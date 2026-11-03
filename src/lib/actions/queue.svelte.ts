import type { PullRequest } from '../pr/types';
import type { PRActionKind, QueuedAction } from './types';

export interface ActionQueueDeps {
  run: (entry: QueuedAction, report: (detail: string) => void) => Promise<void>;
  onDone: (entry: QueuedAction) => void;
  onFailed: (entry: QueuedAction) => void;
  // Every entry has left the queue, whether it ran or was removed.
  onDrained: () => void;
}

// Confirmed GitHub actions, run one at a time in the order they were confirmed. A failure stays at
// the head and holds everything behind it until the user retries, skips or clears. Kept in memory
// only: a restart drops whatever has not started.
export class ActionQueue {
  entries = $state<QueuedAction[]>([]);
  // Finished so far in this batch, so progress can say "2 of 4" as entries leave.
  done = $state(0);
  #deps: ActionQueueDeps;
  #draining = false;
  #nextKey = 1;

  constructor(deps: ActionQueueDeps) {
    this.#deps = deps;
  }

  get paused() {
    return this.entries[0]?.status === 'failed';
  }

  // A paused queue is not busy: nothing is in flight, and it may stay paused indefinitely.
  get busy() {
    return this.entries.length > 0 && !this.paused;
  }

  entry(prId: string) {
    return this.entries.find((e) => e.pr.id === prId);
  }

  has(prId: string) {
    return this.entry(prId) !== undefined;
  }

  // Place among the entries still waiting to start, from 1; 0 when the PR is not waiting.
  position(prId: string) {
    return this.entries.filter((e) => e.status === 'queued').findIndex((e) => e.pr.id === prId) + 1;
  }

  enqueue(kind: PRActionKind, pr: PullRequest, method: string) {
    if (this.has(pr.id)) return;
    this.entries.push({
      key: this.#nextKey++,
      kind,
      pr,
      method,
      status: 'queued',
      detail: '',
      error: '',
    });
    void this.#drain();
  }

  remove(key: number) {
    this.entries = this.entries.filter((e) => e.key !== key || e.status !== 'queued');
  }

  retry() {
    if (!this.paused) return;
    const entry = this.entries[0];
    entry.status = 'queued';
    entry.error = '';
    void this.#drain();
  }

  skip() {
    if (!this.paused) return;
    this.entries.shift();
    void this.#drain();
  }

  clear() {
    this.entries = this.entries.filter((e) => e.status === 'running');
    this.#settle();
  }

  async #drain() {
    if (this.#draining) return;
    this.#draining = true;
    try {
      while (this.entries[0]?.status === 'queued') {
        const entry = this.entries[0];
        entry.status = 'running';
        try {
          await this.#deps.run(entry, (detail) => (entry.detail = detail));
        } catch (e) {
          entry.status = 'failed';
          entry.detail = '';
          entry.error = e instanceof Error ? e.message : String(e);
          this.#deps.onFailed(entry);
          break;
        }
        this.entries.shift();
        this.done++;
        this.#deps.onDone(entry);
      }
    } finally {
      this.#draining = false;
    }
    this.#settle();
  }

  #settle() {
    if (this.#draining || this.entries.length > 0) return;
    this.done = 0;
    this.#deps.onDrained();
  }
}
