import { hotkeys } from './hotkeys';
import type { Hotkey, HotkeyEvent, HotkeyTarget } from './types';

const typingTags = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isTypingTarget(target: HotkeyTarget | null | undefined): boolean {
  if (!target) return false;
  return typingTags.has((target.tagName ?? '').toUpperCase()) || target.isContentEditable === true;
}

function matches(hotkey: Hotkey, event: HotkeyEvent): boolean {
  return (
    event.key.toLowerCase() === hotkey.key.toLowerCase() &&
    event.metaKey === (hotkey.meta ?? false) &&
    event.ctrlKey === (hotkey.ctrl ?? false) &&
    event.shiftKey === (hotkey.shift ?? false) &&
    event.altKey === (hotkey.alt ?? false)
  );
}

export function resolveHotkey(
  event: HotkeyEvent,
  target?: HotkeyTarget | null,
  bindings: Hotkey[] = hotkeys,
): Hotkey | null {
  const hotkey = bindings.find((h) => matches(h, event));
  if (!hotkey || (!hotkey.whileTyping && isTypingTarget(target))) return null;
  return hotkey;
}

export function hotkeyFor(action: Hotkey['action'], bindings: Hotkey[] = hotkeys): Hotkey | null {
  return bindings.find((h) => h.action === action) ?? null;
}
