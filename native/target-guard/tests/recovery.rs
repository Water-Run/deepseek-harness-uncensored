//! Recovery decisions must reject active descendants, reused PIDs and incomplete observations.
use dshu_target_guard::{recovery::*, Identity};

fn stamp(pid: u32, sequence: u64) -> ProcessStamp {
    ProcessStamp { pid, sequence }
}
fn record() -> RecoveryRecord {
    RecoveryRecord {
        format: RECORD_FORMAT.into(),
        boot: "bc0e52e1-c072-450f-b643-a4ae95ffea52".into(),
        scope: "ca55d452-01c1-45c3-b0ad-73e3e3c28a45".into(),
        filters: [
            "af47a344-e355-4e17-bfe5-7eec4dc80c00".into(),
            "55fd062e-80c6-4fe0-b334-d2bc13e19dc1".into(),
        ],
        owner: Identity {
            pid: 20,
            created: "20".into(),
        },
        helper: Identity {
            pid: 30,
            created: "30".into(),
        },
        target: Identity {
            pid: 40,
            created: "40".into(),
        },
        user_sid: "S-1-5-21-1".into(),
        container_sid: "S-1-15-2-1".into(),
        target_stamp: stamp(40, 400),
        prior: vec![stamp(10, 100), stamp(20, 200), stamp(30, 300)],
    }
}

#[test]
fn process_exemptions_require_a_verified_matching_boot() {
    let value = record();
    assert!(value.matches_boot(&value.boot).unwrap());
    assert!(!value
        .matches_boot("ec0e52e1-c072-450f-b643-a4ae95ffea52")
        .unwrap());
    let mut missing = value.clone();
    missing.boot.clear();
    assert!(missing.validate().is_err());
}

#[test]
fn old_processes_are_excluded_only_while_their_kernel_sequence_still_matches() {
    let value = record();
    assert_eq!(
        value
            .candidates_for_boot(
                &value.boot,
                &[stamp(10, 100), stamp(20, 201), stamp(50, 500)]
            )
            .unwrap(),
        [stamp(20, 201), stamp(50, 500)]
    );
}

#[test]
fn orphan_descendant_blocks_removal_even_after_all_recorded_pids_disappear() {
    let value = record();
    let before = [stamp(10, 100), stamp(99, 900)];
    let observed = [(stamp(99, 900), ProcessClass::MatchingContainer)];
    assert_eq!(
        confirm_quiescent_for_boot(&value, &value.boot, &before, &observed, &before)
            .unwrap_err()
            .code,
        "scope-active"
    );
}

#[test]
fn incomplete_classification_cannot_mean_no_descendants() {
    let value = record();
    let before = [stamp(10, 100), stamp(99, 900)];
    assert_eq!(
        confirm_quiescent_for_boot(&value, &value.boot, &before, &[], &before)
            .unwrap_err()
            .code,
        "observation-unavailable"
    );
}

#[test]
fn reused_parent_pid_is_classified_instead_of_inheriting_an_old_exemption() {
    let value = record();
    let before = [stamp(20, 999)];
    assert_eq!(
        confirm_quiescent_for_boot(&value, &value.boot, &before, &[], &before)
            .unwrap_err()
            .code,
        "observation-unavailable"
    );
    assert!(confirm_quiescent_for_boot(
        &value,
        &value.boot,
        &before,
        &[(before[0], ProcessClass::OtherContainer)],
        &before
    )
    .is_ok());
}

#[test]
fn a_stable_complete_observation_allows_cleanup() {
    let value = record();
    let before = [stamp(10, 100), stamp(60, 600), stamp(70, 700)];
    assert!(confirm_quiescent_for_boot(
        &value,
        &value.boot,
        &before,
        &[
            (before[1], ProcessClass::OtherAccount),
            (before[2], ProcessClass::OtherContainer)
        ],
        &before
    )
    .is_ok());
}

#[test]
fn births_exits_and_pid_reuse_during_the_scan_all_keep_rules() {
    let value = record();
    let before = [stamp(10, 100), stamp(60, 600)];
    let observations = [(before[1], ProcessClass::OtherContainer)];
    for after in [
        vec![before[0]],
        vec![before[0], stamp(60, 601)],
        vec![before[0], before[1], stamp(80, 800)],
    ] {
        assert_eq!(
            confirm_quiescent_for_boot(&value, &value.boot, &before, &observations, &after)
                .unwrap_err()
                .code,
            "observation-changed"
        );
    }
}

#[test]
fn no_wall_clock_order_is_used_for_process_sequences() {
    let value = record();
    let current = [stamp(10, 7), stamp(99, 2)];
    assert_eq!(
        value.candidates_for_boot(&value.boot, &current).unwrap(),
        current
    );
}

