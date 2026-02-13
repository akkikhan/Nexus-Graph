import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

export default defineConfig({
    testDir: ".",
    fullyParallel: false,
    retries: CI ? 1 : 0,
    workers: CI ? 1 : undefined,
    reporter: [["list"], ["html", { outputFolder: "output/playwright-report", open: "never" }]],
    use: {
        baseURL: process.env.WEB_BASE_URL || "http://127.0.0.1:3000",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    outputDir: "output/playwright",
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        command: "pnpm --filter @nexus/web dev",
        url: process.env.WEB_BASE_URL || "http://127.0.0.1:3000",
        reuseExistingServer: !CI,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 180000,
    },
});
