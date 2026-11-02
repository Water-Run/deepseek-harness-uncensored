//! Deterministic ownership and IPC failures; native WFP success requires the separate elevated fixture.
use dshu_target_guard::{serve, Admission, Backend, Controller, Failure, Identity};
use std::cell::RefCell;
use std::io::{Cursor, Write};
use std::rc::Rc;
use std::time::Duration;

#[derive(Default)]
struct State {
    active: bool,
    stuck: bool,
    reject: &'static str,
    calls: Vec<&'static str>,
}
struct Fake(Rc<RefCell<State>>);
impl Backend for Fake {
    type Scope = ();
    type Lease = ();
    fn validate(&mut self, _: &Admission) -> Result<(), Failure> {
        self.call("validate")
    }
    fn install(&mut self, _: &()) -> Result<(), Failure> {
        self.call("install")
    }
    fn is_empty(&mut self, _: &()) -> Result<bool, Failure> {
        self.call("observe")?;
        Ok(!self.0.borrow().active)
    }
    fn terminate(&mut self, _: &()) -> Result<(), Failure> {
        self.call("terminate")?;
        let mut state = self.0.borrow_mut();
        if !state.stuck {
            state.active = false;
        }
        Ok(())
    }
    fn remove(&mut self, _: &()) -> Result<(), Failure> {
        self.call("remove")
    }
    fn label(&self, _: &()) -> String {
        "ca55d452-01c1-45c3-b0ad-73e3e3c28a45".into()
    }
}
impl Fake {
    fn call(&self, operation: &'static str) -> Result<(), Failure> {
        let mut state = self.0.borrow_mut();
        state.calls.push(operation);
        if state.reject == operation {
            Err(Failure::new("fixture-failure", operation))
        } else {
            Ok(())
        }
    }
}
fn fixture() -> (Rc<RefCell<State>>, Fake) {
    let state = Rc::new(RefCell::new(State {
        active: true,
        ..Default::default()
    }));
    (state.clone(), Fake(state))
}
fn admission() -> Admission {
    Admission {
        target: Identity {
            pid: 123,
            created: "42".into(),
        },
        job: "64".into(),
    }
}
fn install() -> String {
    format!(
        "{}\n",
        serde_json::json!({ "operation": "install", "sequence": 1, "admission": admission() })
    )
}
fn tiny() -> Duration {
    Duration::from_millis(1)
}

#[test]
fn rules_are_removed_only_after_zero_members_are_observed() {
    let (state, backend) = fixture();
    let mut guard = Controller::new(backend);
    guard.install(&admission()).unwrap();
    assert_eq!(guard.release().unwrap_err().code, "still-running");
    assert!(!state.borrow().calls.contains(&"remove"));
    state.borrow_mut().active = false;
    guard.release().unwrap();
    guard.release().unwrap();
    assert_eq!(
        state.borrow().calls,
        ["validate", "install", "observe", "observe", "remove"]
    );
}

#[test]
fn observer_errors_and_failed_termination_preserve_filters() {
    for rejected in ["observe", "terminate"] {
        let (state, backend) = fixture();
        let mut guard = Controller::new(backend);
        guard.install(&admission()).unwrap();
        state.borrow_mut().reject = rejected;
        assert!(guard.shutdown(tiny(), tiny()).is_err());
        assert!(!state.borrow().calls.contains(&"remove"));
    }
}

#[test]
fn shutdown_timeout_is_not_quiescence() {
    let (state, backend) = fixture();
    state.borrow_mut().stuck = true;
    let mut guard = Controller::new(backend);
    guard.install(&admission()).unwrap();
    assert_eq!(
        guard.shutdown(Duration::ZERO, tiny()).unwrap_err().code,
        "cleanup-unconfirmed"
    );
    assert!(!state.borrow().calls.contains(&"remove"));
}

#[test]
fn identity_failure_does_not_terminate_an_unowned_target() {
    let (state, backend) = fixture();
    state.borrow_mut().reject = "validate";
    let mut guard = Controller::new(backend);
    assert!(guard.install(&admission()).is_err());
    guard.shutdown(tiny(), tiny()).unwrap();
    assert_eq!(state.borrow().calls, ["validate"]);
}

#[test]
fn filter_installation_failure_stops_the_owned_bootstrap() {
    let (state, backend) = fixture();
    state.borrow_mut().reject = "install";
    let mut output = Vec::new();
    assert!(serve(backend, Cursor::new(install()), &mut output, tiny(), tiny()).is_err());
    assert!(state.borrow().calls.contains(&"terminate"));
    assert!(!state.borrow().calls.contains(&"remove"));
    let reply: serde_json::Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(reply["ok"], false);
}

