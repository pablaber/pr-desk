#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{path::PathBuf, time::Duration};
use tokio::process::Command;

fn gh_path() -> Result<PathBuf, String> {
    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/bin/gh"),
        PathBuf::from("/usr/local/bin/gh"),
    ];
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|p| p.join("gh")));
    }
    candidates.into_iter().find(|p| p.is_file()).ok_or_else(|| {
        "gh was not found. Install GitHub CLI with brew install gh, then reopen PR Desk.".into()
    })
}

#[tauri::command]
async fn github(operation: String, query: Option<String>) -> Result<serde_json::Value, String> {
    let path = gh_path()?;
    let mut command = Command::new(path);
    command
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .kill_on_drop(true);
    match operation.as_str() {
        "auth" => {
            command.args(["auth", "status", "--hostname", "github.com"]);
        }
        "graphql" => {
            let query = query.ok_or("Missing query")?;
            let operation_name = [
                "DeskViewer",
                "DeskSearch",
                "DeskRepository",
                "DeskPullRequest",
            ]
            .into_iter()
            .find(|name| query.trim_start().starts_with(&format!("query {name} {{")))
            .ok_or("Only named PR Desk read-only queries are allowed")?;
            // Select the named query explicitly, even if another operation appears in the document.
            command
                .args(["api", "--hostname", "github.com", "graphql", "-f"])
                .arg(format!("query={query}"))
                .arg("-f")
                .arg(format!("operationName={operation_name}"));
        }
        _ => return Err("Unsupported GitHub operation".into()),
    }
    let output = tokio::time::timeout(Duration::from_secs(45), command.output())
        .await
        .map_err(|_| "GitHub request timed out. Try refreshing.".to_string())?
        .map_err(|e| format!("Could not launch gh: {e}"))?;
    if !output.status.success() {
        // Never return auth output: gh may include credential details in diagnostics.
        if operation == "auth" {
            return Err("GitHub authentication failed. Run gh auth login --hostname github.com in Terminal, then retry.".into());
        }
        return Err(format!("GitHub request failed ({}). Check repository access, connectivity, and API rate limits.", output.status));
    }
    if operation == "auth" {
        return Ok(serde_json::Value::Null);
    }
    let value: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|_| "Invalid GitHub response")?;
    if value.get("errors").is_some() {
        return Err("GitHub could not complete this query. Check access and try again.".into());
    }
    Ok(value["data"].clone())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![github])
        .run(tauri::generate_context!())
        .expect("error running PR Desk");
}
