use std::{
    os::unix::process::CommandExt,
    path::Path,
    process::{Command, Stdio},
};
use tauri::AppHandle;

/// Waits up to 30 seconds for the old process ($1) to exit, then opens the bundle ($2). Both are
/// positional arguments, so nothing is interpolated into the script.
const RELAUNCH_SCRIPT: &str = r#"i=0
while /bin/kill -0 "$1" 2>/dev/null && [ "$i" -lt 300 ]; do /bin/sleep 0.1; i=$((i + 1)); done
exec /usr/bin/open "$2""#;

/// The `.app` directory containing `Contents/MacOS/<binary>`, or `None` outside a bundle.
fn app_bundle(binary: &Path) -> Option<&Path> {
    let macos = binary.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    (macos.file_name()? == "MacOS"
        && contents.file_name()? == "Contents"
        && bundle.extension()? == "app")
        .then_some(bundle)
}

/// Restarts into the freshly installed bundle after an update.
///
/// Tauri's own restart runs `open -n` while this process is still alive, so LaunchServices starts
/// the new copy as a second instance and the Dock gives it its own icon beside the pinned one until
/// the app is quit and reopened. Opening the bundle only once this process has exited starts it as
/// the one ordinary instance.
#[tauri::command]
pub fn relaunch_app(app: AppHandle) -> Result<(), String> {
    let binary = std::env::current_exe().map_err(|e| format!("Could not locate PR Desk: {e}"))?;
    let Some(bundle) = app_bundle(&binary) else {
        app.restart();
    };
    Command::new("/bin/sh")
        .arg("-c")
        .arg(RELAUNCH_SCRIPT)
        .arg("pr-desk-relaunch")
        .arg(std::process::id().to_string())
        .arg(bundle)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        // Its own process group, so it survives this process exiting.
        .process_group(0)
        .spawn()
        .map_err(|e| format!("Could not start the relaunch helper: {e}"))?;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_bundle_only_for_a_binary_inside_one() {
        assert_eq!(
            app_bundle(Path::new(
                "/Applications/PR Desk.app/Contents/MacOS/pr-desk"
            )),
            Some(Path::new("/Applications/PR Desk.app"))
        );
        for path in [
            "/repo/src-tauri/target/debug/pr-desk",
            "/Applications/PR Desk.app/Contents/Resources/pr-desk",
            "/Applications/PR Desk/Contents/MacOS/pr-desk",
            "/Contents/MacOS/pr-desk",
        ] {
            assert_eq!(app_bundle(Path::new(path)), None, "{path}");
        }
    }

    #[test]
    fn opens_the_bundle_after_the_old_process_exits() {
        let mut child = Command::new("/bin/sleep").arg("0.3").spawn().unwrap();
        let pid = child.id().to_string();
        // Reap it as launchd would; an unreaped zombie still answers kill -0.
        let reaper = std::thread::spawn(move || child.wait());
        let started = std::time::Instant::now();
        // `true` stands in for open so the test launches nothing.
        let script = RELAUNCH_SCRIPT.replace("/usr/bin/open", "/usr/bin/true");
        let status = Command::new("/bin/sh")
            .args(["-c", &script, "test", &pid, "/nowhere.app"])
            .status()
            .unwrap();
        assert!(status.success());
        assert!(started.elapsed() >= std::time::Duration::from_millis(250));
        reaper.join().unwrap().unwrap();
    }
}
