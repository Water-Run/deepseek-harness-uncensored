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

/// A successful scan classifies every process outside the recorded cohort and rejects any concurrent set change.
pub(super) fn quiescent(record: &RecoveryRecord) -> Result<(), Failure> {
    record.require_boot(&boot_identity()?)?;
    let before = snapshot()?;
    let candidates = record.candidates(&before)?;
    let users = users()?;
    let mut observations = Vec::new();
    let mut retained = Vec::new();
    for stamp in candidates {
        let sid = users
            .get(&stamp.pid)
            .and_then(Option::as_ref)
            .ok_or_else(|| {
                Failure::new(
                    "observation-unavailable",
                    "A possible descendant has no verified account identity.",
                )
            })?;
        if sid != &record.user_sid {
            observations.push((stamp, ProcessClass::OtherAccount));
            continue;
        }
        let raw = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, stamp.pid) };
        if raw.is_null() {
            return Err(os_failure(
                unsafe { GetLastError() },
                "OpenProcess(recovery)",
            ));
        }
        let process = Handle(raw);
        if user_sid(&process)? != record.user_sid {
            return Err(Failure::new(
                "observation-changed",
                "Process account changed during recovery observation.",
            ));
        }
        let class = match optional_container_sid(&process)? {
            Some((_, sid)) if sid == record.container_sid => ProcessClass::MatchingContainer,
            _ => ProcessClass::OtherContainer,
        };
        if class == ProcessClass::MatchingContainer {
            return Err(Failure::new(
                "scope-active",
                "A process still uses this container identity; its rules remain.",
            ));
        }
        observations.push((stamp, class));
        retained.push(process);
    }
    let after = snapshot()?;
    crate::recovery::confirm_quiescent(record, &before, &observations, &after)
}

#[cfg(test)]
mod tests {
    use super::*;

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
