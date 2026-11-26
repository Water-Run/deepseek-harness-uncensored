"""Run the packaged Linux updater against a known older public release on an X11 display."""

import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time


def runtime_version(value):
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", value):
        raise argparse.ArgumentTypeError("Use the three-part runtime version printed by the desktop updater")
    return value


def stop_desktop(process):
    # Electron can leave helpers in the process group after its main process exits.
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            break
        if sig == signal.SIGTERM:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
    process.wait(timeout=5)


def check(binary, kind, current, latest):
    if (binary.parent / "resources/package-type").read_text().strip() != kind:
        raise ValueError("The desktop binary has a different package-type")
    expected = f"Update for version {current} is not available (latest version: {latest}, downgrade is disallowed)."
    with tempfile.TemporaryDirectory(prefix="dshu-update-") as directory:
        home = Path(directory)
        journal = home / "journal"
        (home / "Documents").mkdir()
        config = home / "config"
        config.mkdir()
        (config / "user-dirs.dirs").write_text('XDG_DOCUMENTS_DIR="$HOME/Documents"\n')
        env = {key: os.environ[key] for key in ("DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS", "USER", "LOGNAME") if key in os.environ}
        env.update(HOME=directory, PATH="/usr/local/bin:/usr/bin:/bin", LANG="C.UTF-8",
                   DSH_UNCENSORED_HOME=str(home / "dshu"), DSH_DESKTOP_UPDATE_JOURNAL_DIR=str(journal),
                   XDG_CONFIG_HOME=str(config), XDG_CACHE_HOME=str(home / "cache"),
                   XDG_DATA_HOME=str(home / "data"), XDG_STATE_HOME=str(home / "state"))
        log = home / "desktop.log"
        with log.open("xb") as output:
            process = subprocess.Popen([binary, f"--user-data-dir={home / 'chromium'}"], env=env,
                                       cwd=home, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            deadline = time.monotonic() + 90
            with log.open("rb") as reader:
                seen = b""
                needle = expected.encode()
                while time.monotonic() < deadline:
                    seen += reader.read()
                    if needle in seen:
                        break
                    if process.poll() is not None:
                        raise RuntimeError("Desktop exited before it reported the public version")
                    seen = seen[-len(needle):]
                    time.sleep(0.25)
                else:
                    raise RuntimeError("The updater did not report the expected public version within 90 seconds")
        finally:
            stop_desktop(process)
        report, = journal.glob("*.jsonl")
        events = [json.loads(row) for row in report.read_text().splitlines()]
        phases = [event["phase"] for event in events if event["event"] == "state"]
        if not events or events[0]["event"] != "started" or any(event["version"] != current for event in events):
            raise RuntimeError("The update journal did not identify the expected installed version")
        if not phases or phases[-1] != "idle" or set(phases) - {"checking", "idle"}:
            raise RuntimeError(f"Unexpected update states: {phases}")
        if any(event["event"] in ("download-requested", "install-confirmed") for event in events):
            raise RuntimeError("Unexpected transfer or installation during a downgrade check")
        return {"packageType": kind, "version": current, "latest": latest, "updatePhases": phases, "updaterMessage": expected}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", type=Path)
    parser.add_argument("kind", choices=("deb", "rpm"))
    parser.add_argument("installed", type=runtime_version)
    parser.add_argument("latest", type=runtime_version)
    args = parser.parse_args()
    if tuple(map(int, args.latest.split("."))) >= tuple(map(int, args.installed.split("."))):
        parser.error("This check requires an installed candidate newer than the public release")
    print(json.dumps(check(args.binary.resolve(strict=True), args.kind, args.installed, args.latest), indent=2))
