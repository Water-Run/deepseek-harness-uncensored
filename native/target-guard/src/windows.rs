//! Windows ownership checks and persistent, container-SID-scoped WFP rules.
use crate::{decimal, Admission, Backend, Failure, Identity};
use std::ffi::c_void;
use std::mem::size_of;
use std::ptr::{null, null_mut};
use windows_sys::core::GUID;
use windows_sys::Wdk::Foundation::{NtQueryObject, ObjectBasicInformation};
use windows_sys::Win32::Foundation::*;
use windows_sys::Win32::NetworkManagement::WindowsFilteringPlatform::*;
use windows_sys::Win32::Security::Authorization::ConvertSidToStringSidW;
use windows_sys::Win32::Security::*;
use windows_sys::Win32::System::Console::{GetStdHandle, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE};
use windows_sys::Win32::System::JobObjects::*;
use windows_sys::Win32::System::Pipes::GetNamedPipeServerProcessId;
use windows_sys::Win32::System::Rpc::{UuidCreate, RPC_C_AUTHN_WINNT};
use windows_sys::Win32::System::SystemServices::{JOB_OBJECT_QUERY, JOB_OBJECT_TERMINATE};
use windows_sys::Win32::System::Threading::*;

fn status(code: u32, operation: &'static str) -> Result<(), Failure> {
    if code == 0 {
        return Ok(());
    }
    Err(os_failure(code, operation))
}
fn os_failure(code: u32, operation: &'static str) -> Failure {
    Failure {
        code: if code == ERROR_ACCESS_DENIED {
            "permission-required"
        } else {
            "native-failure"
        },
        message: format!("{operation} failed; no dependent execution is authorized."),
        win32: Some(code),
    }
}
fn boolean(value: i32, operation: &'static str) -> Result<(), Failure> {
    if value != 0 {
        Ok(())
    } else {
        Err(os_failure(unsafe { GetLastError() }, operation))
    }
}
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain([0]).collect()
}
fn guid() -> Result<GUID, Failure> {
    let mut value = GUID::default();
    status(unsafe { UuidCreate(&mut value) } as u32, "UuidCreate")?;
    Ok(value)
}
fn guid_text(value: &GUID) -> String {
    format!(
        "{:08x}-{:04x}-{:04x}-{:02x}{:02x}-{}",
        value.data1,
        value.data2,
        value.data3,
        value.data4[0],
        value.data4[1],
        value.data4[2..]
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    )
}

struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        if unsafe { CloseHandle(self.0) } == 0 {
            eprintln!("target-guard: CloseHandle failed: {}", unsafe {
                GetLastError()
            });
        }
    }
}

fn process(identity: &Identity, access: u32) -> Result<Handle, Failure> {
    let expected = identity.ticks()?;
    let handle = unsafe {
        OpenProcess(
            access | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
            0,
            identity.pid,
        )
    };
    if handle.is_null() {
        return Err(os_failure(unsafe { GetLastError() }, "OpenProcess"));
    }
    let owned = Handle(handle);
    let mut created = FILETIME::default();
    let mut exited = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    boolean(
        unsafe { GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) },
        "GetProcessTimes",
    )?;
    let observed = (u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime);
    if observed != expected || unsafe { WaitForSingleObject(handle, 0) } != WAIT_TIMEOUT {
        return Err(Failure::new(
            "identity-changed",
            "The PID does not identify the expected live process.",
        ));
    }
    Ok(owned)
}

fn query_job<T: Default>(job: &Handle, class: i32) -> Result<T, Failure> {
    let mut value = T::default();
    boolean(
        unsafe {
            QueryInformationJobObject(
                job.0,
                class,
                (&mut value as *mut T).cast(),
                size_of::<T>() as u32,
                null_mut(),
            )
        },
        "QueryInformationJobObject",
    )?;
    Ok(value)
}

/// Duplicated handles and copied SID remain valid independently of caller handle closure.
pub struct Scope {
    job: Handle,
    _target: Handle,
    sid: Vec<u32>,
    metadata: Vec<u8>,
}

/// Object keys are created by this helper and never supplied by an IPC caller.
pub struct Lease {
    provider: GUID,
    filters: [GUID; 2],
}

/// One authenticated pipe owner; stdin/stdout must have been created by the exact owner process.
pub struct WindowsBackend {
    owner: Handle,
    identity: Identity,
    engine: Option<HANDLE>,
}

