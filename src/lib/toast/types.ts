import type { Component } from 'svelte';

export interface Toast {
  id: number;
  icon: Component<{ size?: number }>;
  message: string;
  key?: string;
}
