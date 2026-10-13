import type { DownloadEvent } from '@tauri-apps/plugin-updater';
import type { UpdateHandle, UpdatePhase, UpdateProgress, UpdaterDeps, UpdateState } from './types';

export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const IDLE_POLL_MS = 250;
const INSTALLING: UpdatePhase[] = ['downloading', 'waiting', 'restarting'];

export function releaseNotesUrl(version: string) {
  return `https://github.com/pablaber/pr-desk/releases/tag/v${version}`;
}

function megabytes(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function progressLabel({ downloaded, total, finished }: UpdateProgress) {
  if (finished) return 'Installing…';
  return total
    ? `${megabytes(downloaded)} of ${megabytes(total)}`
    : `${megabytes(downloaded)} downloaded`;
}

// Owns the updater plugin's Update resource and every timer; components only render its state.
export class UpdateService {
  #deps: UpdaterDeps;
  #state: UpdateState;
  #listeners = new Set<(state: UpdateState) => void>();
  #handle: UpdateHandle | null = null;
  #inFlight: Promise<void> | null = null;
  #manual = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;

  constructor(deps: UpdaterDeps) {
    this.#deps = deps;
    this.#state = {
      phase: deps.enabled ? 'idle' : 'disabled',
      dialogOpen: false,
      version: null,
      progress: null,
      error: '',
    };
  }

  get state() {
    return this.#state;
  }

  subscribe(listener: (state: UpdateState) => void) {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => void this.#listeners.delete(listener);
  }

  /** Checks once now; each finished check schedules the next automatic one. */
  start() {
    if (this.#deps.enabled) void this.#check(false);
  }

  /** The user asked: the dialog opens and reports the result, including failures. */
  checkNow() {
    this.#set({ dialogOpen: true });
    if (!this.#deps.enabled || INSTALLING.includes(this.#state.phase)) return Promise.resolve();
    return this.#check(true);
  }

  openDialog() {
    this.#set({ dialogOpen: true });
  }

  /** Later: the update stays on offer for this session, without being remembered as skipped. */
  dismiss() {
    if (INSTALLING.includes(this.#state.phase)) return;
    this.#set({ dialogOpen: false });
  }

  async install() {
    const handle = this.#handle;
    const { phase } = this.#state;
    if (!handle || (phase !== 'available' && phase !== 'install-failed')) return;
    this.#set({
      phase: 'downloading',
      progress: { downloaded: 0, total: null, finished: false },
      error: '',
    });
    try {
      await handle.downloadAndInstall((event) => this.#progress(event));
    } catch (e) {
      this.#deps.onError?.(`Update install failed: ${String(e)}`);
      this.#set({
        phase: 'install-failed',
        progress: null,
        error: `PR Desk ${handle.version} could not be installed. Nothing was changed, so you can keep working or try again.`,
      });
      return;
    }
    this.#handle = null;
    await closeQuietly(handle);
    await this.#restart();
  }

  retry() {
    const { phase } = this.#state;
    if (phase === 'check-failed') return this.checkNow();
    if (phase === 'install-failed') return this.install();
    if (phase === 'restart-failed') return this.#restart();
    return Promise.resolve();
  }

  dispose() {
    this.#disposed = true;
    this.#clearTimer();
    this.#listeners.clear();
    const handle = this.#handle;
    this.#handle = null;
    if (handle) void closeQuietly(handle);
  }

  #check(manual: boolean): Promise<void> {
    if (this.#inFlight) {
      // A manual request joining an automatic check reports that check's result.
      if (manual) this.#manual = true;
      if (manual && !this.#handle) this.#set({ phase: 'checking', error: '' });
      return this.#inFlight;
    }
    if (INSTALLING.includes(this.#state.phase)) {
      this.#arm();
      return Promise.resolve();
    }
    this.#manual = manual;
    this.#clearTimer();
    // An automatic check runs quietly, leaving whatever the sidebar and dialog show in place.
    if (manual && !this.#handle) this.#set({ phase: 'checking', error: '' });
    this.#inFlight = this.#runCheck().finally(() => {
      this.#inFlight = null;
      this.#manual = false;
      this.#arm();
    });
    return this.#inFlight;
  }

  async #runCheck() {
    let found: UpdateHandle | null;
    try {
      found = await this.#deps.check();
    } catch (e) {
      this.#deps.onError?.(`Update check failed: ${String(e)}`);
      if (this.#disposed || this.#handle) return;
      if (this.#manual)
        this.#set({
          phase: 'check-failed',
          error:
            'PR Desk could not check for updates. You may be offline, or a new release may still be publishing. Try again in a few minutes.',
        });
      else if (this.#state.phase === 'checking') this.#set({ phase: 'idle' });
      return;
    }
    // A check that finishes after dispose, or while the previous update installs, is discarded.
    if (this.#disposed || INSTALLING.includes(this.#state.phase)) {
      if (found) await closeQuietly(found);
      return;
    }
    const previous = this.#handle;
    this.#handle = found;
    if (previous && previous !== found) await closeQuietly(previous);
    this.#set(
      found
        ? { phase: 'available', version: found.version, error: '' }
        : { phase: 'current', version: null, error: '' },
    );
  }

  async #restart() {
    this.#set({ phase: 'waiting', error: '' });
    // Restarting mid-write would lose a preference change or abandon a confirmed GitHub action.
    await this.#whenIdle();
    if (this.#disposed) return;
    this.#set({ phase: 'restarting' });
    try {
      await this.#deps.relaunch();
    } catch (e) {
      this.#deps.onError?.(`Restart after update failed: ${String(e)}`);
      this.#set({
        phase: 'restart-failed',
        error:
          'The update is installed, but PR Desk could not restart. Quit and reopen it to finish.',
      });
    }
  }

  #whenIdle() {
    return new Promise<void>((resolve) => {
      const poll = () => {
        if (this.#disposed || !this.#deps.busy()) resolve();
        else setTimeout(poll, IDLE_POLL_MS);
      };
      poll();
    });
  }

  #progress(event: DownloadEvent) {
    const progress = this.#state.progress ?? { downloaded: 0, total: null, finished: false };
    if (event.event === 'Started')
      this.#set({
        progress: { ...progress, downloaded: 0, total: event.data.contentLength || null },
      });
    else if (event.event === 'Progress')
      this.#set({
        progress: { ...progress, downloaded: progress.downloaded + event.data.chunkLength },
      });
    else this.#set({ progress: { ...progress, finished: true } });
  }

  // A single timer re-armed after each check, so waking from sleep runs at most one late check.
  #arm() {
    this.#clearTimer();
    if (this.#disposed) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#check(false);
    }, CHECK_INTERVAL_MS);
  }

  #clearTimer() {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #set(patch: Partial<UpdateState>) {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener(this.#state);
  }
}

async function closeQuietly(handle: UpdateHandle) {
  // Releasing the Rust resource is housekeeping; a failure must not block checks or installs.
  await handle.close().catch(() => {});
}