impl WindowsBackend {
    pub fn authenticated(owner: Identity) -> Result<Self, Failure> {
        let process = process(&owner, PROCESS_DUP_HANDLE)?;
        for stream in [STD_INPUT_HANDLE, STD_OUTPUT_HANDLE] {
            let handle = unsafe { GetStdHandle(stream) };
            let mut pid = 0;
            boolean(
                unsafe { GetNamedPipeServerProcessId(handle, &mut pid) },
                "GetNamedPipeServerProcessId",
            )?;
            if pid != owner.pid {
                return Err(Failure::new(
                    "caller-mismatch",
                    "The private pipe was not created by the expected caller.",
                ));
            }
        }
        Ok(Self {
            owner: process,
            identity: owner,
            engine: None,
        })
    }

    fn engine(&mut self) -> Result<HANDLE, Failure> {
        if let Some(handle) = self.engine {
            return Ok(handle);
        }
        let mut handle = null_mut();
        status(
            unsafe { FwpmEngineOpen0(null(), RPC_C_AUTHN_WINNT, null(), null(), &mut handle) },
            "FwpmEngineOpen0",
        )?;
        self.engine = Some(handle);
        Ok(handle)
    }

    fn transaction<T>(
        &mut self,
        operation: impl FnOnce(HANDLE) -> Result<T, Failure>,
    ) -> Result<T, Failure> {
        let handle = self.engine()?;
        status(
            unsafe { FwpmTransactionBegin0(handle, 0) },
            "FwpmTransactionBegin0",
        )?;
        match operation(handle).and_then(|value| {
            status(
                unsafe { FwpmTransactionCommit0(handle) },
                "FwpmTransactionCommit0",
            )?;
            Ok(value)
        }) {
            Ok(value) => Ok(value),
            Err(error) => {
                let aborted = unsafe { FwpmTransactionAbort0(handle) };
                if aborted != 0 {
                    eprintln!("target-guard: transaction abort returned {aborted}; owned filters may remain.");
                }
                Err(error)
            }
        }
    }
}

impl Drop for WindowsBackend {
    fn drop(&mut self) {
        // These sessions are not dynamic: an unexpected helper exit must not remove admission filters.
        if let Some(engine) = self.engine {
            let result = unsafe { FwpmEngineClose0(engine) };
            if result != 0 {
                eprintln!("target-guard: FwpmEngineClose0 returned {result}.");
            }
        }
    }
}

impl Backend for WindowsBackend {
    type Scope = Scope;
    type Lease = Lease;

    fn validate(&mut self, admission: &Admission) -> Result<Scope, Failure> {
        if unsafe { WaitForSingleObject(self.owner.0, 0) } != WAIT_TIMEOUT {
            return Err(Failure::new(
                "caller-exited",
                "The authenticated caller has exited.",
            ));
        }
        let target = process(&admission.target, 0)?;
        if !same_user(&self.owner, &target)? {
            return Err(Failure::new(
                "owner-mismatch",
                "The target and authenticated caller must belong to the same account.",
            ));
        }
        let mut borrowed = null_mut();
        let source = usize::try_from(decimal(&admission.job)?)
            .map_err(|_| Failure::new("invalid-identity", "Job handle exceeds pointer size."))?;
        boolean(
            unsafe {
                DuplicateHandle(
                    self.owner.0,
                    source as HANDLE,
                    GetCurrentProcess(),
                    &mut borrowed,
                    0,
                    0,
                    DUPLICATE_SAME_ACCESS,
                )
            },
            "DuplicateHandle",
        )?;
        let job = Handle(borrowed);
        let mut info = [0u32; 14];
        let result = unsafe {
            NtQueryObject(
                job.0,
                ObjectBasicInformation,
                info.as_mut_ptr().cast(),
                size_of_val(&info) as u32,
                null_mut(),
            )
        };
        if result != 0 {
            return Err(Failure::new(
                "job-access-unverified",
                format!("Cannot verify borrowed Job access (NTSTATUS {result:08x})."),
            ));
        }
        let required = JOB_OBJECT_QUERY | JOB_OBJECT_TERMINATE;
        if info[1] & required != required {
            return Err(Failure::new(
                "job-access-insufficient",
                "The caller must already own Job query and termination rights.",
            ));
        }
        let mut member = 0;
        boolean(
            unsafe { IsProcessInJob(target.0, job.0, &mut member) },
            "IsProcessInJob",
        )?;
        let processes: JOBOBJECT_BASIC_PROCESS_ID_LIST =
            query_job(&job, JobObjectBasicProcessIdList)?;
        let limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION =
            query_job(&job, JobObjectExtendedLimitInformation)?;
        if member == 0
            || processes.NumberOfAssignedProcesses != 1
            || processes.NumberOfProcessIdsInList != 1
            || processes.ProcessIdList[0] != admission.target.pid as usize
            || limits.BasicLimitInformation.LimitFlags & JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE == 0
            || limits.BasicLimitInformation.LimitFlags
                & (JOB_OBJECT_LIMIT_BREAKAWAY_OK | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK)
                != 0
        {
            return Err(Failure::new(
                "job-mismatch",
                "Admission requires a non-breakaway Job containing only the expected bootstrap.",
            ));
        }
        let (sid, text) = container_sid(&target)?;
        let metadata = serde_json::to_vec(
            &serde_json::json!({ "format": "dshu-target-guard/1", "owner": self.identity,
            "target": admission.target, "sid": text }),
        )
        .map_err(|error| Failure::new("invalid-identity", error.to_string()))?;
        Ok(Scope {
            job,
            _target: target,
            sid,
            metadata,
        })
    }

