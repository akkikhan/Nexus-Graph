import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;
const WEB_PORT = Number(process.env.WEB_PORT || "3100");
const WEB_BASE_URL = process.env.WEB_BASE_URL || `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
    testDir: ".",
    fullyParallel: false,
    retries: CI ? 1 : 0,
    workers: CI ? 1 : undefined,
    reporter: [["list"], ["html", { outputFolder: "output/playwright-report", open: "never" }]],
    use: {
        baseURL: WEB_BASE_URL,
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
        command: `pnpm --filter @nexus/web exec next dev -p ${WEB_PORT}`,
        url: WEB_BASE_URL,
        // Deterministic runs: always start the expected web server (avoids accidentally reusing a different app on 3000).
        reuseExistingServer: false,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 180000,
    },
});
