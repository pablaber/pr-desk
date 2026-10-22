import {
  hasUnseenAchievements,
  recordAchievements,
  type AchievementPreferences,
} from '../achievements/record';
import type { Unlock } from '../achievements/types';
import { requestDetails } from '../github/errors';
import type { GitHubRequestDetails } from '../github/types';
import { applyAction, ingest, newAccount, syncDate } from './ingest';
import type { AccountHistory, HistoryAction, HistoryFile, HistorySyncResult } from './types';

export const SYNC_INTERVAL_MS = 3_600_000;

export interface HistoryDeps {
  load: () => Promise<HistoryFile>;
  save: (file: HistoryFile) => Promise<void>;
  fetch: (login: string, since: string) => Promise<HistorySyncResult>;
  onWarning: (message: string, details?: GitHubRequestDetails) => void;
  // Read at every change, so achievements always use the goal and bots in force at the time.
  preferences: () => AchievementPreferences;
  now?: () => number;
}

// The signed-in account's history, kept in memory and written to history.json one write at a time.
// Syncing runs beside the dashboard and never holds it up; a file this build cannot read is left
// alone, with nothing recorded or written for the rest of the session.
export class HistoryLog {
  account = $state.raw<AccountHistory | null>(null);
  #deps: HistoryDeps;
  #file: HistoryFile | null = null;
  #login = '';
  #opening: Promise<void> = Promise.resolve();
  #writes: Promise<void> = Promise.resolve();
  #pendingWrites = 0;
  #syncing: Promise<void> | null = null;
  #started = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;

  constructor(deps: HistoryDeps) {
    this.#deps = deps;
  }

  get busy() {
    return this.#pendingWrites > 0;
  }

  #now() {
    return (this.#deps.now ?? Date.now)();
  }

  open(login: string) {
    this.#opening = this.#open(login);
    return this.#opening;
  }

  async #open(login: string) {
    this.#login = login;
    this.account = null;
    try {
      this.#file ??= await this.#deps.load();
    } catch (e) {
      this.#deps.onWarning(String(e));
      return;
    }
    const existing = this.#file.accounts[login];
    this.#set(existing ?? newAccount(this.#now()), !existing);
  }

  // Every change is evaluated against the achievements, and an unchanged account is only written
  // when the evaluation recorded something. Returns the levels this change unlocked.
  #set(account: AccountHistory, write = true): Unlock[] {
    if (!this.#file) return [];
    const evaluated = recordAchievements(
      account,
      this.#login,
      this.#deps.preferences(),
      this.#now(),
    );
    this.account = evaluated.account;
    this.#file = {
      ...this.#file,
      accounts: { ...this.#file.accounts, [this.#login]: evaluated.account },
    };
    if (write || evaluated.account !== account) this.#write(this.#file);
    return evaluated.unlocked;
  }

  #write(file: HistoryFile) {
    this.#pendingWrites++;
    this.#writes = this.#writes
      .then(() => this.#deps.save(file))
      .catch((e) => this.#deps.onWarning(`Could not save history: ${String(e)}`))
      .finally(() => this.#pendingWrites--);
  }

  // Updates the in-memory history synchronously, so it can be read straight after, and returns
  // the achievement levels the action unlocked.
  record(action: HistoryAction): Unlock[] {
    if (!this.account) return [];
    const next = applyAction(this.account, action, this.#login, this.#now());
    // A repeated same-day attention-clear comes back unchanged and needs no write.
    return this.#set(next, next !== this.account);
  }

  get hasUnseenAchievements() {
    return this.account !== null && hasUnseenAchievements(this.account);
  }

  // Called while Completed is on screen, so every level recorded so far has been seen.
  markAchievementsSeen() {
    if (this.account && hasUnseenAchievements(this.account))
      this.#set({ ...this.account, achievementsSeenAt: this.#now() });
  }

  // The first call syncs straight away and then every hour; later calls do nothing.
  start() {
    if (this.#started) return;
    this.#started = true;
    void this.sync();
  }

  // A sync already running is joined rather than repeated, and finishing restarts the hour.
  sync() {
    clearTimeout(this.#timer);
    this.#syncing ??= this.#sync().finally(() => {
      this.#syncing = null;
      this.#schedule();
    });
    return this.#syncing;
  }

  async #sync() {
    await this.#opening;
    const login = this.#login;
    if (!this.account) return;
    const startedAt = this.#now();
    try {
      const result = await this.#deps.fetch(login, syncDate(this.account));
      for (const warning of result.warnings) this.#deps.onWarning(warning.message, warning.details);
      if (login !== this.#login || !this.account) return;
      this.#set(ingest(this.account, login, result.entries, result.complete ? startedAt : null));
    } catch (e) {
      this.#deps.onWarning(`History sync failed: ${String(e)}`, requestDetails(e));
    }
  }

  #schedule() {
    clearTimeout(this.#timer);
    if (this.#started && !this.#disposed)
      this.#timer = setTimeout(() => void this.sync(), SYNC_INTERVAL_MS);
  }

  dispose() {
    this.#disposed = true;
    clearTimeout(this.#timer);
  }
}
