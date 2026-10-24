import { defineConfig, devices } from "@playwright/test";
const baseURL = `http://127.0.0.1:${Number(process.env.PORT || 8768)}`;
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.mjs",
  timeout: 120000,
  expect: { timeout: 10000 },
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      // Full Chromium handles WASM memory traps through Chrome's signal handler.
      // The separate headless shell can crash on this deliberate trap on Linux.
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run serve",
    url: `${baseURL}/wasm-demo/`,
    reuseExistingServer: !process.env.CI,
  },
});
