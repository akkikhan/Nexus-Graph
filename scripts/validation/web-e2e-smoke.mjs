#!/usr/bin/env node

const WEB_BASE_URL = (process.env.WEB_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const REQUIRE_PLAYWRIGHT = process.env.REQUIRE_PLAYWRIGHT === "true";
const REQUIRE_HEALTHY = process.env.REQUIRE_HEALTHY === "true";

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function httpSmokeOnly() {
    const routes = ["/inbox", "/stacks", "/queue", "/activity", "/insights"];
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

    try {
        const pages = ["/inbox", "/stacks", "/queue", "/activity", "/insights"];
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
            assert(!REQUIRE_HEALTHY, "Inbox is degraded (DB unavailable) but REQUIRE_HEALTHY=true");
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
