import type { Hotkey } from './types';

// The whole keyboard map: adding, removing or retuning a shortcut happens here, and both
// matching and the hints shown in the UI follow from it.
export const hotkeys: Hotkey[] = [
  {
    action: 'refresh',
    key: 'r',
    meta: true,
    whileTyping: true,
    description: 'Refresh pull requests',
  },
  {
    action: 'open-settings',
    key: ',',
    meta: true,
    whileTyping: true,
    description: 'Open settings',
  },
  {
    action: 'open-dashboard',
    key: 'd',
    shift: true,
    description: 'Open the dashboard',
  },
  {
    action: 'open-snoozed',
    key: 's',
    shift: true,
    description: 'Open snoozed pull requests',
  },
  {
    // Shift is 'any' because reaching ? needs it on some layouts and not on others.
    action: 'toggle-shortcuts',
    key: '?',
    shift: 'any',
    description: 'Show keyboard shortcuts',
  },
];
