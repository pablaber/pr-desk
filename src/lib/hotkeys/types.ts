export type HotkeyAction = 'open-dashboard' | 'open-settings' | 'toggle-shortcuts';

// A modifier must be absent unless the binding asks for it; 'any' means the binding does
// not care, which is what layout-dependent keys like ? need.
export type Modifier = boolean | 'any';

// The parts of a KeyboardEvent a binding is matched against, so matching stays a pure
// function that unit tests can call without a DOM.
export interface HotkeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

// The parts of an event target that decide whether the user is typing.
export interface HotkeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

export interface Hotkey {
  action: HotkeyAction;
  // Compared against event.key, case-insensitively. Every modifier left unset must be
  // absent from the event, so 'd' never fires on ⌘D.
  key: string;
  meta?: Modifier;
  ctrl?: Modifier;
  shift?: Modifier;
  alt?: Modifier;
  // Plain-key hotkeys stay out of the way while the user types in a field; set this for
  // bindings that should fire anyway, like the system-standard ⌘,.
  whileTyping?: boolean;
  label: string;
  description: string;
}
