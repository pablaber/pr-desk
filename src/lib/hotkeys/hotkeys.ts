import type { Hotkey } from './types';

// The whole keyboard map: adding, removing or retuning a shortcut happens here, and both
// matching and the hints shown in the UI follow from it.
export const hotkeys: Hotkey[] = [
  {
    action: 'open-settings',
    key: ',',
    meta: true,
    whileTyping: true,
    label: '⌘,',
    description: 'Open settings',
  },
  {
    action: 'open-dashboard',
    key: 'd',
    label: 'D',
    description: 'Open the dashboard',
  },
  {
    // Shift is 'any' because reaching ? needs it on some layouts and not on others.
    action: 'toggle-shortcuts',
    key: '?',
    shift: 'any',
    label: '?',
    description: 'Show keyboard shortcuts',
  },
];
