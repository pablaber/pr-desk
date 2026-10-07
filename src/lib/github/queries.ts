const q = JSON.stringify;
const page = 'pageInfo { hasNextPage endCursor }';
function connections(cursors: (string | null | undefined)[] = [null, null, null]) {
  return [
    cursors[0] === undefined
      ? ''
      : `reviewRequests(first: 100, after: ${q(cursors[0])}) { ${page} nodes { requestedReviewer { __typename ... on User { login } } } }`,
    cursors[1] === undefined
      ? ''
      : `reviewThreads(first: 100, after: ${q(cursors[1])}) { ${page} nodes { isResolved isOutdated } }`,
    cursors[2] === undefined
      ? ''
      : `commits(last: 1) { nodes { commit { oid statusCheckRollup { contexts(first: 100, after: ${q(cursors[2])}) { ${page} nodes {
      __typename ... on CheckRun { name status conclusion }
      ... on StatusContext { context state }
    } } } } } }`,
  ].join(' ');
}
const fields = `url number title author { __typename login } repository { nameWithOwner } state isDraft updatedAt reviewDecision mergeable mergeStateStatus mergeQueueEntry { state position } autoMergeRequest { enabledAt }`;
export function searchQuery(search: string, cursor: string | null) {
  return `query DeskSearch { search(query: ${q(search)}, type: ISSUE, first: 100, after: ${q(cursor)}) { issueCount ${page} nodes { ... on PullRequest { ${fields} ${connections()} } } } }`;
}
export function repositoryQuery(repo: string, cursor: string | null, validate = false) {
  const [owner, name] = repo.split('/');
  return `query DeskRepository { repository(owner: ${q(owner)}, name: ${q(name)}) { nameWithOwner ${validate ? '' : `pullRequests(states: OPEN, first: 100, after: ${q(cursor)}) { ${page} nodes { ${fields} ${connections()} } }`} } }`;
}
export function pullRequestQuery(id: string, cursors?: (string | null | undefined)[]) {
  const [repo, number] = id.split('#');
  const [owner, name] = repo.split('/');
  return `query DeskPullRequest { repository(owner: ${q(owner)}, name: ${q(name)}) { pullRequest(number: ${Number(number)}) {
    ${cursors ? '' : fields} ${connections(cursors)}
  } } }`;
}
// The Completed view only needs enough to list a PR, so there are no connections to page through.
const mergedFields = `url number title author { login } repository { nameWithOwner } mergedAt mergedBy { login }`;
export function mergedSearchQuery(search: string) {
  return `query DeskMergedSearch { search(query: ${q(search)}, type: ISSUE, first: 100) { nodes { ... on PullRequest { ${mergedFields} } } } }`;
}
export function mergedRepositoryQuery(repo: string) {
  const [owner, name] = repo.split('/');
  return `query DeskMergedRepository { repository(owner: ${q(owner)}, name: ${q(name)}) { pullRequests(states: MERGED, orderBy: { field: UPDATED_AT, direction: DESC }, first: 25) { nodes { ${mergedFields} } } } }`;
}
