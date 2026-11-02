//! Read-only process-observation acceptance driver. This binary is not part of the helper's IPC or distribution.
#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use dshu_target_guard::{recovery::RecoveryRecord, windows::*, Identity};
    use std::io::Read;
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("cohort") => println!("{}", serde_json::to_string(&recovery_fixture_cohort()?)?),
        Some("target") if args.len() == 3 => println!(
            "{}",
            recovery_fixture_target(&Identity {
                pid: args[1].parse()?,
                created: args[2].clone()
            })?
        ),
        Some("inspect") => {
            let mut bytes = Vec::new();
            std::io::stdin().take(262145).read_to_end(&mut bytes)?;
            if bytes.len() > 262144 {
                return Err("record too large".into());
            }
            let record: RecoveryRecord = serde_json::from_slice(&bytes)?;
            match inspect_recovery_record(&record) {
                Ok(()) => println!("quiescent"),
                Err(error) => println!("{}", error.code),
            }
        }
        _ => return Err("expected cohort, target or inspect".into()),
    }
    Ok(())
}

#[cfg(not(windows))]
fn main() {
    eprintln!("Windows-only observation fixture");
    std::process::exit(1);
}