#[test]
fn failed_removal_retains_the_lease_for_explicit_retry() {
    let (state, backend) = fixture();
    let mut guard = Controller::new(backend);
    guard.install(&admission()).unwrap();
    {
        let mut value = state.borrow_mut();
        value.active = false;
        value.reject = "remove";
    }
    assert!(guard.release().is_err());
    state.borrow_mut().reject = "";
    guard.release().unwrap();
    assert_eq!(
        state
            .borrow()
            .calls
            .iter()
            .filter(|&&value| value == "remove")
            .count(),
        2
    );
}

#[test]
fn helpers_accept_only_one_execution_even_after_release() {
    let (_, backend) = fixture();
    let mut guard = Controller::new(backend);
    guard.install(&admission()).unwrap();
    assert_eq!(
        guard.install(&admission()).unwrap_err().code,
        "invalid-state"
    );
    guard.shutdown(tiny(), tiny()).unwrap();
    assert_eq!(
        guard.install(&admission()).unwrap_err().code,
        "invalid-state"
    );
}

#[test]
fn eof_after_install_stops_and_joins_before_removing_rules() {
    let (state, backend) = fixture();
    let mut output = Vec::new();
    serve(backend, Cursor::new(install()), &mut output, tiny(), tiny()).unwrap();
    assert_eq!(
        state.borrow().calls,
        [
            "validate",
            "install",
            "observe",
            "terminate",
            "observe",
            "observe",
            "remove"
        ]
    );
    let reply: serde_json::Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(reply["ok"], true);
}

#[test]
fn replay_unknown_fields_and_truncated_messages_stop_admitted_work() {
    for tail in [
        "{\"operation\":\"release\",\"sequence\":1}\n",
        "{\"operation\":\"release\",\"sequence\":0}\n",
        "{\"operation\":\"delete\",\"sequence\":2}\n",
        "{\"operation\":\"release\",\"sequence\":2,\"filter\":123}\n",
        "{\"operation\":\"release\",\"sequence\":2}",
    ] {
        let (state, backend) = fixture();
        assert!(serve(
            backend,
            Cursor::new(install() + tail),
            Vec::new(),
            tiny(),
            tiny()
        )
        .is_err());
        assert!(state.borrow().calls.contains(&"terminate"));
        assert!(state.borrow().calls.contains(&"remove"));
    }
}

#[test]
fn size_limit_applies_before_parsing_or_allocating_native_resources() {
    let (state, backend) = fixture();
    assert_eq!(
        serve(
            backend,
            Cursor::new(vec![b'x'; 70000]),
            Vec::new(),
            tiny(),
            tiny()
        )
        .unwrap_err()
        .code,
        "invalid-request"
    );
    assert!(state.borrow().calls.is_empty());
}

#[test]
fn failing_reply_delivery_never_leaves_a_running_unobserved_job() {
    struct Broken;
    impl Write for Broken {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::ErrorKind::BrokenPipe.into())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let (state, backend) = fixture();
    assert_eq!(
        serve(backend, Cursor::new(install()), Broken, tiny(), tiny())
            .unwrap_err()
            .code,
        "transport-failed"
    );
    assert!(!state.borrow().active);
    assert!(state.borrow().calls.contains(&"remove"));
}

#[test]
fn explicit_stop_acknowledges_quiescent_cleanup() {
    let (state, backend) = fixture();
    let input = install() + "{\"sequence\":2,\"operation\":\"stop\"}\n";
    let mut output = Vec::new();
    serve(backend, Cursor::new(input), &mut output, tiny(), tiny()).unwrap();
    let lines: Vec<serde_json::Value> = String::from_utf8(output)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(
        lines[1],
        serde_json::json!({ "sequence": 2, "ok": true, "value": null })
    );
    assert!(!state.borrow().active);
}

#[test]
fn malformed_kernel_integers_never_reach_the_native_provider() {
    for value in [
        "",
        "00",
        "-1",
        "1.5",
        "9007199254740993e0",
        "18446744073709551616",
        " 42",
    ] {
        let (state, backend) = fixture();
        let mut guard = Controller::new(backend);
        let mut request = admission();
        request.target.created = value.into();
        assert!(guard.install(&request).is_err());
        assert!(state.borrow().calls.is_empty());
    }
}

#[test]
fn filetime_is_not_truncated_to_a_javascript_number() {
    let identity = Identity {
        pid: 123,
        created: "134121339991234567".into(),
    };
    assert_eq!(identity.ticks().unwrap(), 134121339991234567);
}
