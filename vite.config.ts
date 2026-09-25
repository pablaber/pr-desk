import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tauriConfig from './src-tauri/tauri.conf.json';
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  preview: {
    port: 1421,
    strictPort: true,
    headers: { 'Content-Security-Policy': tauriConfig.app.security.csp },
  },
  build: { target: 'safari15' },
});
