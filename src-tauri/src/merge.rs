use serde_json::Value;
use std::time::Duration;
use tokio::process::Command;

const FAILURE: &str = "Could not merge this PR. Check repository permissions, allowed merge methods, and branch or merge queue rules on GitHub. Refresh before retrying; the merge may already have succeeded.";

async fn gh(args: &[&str]) -> Result<Value, String> {
    gh_or(args, FAILURE).await
}

async fn gh_or(args: &[&str], failure: &str) -> Result<Value, String> {
    let output = Command::new(crate::gh_path()?)
        .args(args)
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|_| "Could not launch GitHub CLI".to_string())?;
    if !output.status.success() {
        let body = serde_json::from_slice(&output.stdout).unwrap_or_default();
        return Err(with_reason(failure, &body));
    }
    serde_json::from_slice(&output.stdout).map_err(|_| "Invalid GitHub response".into())
}

// gh api prints GitHub's error body on failure; its message names the rule that refused
// the request, such as a required merge queue or a disallowed merge method.
fn with_reason(failure: &str, body: &Value) -> String {
    let reason = body["message"]
        .as_str()
        .unwrap_or("")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if reason.is_empty() {
        return failure.into();
    }
    format!(
        "{failure} GitHub said: {}",
        reason.chars().take(300).collect::<String>()
    )
}

fn validate_head(url: &str, head_oid: &str) -> Result<(), String> {
    crate::validate_pr_url(url)?;
    if head_oid.len() != 40 || !head_oid.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Missing or invalid commit. Refresh before trying again.".into());
    }
    Ok(())
}

fn validate_input(url: &str, head_oid: &str, method: &str) -> Result<(), String> {
    validate_head(url, head_oid)?;
    if !["squash", "merge", "rebase"].contains(&method) {
        return Err("Unsupported merge method".into());
    }
    Ok(())
}

// A known bot is a GitHub App, `name[bot]`, which gh reports as `app/name`, or a machine
// user's bare login. The account type must match too, so a user never passes for an App.
fn bot_key(author: &Value) -> Option<String> {
    let login = author["login"].as_str()?.to_ascii_lowercase();
    match author["is_bot"].as_bool()? {
        true => Some(format!("{}[bot]", login.strip_prefix("app/")?)),
        false => Some(login),
    }
}

fn author_allowed(pr: &Value, login: &str, bot: Option<&str>) -> bool {
    let author = pr["author"]["login"].as_str().unwrap_or("");
    if !login.is_empty() && author.eq_ignore_ascii_case(login) {
        return true;
    }
    !author.is_empty()
        && bot.is_some_and(|bot| bot_key(&pr["author"]) == Some(bot.to_ascii_lowercase()))
}

const PR_FIELDS: &str = "state,isDraft,headRefOid,author,reviewDecision,mergeable,mergeStateStatus,statusCheckRollup,autoMergeRequest";

// Pending or unknown checks never pass; an empty or missing rollup means no checks.
fn checks_pass(pr: &Value) -> bool {
    match &pr["statusCheckRollup"] {
        Value::Null => pr.get("statusCheckRollup").is_some(),
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
    }
}

// Merging a stacked PR also lands every open PR below it, so only an unstacked PR or the
// bottom of a stack merges exactly what was confirmed. A missing stack field is not trusted.
fn merges_alone(pr: &Value) -> Result<(), String> {
    let alone = match &pr["stack"] {
        Value::Null => pr.get("stack").is_some(),
        stack => stack["position"] == 1,
    };
    if !alone {
        return Err("This PR is stacked on other open PRs. Merge the bottom of the stack first, then refresh.".into());
    }
    Ok(())
}

// gh pr view has no stack field; the REST pull carries it from this API version on.
const API_VERSION: &str = "X-GitHub-Api-Version: 2026-03-10";

// GitHub omits stack from the REST pull of an unstacked PR rather than returning null.
fn with_stack(mut pr: Value, pull: &Value) -> Value {
    pr["stack"] = pull["stack"].clone();
    pr
}

async fn view(url: &str) -> Result<Value, String> {
    let pr = gh(&["pr", "view", url, "--json", PR_FIELDS]).await?;
    let pull = gh(&[
        "api",
        "--hostname",
        "github.com",
        "-H",
        API_VERSION,
        &pull_endpoint(url),
    ])
    .await?;
    Ok(with_stack(pr, &pull))
}

