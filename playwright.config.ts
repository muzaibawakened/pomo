import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://127.0.0.1:4183",
    channel: process.env.POMO_BROWSER_CHANNEL || undefined,
    viewport: { width: 320, height: 720 },
    reducedMotion: "reduce",
    timezoneId: "America/New_York",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4183 --strictPort",
    url: "http://127.0.0.1:4183",
    reuseExistingServer: false,
  },
});
