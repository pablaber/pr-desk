import type { PullRequest } from '../pr/types';

const ATTEMPTS = 15;
const INTERVAL_MS = 1000;

const unsettled = (pr: PullRequest) =>
  pr.mergeable === 'UNKNOWN' || pr.mergeStateStatus === 'UNKNOWN';

// Once its base branch moves, for example after merging a sibling PR, GitHub reports UNKNOWN
// until a background job recomputes mergeability. Reading the PR is what starts that job.
export async function settledPullRequest(
  load: () => Promise<PullRequest>,
  onWait: () => void = () => {},
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
) {
  let pr = await load();
  for (let attempt = 1; attempt < ATTEMPTS && unsettled(pr); attempt++) {
    onWait();
    await wait(INTERVAL_MS);
    pr = await load();
  }
  return pr;
}
