//! Process sequences prevent PID reuse from becoming false quiescence evidence.
use super::*;
use crate::recovery::{ProcessClass, ProcessStamp, RecoveryRecord, MAX_PROCESSES};
use std::collections::BTreeMap;
use windows_sys::Wdk::System::SystemInformation::NtQuerySystemInformation;
use windows_sys::Win32::System::RemoteDesktop::*;

// Windows SDK winternl.h: SystemBasicProcessInformation (Windows 11 26100.4770+).
const SYSTEM_BASIC_PROCESS_INFORMATION: i32 = 252;
// PHNT ntexapi.h: SYSTEM_BOOT_ENVIRONMENT_INFORMATION, Windows 8+.
#[repr(C)]
#[derive(Default)]
struct BootEnvironment {
    identifier: GUID,
    firmware: u32,
    flags: u64,
}

pub(super) fn boot_identity() -> Result<String, Failure> {
    let mut environment = BootEnvironment::default();
    let mut length = 0;
    let result = unsafe {
        NtQuerySystemInformation(
            90,
            (&mut environment as *mut BootEnvironment).cast(),
            size_of::<BootEnvironment>() as u32,
            &mut length,
        )
    };
    if result != 0
        || length != size_of::<BootEnvironment>() as u32
        || environment.identifier.data1 == 0
            && environment.identifier.data2 == 0
            && environment.identifier.data3 == 0
            && environment.identifier.data4 == [0; 8]
    {
        return Err(Failure::new(
            "observation-unavailable",
            "The current boot identity cannot be verified.",
        ));
    }
    Ok(guid_text(&environment.identifier))
}
#[repr(C)]
#[derive(Clone, Copy)]
struct BasicProcess {
    next: u32,
    pid: usize,
    parent: usize,
    sequence: u64,
    image_length: u16,
    image_maximum: u16,
    image: usize,
}

pub(super) fn snapshot() -> Result<Vec<ProcessStamp>, Failure> {
    if size_of::<BasicProcess>() != 48 {
        return Err(Failure::new(
            "observation-unavailable",
            "Unsupported process snapshot ABI.",
        ));
    }
    let mut capacity = 65536usize;
    for _ in 0..4 {
        if capacity > 8 * 1024 * 1024 {
            break;
        }
        let mut buffer = vec![0usize; capacity.div_ceil(size_of::<usize>())];
        let mut length = 0;
        let result = unsafe {
            NtQuerySystemInformation(
                SYSTEM_BASIC_PROCESS_INFORMATION,
                buffer.as_mut_ptr().cast(),
                capacity as u32,
                &mut length,
            )
        };
        if result as u32 == 0xc0000004 {
            capacity = capacity.saturating_mul(2).max(length as usize);
            continue;
        }
        if result != 0 {
            return Err(Failure::new(
                "observation-unavailable",
                format!("Process sequence snapshot failed (NTSTATUS {result:08x})."),
            ));
        }
        if length as usize > capacity || (length as usize) < size_of::<BasicProcess>() {
            return Err(Failure::new(
                "observation-unavailable",
                "Invalid process snapshot length.",
            ));
        }
        let mut offset = 0usize;
        let mut entries = Vec::new();
        loop {
            if offset + size_of::<BasicProcess>() > length as usize
                || entries.len() >= MAX_PROCESSES
            {
                return Err(Failure::new(
                    "observation-unavailable",
                    "Process snapshot exceeds its bounds.",
                ));
            }
            let entry = unsafe {
                std::ptr::read_unaligned(
                    buffer
                        .as_ptr()
                        .cast::<u8>()
                        .add(offset)
                        .cast::<BasicProcess>(),
                )
            };
            let pid = u32::try_from(entry.pid).map_err(|_| {
                Failure::new("observation-unavailable", "Invalid process identifier.")
            })?;
            entries.push(ProcessStamp {
                pid,
                sequence: entry.sequence,
            });
            if entry.next == 0 {
                break;
            }
            if (entry.next as usize) < size_of::<BasicProcess>() || entry.next % 8 != 0 {
                return Err(Failure::new(
                    "observation-unavailable",
                    "Invalid process snapshot link.",
                ));
            }
            offset += entry.next as usize;
        }
        crate::recovery::snapshot_map(&entries)?;
        if !entries
            .iter()
            .any(|entry| entry.pid == unsafe { GetCurrentProcessId() } && entry.sequence != 0)
        {
            return Err(Failure::new(
                "observation-unavailable",
                "The observer is absent from its process snapshot.",
            ));
        }
        return Ok(entries);
    }
    Err(Failure::new(
        "observation-unavailable",
        "Process observation could not fit within its allocation budget.",
    ))
}

struct WtsMemory {
    pointer: *mut u16,
    count: u32,
}
impl Drop for WtsMemory {
    fn drop(&mut self) {
        if !self.pointer.is_null()
            && unsafe {
                WTSFreeMemoryExW(WTSTypeProcessInfoLevel1, self.pointer.cast(), self.count)
            } == 0
        {
            eprintln!("target-guard: WTSFreeMemoryExW failed.");
        }
    }
}

