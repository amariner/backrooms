import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const installedChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      ...(existsSync(installedChrome) ? { executablePath: installedChrome } : {}),
      args: ['--enable-webgl', ...(process.env.PLAYWRIGHT_SOFTWARE_WEBGL === '1'
        ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
