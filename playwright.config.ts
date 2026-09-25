import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:1421', viewport: { width: 1180, height: 780 } },
  webServer: {
    command: 'npm run build && npx vite preview',
    url: 'http://localhost:1421',
    reuseExistingServer: false,
  },
});