fn validate_ready(
    pr: &Value,
    head_oid: &str,
    login: &str,
    bot: Option<&str>,
) -> Result<(), String> {
    merges_alone(pr)?;
    if pr["state"] != "OPEN"
        || pr["isDraft"] != false
        || pr["headRefOid"] != head_oid
        || pr["reviewDecision"] != "APPROVED"
        || pr["mergeable"] != "MERGEABLE"
        || !["CLEAN", "HAS_HOOKS", "UNSTABLE"]
            .contains(&pr["mergeStateStatus"].as_str().unwrap_or(""))
        || !author_allowed(pr, login, bot)
        || !checks_pass(pr)
        || !pr["autoMergeRequest"].is_null()
    {
        return Err("This PR changed or is no longer ready to merge. Cancel and refresh before trying again.".into());
    }
    Ok(())
}

// The missing review is what makes GitHub report BLOCKED, so it is accepted before approving.
fn validate_approvable(pr: &Value, head_oid: &str, login: &str, bot: &str) -> Result<(), String> {
    merges_alone(pr)?;
    let author = pr["author"]["login"].as_str().unwrap_or("");
    if pr["state"] != "OPEN"
        || pr["isDraft"] != false
        || pr["headRefOid"] != head_oid
        || pr["reviewDecision"] == "APPROVED"
        || pr["reviewDecision"] == "CHANGES_REQUESTED"
        || pr["mergeable"] != "MERGEABLE"
        || !["BLOCKED", "CLEAN", "HAS_HOOKS", "UNSTABLE"]
            .contains(&pr["mergeStateStatus"].as_str().unwrap_or(""))
        || login.is_empty()
        || author.eq_ignore_ascii_case(login)
        || !author_allowed(pr, "", Some(bot))
        || !checks_pass(pr)
        || !pr["autoMergeRequest"].is_null()
    {
        return Err("This PR changed or can no longer be approved and merged. Cancel and refresh before trying again.".into());
    }
    Ok(())
}

// GitHub only reports BEHIND when branch protection requires an up-to-date branch.
fn validate_updatable(
    pr: &Value,
    head_oid: &str,
    login: &str,
    bot: Option<&str>,
) -> Result<(), String> {
    if pr["state"] != "OPEN"
        || pr["isDraft"] != false
        || pr["headRefOid"] != head_oid
        || pr["mergeable"] != "MERGEABLE"
        || pr["mergeStateStatus"] != "BEHIND"
        || !author_allowed(pr, login, bot)
        || !pr["autoMergeRequest"].is_null()
    {
        return Err("This PR changed or no longer needs a branch update. Cancel and refresh before trying again.".into());
    }
    Ok(())
}

fn pull_endpoint(url: &str) -> String {
    let path = url.strip_prefix("https://github.com/").unwrap();
    let (repository, number) = path.rsplit_once("/pull/").unwrap();
    format!("repos/{repository}/pulls/{number}")
}

