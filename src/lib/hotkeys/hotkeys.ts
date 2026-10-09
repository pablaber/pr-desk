import type { Hotkey, HotkeySection } from './types';

// The whole keyboard map: adding, removing or retuning a shortcut happens here, and both
// matching and the hints shown in the UI follow from it.
export const hotkeySections: { id: HotkeySection; title: string }[] = [
  { id: 'navigation', title: 'Navigation' },
  { id: 'pr-actions', title: 'PR actions' },
  { id: 'other', title: 'Other' },
];

export const hotkeys: Hotkey[] = [
  {
    action: 'refresh',
    section: 'other',
    key: 'r',
    meta: true,
    whileTyping: true,
    description: 'Refresh pull requests',
  },
  {
    // Shift is 'any' so ⌘⇧= still zooms in on layouts that keep = as the key value.
    action: 'zoom-in',
    section: 'other',
    key: '=',
    meta: true,
    shift: 'any',
    whileTyping: true,
    description: 'Increase interface size',
  },
  {
    action: 'zoom-out',
    section: 'other',
    key: '-',
    meta: true,
    whileTyping: true,
    description: 'Decrease interface size',
  },
  {
    action: 'zoom-reset',
    section: 'other',
    key: '0',
    meta: true,
    whileTyping: true,
    description: 'Reset interface size',
  },
  {
    action: 'open-settings',
    section: 'navigation',
    key: ',',
    meta: true,
    whileTyping: true,
    description: 'Open settings',
  },
  {
    action: 'open-dashboard',
    section: 'navigation',
    key: 'd',
    shift: true,
    description: 'Open the dashboard',
  },
  {
    action: 'open-snoozed',
    section: 'navigation',
    key: 's',
    shift: true,
    description: 'Open snoozed pull requests',
  },
  {
    action: 'open-completed',
    section: 'navigation',
    key: 'c',
    shift: true,
    description: 'Open recently merged pull requests',
  },
  {
    action: 'open-labels',
    section: 'navigation',
    key: 'l',
    shift: true,
    description: 'Open labels',
  },
  {
    action: 'toggle-sidebar',
    section: 'navigation',
    key: 'b',
    meta: true,
    whileTyping: true,
    description: 'Collapse or expand the sidebar',
  },
  {
    // Shift is 'any' because reaching ? needs it on some layouts and not on others.
    action: 'toggle-shortcuts',
    section: 'other',
    key: '?',
    shift: 'any',
    description: 'Show keyboard shortcuts',
  },
  // Card actions apply to the card under the pointer (or holding focus).
  {
    action: 'open-pr',
    section: 'pr-actions',
    key: 'o',
    alternateKeys: ['Enter'],
    description: 'Open the hovered PR on GitHub',
  },
  { action: 'copy-pr', section: 'pr-actions', key: 'c', description: 'Copy the hovered PR URL' },
  { action: 'snooze-pr', section: 'pr-actions', key: 's', description: 'Snooze the hovered PR' },
  { action: 'ignore-pr', section: 'pr-actions', key: 'i', description: 'Ignore the hovered PR' },
  { action: 'label-pr', section: 'pr-actions', key: 'l', description: 'Label the hovered PR' },
];