    fn install(&mut self, scope: &Scope) -> Result<Lease, Failure> {
        let lease = Lease {
            provider: guid()?,
            filters: [guid()?, guid()?],
        };
        let mut name = wide(&format!(
            "DSHU isolated execution {}",
            guid_text(&lease.provider)
        ));
        let mut provider_key = lease.provider;
        let mut metadata = scope.metadata.clone();
        self.transaction(|engine| {
            let provider = FWPM_PROVIDER0 {
                providerKey: lease.provider,
                flags: FWPM_PROVIDER_FLAG_PERSISTENT,
                displayData: FWPM_DISPLAY_DATA0 {
                    name: name.as_mut_ptr(),
                    description: null_mut(),
                },
                providerData: FWP_BYTE_BLOB {
                    size: metadata.len() as u32,
                    data: metadata.as_mut_ptr(),
                },
                ..Default::default()
            };
            status(
                unsafe { FwpmProviderAdd0(engine, &provider, null_mut()) },
                "FwpmProviderAdd0",
            )?;
            let sublayer = FWPM_SUBLAYER0 {
                subLayerKey: lease.provider,
                flags: FWPM_SUBLAYER_FLAG_PERSISTENT,
                providerKey: &mut provider_key,
                weight: u16::MAX,
                displayData: provider.displayData,
                ..Default::default()
            };
            status(
                unsafe { FwpmSubLayerAdd0(engine, &sublayer, null_mut()) },
                "FwpmSubLayerAdd0",
            )?;
            for (key, layer) in lease.filters.iter().zip([
                FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V4,
                FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V6,
            ]) {
                let mut weight = u64::MAX;
                let mut condition = FWPM_FILTER_CONDITION0 {
                    fieldKey: FWPM_CONDITION_ALE_PACKAGE_ID,
                    matchType: FWP_MATCH_EQUAL,
                    conditionValue: FWP_CONDITION_VALUE0 {
                        r#type: FWP_SID,
                        Anonymous: FWP_CONDITION_VALUE0_0 {
                            sid: scope.sid.as_ptr().cast_mut().cast(),
                        },
                    },
                };
                let filter = FWPM_FILTER0 {
                    filterKey: *key,
                    flags: FWPM_FILTER_FLAG_PERSISTENT,
                    providerKey: &mut provider_key,
                    displayData: provider.displayData,
                    layerKey: layer,
                    subLayerKey: lease.provider,
                    weight: FWP_VALUE0 {
                        r#type: FWP_UINT64,
                        Anonymous: FWP_VALUE0_0 {
                            uint64: &mut weight,
                        },
                    },
                    numFilterConditions: 1,
                    filterCondition: &mut condition,
                    action: FWPM_ACTION0 {
                        r#type: FWP_ACTION_BLOCK,
                        ..Default::default()
                    },
                    ..Default::default()
                };
                status(
                    unsafe { FwpmFilterAdd0(engine, &filter, null_mut(), null_mut()) },
                    "FwpmFilterAdd0",
                )?;
            }
            Ok(())
        })?;
        Ok(lease)
    }

    fn is_empty(&mut self, scope: &Scope) -> Result<bool, Failure> {
        let accounting: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION =
            query_job(&scope.job, JobObjectBasicAccountingInformation)?;
        Ok(accounting.ActiveProcesses == 0)
    }
    fn terminate(&mut self, scope: &Scope) -> Result<(), Failure> {
        boolean(
            unsafe { TerminateJobObject(scope.job.0, 1) },
            "TerminateJobObject",
        )
    }
    fn remove(&mut self, lease: &Lease) -> Result<(), Failure> {
        self.transaction(|engine| {
            for key in &lease.filters {
                status(
                    unsafe { FwpmFilterDeleteByKey0(engine, key) },
                    "FwpmFilterDeleteByKey0",
                )?;
            }
            status(
                unsafe { FwpmSubLayerDeleteByKey0(engine, &lease.provider) },
                "FwpmSubLayerDeleteByKey0",
            )?;
            status(
                unsafe { FwpmProviderDeleteByKey0(engine, &lease.provider) },
                "FwpmProviderDeleteByKey0",
            )
        })
    }
    fn label(&self, lease: &Lease) -> String {
        guid_text(&lease.provider)
    }
}