// Pin the mutation to the commit shown in the confirmation; never enable auto-merge, join a
// merge queue or bypass repository rules. GitHub atomically rejects a changed head. The
// synchronous merge endpoint refuses stacked PRs, so merges go through the async API.
async fn merge(url: &str, head_oid: &str, method: &str) -> Result<(), String> {
    let endpoint = format!("{}/merge-async", pull_endpoint(url));
    let mut result = gh(&[
        "api",
        "--hostname",
        "github.com",
        "-H",
        API_VERSION,
        "--method",
        "PUT",
        &endpoint,
        "-f",
        &format!("sha={head_oid}"),
        "-f",
        &format!("merge_method={method}"),
        "-f",
        "merge_action=direct_merge",
    ])
    .await?;
    let uuid = result["details"]["uuid"].as_str().unwrap_or("").to_string();
    for _ in 0..10 {
        if result["status"] != "pending" || !valid_uuid(&uuid) {
            break;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
        let poll = format!("{endpoint}/{uuid}");
        result = gh(&["api", "--hostname", "github.com", "-H", API_VERSION, &poll]).await?;
    }
    merge_outcome(&result)
}

fn valid_uuid(uuid: &str) -> bool {
    !uuid.is_empty() && uuid.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}

fn merge_outcome(result: &Value) -> Result<(), String> {
    match result["status"].as_str() {
        Some("merged") => Ok(()),
        Some("pending") => Err(
            "GitHub is still merging this PR. Refresh in a moment to see whether it merged.".into(),
        ),
        _ => Err(with_reason(FAILURE, &result["details"])),
    }
}

#[tauri::command]
pub async fn merge_pr(
    url: String,
    head_oid: String,
    method: String,
    bot: Option<String>,
) -> Result<(), String> {
    validate_input(&url, &head_oid, &method)?;
    tokio::time::timeout(Duration::from_secs(45), async {
        let user = gh(&["api", "--hostname", "github.com", "user"]).await?;
        let pr = view(&url).await?;
        validate_ready(
            &pr,
            &head_oid,
            user["login"].as_str().unwrap_or(""),
            bot.as_deref(),
        )?;
        merge(&url, &head_oid, &method).await
    })
    .await
    .map_err(|_| {
        "Merge timed out. Refresh the PR on GitHub before retrying; it may already have merged."
            .to_string()
    })?
}

#[tauri::command]
pub async fn approve_and_merge_pr(
    url: String,
    head_oid: String,
    method: String,
    bot: String,
) -> Result<(), String> {
    validate_input(&url, &head_oid, &method)?;
    tokio::time::timeout(Duration::from_secs(45), async {
        let user = gh(&["api", "--hostname", "github.com", "user"]).await?;
        let login = user["login"].as_str().unwrap_or("");
        let pr = view(&url).await?;
        validate_approvable(&pr, &head_oid, login, &bot)?;
        // The approval is pinned to the confirmed commit, like the merge that follows it.
        let reviews = format!("{}/reviews", pull_endpoint(&url));
        gh_or(&["api", "--hostname", "github.com", "--method", "POST", &reviews,
            "-f", &format!("commit_id={head_oid}"), "-f", "event=APPROVE"],
            "Could not approve this PR. Check your repository permissions on GitHub, then refresh before retrying.")
            .await?;
        // GitHub recomputes the review decision and merge state asynchronously after a review.
        let mut ready = false;
        for _ in 0..10 {
            tokio::time::sleep(Duration::from_secs(2)).await;
            let pr = view(&url).await?;
            if validate_ready(&pr, &head_oid, login, Some(&bot)).is_ok() {
                ready = true;
                break;
            }
        }
        if !ready {
            return Err("Approved on GitHub, but it isn't mergeable yet — GitHub may require more reviews. Refresh to see what's blocking it.".into());
        }
        merge(&url, &head_oid, &method)
            .await
            .map_err(|e| format!("Approved on GitHub, but the merge failed. {e}"))
    }).await.map_err(|_| "Approve and merge timed out. Refresh the PR on GitHub before retrying; it may already be approved or merged.".to_string())?
}

// Merges the base branch into the PR; GitHub rejects the update if the head moved since
// the confirmation.
#[tauri::command]
pub async fn update_pr_branch(
    url: String,
    head_oid: String,
    bot: Option<String>,
) -> Result<(), String> {
    validate_head(&url, &head_oid)?;
    tokio::time::timeout(Duration::from_secs(45), async {
        let user = gh(&["api", "--hostname", "github.com", "user"]).await?;
        let pr = gh(&["pr", "view", &url, "--json", PR_FIELDS]).await?;
        validate_updatable(
            &pr,
            &head_oid,
            user["login"].as_str().unwrap_or(""),
            bot.as_deref(),
        )?;
        let endpoint = format!("{}/update-branch", pull_endpoint(&url));
        gh_or(&["api", "--hostname", "github.com", "--method", "PUT", &endpoint,
            "-f", &format!("expected_head_sha={head_oid}")],
            "Could not update this branch. Check your repository permissions on GitHub, then refresh before retrying; the update may already have started.")
            .await?;
        Ok(())
    })
    .await
    .map_err(|_| {
        "Branch update timed out. Refresh the PR on GitHub before retrying; it may already be updated."
            .to_string()
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ready() -> Value {
        json!({"state":"OPEN", "isDraft":false, "headRefOid":"a".repeat(40),
            "author":{"login":"me"}, "reviewDecision":"APPROVED", "mergeable":"MERGEABLE",
            "mergeStateStatus":"CLEAN", "statusCheckRollup":[], "stack":null})
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
    fn failures_carry_github_reason_when_present() {
        let body = json!({"message":"Repository rule violations found\n\nChanges must be made through the merge queue","status":"405"});
        assert_eq!(
            with_reason("Failed.", &body),
            "Failed. GitHub said: Repository rule violations found Changes must be made through the merge queue"
        );
        for body in [
            Value::Null,
            json!("text"),
            json!({"message":"  "}),
            json!({"status":"500"}),
        ] {
            assert_eq!(with_reason("Failed.", &body), "Failed.");
        }
        let long = json!({"message":"x".repeat(400)});
        assert_eq!(with_reason("", &long).len(), " GitHub said: ".len() + 300);
    }

    #[test]
    fn async_merge_succeeds_only_once_merged() {
        assert!(merge_outcome(&json!({"status":"merged","details":{"sha":"a"}})).is_ok());
        assert!(
            merge_outcome(&json!({"status":"pending","details":{"uuid":"1-a"}}))
                .unwrap_err()
                .contains("still merging")
        );
        assert!(merge_outcome(
            &json!({"status":"failed","details":{"message":"Required status check is expected"}})
        )
        .unwrap_err()
        .ends_with("GitHub said: Required status check is expected"));
        for result in [
            json!({"status":"enqueued","details":{}}),
            json!({}),
            Value::Null,
        ] {
            assert_eq!(merge_outcome(&result), Err(FAILURE.to_string()));
        }
        assert!(valid_uuid("0f8e2c1a-3b4d-4e5f-8a9b-0c1d2e3f4a5b"));
        for uuid in ["", "../merge", "a/b", "a?b"] {
            assert!(!valid_uuid(uuid), "{uuid}");
        }
    }

    #[test]
    fn only_unstacked_prs_or_stack_bottoms_merge() {
        let oid = "a".repeat(40);
        let mut bottom = ready();
        bottom["stack"] = json!({"number":3,"size":2,"position":1,"base":{"ref":"main"}});
        assert!(validate_ready(&bottom, &oid, "me", None).is_ok());
        let mut above = bottom.clone();
        above["stack"]["position"] = json!(2);
        assert!(validate_ready(&above, &oid, "me", None)
            .unwrap_err()
            .contains("stacked"));
        let mut unknown = ready();
        unknown.as_object_mut().unwrap().remove("stack");
        assert!(validate_ready(&unknown, &oid, "me", None).is_err());
        let unstacked = with_stack(unknown, &json!({"number":1}));
        assert!(validate_ready(&unstacked, &oid, "me", None).is_ok());
        let stacked = with_stack(ready(), &json!({"stack":above["stack"]}));
        assert!(validate_ready(&stacked, &oid, "me", None).is_err());
        let mut bot = approvable();
        bot["stack"] = above["stack"].clone();
        assert!(validate_approvable(&bot, &oid, "me", "dependabot[bot]").is_err());
    }

    #[test]
    fn rejects_changed_head_and_every_non_ready_state() {
        let oid = "a".repeat(40);
        assert!(validate_ready(&ready(), &oid, "ME", None).is_ok());
        assert!(validate_ready(&ready(), &oid, "other", None).is_err());
        for (key, value) in [
            ("state", json!("MERGED")),
            ("isDraft", json!(true)),
            ("headRefOid", json!("b".repeat(40))),
            ("reviewDecision", json!("REVIEW_REQUIRED")),
            ("mergeable", json!("UNKNOWN")),
            ("mergeStateStatus", json!("BLOCKED")),
            (
                "autoMergeRequest",
                json!({"enabledAt":"2026-09-20T10:00:00Z"}),
            ),
        ] {
            let mut pr = ready();
            pr[key] = value;
            assert!(validate_ready(&pr, &oid, "me", None).is_err(), "{key}");
        }
    }

    #[test]
    fn known_bot_authors_are_accepted_only_when_declared_and_matching() {
        let oid = "a".repeat(40);
        let bot_pr = |login: &str, is_bot: bool| {
            let mut pr = ready();
            pr["author"] = json!({"login":login,"is_bot":is_bot});
            pr
        };
        let app = bot_pr("app/dependabot", true);
        assert!(validate_ready(&app, &oid, "me", Some("dependabot[bot]")).is_ok());
        assert!(validate_ready(&app, &oid, "me", Some("dependabot")).is_err());
        assert!(validate_ready(&app, &oid, "me", Some("renovate[bot]")).is_err());
        assert!(validate_ready(&app, &oid, "me", None).is_err());
        let user = bot_pr("CI-User", false);
        assert!(validate_ready(&user, &oid, "me", Some("ci-user")).is_ok());
        assert!(validate_ready(&user, &oid, "me", Some("ci-user[bot]")).is_err());
        let impostor = bot_pr("dependabot", false);
        assert!(validate_ready(&impostor, &oid, "me", Some("dependabot[bot]")).is_err());
        let mut unknown = bot_pr("app/dependabot", true);
        unknown["author"]["is_bot"] = Value::Null;
        assert!(validate_ready(&unknown, &oid, "me", Some("dependabot[bot]")).is_err());
        assert!(validate_ready(&ready(), &oid, "me", Some("dependabot[bot]")).is_ok());
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
            assert_eq!(
                validate_ready(&pr, &"a".repeat(40), "me", None).is_ok(),
                passing
            );
        }
    }

    fn approvable() -> Value {
        let mut pr = ready();
        pr["author"] = json!({"login":"app/dependabot","is_bot":true});
        pr["reviewDecision"] = json!("REVIEW_REQUIRED");
        pr["mergeStateStatus"] = json!("BLOCKED");
        pr
    }

    #[test]
    fn approvable_accepts_waiting_bot_prs() {
        let oid = "a".repeat(40);
        assert!(validate_approvable(&approvable(), &oid, "me", "dependabot[bot]").is_ok());
        let mut machine_user = approvable();
        machine_user["author"] = json!({"login":"ci-user","is_bot":false});
        assert!(validate_approvable(&machine_user, &oid, "me", "ci-user").is_ok());
        let mut pr = approvable();
        pr["reviewDecision"] = Value::Null;
        pr["mergeStateStatus"] = json!("CLEAN");
        assert!(validate_approvable(&pr, &oid, "me", "dependabot[bot]").is_ok());
    }

    #[test]
    fn approvable_rejects_other_authors_and_non_approvable_states() {
        let oid = "a".repeat(40);
        let mut owned = approvable();
        owned["author"] = json!({"login":"Me","is_bot":false});
        assert!(validate_approvable(&owned, &oid, "me", "me").is_err());
        assert!(validate_approvable(&approvable(), &oid, "", "dependabot[bot]").is_err());
        let mut human = approvable();
        human["author"] = json!({"login":"app/dependabot","is_bot":false});
        assert!(validate_approvable(&human, &oid, "me", "dependabot[bot]").is_err());
        assert!(validate_approvable(&approvable(), &oid, "me", "renovate[bot]").is_err());
        for (key, value) in [
            ("state", json!("CLOSED")),
            ("isDraft", json!(true)),
            ("headRefOid", json!("b".repeat(40))),
            ("reviewDecision", json!("APPROVED")),
            ("reviewDecision", json!("CHANGES_REQUESTED")),
            ("mergeable", json!("CONFLICTING")),
            ("mergeStateStatus", json!("BEHIND")),
            ("mergeStateStatus", json!("DIRTY")),
            (
                "statusCheckRollup",
                json!([{"__typename":"CheckRun","status":"COMPLETED","conclusion":"FAILURE"}]),
            ),
            (
                "statusCheckRollup",
                json!([{"__typename":"StatusContext","state":"PENDING"}]),
            ),
            (
                "autoMergeRequest",
                json!({"enabledAt":"2026-09-20T10:00:00Z"}),
            ),
        ] {
            let mut pr = approvable();
            pr[key] = value;
            assert!(
                validate_approvable(&pr, &oid, "me", "dependabot[bot]").is_err(),
                "{key}"
            );
        }
    }

    fn updatable() -> Value {
        let mut pr = ready();
        pr["reviewDecision"] = json!("REVIEW_REQUIRED");
        pr["mergeStateStatus"] = json!("BEHIND");
        pr["statusCheckRollup"] =
            json!([{"__typename":"CheckRun","status":"COMPLETED","conclusion":"FAILURE"}]);
        pr
    }

    #[test]
    fn updatable_accepts_owned_and_known_bot_prs_behind_their_base() {
        let oid = "a".repeat(40);
        assert!(validate_updatable(&updatable(), &oid, "ME", None).is_ok());
        let mut app = updatable();
        app["author"] = json!({"login":"app/dependabot","is_bot":true});
        assert!(validate_updatable(&app, &oid, "me", Some("dependabot[bot]")).is_ok());
        assert!(validate_updatable(&app, &oid, "me", None).is_err());
        assert!(validate_updatable(&app, &oid, "me", Some("renovate[bot]")).is_err());
        assert!(validate_updatable(&updatable(), &oid, "other", None).is_err());
        assert!(validate_head("https://github.com/acme/api/pull/1", &oid).is_ok());
        assert!(validate_head("https://github.com/acme/api/pull/1", "bad").is_err());
        assert!(validate_head("--help", &oid).is_err());
    }

    #[test]
    fn updatable_rejects_changed_head_and_states_not_behind() {
        let oid = "a".repeat(40);
        for (key, value) in [
            ("state", json!("CLOSED")),
            ("isDraft", json!(true)),
            ("headRefOid", json!("b".repeat(40))),
            ("mergeable", json!("UNKNOWN")),
            ("mergeStateStatus", json!("BLOCKED")),
            ("mergeStateStatus", json!("CLEAN")),
            ("mergeStateStatus", json!("DIRTY")),
            (
                "autoMergeRequest",
                json!({"enabledAt":"2026-09-20T10:00:00Z"}),
            ),
        ] {
            let mut pr = updatable();
            pr[key] = value;
            assert!(validate_updatable(&pr, &oid, "me", None).is_err(), "{key}");
        }
    }
}
