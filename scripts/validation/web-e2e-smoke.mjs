#!/usr/bin/env node

const WEB_BASE_URL = (process.env.WEB_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const REQUIRE_PLAYWRIGHT = process.env.REQUIRE_PLAYWRIGHT === "true";
const REQUEST_FAILURE_IGNORE_SUBSTRINGS = ["ERR_ABORTED", "NS_BINDING_ABORTED", "Operation canceled"];

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function isIgnorableRequestFailure(errorText) {
    return REQUEST_FAILURE_IGNORE_SUBSTRINGS.some((pattern) => errorText.includes(pattern));
}

async function httpSmokeOnly() {
    const routes = ["/inbox", "/stacks", "/queue", "/activity", "/insights", "/ai-rules", "/settings"];
    for (const route of routes) {
        const url = `${WEB_BASE_URL}${route}`;
        const response = await fetch(url);
        process.stdout.write(`[web-smoke] HTTP ${route}: ${response.status}\n`);
        assert(response.status === 200, `Expected 200 for ${route}`);
    }
    process.stdout.write(
        "[web-smoke] PASS (HTTP-only mode; install @playwright/test for browser actions)\n"
    );
}

async function browserSmoke(playwrightModule) {
    const chromium = playwrightModule.chromium || playwrightModule.default?.chromium;
    assert(chromium, "Unable to resolve Playwright chromium launcher");

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const apiClientErrors = [];
    const pageErrors = [];
    const consoleErrors = [];
    const requestFailures = [];

    page.on("response", async (response) => {
        const url = response.url();
        if (!url.includes("/api/v1/")) return;
        const status = response.status();
        if (status < 400 || status >= 500) return;

        let preview = "";
        try {
            const body = await response.text();
            preview = body.slice(0, 240);
        } catch {
            // Best-effort diagnostics only.
        }

        apiClientErrors.push({
            method: response.request().method(),
            status,
            url,
            preview,
        });
    });
    page.on("pageerror", (error) => {
        pageErrors.push(String(error?.message || error));
    });
    page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        // Ignore noisy browser extension errors that are unrelated to app behavior.
        if (text.includes("chrome-extension://")) return;
        consoleErrors.push(text);
    });
    page.on("requestfailed", (request) => {
        const url = request.url();
        if (!url.includes("/api/v1/") && !url.startsWith(WEB_BASE_URL)) return;
        if (url.includes("/_next/static/webpack/")) return;

        const errorText = request.failure()?.errorText || "unknown request failure";
        if (isIgnorableRequestFailure(errorText)) return;

        requestFailures.push({
            method: request.method(),
            url,
            error: errorText,
        });
    });

    try {
        const pages = ["/inbox", "/stacks", "/queue", "/activity", "/insights", "/ai-rules", "/settings"];
        for (const route of pages) {
            await page.goto(`${WEB_BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(500);
            process.stdout.write(`[web-smoke] Visited ${route}\n`);
        }

        // Inbox happy/degraded path.
        await page.goto(`${WEB_BASE_URL}/inbox`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(750);

        const inboxError = page.getByText(/Error loading PRs/i).first();
        if (await inboxError.isVisible().catch(() => false)) {
            process.stdout.write("[web-smoke] Inbox degraded path detected (DB unavailable)\n");
        } else {
            const search = page.locator('input[placeholder*="Search pull requests"]').first();
            if ((await search.count()) > 0) {
                await search.fill("auth");
            }

            const openFilter = page.getByRole("button", { name: "open" }).first();
            if (await openFilter.isVisible().catch(() => false)) {
                await openFilter.click();
            }

            const firstCard = page.locator("div.cursor-pointer.group").first();
            if ((await firstCard.count()) > 0) {
                await firstCard.click();
                await page.waitForURL(/\/inbox\/[^/]+$/, { timeout: 15000 }).catch(() => {});
                await page.waitForLoadState("domcontentloaded");

                const backLink = page.getByRole("link", { name: /Back to Inbox/i }).first();
                const reviewButton = page.getByRole("button", { name: /Request AI Review/i }).first();
                const mergeButton = page.getByRole("button", { name: /Merge PR|Merged/i }).first();

                const detailVisible = await Promise.any([
                    backLink.waitFor({ state: "visible", timeout: 15000 }).then(() => true),
                    reviewButton.waitFor({ state: "visible", timeout: 15000 }).then(() => true),
                    mergeButton.waitFor({ state: "visible", timeout: 15000 }).then(() => true),
                ]).catch(() => false);

                assert(detailVisible, "Expected PR detail marker after opening first inbox item");

                if (await reviewButton.isVisible().catch(() => false)) {
                    await reviewButton.click();
                    await page.waitForTimeout(250);
                }
            }
        }

        // Queue action.
        await page.goto(`${WEB_BASE_URL}/stacks`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(750);
        const newStackButton = page.getByTestId("new-stack-button");
        if (await newStackButton.isVisible().catch(() => false)) {
            const smokeStackName = `Smoke Stack ${Date.now()}`;
            await newStackButton.click();
            await page.getByTestId("stack-name-input").fill(smokeStackName);
            await page.getByTestId("create-stack-submit").click();
            await page.waitForURL(/\/stacks\/[^/]+$/, { timeout: 15000 }).catch(() => {});

            const backToStacks = page.getByRole("link", { name: /Back to Stacks/i }).first();
            const stackError = page.getByText(/Error loading stack/i).first();
            const detailVisible = await Promise.any([
                backToStacks.waitFor({ state: "visible", timeout: 15000 }).then(() => true),
                stackError.waitFor({ state: "visible", timeout: 15000 }).then(() => false),
            ]).catch(() => false);
            assert(detailVisible, "Expected stack detail page after creating a stack");
        }

        await page.goto(`${WEB_BASE_URL}/ai-rules`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(750);
        const saveAiRules = page.getByRole("button", { name: /Save AI Rules|Saving/i }).first();
        if (await saveAiRules.isVisible().catch(() => false)) {
            await saveAiRules.click();
            await page.waitForTimeout(500);
        }

        await page.goto(`${WEB_BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(750);
        const saveSettings = page.getByRole("button", { name: /Save Changes|Saving/i }).first();
        if (await saveSettings.isVisible().catch(() => false)) {
            await saveSettings.click();
            await page.waitForTimeout(500);
        }

        // Queue action.
        await page.goto(`${WEB_BASE_URL}/queue`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(750);
        const turboButton = page.getByRole("button", { name: /Enable Turbo|Disable Turbo/i }).first();
        if (await turboButton.isVisible().catch(() => false)) {
            await turboButton.click();
            await page.waitForTimeout(250);
        }

        // Activity filter switch.
        await page.goto(`${WEB_BASE_URL}/activity`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(750);
        const reviewsFilter = page.getByRole("button", { name: /Reviews/i }).first();
        if (await reviewsFilter.isVisible().catch(() => false)) {
            await reviewsFilter.click();
            await page.waitForTimeout(250);
        }

        if (apiClientErrors.length > 0) {
            const formatted = apiClientErrors
                .slice(0, 8)
                .map(
                    (entry) =>
                        `${entry.method} ${entry.status} ${entry.url}${entry.preview ? ` :: ${entry.preview}` : ""}`
                )
                .join("\n");
            throw new Error(`Unexpected API 4xx responses during web smoke:\n${formatted}`);
        }
        if (pageErrors.length > 0) {
            throw new Error(`Unexpected page runtime errors during web smoke:\n${pageErrors.slice(0, 5).join("\n")}`);
        }
        if (consoleErrors.length > 0) {
            throw new Error(`Unexpected browser console errors during web smoke:\n${consoleErrors.slice(0, 5).join("\n")}`);
        }
        if (requestFailures.length > 0) {
            const formatted = requestFailures
                .slice(0, 8)
                .map((entry) => `${entry.method} ${entry.url} :: ${entry.error}`)
                .join("\n");
            throw new Error(`Unexpected network request failures during web smoke:\n${formatted}`);
        }

        process.stdout.write("[web-smoke] PASS\n");
    } finally {
        await browser.close();
    }
}

async function run() {
    process.stdout.write(`[web-smoke] Web base: ${WEB_BASE_URL}\n`);

    let playwrightModule = null;
    try {
        playwrightModule = await import("@playwright/test");
    } catch {
        if (REQUIRE_PLAYWRIGHT) {
            throw new Error(
                "Playwright is required but not installed. Run: pnpm add -D @playwright/test && pnpm exec playwright install chromium"
            );
        }
    }

    if (!playwrightModule) {
        await httpSmokeOnly();
        return;
    }

    await browserSmoke(playwrightModule);
}

run().catch((error) => {
    process.stderr.write(`[web-smoke] FAIL: ${error.message}\n`);
    process.exitCode = 1;
});
