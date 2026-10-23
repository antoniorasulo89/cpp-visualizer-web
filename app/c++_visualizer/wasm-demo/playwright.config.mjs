import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.mjs",
  timeout: 120000,
  expect: { timeout: 10000 },
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: { baseURL: "http://127.0.0.1:8768", trace: "retain-on-failure" },
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
    url: "http://127.0.0.1:8768/wasm-demo/",
    reuseExistingServer: !process.env.CI,
  },
});
