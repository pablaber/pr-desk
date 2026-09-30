import type { Toast } from './types';

const DURATION_MS = 4000;
const MAX_TOASTS = 3;

export const toasts: Toast[] = $state([]);

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

const timers = new Map<number, Timer>();
let nextId = 1;
let paused = false;

function start(id: number, timer: Timer) {
  timer.startedAt = Date.now();
  timer.handle = setTimeout(() => dismissToast(id), timer.remaining);
}

export function dismissToast(id: number) {
  const timer = timers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  timers.delete(id);
  const index = toasts.findIndex((t) => t.id === id);
  if (index >= 0) toasts.splice(index, 1);
}

export function showToast(icon: Toast['icon'], message: string) {
  const existing = toasts.find((t) => t.message === message);
  if (existing) {
    const timer = timers.get(existing.id)!;
    if (timer.handle) clearTimeout(timer.handle);
    timer.remaining = DURATION_MS;
    if (paused) timer.handle = null;
    else start(existing.id, timer);
    return;
  }
  const id = nextId++;
  toasts.push({ id, icon, message });
  while (toasts.length > MAX_TOASTS) dismissToast(toasts[0].id);
  const timer: Timer = { handle: null, remaining: DURATION_MS, startedAt: 0 };
  timers.set(id, timer);
  if (!paused) start(id, timer);
}

export function pauseToasts() {
  paused = true;
  for (const timer of timers.values()) {
    if (!timer.handle) continue;
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
  }
}

export function resumeToasts() {
  paused = false;
  for (const [id, timer] of timers) if (!timer.handle) start(id, timer);
}
