use serde_json::Value;
use std::time::Duration;
use tokio::process::Command;

const FAILURE: &str = "Could not merge this PR. Check repository permissions, allowed merge methods, and branch or merge queue rules on GitHub. Refresh before retrying; the merge may already have succeeded.";

async fn gh(args: &[&str]) -> Result<Value, String> {
    let output = Command::new(crate::gh_path()?)
        .args(args)
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|_| "Could not launch GitHub CLI".to_string())?;
    if !output.status.success() {
        return Err(FAILURE.into());
    }
    serde_json::from_slice(&output.stdout).map_err(|_| "Invalid GitHub response".into())
}

fn validate_input(url: &str, head_oid: &str, method: &str) -> Result<(), String> {
    crate::validate_pr_url(url)?;
    if head_oid.len() != 40 || !head_oid.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Missing or invalid commit. Refresh before merging.".into());
    }
    if !["squash", "merge", "rebase"].contains(&method) {
        return Err("Unsupported merge method".into());
    }
    Ok(())
}

fn validate_ready(pr: &Value, head_oid: &str, login: &str) -> Result<(), String> {
    let checks_pass = match &pr["statusCheckRollup"] {
        Value::Null => true,
        Value::Array(checks) => checks.iter().all(|check| {
            if check["__typename"] == "CheckRun" {
                check["status"] == "COMPLETED"
                    && ["SUCCESS", "NEUTRAL", "SKIPPED"]
                        .contains(&check["conclusion"].as_str().unwrap_or(""))
            } else {
                check["__typename"] == "StatusContext" && check["state"] == "SUCCESS"
            }
        }),
        _ => false,
    };
    if pr["state"] != "OPEN"
        || pr["isDraft"] != false
        || pr["headRefOid"] != head_oid
        || pr["reviewDecision"] != "APPROVED"
        || pr["mergeable"] != "MERGEABLE"
        || !["CLEAN", "HAS_HOOKS", "UNSTABLE"]
            .contains(&pr["mergeStateStatus"].as_str().unwrap_or(""))
        || login.is_empty()
        || !pr["author"]["login"]
            .as_str()
            .unwrap_or("")
            .eq_ignore_ascii_case(login)
        || pr.get("statusCheckRollup").is_none()
        || !checks_pass
    {
        return Err("This PR changed or is no longer ready to merge. Cancel and refresh before trying again.".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn merge_pr(url: String, head_oid: String, method: String) -> Result<(), String> {
    validate_input(&url, &head_oid, &method)?;
    tokio::time::timeout(Duration::from_secs(45), async {
        let user = gh(&["api", "--hostname", "github.com", "user"]).await?;
        let pr = gh(&["pr", "view", &url, "--json", "state,isDraft,headRefOid,author,reviewDecision,mergeable,mergeStateStatus,statusCheckRollup"]).await?;
        validate_ready(&pr, &head_oid, user["login"].as_str().unwrap_or(""))?;
        let path = url.strip_prefix("https://github.com/").unwrap();
        let (repository, number) = path.rsplit_once("/pull/").unwrap();
        let endpoint = format!("repos/{repository}/pulls/{number}/merge");
        // Pin the mutation to the commit shown in the confirmation; never enable auto-merge
        // or bypass repository rules. GitHub atomically rejects a changed head.
        let result = gh(&["api", "--hostname", "github.com", "--method", "PUT", &endpoint,
            "-f", &format!("sha={head_oid}"), "-f", &format!("merge_method={method}")]).await?;
        if result["merged"] != true {
            return Err(FAILURE.into());
        }
        Ok(())
    }).await.map_err(|_| "Merge timed out. Refresh the PR on GitHub before retrying; it may already have merged.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ready() -> Value {
        json!({"state":"OPEN", "isDraft":false, "headRefOid":"a".repeat(40),
            "author":{"login":"me"}, "reviewDecision":"APPROVED", "mergeable":"MERGEABLE",
            "mergeStateStatus":"CLEAN", "statusCheckRollup":[]})
    }

    #[test]
    fn accepts_only_fixed_merge_methods_and_valid_targets() {
        for method in ["squash", "merge", "rebase"] {
            assert!(validate_input(
                "https://github.com/acme/api/pull/1",
                &"a".repeat(40),
                method
            )
            .is_ok());
        }
        for (url, oid, method) in [
            ("--help", "a".repeat(40), "squash"),
            ("https://github.com/acme/api/pull/1", "bad".into(), "squash"),
            (
                "https://github.com/acme/api/pull/1",
                "a".repeat(40),
                "--admin",
            ),
        ] {
            assert!(validate_input(url, &oid, method).is_err());
        }
    }

    #[test]
    fn rejects_changed_head_and_every_non_ready_state() {
        let oid = "a".repeat(40);
        assert!(validate_ready(&ready(), &oid, "ME").is_ok());
        assert!(validate_ready(&ready(), &oid, "other").is_err());
        for (key, value) in [
            ("state", json!("MERGED")),
            ("isDraft", json!(true)),
            ("headRefOid", json!("b".repeat(40))),
            ("reviewDecision", json!("REVIEW_REQUIRED")),
            ("mergeable", json!("UNKNOWN")),
            ("mergeStateStatus", json!("BLOCKED")),
        ] {
            let mut pr = ready();
            pr[key] = value;
            assert!(validate_ready(&pr, &oid, "me").is_err(), "{key}");
        }
    }

    #[test]
    fn all_checks_must_pass_including_optional_and_unknown_checks() {
        for (check, passing) in [
            (
                json!({"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}),
                true,
            ),
            (
                json!({"__typename":"CheckRun","status":"COMPLETED","conclusion":"NEUTRAL"}),
                true,
            ),
            (
                json!({"__typename":"CheckRun","status":"COMPLETED","conclusion":"SKIPPED"}),
                true,
            ),
            (
                json!({"__typename":"StatusContext","state":"SUCCESS"}),
                true,
            ),
            (
                json!({"__typename":"CheckRun","status":"IN_PROGRESS","conclusion":"SUCCESS"}),
                false,
            ),
            (
                json!({"__typename":"CheckRun","status":"COMPLETED","conclusion":"FAILURE"}),
                false,
            ),
            (
                json!({"__typename":"StatusContext","state":"PENDING"}),
                false,
            ),
            (json!({"__typename":"StatusContext","state":"ERROR"}), false),
            (json!({"__typename":"Unknown"}), false),
        ] {
            let mut pr = ready();
            pr["statusCheckRollup"] = json!([check]);
            assert_eq!(validate_ready(&pr, &"a".repeat(40), "me").is_ok(), passing);
        }
    }
}