fn container_sid(process: &Handle) -> Result<(Vec<u32>, String), Failure> {
    let mut raw = null_mut();
    boolean(
        unsafe { OpenProcessToken(process.0, TOKEN_QUERY, &mut raw) },
        "OpenProcessToken",
    )?;
    let token = Handle(raw);
    let mut is_container = 0u32;
    let mut length = 0;
    boolean(
        unsafe {
            GetTokenInformation(
                token.0,
                TokenIsAppContainer,
                (&mut is_container as *mut u32).cast(),
                4,
                &mut length,
            )
        },
        "GetTokenInformation(TokenIsAppContainer)",
    )?;
    if is_container == 0 {
        return Err(Failure::new(
            "not-contained",
            "The target must have an AppContainer identity.",
        ));
    }
    unsafe { GetTokenInformation(token.0, TokenAppContainerSid, null_mut(), 0, &mut length) };
    if length == 0 || length > 4096 {
        return Err(Failure::new(
            "invalid-identity",
            "Unexpected container identity size.",
        ));
    }
    let mut buffer = vec![0usize; (length as usize).div_ceil(size_of::<usize>())];
    boolean(
        unsafe {
            GetTokenInformation(
                token.0,
                TokenAppContainerSid,
                buffer.as_mut_ptr().cast(),
                length,
                &mut length,
            )
        },
        "GetTokenInformation(TokenAppContainerSid)",
    )?;
    let info = unsafe { &*buffer.as_ptr().cast::<TOKEN_APPCONTAINER_INFORMATION>() };
    if unsafe { IsValidSid(info.TokenAppContainer) } == 0 {
        return Err(Failure::new("invalid-identity", "Invalid container SID."));
    }
    let size = unsafe { GetLengthSid(info.TokenAppContainer) };
    if size == 0 || size > 68 {
        return Err(Failure::new("invalid-identity", "Unexpected SID size."));
    }
    let mut sid = vec![0u32; (size as usize).div_ceil(4)];
    boolean(
        unsafe { CopySid(size, sid.as_mut_ptr().cast(), info.TokenAppContainer) },
        "CopySid",
    )?;
    let mut text = null_mut();
    boolean(
        unsafe { ConvertSidToStringSidW(info.TokenAppContainer, &mut text) },
        "ConvertSidToStringSidW",
    )?;
    let result = unsafe {
        let mut length = 0;
        while *text.add(length) != 0 {
            length += 1;
        }
        let value = String::from_utf16_lossy(std::slice::from_raw_parts(text, length));
        LocalFree(text.cast::<c_void>());
        value
    };
    Ok((sid, result))
}

fn same_user(owner: &Handle, target: &Handle) -> Result<bool, Failure> {
    fn identity(process: &Handle) -> Result<Vec<usize>, Failure> {
        let mut raw = null_mut();
        boolean(
            unsafe { OpenProcessToken(process.0, TOKEN_QUERY, &mut raw) },
            "OpenProcessToken",
        )?;
        let token = Handle(raw);
        let mut length = 0;
        unsafe { GetTokenInformation(token.0, TokenUser, null_mut(), 0, &mut length) };
        if length < size_of::<TOKEN_USER>() as u32 || length > 4096 {
            return Err(Failure::new(
                "invalid-identity",
                "Unexpected user token information size.",
            ));
        }
        let mut buffer = vec![0usize; (length as usize).div_ceil(size_of::<usize>())];
        boolean(
            unsafe {
                GetTokenInformation(
                    token.0,
                    TokenUser,
                    buffer.as_mut_ptr().cast(),
                    length,
                    &mut length,
                )
            },
            "GetTokenInformation(TokenUser)",
        )?;
        Ok(buffer)
    }
    let owner_buffer = identity(owner)?;
    let target_buffer = identity(target)?;
    let owner_info = unsafe { &*owner_buffer.as_ptr().cast::<TOKEN_USER>() };
    let target_info = unsafe { &*target_buffer.as_ptr().cast::<TOKEN_USER>() };
    Ok(unsafe { EqualSid(owner_info.User.Sid, target_info.User.Sid) } != 0)
}
