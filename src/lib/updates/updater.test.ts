import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadEvent } from '@tauri-apps/plugin-updater';
import type { UpdateHandle, UpdaterDeps } from './types';
import { CHECK_INTERVAL_MS, progressLabel, releaseNotesUrl, UpdateService } from './updater';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeUpdate(
  version = '2.0.0',
  install: (onEvent: (event: DownloadEvent) => void) => Promise<void> = async () => {},
) {
  return {
    version,
    downloadAndInstall: vi.fn(install),
    close: vi.fn(async () => {}),
  } satisfies UpdateHandle;
}

function setup(overrides: Partial<UpdaterDeps> = {}) {
  let busy = false;
  const deps = {
    check: vi.fn<UpdaterDeps['check']>(async () => null),
    relaunch: vi.fn(async () => {}),
    busy: () => busy,
    onError: vi.fn(),
    enabled: true,
    ...overrides,
  };
  const service = new UpdateService(deps);
  return {
    deps,
    service,
    setBusy: (value: boolean) => (busy = value),
  };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('UpdateService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('checks once at launch and again 24 hours after each check', async () => {
    const { deps, service } = setup();
    service.start();
    await flush();
    expect(deps.check).toHaveBeenCalledTimes(1);
    expect(service.state.phase).toBe('current');
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - 1);
    expect(deps.check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.check).toHaveBeenCalledTimes(2);
    service.dispose();
  });

  it('restarts the 24 hour wait after a manual check', async () => {
    const { deps, service } = setup();
    service.start();
    await flush();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS / 2);
    await service.checkNow();
    expect(deps.check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - 1);
    expect(deps.check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.check).toHaveBeenCalledTimes(3);
    service.dispose();
  });

  it('keeps a single timer, so a long sleep produces one late check rather than a burst', async () => {
    const { deps, service } = setup();
    service.start();
    await flush();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 5);
    expect(deps.check).toHaveBeenCalledTimes(6);
    expect(vi.getTimerCount()).toBe(1);
    service.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does nothing in development builds', async () => {
    const { deps, service } = setup({ enabled: false });
    service.start();
    await service.checkNow();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
    expect(deps.check).not.toHaveBeenCalled();
    expect(service.state).toMatchObject({ phase: 'disabled', dialogOpen: true });
  });

  it('coalesces concurrent checks into one request and reports it to the manual caller', async () => {
    const pending = deferred<UpdateHandle | null>();
    const { deps, service } = setup({ check: vi.fn(() => pending.promise) });
    service.start();
    const first = service.checkNow();
    const second = service.checkNow();
    expect(deps.check).toHaveBeenCalledTimes(1);
    expect(service.state).toMatchObject({ phase: 'checking', dialogOpen: true });
    pending.resolve(fakeUpdate());
    await Promise.all([first, second]);
    expect(service.state).toMatchObject({ phase: 'available', version: '2.0.0' });
    expect(vi.getTimerCount()).toBe(1);
    service.dispose();
  });

  it('reports the current version as up to date', async () => {
    const { service } = setup();
    await service.checkNow();
    expect(service.state).toMatchObject({ phase: 'current', version: null, dialogOpen: true });
    service.dispose();
  });

  it('offers a newer version without opening the dialog after an automatic check', async () => {
    const { service } = setup({ check: vi.fn(async () => fakeUpdate('2.1.0')) });
    service.start();
    await flush();
    expect(service.state).toMatchObject({
      phase: 'available',
      version: '2.1.0',
      dialogOpen: false,
    });
    service.openDialog();
    expect(service.state.dialogOpen).toBe(true);
    service.dispose();
  });

  it('closes an update that a later check replaces or withdraws', async () => {
    const older = fakeUpdate('2.0.0');
    const newer = fakeUpdate('2.1.0');
    const check = vi
      .fn<UpdaterDeps['check']>()
      .mockResolvedValueOnce(older)
      .mockResolvedValueOnce(newer)
      .mockResolvedValueOnce(null);
    const { service } = setup({ check });
    await service.checkNow();
    await service.checkNow();
    expect(older.close).toHaveBeenCalledTimes(1);
    expect(service.state.version).toBe('2.1.0');
    await service.checkNow();
    expect(newer.close).toHaveBeenCalledTimes(1);
    expect(service.state.phase).toBe('current');
    service.dispose();
  });

  it('closes the held update on dispose', async () => {
    const update = fakeUpdate();
    const { service } = setup({ check: vi.fn(async () => update) });
    await service.checkNow();
    service.dispose();
    expect(update.close).toHaveBeenCalledTimes(1);
  });

  it('Later closes the dialog but keeps the update on offer without remembering a skip', async () => {
    const update = fakeUpdate();
    const { deps, service } = setup({ check: vi.fn(async () => update) });
    await service.checkNow();
    service.dismiss();
    expect(service.state).toMatchObject({ phase: 'available', dialogOpen: false });
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(update.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(deps.check).toHaveBeenCalledTimes(2);
    expect(service.state.phase).toBe('available');
    service.dispose();
  });

  it('treats unavailable metadata as a retryable failure, never as up to date', async () => {
    const check = vi
      .fn<UpdaterDeps['check']>()
      .mockRejectedValueOnce(new Error('Could not fetch a valid release JSON from the remote'))
      .mockResolvedValueOnce(fakeUpdate());
    const { deps, service } = setup({ check });
    await service.checkNow();
    expect(service.state.phase).toBe('check-failed');
    expect(service.state.error).toMatch(/could not check for updates/);
    expect(deps.onError).toHaveBeenCalledWith(expect.stringContaining('valid release JSON'));
    await service.retry();
    expect(service.state.phase).toBe('available');
    service.dispose();
  });

  it('keeps automatic network failures quiet and retries a day later', async () => {
    const check = vi
      .fn<UpdaterDeps['check']>()
      .mockRejectedValueOnce(new TypeError('network unreachable'))
      .mockResolvedValueOnce(null);
    const { deps, service } = setup({ check });
    service.start();
    await flush();
    expect(service.state).toMatchObject({ phase: 'idle', dialogOpen: false, error: '' });
    expect(deps.onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(service.state.phase).toBe('current');
    service.dispose();
  });

  it('keeps an offered update when a later automatic check fails', async () => {
    const check = vi
      .fn<UpdaterDeps['check']>()
      .mockResolvedValueOnce(fakeUpdate())
      .mockRejectedValueOnce(new Error('offline'));
    const { service } = setup({ check });
    service.start();
    await flush();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(service.state).toMatchObject({ phase: 'available', version: '2.0.0', error: '' });
    service.dispose();
  });

  it('reports download progress with a known size', async () => {
    const step = deferred<void>();
    const update = fakeUpdate('2.0.0', async (onEvent) => {
      onEvent({ event: 'Started', data: { contentLength: 1000 } });
      onEvent({ event: 'Progress', data: { chunkLength: 400 } });
      await step.promise;
      onEvent({ event: 'Progress', data: { chunkLength: 600 } });
      onEvent({ event: 'Finished' });
    });
    const { service } = setup({ check: vi.fn(async () => update) });
    await service.checkNow();
    const installing = service.install();
    await flush();
    expect(service.state).toMatchObject({
      phase: 'downloading',
      progress: { downloaded: 400, total: 1000, finished: false },
    });
    step.resolve();
    await installing;
    expect(service.state.phase).toBe('restarting');
    service.dispose();
  });

  it('reports indeterminate progress when the size is unknown', async () => {
    const step = deferred<void>();
    const update = fakeUpdate('2.0.0', async (onEvent) => {
      onEvent({ event: 'Started', data: {} });
      onEvent({ event: 'Progress', data: { chunkLength: 250 } });
      onEvent({ event: 'Finished' });
      await step.promise;
    });
    const { service } = setup({ check: vi.fn(async () => update) });
    await service.checkNow();
    const installing = service.install();
    await flush();
    expect(service.state.progress).toEqual({ downloaded: 250, total: null, finished: true });
    step.resolve();
    await installing;
    service.dispose();
  });

  it('ignores duplicate install and dismiss requests while updating', async () => {
    const step = deferred<void>();
    const update = fakeUpdate('2.0.0', () => step.promise);
    const { service } = setup({ check: vi.fn(async () => update) });
    await service.checkNow();
    const installing = service.install();
    void service.install();
    service.dismiss();
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(service.state.dialogOpen).toBe(true);
    step.resolve();
    await installing;
    service.dispose();
  });

  it('never relaunches after a failed install, and can retry it', async () => {
    const update = fakeUpdate();
    update.downloadAndInstall
      .mockRejectedValueOnce(new Error('signature verification failed'))
      .mockResolvedValueOnce(undefined);
    const { deps, service } = setup({ check: vi.fn(async () => update) });
    await service.checkNow();
    await service.install();
    expect(service.state).toMatchObject({ phase: 'install-failed', progress: null });
    expect(service.state.error).toMatch(/could not be installed/);
    expect(deps.relaunch).not.toHaveBeenCalled();
    expect(update.close).not.toHaveBeenCalled();
    await service.retry();
    expect(deps.relaunch).toHaveBeenCalledTimes(1);
    expect(update.close).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it('relaunches only once pending writes and GitHub actions have finished', async () => {
    const { deps, service, setBusy } = setup({ check: vi.fn(async () => fakeUpdate()) });
    await service.checkNow();
    setBusy(true);
    const installing = service.install();
    await flush();
    expect(service.state.phase).toBe('waiting');
    await vi.advanceTimersByTimeAsync(5000);
    expect(deps.relaunch).not.toHaveBeenCalled();
    setBusy(false);
    await vi.advanceTimersByTimeAsync(250);
    await installing;
    expect(deps.relaunch).toHaveBeenCalledTimes(1);
    expect(service.state.phase).toBe('restarting');
    service.dispose();
  });

  it('skips automatic checks while an update installs', async () => {
    const step = deferred<void>();
    const update = fakeUpdate('2.0.0', () => step.promise);
    const { deps, service } = setup({ check: vi.fn(async () => update) });
    service.start();
    await flush();
    const installing = service.install();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(deps.check).toHaveBeenCalledTimes(1);
    step.resolve();
    await installing;
    service.dispose();
  });

  it('offers a restart retry when relaunching fails after a successful install', async () => {
    const relaunch = vi
      .fn<UpdaterDeps['relaunch']>()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(undefined);
    const { service } = setup({ check: vi.fn(async () => fakeUpdate()), relaunch });
    await service.checkNow();
    await service.install();
    expect(service.state.phase).toBe('restart-failed');
    await service.retry();
    expect(relaunch).toHaveBeenCalledTimes(2);
    expect(service.state.phase).toBe('restarting');
    service.dispose();
  });

  it('notifies subscribers of every state change', async () => {
    const { service } = setup({ check: vi.fn(async () => fakeUpdate()) });
    const phases: string[] = [];
    const unsubscribe = service.subscribe((state) => phases.push(state.phase));
    await service.checkNow();
    unsubscribe();
    service.dismiss();
    expect(phases).toEqual(['idle', 'idle', 'checking', 'available']);
    service.dispose();
  });

  it('links release notes to the exact release tag', () => {
    expect(releaseNotesUrl('1.18.0')).toBe(
      'https://github.com/pablaber/pr-desk/releases/tag/v1.18.0',
    );
  });

  it('labels progress by size when known and by bytes so far when not', () => {
    expect(progressLabel({ downloaded: 2_500_000, total: 10_000_000, finished: false })).toBe(
      '2.5 MB of 10.0 MB',
    );
    expect(progressLabel({ downloaded: 2_500_000, total: null, finished: false })).toBe(
      '2.5 MB downloaded',
    );
    expect(progressLabel({ downloaded: 10, total: 10, finished: true })).toBe('Installing…');
  });
});
