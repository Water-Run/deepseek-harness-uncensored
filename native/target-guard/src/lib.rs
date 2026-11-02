//! Private guard protocol and resource ownership, independent of the Windows transport.
use serde::{Deserialize, Serialize};
use std::io::{BufRead, Read, Write};
use std::time::{Duration, Instant};

#[cfg(windows)]
pub mod windows;

/// Kernel identity uses decimal FILETIME to avoid JSON floating-point truncation.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Identity {
    pub pid: u32,
    pub created: String,
}

impl Identity {
    pub fn ticks(&self) -> Result<u64, Failure> {
        let value = decimal(&self.created)?;
        if self.pid == 0 || value == 0 {
            return Err(Failure::new(
                "invalid-identity",
                "A live PID and creation FILETIME are required.",
            ));
        }
        Ok(value)
    }
}

/// One owned Job containing only the stopped bootstrap at admission.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Admission {
    pub target: Identity,
    pub job: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Request {
    Install { sequence: u32, admission: Admission },
    Release { sequence: u32 },
    Stop { sequence: u32 },
}

impl Request {
    fn sequence(&self) -> u32 {
        match self {
            Self::Install { sequence, .. }
            | Self::Release { sequence }
            | Self::Stop { sequence } => *sequence,
        }
    }
}

/// Failures do not imply rollback of WFP state or successful process termination.
#[derive(Debug, Serialize)]
pub struct Failure {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub win32: Option<u32>,
}

impl Failure {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            win32: None,
        }
    }
}

impl std::fmt::Display for Failure {
    fn fmt(&self, out: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(out, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for Failure {}

pub fn decimal(value: &str) -> Result<u64, Failure> {
    if value.is_empty()
        || value.len() > 20
        || !value.bytes().all(|byte| byte.is_ascii_digit())
        || value.len() > 1 && value.starts_with('0')
    {
        return Err(Failure::new(
            "invalid-identity",
            "Expected a canonical unsigned decimal integer.",
        ));
    }
    value.parse().map_err(|_| {
        Failure::new(
            "invalid-identity",
            "Integer exceeds the Windows identity range.",
        )
    })
}

/// OS provider keeps persistent filters on any unconfirmed shutdown.
pub trait Backend {
    type Scope;
    type Lease;
    fn validate(&mut self, admission: &Admission) -> Result<Self::Scope, Failure>;
    fn install(&mut self, scope: &Self::Scope) -> Result<Self::Lease, Failure>;
    fn is_empty(&mut self, scope: &Self::Scope) -> Result<bool, Failure>;
    fn terminate(&mut self, scope: &Self::Scope) -> Result<(), Failure>;
    fn remove(&mut self, lease: &Self::Lease) -> Result<(), Failure>;
    fn label(&self, lease: &Self::Lease) -> String;
}

pub struct Controller<B: Backend> {
    backend: B,
    scope: Option<B::Scope>,
    lease: Option<B::Lease>,
    installed: bool,
    closed: bool,
}

impl<B: Backend> Controller<B> {
    pub fn new(backend: B) -> Self {
        Self {
            backend,
            scope: None,
            lease: None,
            installed: false,
            closed: false,
        }
    }

    pub fn install(&mut self, admission: &Admission) -> Result<String, Failure> {
        if self.installed || self.closed {
            return Err(Failure::new(
                "invalid-state",
                "This helper accepts one execution only.",
            ));
        }
        admission.target.ticks()?;
        if decimal(&admission.job)? == 0 {
            return Err(Failure::new(
                "invalid-identity",
                "A nonzero Job handle is required.",
            ));
        }
        let scope = self.backend.validate(admission)?;
        self.scope = Some(scope);
        self.installed = true;
        let lease = self.backend.install(self.scope.as_ref().unwrap())?;
        let label = self.backend.label(&lease);
        self.lease = Some(lease);
        Ok(label)
    }

    pub fn release(&mut self) -> Result<(), Failure> {
        if self.closed {
            return Ok(());
        }
        if let Some(scope) = &self.scope {
            if !self.backend.is_empty(scope)? {
                return Err(Failure::new(
                    "still-running",
                    "The entire Job must exit before inbound rules are removed.",
                ));
            }
        }
        if let Some(lease) = &self.lease {
            self.backend.remove(lease)?;
        }
        self.lease = None;
        self.scope = None;
        self.closed = true;
        Ok(())
    }

    pub fn shutdown(&mut self, budget: Duration, poll: Duration) -> Result<(), Failure> {
        let start = Instant::now();
        if let Some(scope) = &self.scope {
            if !self.backend.is_empty(scope)? {
                self.backend.terminate(scope)?;
            }
            while !self.backend.is_empty(scope)? {
                if start.elapsed() >= budget {
                    return Err(Failure::new(
                        "cleanup-unconfirmed",
                        "Job shutdown is unconfirmed; persistent inbound rules remain.",
                    ));
                }
                std::thread::sleep(poll.min(budget.saturating_sub(start.elapsed())));
            }
        }
        self.release()
    }
}

/// Bounded, strictly sequenced private IPC. EOF or reporting failure always stops the owned range.
pub fn serve<B: Backend>(
    backend: B,
    input: impl BufRead,
    mut output: impl Write,
    budget: Duration,
    poll: Duration,
) -> Result<(), Failure> {
    let mut controller = Controller::new(backend);
    let operation = (|| {
        let mut input = input;
        let mut sequence = 0;
        loop {
            let mut bytes = Vec::new();
            let length = input
                .by_ref()
                .take(65537)
                .read_until(b'\n', &mut bytes)
                .map_err(|error| Failure::new("transport-failed", error.to_string()))?;
            if length == 0 {
                return Ok(());
            }
            if length > 65536 || bytes.last() != Some(&b'\n') {
                return Err(Failure::new(
                    "invalid-request",
                    "Guard requests must be newline-terminated and at most 64 KiB.",
                ));
            }
            let request: Request = serde_json::from_slice(&bytes).map_err(|_| {
                Failure::new("invalid-request", "Invalid guard operation or fields.")
            })?;
            if request.sequence() == 0 || request.sequence() <= sequence {
                return Err(Failure::new(
                    "invalid-request",
                    "Guard sequence was reused or decreased.",
                ));
            }
            sequence = request.sequence();
            let result = match request {
                Request::Install { admission, .. } => controller
                    .install(&admission)
                    .map(|scope| serde_json::json!({ "scope": scope })),
                Request::Release { .. } => controller.release().map(|_| serde_json::Value::Null),
                Request::Stop { .. } => controller
                    .shutdown(budget, poll)
                    .map(|_| serde_json::Value::Null),
            };
            let failed = result.is_err();
            let reply = match result {
                Ok(value) => {
                    serde_json::json!({ "sequence": sequence, "ok": true, "value": value })
                }
                Err(error) => {
                    serde_json::json!({ "sequence": sequence, "ok": false, "error": error })
                }
            };
            serde_json::to_writer(&mut output, &reply)
                .map_err(|error| Failure::new("transport-failed", error.to_string()))?;
            output
                .write_all(b"\n")
                .and_then(|_| output.flush())
                .map_err(|error| Failure::new("transport-failed", error.to_string()))?;
            if failed {
                return Err(Failure::new(
                    "operation-failed",
                    "The guard refused the operation; dependent execution must stop.",
                ));
            }
        }
    })();
    let cleanup = controller.shutdown(budget, poll);
    cleanup.and(operation)
}
