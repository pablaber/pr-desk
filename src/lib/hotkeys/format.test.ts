import { describe, expect, it } from 'vitest';
import { ariaKeyShortcut, compactKeys, displayKeys, spokenKeys } from './format';
import { hotkeys } from './hotkeys';
import { hotkeyFor } from './match';
import type { Hotkey } from './types';

const settings = hotkeyFor('open-settings') as Hotkey;
const dashboard = hotkeyFor('open-dashboard') as Hotkey;
const shortcuts = hotkeyFor('toggle-shortcuts') as Hotkey;

describe('displayKeys', () => {
  it('gives one cap per key, uppercasing letters', () => {
    expect(displayKeys(settings)).toEqual(['⌘', ',']);
    expect(displayKeys(dashboard)).toEqual(['⇧', 'D']);
  });

  it("omits 'any' modifiers, since ? already implies its own shift", () => {
    expect(displayKeys(shortcuts)).toEqual(['?']);
  });

  it('orders modifiers the way macOS writes them', () => {
    const all: Hotkey = {
      action: 'open-settings',
      key: 'k',
      meta: true,
      shift: true,
      alt: true,
      ctrl: true,
      description: 'Everything',
    };
    expect(displayKeys(all)).toEqual(['⌃', '⌥', '⇧', '⌘', 'K']);
  });
});

describe('compactKeys', () => {
  it('concatenates for inline hints, as the macOS menu bar does', () => {
    expect(compactKeys(settings)).toBe('⌘,');
    expect(compactKeys(dashboard)).toBe('⇧D');
  });
});

describe('spokenKeys', () => {
  it('spells out glyphs and punctuation for screen readers', () => {
    expect(spokenKeys(settings)).toBe('Command plus Comma');
    expect(spokenKeys(dashboard)).toBe('Shift plus D');
    expect(spokenKeys(shortcuts)).toBe('Question mark');
  });
});

describe('ariaKeyShortcut', () => {
  it('uses KeyboardEvent key values joined with +', () => {
    expect(ariaKeyShortcut(settings)).toBe('Meta+,');
    expect(ariaKeyShortcut(dashboard)).toBe('Shift+D');
  });
});

describe('every binding', () => {
  it('formats without empty caps', () => {
    for (const hotkey of hotkeys) {
      const keys = displayKeys(hotkey);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.every((key) => key.length > 0)).toBe(true);
      expect(spokenKeys(hotkey)).not.toBe('');
    }
  });
});