fn users() -> Result<BTreeMap<u32, Option<String>>, Failure> {
    let mut memory = WtsMemory {
        pointer: null_mut(),
        count: 0,
    };
    let mut level = 1;
    boolean(
        unsafe {
            WTSEnumerateProcessesExW(
                null_mut(),
                &mut level,
                u32::MAX,
                &mut memory.pointer,
                &mut memory.count,
            )
        },
        "WTSEnumerateProcessesExW",
    )?;
    if level != 1
        || memory.count == 0
        || memory.count as usize > MAX_PROCESSES
        || memory.pointer.is_null()
    {
        return Err(Failure::new(
            "observation-unavailable",
            "Incomplete process-account observation.",
        ));
    }
    let entries = unsafe {
        std::slice::from_raw_parts(
            memory.pointer.cast::<WTS_PROCESS_INFO_EXW>(),
            memory.count as usize,
        )
    };
    let mut result = BTreeMap::new();
    for entry in entries {
        let sid = if entry.pUserSid.is_null() {
            None
        } else {
            Some(sid_text(entry.pUserSid)?)
        };
        if result.insert(entry.ProcessId, sid).is_some() {
            return Err(Failure::new(
                "observation-unavailable",
                "Duplicate process-account identity.",
            ));
        }
    }
    Ok(result)
}

/// Hold queried objects through the final snapshot; a signaled object proves exit independently of its exit status.
fn classify_candidate(
    pid: u32,
    reported_sid: Option<&String>,
    account: &str,
    container: &str,
) -> Result<(ProcessClass, Option<Handle>), Failure> {
    if reported_sid.is_some_and(|sid| sid != account) {
        return Ok((ProcessClass::OtherAccount, None));
    }
    let raw = unsafe {
        OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
            0,
            pid,
        )
    };
    if raw.is_null() {
        return Err(os_failure(
            unsafe { GetLastError() },
            &format!("OpenProcess(recovery PID {pid})"),
        ));
    }
    let process = Handle(raw);
    match unsafe { WaitForSingleObject(process.0, 0) } {
        WAIT_OBJECT_0 => return Ok((ProcessClass::Exited, Some(process))),
        WAIT_TIMEOUT => {}
        _ => {
            return Err(os_failure(
                unsafe { GetLastError() },
                "WaitForSingleObject(recovery)",
            ))
        }
    }
    let actual_sid = user_sid(&process)?;
    if reported_sid.is_some_and(|reported| reported != &actual_sid) {
        return Err(Failure::new(
            "observation-changed",
            "Process account changed during recovery observation.",
        ));
    }
    if actual_sid != account {
        return Ok((ProcessClass::OtherAccount, Some(process)));
    }
    let class = match optional_container_sid(&process)? {
        Some((_, sid)) if sid == container => ProcessClass::MatchingContainer,
        _ => ProcessClass::OtherContainer,
    };
    Ok((class, Some(process)))
}

/// A new boot classifies all executable processes; the recorded cohort applies only within its original boot.
pub(super) fn quiescent(record: &RecoveryRecord) -> Result<(), Failure> {
    let boot = boot_identity()?;
    let before = snapshot()?;
    let candidates = record.candidates_for_boot(&boot, &before)?;
    let users = users()?;
    let mut observations = Vec::new();
    let mut retained = Vec::new();
    for stamp in candidates {
        let (class, process) = classify_candidate(
            stamp.pid,
            users.get(&stamp.pid).and_then(Option::as_ref),
            &record.user_sid,
            &record.container_sid,
        )?;
        if class == ProcessClass::MatchingContainer {
            return Err(Failure::new(
                "scope-active",
                "A process still uses this container identity; its rules remain.",
            ));
        }
        observations.push((stamp, class));
        if let Some(process) = process {
            retained.push(process)
        }
    }
    let after = snapshot()?;
    if boot_identity()? != boot {
        return Err(Failure::new(
            "observation-changed",
            "The kernel boot identity changed during recovery observation.",
        ));
    }
    crate::recovery::confirm_quiescent_for_boot(record, &boot, &before, &observations, &after)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::windows::process::CommandExt;

    #[test]
    fn a_missing_wts_entry_can_be_verified_through_the_live_process_token() {
        let pid = unsafe { GetCurrentProcessId() };
        let process = process(&current_identity().unwrap(), 0).unwrap();
        let account = user_sid(&process).unwrap();
        let (class, handle) = classify_candidate(pid, None, &account, "S-1-15-2-1").unwrap();
        assert_eq!(class, ProcessClass::OtherContainer);
        assert!(handle.is_some());
    }

    #[test]
    fn a_signaled_process_handle_establishes_exit_without_an_account_entry() {
        let executable = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap())
            .join("System32/cmd.exe");
        let mut child = std::process::Command::new(executable)
            .args(["/d", "/c", "exit", "0"])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .unwrap();
        child.wait().unwrap();
        let (class, handle) =
            classify_candidate(child.id(), None, "S-1-5-21-1", "S-1-15-2-1").unwrap();
        assert_eq!(class, ProcessClass::Exited);
        assert!(handle.is_some());
    }

    #[test]
    fn boot_observation_is_nonempty_and_stable() {
        let first = boot_identity().unwrap();
        assert!(crate::recovery::uuid(&first));
        assert_eq!(first, boot_identity().unwrap());
    }

    #[test]
    fn real_sequence_snapshot_contains_the_same_live_observer_identity() {
        let first = snapshot().unwrap();
        let second = snapshot().unwrap();
        let pid = unsafe { GetCurrentProcessId() };
        assert_eq!(
            first.iter().find(|entry| entry.pid == pid),
            second.iter().find(|entry| entry.pid == pid)
        );
    }

    #[test]
    fn account_snapshot_identifies_the_current_process_without_disclosing_names() {
        let table = users().unwrap();
        assert!(table
            .get(&unsafe { GetCurrentProcessId() })
            .and_then(Option::as_ref)
            .is_some());
    }
}
