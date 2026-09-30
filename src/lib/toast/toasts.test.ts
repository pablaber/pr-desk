import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissToast, pauseToasts, resumeToasts, showToast, toasts } from './toasts.svelte';

const icon = (() => {}) as never;

describe('toasts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    for (const t of [...toasts]) dismissToast(t.id);
    resumeToasts();
    vi.useRealTimers();
  });

  it('shows then auto-dismisses', () => {
    showToast(icon, 'hello');
    expect(toasts.map((t) => t.message)).toEqual(['hello']);
    vi.advanceTimersByTime(3999);
    expect(toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts).toHaveLength(0);
  });

  it('refreshes a duplicate message instead of stacking', () => {
    showToast(icon, 'same');
    vi.advanceTimersByTime(3000);
    showToast(icon, 'same');
    expect(toasts).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(toasts).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(toasts).toHaveLength(0);
  });

  it('keeps at most three, dropping the oldest', () => {
    for (const m of ['a', 'b', 'c', 'd']) showToast(icon, m);
    expect(toasts.map((t) => t.message)).toEqual(['b', 'c', 'd']);
  });

  it('holds while paused and finishes the remaining time on resume', () => {
    showToast(icon, 'pause');
    vi.advanceTimersByTime(3000);
    pauseToasts();
    vi.advanceTimersByTime(10000);
    expect(toasts).toHaveLength(1);
    resumeToasts();
    vi.advanceTimersByTime(999);
    expect(toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts).toHaveLength(0);
  });
});
