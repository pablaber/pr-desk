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

fn validate_pr_url(url: &str) -> Result<(), String> {
    let parts: Vec<_> = url
        .strip_prefix("https://github.com/")
        .unwrap_or("")
        .split('/')
        .collect();
    let valid_name = |s: &str| {
        !s.is_empty()
            && s != "."
            && s != ".."
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
    };
    if parts.len() != 4
        || !valid_name(parts[0])
        || !valid_name(parts[1])
        || parts[2] != "pull"
        || parts[3].parse::<u64>().unwrap_or(0) == 0
        || !parts[3].bytes().all(|b| b.is_ascii_digit())
    {
        return Err("Invalid GitHub pull request URL".into());
    }
    Ok(())
}

fn stale_comment(value: &serde_json::Value) -> Result<String, String> {
    let age = value["ageSeconds"]
        .as_f64()
        .filter(|age| age.is_finite() && *age > 28.0 * 86400.0);
    if value["state"] != "OPEN" || age.is_none() {
        return Err("This PR is no longer open with red staleness. Refresh and try again.".into());
    }
    let days = (age.unwrap() / 86400.0).floor() as u64;
    Ok(format!("🤖 This PR has been closed via the PR Desk application because it is stale and hasn't been updated in {days} days."))
}

async fn stale_gh(args: &[&str]) -> Result<Vec<u8>, String> {
    let output = Command::new(gh_path()?)
        .args(args)
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|_| "Could not launch GitHub CLI".to_string())?;
    if !output.status.success() {
        return Err("Could not complete Close as stale. Check repository permissions and connectivity, then refresh the PR on GitHub before retrying; the comment or closure may already have succeeded.".into());
    }
    Ok(output.stdout)
}

#[tauri::command]
async fn close_stale_pr(url: String) -> Result<(), String> {
    validate_pr_url(&url)?;
    // Keep this explicit action separate from the read-only GraphQL transport.
    tokio::time::timeout(Duration::from_secs(45), async {
        let output = stale_gh(&["pr", "view", &url, "--json", "state,updatedAt", "--jq",
            "{state: .state, ageSeconds: (now - (.updatedAt | fromdateiso8601))}"]).await?;
        let value = serde_json::from_slice(&output).map_err(|_| "Invalid GitHub response")?;
        let comment = stale_comment(&value)?;
        stale_gh(&["pr", "close", &url, "--comment", &comment]).await?;
        Ok(())
    }).await.map_err(|_| "Close as stale timed out. Refresh the PR on GitHub before retrying; the comment or closure may already have succeeded.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn validates_only_github_pr_urls() {
        assert!(validate_pr_url("https://github.com/acme/platform/pull/12").is_ok());
        for url in [
            "--help",
            "https://evil.com/acme/platform/pull/1",
            "https://github.com/acme/platform/pull/0",
            "https://github.com/acme/platform/pull/1?x",
            "https://github.com/../platform/pull/1",
        ] {
            assert!(validate_pr_url(url).is_err(), "{url}");
        }
    }
    #[test]
    fn closes_only_open_red_stale_prs_with_whole_days() {
        assert_eq!(stale_comment(&json!({"state":"OPEN","ageSeconds":30.9*86400.0})).unwrap(),
            "🤖 This PR has been closed via the PR Desk application because it is stale and hasn't been updated in 30 days.");
        for value in [
            json!({"state":"OPEN","ageSeconds":28*86400}),
            json!({"state":"CLOSED","ageSeconds":30*86400}),
            json!({"state":"MERGED","ageSeconds":30*86400}),
            json!({"state":"OPEN"}),
        ] {
            assert!(stale_comment(&value).is_err());
        }
        assert!(stale_comment(&json!({"state":"OPEN","ageSeconds":28*86400+1})).is_ok());
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![github, close_stale_pr])
        .run(tauri::generate_context!())
        .expect("error running PR Desk");
}
