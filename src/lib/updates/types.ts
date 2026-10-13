import type { DownloadEvent } from '@tauri-apps/plugin-updater';

// The subset of the updater plugin's Update resource the service relies on, so tests can fake it.
export interface UpdateHandle {
  version: string;
  downloadAndInstall(onEvent: (event: DownloadEvent) => void): Promise<void>;
  close(): Promise<void>;
}

export interface UpdaterDeps {
  /** Resolves null when the running version is current; rejects when metadata is unavailable. */
  check: () => Promise<UpdateHandle | null>;
  relaunch: () => Promise<void>;
  /** True while a preference write or GitHub mutation is in flight. */
  busy: () => boolean;
  onError?: (message: string) => void;
  /** False in development, where nothing is checked, downloaded or installed. */
  enabled: boolean;
}

export type UpdatePhase =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'waiting'
  | 'restarting'
  | 'check-failed'
  | 'install-failed'
  | 'restart-failed';

export interface UpdateProgress {
  downloaded: number;
  /** Null while the server has not reported a size, which the dialog shows as indeterminate. */
  total: number | null;
  finished: boolean;
}

export interface UpdateState {
  phase: UpdatePhase;
  dialogOpen: boolean;
  /** The newer version on offer, kept through download, install and failures. */
  version: string | null;
  progress: UpdateProgress | null;
  error: string;
}
