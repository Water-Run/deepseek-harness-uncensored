//! Private inherited-pipe entry. Product elevation and recovery are not enabled by this executable alone.
#[cfg(windows)]
fn main() {
    use dshu_target_guard::{serve, windows::WindowsBackend, Failure, Identity};
    use std::time::Duration;
    let result = (|| -> Result<(), Failure> {
        let args: Vec<String> = std::env::args().skip(1).collect();
        if args.len() != 5 || args[0] != "--stdio" {
            return Err(Failure::new(
                "invalid-request",
                "Private usage: --stdio <owner-pid> <owner-FILETIME> <shutdown-ms> <poll-ms>",
            ));
        }
        let pid = args[1]
            .parse()
            .map_err(|_| Failure::new("invalid-identity", "Invalid owner PID."))?;
        let owner = Identity {
            pid,
            created: args[2].clone(),
        };
        let shutdown = dshu_target_guard::decimal(&args[3])?;
        let poll = dshu_target_guard::decimal(&args[4])?;
        if shutdown == 0 || shutdown > 300000 || poll == 0 || poll > shutdown {
            return Err(Failure::new(
                "invalid-request",
                "Invalid shutdown observation budget.",
            ));
        }
        let backend = WindowsBackend::authenticated(owner)?;
        serve(
            backend,
            std::io::stdin().lock(),
            std::io::stdout().lock(),
            Duration::from_millis(shutdown),
            Duration::from_millis(poll),
        )
    })();
    if let Err(error) = result {
        eprintln!(
            "{}",
            serde_json::to_string(&error)
                .unwrap_or_else(|_| "target-guard error reporting failed".into())
        );
        std::process::exit(1);
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("DSHU target guard requires Windows.");
    std::process::exit(1);
}
