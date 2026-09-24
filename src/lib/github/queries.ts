const q = JSON.stringify;
const page = 'pageInfo { hasNextPage endCursor }';
export function searchQuery(search: string, cursor: string | null) {
  return `query DeskSearch { search(query: ${q(search)}, type: ISSUE, first: 100, after: ${q(cursor)}) { issueCount ${page} nodes { ... on PullRequest { url } } } }`;
}
export function repositoryQuery(repo: string, cursor: string | null, validate = false) {
  const [owner, name] = repo.split('/');
  return `query DeskRepository { repository(owner: ${q(owner)}, name: ${q(name)}) { nameWithOwner ${validate ? '' : `pullRequests(states: OPEN, first: 100, after: ${q(cursor)}) { ${page} nodes { url } }`} } }`;
}
export function pullRequestQuery(id: string, cursors: (string | null)[] = [null, null, null]) {
  const [repo, number] = id.split('#');
  const [owner, name] = repo.split('/');
  return `query DeskPullRequest { repository(owner: ${q(owner)}, name: ${q(name)}) { pullRequest(number: ${Number(number)}) {
    url number title author { login } repository { nameWithOwner } state isDraft updatedAt reviewDecision mergeable mergeStateStatus
    reviewRequests(first: 100, after: ${q(cursors[0])}) { ${page} nodes { requestedReviewer { __typename ... on User { login } } } }
    reviewThreads(first: 100, after: ${q(cursors[1])}) { ${page} nodes { isResolved isOutdated } }
    commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100, after: ${q(cursors[2])}) { ${page} nodes {
      __typename ... on CheckRun { name status conclusion isRequired(pullRequestNumber: ${Number(number)}) }
      ... on StatusContext { context state isRequired(pullRequestNumber: ${Number(number)}) }
    } } } } } }
  } } }`;
}
