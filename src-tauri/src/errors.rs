// What crosses the bridge when a gh call fails: a message plus details built only from
// allowlisted, validated facts. Never gh's output or GitHub's messages, which may carry
// credential diagnostics or arbitrary text.
use serde_json::{json, Map, Value};
use std::time::Instant;

pub fn plain(message: impl Into<String>) -> Value {
    json!({ "message": message.into() })
}

pub struct Attempt<'a> {
    pub operation: &'a str,
    pub args: &'a [String],
    pub started: Instant,
}

impl Attempt<'_> {
    pub fn fail(
        &self,
        message: impl Into<String>,
        failure: &str,
        exit_status: Option<i32>,
        response: Option<&Response>,
    ) -> Value {
        let mut details = Map::new();
        details.insert("operation".into(), self.operation.into());
        details.insert("command".into(), command_line(self.args).into());
        details.insert("failure".into(), failure.into());
        if let Some(code) = exit_status {
            details.insert("exitStatus".into(), code.into());
        }
        details.insert(
            "durationMs".into(),
            (self.started.elapsed().as_millis() as u64).into(),
        );
        if let Some(response) = response {
            response.describe(&mut details);
        }
        json!({ "message": message.into(), "details": details })
    }
}

// A shell-quoted command that reruns the request in Terminal.
fn command_line(args: &[String]) -> String {
    std::iter::once("gh")
        .chain(args.iter().map(String::as_str))
        .map(|arg| {
            if !arg.is_empty()
                && arg
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"@%+=:,./_-".contains(&b))
            {
                arg.to_string()
            } else {
                format!("'{}'", arg.replace('\'', r"'\''"))
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

// gh api --include output: the HTTP status line and headers, a blank line, then the body.
// Without a status line, gh failed before GitHub answered.
pub struct Response<'a> {
    pub status: Option<u16>,
    headers: Vec<(&'a str, &'a str)>,
    pub body: &'a [u8],
}

pub fn split_response(stdout: &[u8]) -> Response<'_> {
    let none = Response {
        status: None,
        headers: vec![],
        body: stdout,
    };
    if !stdout.starts_with(b"HTTP/") {
        return none;
    }
    let Some((head, body)) = [b"\r\n\r\n".as_slice(), b"\n\n"]
        .iter()
        .filter_map(|separator| {
            stdout
                .windows(separator.len())
                .position(|w| w == *separator)
                .map(|at| (&stdout[..at], &stdout[at + separator.len()..]))
        })
        .min_by_key(|(head, _)| head.len())
    else {
        return none;
    };
    let Ok(head) = std::str::from_utf8(head) else {
        return none;
    };
    let mut lines = head.lines();
    let status = lines
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse().ok());
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim(), value.trim()))
        .collect();
    Response {
        status,
        headers,
        body,
    }
}

fn valid(value: &str, max: usize, allowed: impl Fn(u8) -> bool) -> bool {
    !value.is_empty() && value.len() <= max && value.bytes().all(allowed)
}

impl Response<'_> {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| *value)
    }

    fn number(&self, name: &str) -> Option<u64> {
        self.header(name)?.parse().ok()
    }

    fn describe(&self, details: &mut Map<String, Value>) {
        if let Some(status) = self.status {
            details.insert("httpStatus".into(), status.into());
        }
        if let Some(id) = self
            .header("x-github-request-id")
            .filter(|id| valid(id, 64, |b| b.is_ascii_alphanumeric() || b == b':'))
        {
            details.insert("requestId".into(), id.into());
        }
        let mut rate_limit = Map::new();
        for (header, key) in [
            ("x-ratelimit-limit", "limit"),
            ("x-ratelimit-remaining", "remaining"),
            ("x-ratelimit-used", "used"),
            ("x-ratelimit-reset", "reset"),
        ] {
            if let Some(value) = self.number(header) {
                rate_limit.insert(key.into(), value.into());
            }
        }
        if let Some(resource) = self
            .header("x-ratelimit-resource")
            .filter(|r| valid(r, 32, |b| b.is_ascii_lowercase() || b == b'_'))
        {
            rate_limit.insert("resource".into(), resource.into());
        }
        if !rate_limit.is_empty() {
            details.insert("rateLimit".into(), rate_limit.into());
        }
        if let Some(seconds) = self.number("retry-after") {
            details.insert("retryAfterSeconds".into(), seconds.into());
        }
        let errors = graphql_errors(self.body);
        if !errors.is_empty() {
            details.insert("graphqlErrors".into(), errors.into());
        }
    }
}

// Error types, codes and paths name what failed without GitHub's message text.
fn graphql_errors(body: &[u8]) -> Vec<Value> {
    let Ok(response) = serde_json::from_slice::<Value>(body) else {
        return vec![];
    };
    let Some(errors) = response.get("errors").and_then(Value::as_array) else {
        return vec![];
    };
    errors
        .iter()
        .take(5)
        .filter_map(|error| {
            let mut entry = Map::new();
            if let Some(kind) = error["type"]
                .as_str()
                .filter(|t| valid(t, 64, |b| b.is_ascii_uppercase() || b == b'_'))
            {
                entry.insert("type".into(), kind.into());
            }
            if let Some(code) = error["extensions"]["code"]
                .as_str()
                .filter(|c| valid(c, 64, |b| b.is_ascii_alphabetic() || b == b'_'))
            {
                entry.insert("code".into(), code.into());
            }
            let path: Vec<Value> = error["path"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|part| {
                    part.is_u64()
                        || part.as_str().is_some_and(|s| {
                            valid(s, 64, |b| b.is_ascii_alphanumeric() || b"_ ".contains(&b))
                        })
                })
                .cloned()
                .collect();
            if !path.is_empty() {
                entry.insert("path".into(), path.into());
            }
            (!entry.is_empty()).then(|| entry.into())
        })
        .collect()
}

