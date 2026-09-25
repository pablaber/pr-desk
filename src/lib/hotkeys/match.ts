import { hotkeys } from './hotkeys';
import type { Hotkey, HotkeyEvent, HotkeyTarget, Modifier } from './types';

const typingTags = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isTypingTarget(target: HotkeyTarget | null | undefined): boolean {
  if (!target) return false;
  return typingTags.has((target.tagName ?? '').toUpperCase()) || target.isContentEditable === true;
}

function modifierMatches(required: Modifier | undefined, pressed: boolean): boolean {
  return required === 'any' || pressed === (required ?? false);
}

function matches(hotkey: Hotkey, event: HotkeyEvent): boolean {
  return (
    event.key.toLowerCase() === hotkey.key.toLowerCase() &&
    modifierMatches(hotkey.meta, event.metaKey) &&
    modifierMatches(hotkey.ctrl, event.ctrlKey) &&
    modifierMatches(hotkey.shift, event.shiftKey) &&
    modifierMatches(hotkey.alt, event.altKey)
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