#[test]
fn duplicate_or_extra_classifications_are_not_a_complete_scan() {
    let value = record();
    let current = [stamp(60, 600)];
    for rows in [
        vec![(current[0], ProcessClass::OtherContainer); 2],
        vec![(stamp(80, 800), ProcessClass::OtherAccount)],
    ] {
        assert_eq!(
            confirm_quiescent_for_boot(&value, &value.boot, &current, &rows, &current)
                .unwrap_err()
                .code,
            "observation-unavailable"
        );
    }
}

#[test]
fn historical_or_forged_exclusion_records_are_rejected() {
    let mut value = record();
    value.format = "dshu-target-guard/1".into();
    assert!(value.validate().is_err());
    value = record();
    value.prior.push(value.target_stamp);
    assert!(value.validate().is_err());
    value = record();
    value.prior.push(stamp(10, 101));
    assert!(value.validate().is_err());
    value = record();
    value.filters[0] = value.scope.clone();
    assert!(value.validate().is_err());
    value = record();
    value.filters[1] = value.filters[0].clone();
    assert!(value.validate().is_err());
    value = record();
    value.target_stamp.pid = 99;
    assert!(value.validate().is_err());
    value = record();
    value.prior = (0..=MAX_PROCESSES)
        .map(|pid| stamp(pid as u32, 1))
        .collect();
    assert!(value.validate().is_err());
}

#[test]
fn empty_or_ambiguous_kernel_snapshots_are_not_accepted() {
    assert!(snapshot_map(&[]).is_err());
    assert!(snapshot_map(&[stamp(10, 1), stamp(10, 2)]).is_err());
    assert!(snapshot_map(&vec![stamp(1, 1); MAX_PROCESSES + 1]).is_err());
}

const NEXT_BOOT: &str = "ec0e52e1-c072-450f-b643-a4ae95ffea52";

#[test]
fn a_new_boot_classifies_even_exactly_reused_prior_stamps() {
    let value = record();
    let current = [stamp(10, 100), stamp(20, 200), stamp(99, 900)];
    assert_eq!(
        value.candidates_for_boot(NEXT_BOOT, &current).unwrap(),
        current
    );
    assert_eq!(
        value.candidates_for_boot(&value.boot, &current).unwrap(),
        [current[2]]
    );
}

#[test]
fn a_reboot_cannot_exempt_a_live_container_using_an_old_prior_stamp() {
    let value = record();
    let current = [stamp(10, 100), stamp(20, 200)];
    let observed = [
        (current[0], ProcessClass::OtherAccount),
        (current[1], ProcessClass::MatchingContainer),
    ];
    assert_eq!(
        confirm_quiescent_for_boot(&value, NEXT_BOOT, &current, &observed, &current)
            .unwrap_err()
            .code,
        "scope-active"
    );
}

#[test]
fn a_new_boot_requires_every_non_idle_process_to_be_classified() {
    let value = record();
    let current = [stamp(10, 100), stamp(20, 200)];
    let partial = [(current[1], ProcessClass::OtherContainer)];
    assert_eq!(
        confirm_quiescent_for_boot(&value, NEXT_BOOT, &current, &partial, &current)
            .unwrap_err()
            .code,
        "observation-unavailable"
    );
    let complete = [
        (current[0], ProcessClass::OtherAccount),
        (current[1], ProcessClass::OtherContainer),
    ];
    assert!(confirm_quiescent_for_boot(&value, NEXT_BOOT, &current, &complete, &current).is_ok());
    assert_eq!(
        confirm_quiescent_for_boot(&value, NEXT_BOOT, &current, &complete, &[current[0]])
            .unwrap_err()
            .code,
        "observation-changed"
    );
}

#[test]
fn only_reserved_windows_kernel_pids_need_no_account_classification() {
    let value = record();
    let current = [stamp(0, 0), stamp(4, 4), stamp(10, 100)];
    assert_eq!(
        value.candidates_for_boot(NEXT_BOOT, &current).unwrap(),
        [current[2]]
    );
    assert!(confirm_quiescent_for_boot(
        &value,
        NEXT_BOOT,
        &current,
        &[(current[2], ProcessClass::OtherAccount)],
        &current,
    )
    .is_ok());
}

#[test]
fn an_unknown_current_boot_never_selects_a_recovery_scope() {
    let value = record();
    for boot in ["", "unknown", "00000000-0000-0000-0000-000000000000"] {
        assert_eq!(
            value
                .candidates_for_boot(boot, &[stamp(10, 100)])
                .unwrap_err()
                .code,
            "observation-unavailable"
        );
    }
}

#[test]
fn kernel_process_exemptions_cannot_be_claimed_as_application_owners_or_targets() {
    for role in 0..3 {
        let mut value = record();
        match role {
            0 => value.owner.pid = 4,
            1 => value.helper.pid = 4,
            _ => {
                value.target.pid = 4;
                value.target_stamp.pid = 4;
            }
        }
        assert_eq!(value.validate().unwrap_err().code, "invalid-record");
    }
}