// Only return known codes as messages, never GitHub's own text.
pub fn graphql_error_code(body: &[u8]) -> Option<&'static str> {
    let response: Value = serde_json::from_slice(body).ok()?;
    let errors = response.get("errors")?.as_array()?;
    errors.iter().find_map(|error| {
        (error.get("type").and_then(|value| value.as_str()) == Some("NOT_FOUND")
            && error.get("path") == Some(&json!(["repository"])))
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

    fn attempt(args: &[String]) -> Attempt<'_> {
        Attempt {
            operation: "DeskSearch",
            args,
            started: Instant::now(),
        }
    }

    #[test]
    fn details_keep_allowlisted_facts_and_drop_messages_and_credentials() {
        // Shape captured from gh api --include for a GraphQL error (exit code 1): gh ends the status
        // line with LF and each header with CRLF.
        let stdout = b"HTTP/2.0 200 OK\nContent-Type: application/json; charset=utf-8\r\nX-Github-Request-Id: C583:2B3695:5B53D93:125A28FF:6ADA1322\r\nX-Oauth-Client-Id: 178c6fc778ccc68e1d6a\r\nX-Oauth-Scopes: gist, read:org, repo, workflow\r\nX-Ratelimit-Limit: 5000\r\nX-Ratelimit-Remaining: 0\r\nX-Ratelimit-Reset: 1792679250\r\nX-Ratelimit-Resource: graphql\r\nX-Ratelimit-Used: 5000\r\nRetry-After: 60\r\n\r\n{\"errors\":[{\"type\":\"RATE_LIMITED\",\"path\":[\"query DeskSearch\",\"search\",0],\"extensions\":{\"code\":\"rateLimited\"},\"message\":\"API rate limit exceeded for user ID 1234.\"}]}";
        let response = split_response(stdout);
        assert_eq!(response.status, Some(200));
        let args = vec!["api".into(), "graphql".into()];
        let error = attempt(&args).fail("failed", "graphql", Some(1), Some(&response));
        let details = &error["details"];
        assert_eq!(error["message"], "failed");
        assert_eq!(details["operation"], "DeskSearch");
        assert_eq!(details["command"], "gh api graphql");
        assert_eq!(details["failure"], "graphql");
        assert_eq!(details["exitStatus"], 1);
        assert_eq!(details["httpStatus"], 200);
        assert_eq!(
            details["requestId"],
            "C583:2B3695:5B53D93:125A28FF:6ADA1322"
        );
        assert_eq!(
            details["rateLimit"],
            json!({"limit":5000,"remaining":0,"used":5000,"reset":1792679250,"resource":"graphql"})
        );
        assert_eq!(details["retryAfterSeconds"], 60);
        assert_eq!(
            details["graphqlErrors"],
            json!([{"type":"RATE_LIMITED","code":"rateLimited","path":["query DeskSearch","search",0]}])
        );
        let text = error.to_string();
        for secret in ["178c6fc778ccc68e1d6a", "read:org", "1234", "exceeded"] {
            assert!(!text.contains(secret), "{secret}");
        }
    }

    #[test]
    fn splits_http_errors_and_reads_bodies_without_headers() {
        let response =
            split_response(b"HTTP/2.0 502 Bad Gateway\nX-Github-Request-Id: AB:CD\n\n{\"x\":1}");
        assert_eq!(response.status, Some(502));
        assert_eq!(response.body, b"{\"x\":1}");
        let mut details = Map::new();
        response.describe(&mut details);
        assert_eq!(
            Value::from(details),
            json!({"httpStatus":502,"requestId":"AB:CD"})
        );
        for stdout in [
            b"".as_slice(),
            b"{\"data\":{}}",
            b"HTTP/2.0 200 OK\nno body",
        ] {
            let response = split_response(stdout);
            assert_eq!((response.status, response.body), (None, stdout));
        }
    }

    #[test]
    fn rejects_header_values_and_error_fields_that_could_carry_text() {
        let response = split_response(b"HTTP/2.0 403 Forbidden\nX-Github-Request-Id: has spaces\nX-Ratelimit-Resource: Bad Value\nX-Ratelimit-Remaining: soon\n\n{\"errors\":[{\"type\":\"lower case\",\"extensions\":{\"code\":\"has-dash\"},\"path\":[\"ok\",\"not/ok\"]},{\"message\":\"only text\"}]}");
        let mut details = Map::new();
        response.describe(&mut details);
        assert_eq!(
            Value::from(details),
            json!({"httpStatus":403,"graphqlErrors":[{"path":["ok"]}]})
        );
    }

    #[test]
    fn commands_are_shell_quoted_for_terminal() {
        let args: Vec<String> = [
            "api",
            "--hostname",
            "github.com",
            "-f",
            "query=query DeskSearch { search(query: \"it's\") }",
            "",
        ]
        .map(String::from)
        .to_vec();
        assert_eq!(
            command_line(&args),
            r#"gh api --hostname github.com -f 'query=query DeskSearch { search(query: "it'\''s") }' ''"#
        );
    }
}
