import { describe, expect, it } from 'vitest';
import { hotkeys } from './hotkeys';
import { hotkeyFor, isTypingTarget, resolveHotkey } from './match';
import type { HotkeyEvent } from './types';

function press(key: string, modifiers: Partial<HotkeyEvent> = {}): HotkeyEvent {
  return { key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...modifiers };
}

describe('resolveHotkey', () => {
  it('matches the dashboard and settings bindings', () => {
    expect(resolveHotkey(press('d'))?.action).toBe('open-dashboard');
    expect(resolveHotkey(press('D'))?.action).toBe('open-dashboard');
    expect(resolveHotkey(press(',', { metaKey: true }))?.action).toBe('open-settings');
  });

  it('ignores unbound keys and unexpected modifiers', () => {
    expect(resolveHotkey(press('x'))).toBeNull();
    expect(resolveHotkey(press('d', { metaKey: true }))).toBeNull();
    expect(resolveHotkey(press('d', { shiftKey: true }))).toBeNull();
    expect(resolveHotkey(press(','))).toBeNull();
    expect(resolveHotkey(press(',', { ctrlKey: true }))).toBeNull();
  });

  it('suppresses plain-key bindings while typing but keeps modifier ones', () => {
    for (const tagName of ['INPUT', 'textarea', 'SELECT']) {
      expect(resolveHotkey(press('d'), { tagName })).toBeNull();
      expect(resolveHotkey(press(',', { metaKey: true }), { tagName })?.action).toBe(
        'open-settings',
      );
    }
    expect(resolveHotkey(press('d'), { tagName: 'DIV', isContentEditable: true })).toBeNull();
    expect(resolveHotkey(press('d'), { tagName: 'BUTTON' })?.action).toBe('open-dashboard');
    expect(resolveHotkey(press('d'), null)?.action).toBe('open-dashboard');
  });

  it('accepts custom bindings so new shortcuts need no changes here', () => {
    const custom = [
      {
        action: 'open-settings' as const,
        key: 's',
        alt: true,
        label: '⌥S',
        description: 'Settings',
      },
    ];
    expect(resolveHotkey(press('s', { altKey: true }), null, custom)?.action).toBe('open-settings');
    expect(resolveHotkey(press('d'), null, custom)).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('treats fields and editable regions as typing targets', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({})).toBe(false);
    expect(isTypingTarget({ tagName: 'input' })).toBe(true);
    expect(isTypingTarget({ tagName: 'P', isContentEditable: true })).toBe(true);
  });
});

describe('hotkeys', () => {
  it('binds every action exactly once', () => {
    const actions = hotkeys.map((h) => h.action);
    expect(new Set(actions).size).toBe(actions.length);
    for (const action of actions) expect(hotkeyFor(action)?.action).toBe(action);
    expect(hotkeyFor('open-dashboard')?.label).toBe('D');
  });
});
