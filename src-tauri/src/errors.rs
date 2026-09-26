// Only return known codes, never GitHub messages or gh diagnostics across the bridge.
pub fn graphql_error_code(stdout: &[u8]) -> Option<&'static str> {
    let response: serde_json::Value = serde_json::from_slice(stdout).ok()?;
    let errors = response.get("errors")?.as_array()?;
    errors.iter().find_map(|error| {
        (error.get("type").and_then(|value| value.as_str()) == Some("NOT_FOUND")
            && error.get("path") == Some(&serde_json::json!(["repository"])))
        .then_some("GITHUB_REPOSITORY_NOT_FOUND")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_live_missing_repository_response() {
        // Captured using the same gh GraphQL query as repository validation (exit code 1).
        let response = br#"{"data":{"repository":null},"errors":[{"type":"NOT_FOUND","path":["repository"],"locations":[{"line":1,"column":24}],"message":"Could not resolve to a Repository with the name 'octocat/pr-desk-missing-repository-20260926-7c2936'."}]}"#;
        assert_eq!(
            graphql_error_code(response),
            Some("GITHUB_REPOSITORY_NOT_FOUND")
        );
    }

    #[test]
    fn does_not_mislabel_other_failures_or_success() {
        for response in [
            r#"{"data":{"repository":{"nameWithOwner":"octocat/Hello-World"}}}"#,
            r#"{"errors":[{"type":"NOT_FOUND","path":["repository","pullRequest"]}]}"#,
            r#"{"errors":[{"type":"RATE_LIMITED","path":["repository"]}]}"#,
            r#"{"errors":[{"type":"NOT_FOUND"}]}"#,
            "not JSON",
        ] {
            assert_eq!(graphql_error_code(response.as_bytes()), None);
        }
    }
}
