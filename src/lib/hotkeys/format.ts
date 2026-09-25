import type { Hotkey } from './types';

// Apple's canonical order for a shortcut is ⌃⌥⇧⌘ followed by the key itself, so the
// glyphs read the way the macOS menu bar writes them.
type ModifierFlag = 'ctrl' | 'alt' | 'shift' | 'meta';

const modifiers: { flag: ModifierFlag; glyph: string; aria: string; spoken: string }[] = [
  { flag: 'ctrl', glyph: '⌃', aria: 'Control', spoken: 'Control' },
  { flag: 'alt', glyph: '⌥', aria: 'Alt', spoken: 'Option' },
  { flag: 'shift', glyph: '⇧', aria: 'Shift', spoken: 'Shift' },
  { flag: 'meta', glyph: '⌘', aria: 'Meta', spoken: 'Command' },
];

// Microsoft's style guide spells punctuation key names out rather than leaving a screen
// reader to announce the bare glyph.
const spokenNames: Record<string, string> = { ',': 'Comma', '?': 'Question mark' };

function mainKey(hotkey: Hotkey): string {
  return hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key;
}

// One key per cap, derived from the binding itself so the display can never drift from
// what actually fires. 'any' modifiers are left out: ? already implies its own Shift.
export function displayKeys(hotkey: Hotkey): string[] {
  const glyphs = modifiers.filter((m) => hotkey[m.flag] === true).map((m) => m.glyph);
  return [...glyphs, mainKey(hotkey)];
}

// The compact macOS spelling (⌘,) for inline hints beside a control.
export function compactKeys(hotkey: Hotkey): string {
  return displayKeys(hotkey).join('');
}

// What a screen reader should say, since the glyphs alone announce poorly or not at all.
export function spokenKeys(hotkey: Hotkey): string {
  const names = modifiers.filter((m) => hotkey[m.flag] === true).map((m) => m.spoken);
  const key = mainKey(hotkey);
  return [...names, spokenNames[key] ?? key].join(' plus ');
}

// aria-keyshortcuts wants KeyboardEvent key values joined with +, e.g. "Meta+,".
export function ariaKeyShortcut(hotkey: Hotkey): string {
  const names = modifiers.filter((m) => hotkey[m.flag] === true).map((m) => m.aria);
  return [...names, mainKey(hotkey)].join('+');
}
