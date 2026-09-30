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
    action: 'open-labels',
    key: 'l',
    shift: true,
    description: 'Open labels',
  },
  {
    // Shift is 'any' because reaching ? needs it on some layouts and not on others.
    action: 'toggle-shortcuts',
    key: '?',
    shift: 'any',
    description: 'Show keyboard shortcuts',
  },
  // Card actions apply to the card under the pointer (or holding focus).
  { action: 'open-pr', key: 'o', description: 'Open the hovered PR on GitHub' },
  { action: 'copy-pr', key: 'c', description: 'Copy the hovered PR URL' },
  { action: 'snooze-pr', key: 's', description: 'Snooze the hovered PR' },
  { action: 'ignore-pr', key: 'i', description: 'Ignore the hovered PR' },
  { action: 'label-pr', key: 'l', description: 'Label the hovered PR' },
];
