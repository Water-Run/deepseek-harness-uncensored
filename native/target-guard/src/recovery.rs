//! Durable recovery records and conservative orphan-admission decisions.
use crate::{Failure, Identity};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const RECORD_FORMAT: &str = "dshu-target-guard/2";
pub const MAX_PROCESSES: usize = 4096;
pub const MAX_RECORD_BYTES: usize = 262144;

/// Kernel sequence, not wall-clock time, distinguishes reused process IDs within a boot.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(deny_unknown_fields)]
pub struct ProcessStamp {
    pub pid: u32,
    pub sequence: u64,
}

/// Version 1 records lack quiescence evidence and are never guessed into this successor.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct RecoveryRecord {
    pub format: String,
    pub boot: String,
    pub scope: String,
    pub filters: [String; 2],
    pub owner: Identity,
    pub helper: Identity,
    pub target: Identity,
    pub user_sid: String,
    pub container_sid: String,
    pub target_stamp: ProcessStamp,
    pub prior: Vec<ProcessStamp>,
}

pub fn uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                byte == b'-'
            } else {
                byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
            }
        })
}

impl RecoveryRecord {
    pub fn validate(&self) -> Result<(), Failure> {
        self.owner.ticks()?;
        self.helper.ticks()?;
        self.target.ticks()?;
        let unique: BTreeSet<_> = self.prior.iter().map(|stamp| stamp.pid).collect();
        if self.format != RECORD_FORMAT
            || !uuid(&self.boot)
            || !uuid(&self.scope)
            || !self.filters.iter().all(|key| uuid(key))
            || self.filters[0] == self.filters[1]
            || self.filters.iter().any(|key| key == &self.scope)
            || self.user_sid.len() > 184
            || !self.user_sid.starts_with("S-1-")
            || self.container_sid.len() > 184
            || !self.container_sid.starts_with("S-1-15-2-")
            || self.target_stamp.pid != self.target.pid
            || self.target_stamp.sequence == 0
            || self.prior.len() > MAX_PROCESSES
            || unique.len() != self.prior.len()
            || self.prior.iter().any(|stamp| stamp.pid == self.target.pid)
            || self.owner.pid == self.helper.pid
            || self.owner.pid == self.target.pid
            || self.helper.pid == self.target.pid
        {
            return Err(Failure::new(
                "invalid-record",
                "The persistent guard record cannot establish its scope.",
            ));
        }
        Ok(())
    }

    /// Every process outside the pre-admission cohort must be classified, including reused PIDs.
    pub fn candidates(&self, snapshot: &[ProcessStamp]) -> Result<Vec<ProcessStamp>, Failure> {
        self.validate()?;
        let before = snapshot_map(snapshot)?;
        let prior: BTreeSet<_> = self.prior.iter().copied().collect();
        Ok(before
            .into_iter()
            .map(|(pid, sequence)| ProcessStamp { pid, sequence })
            .filter(|stamp| !prior.contains(stamp))
            .collect())
    }

    /// Kernel process sequences cannot exclude candidates from a different system boot.
    pub fn require_boot(&self, current: &str) -> Result<(), Failure> {
        self.validate()?;
        if self.boot != current {
            return Err(Failure::new(
                "boot-changed",
                "The boot identity changed; retain this record for explicit maintenance.",
            ));
        }
        Ok(())
    }
}

pub fn snapshot_map(snapshot: &[ProcessStamp]) -> Result<BTreeMap<u32, u64>, Failure> {
    if snapshot.is_empty() || snapshot.len() > MAX_PROCESSES {
        return Err(Failure::new(
            "observation-unavailable",
            "Process observation is empty or exceeds its bound.",
        ));
    }
    let values: BTreeMap<_, _> = snapshot
        .iter()
        .map(|stamp| (stamp.pid, stamp.sequence))
        .collect();
    if values.len() != snapshot.len() {
        return Err(Failure::new(
            "observation-unavailable",
            "Process observation contains duplicate IDs.",
        ));
    }
    Ok(values)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProcessClass {
    OtherAccount,
    OtherContainer,
    MatchingContainer,
}

/// PID disappearance, inaccessible tokens and snapshot changes are failures, never evidence of exit.
pub fn confirm_quiescent(
    record: &RecoveryRecord,
    before: &[ProcessStamp],
    observations: &[(ProcessStamp, ProcessClass)],
    after: &[ProcessStamp],
) -> Result<(), Failure> {
    let candidates = record.candidates(before)?;
    if snapshot_map(before)? != snapshot_map(after)? {
        return Err(Failure::new(
            "observation-changed",
            "The process set changed; retain rules and observe again.",
        ));
    }
    let observed: BTreeMap<_, _> = observations.iter().copied().collect();
    if observed.len() != observations.len()
        || observed.len() != candidates.len()
        || candidates.iter().any(|stamp| !observed.contains_key(stamp))
    {
        return Err(Failure::new(
            "observation-unavailable",
            "Not every possible descendant was classified.",
        ));
    }
    if observed
        .values()
        .any(|class| *class == ProcessClass::MatchingContainer)
    {
        return Err(Failure::new(
            "scope-active",
            "A process still uses this container identity; its rules remain.",
        ));
    }
    Ok(())
}

#[derive(Default, Debug, Serialize)]
pub struct RecoveryReport {
    pub removed: Vec<String>,
    pub retained: Vec<RetainedRule>,
    pub unrecognized: u32,
}
#[derive(Debug, Serialize)]
pub struct RetainedRule {
    pub scope: String,
    pub code: String,
}
