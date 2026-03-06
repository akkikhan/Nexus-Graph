#!/usr/bin/env node

const WEB_BASE_URL = (process.env.WEB_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const MISSING_PR_ID = "00000000-0000-4000-8000-000000000000";

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function clickWhenVisible(locator, timeout = 20000) {
    await locator.waitFor({ state: "visible", timeout });
    await locator.click();
}

function isIgnorableRequestFailure(url, errorText) {
    if (url.includes("/_next/static/")) return true;
    return errorText.includes("ERR_ABORTED") || errorText.includes("NS_BINDING_ABORTED") || errorText.includes("Operation canceled");
}

async function run() {
    const playwright = await import("@playwright/test");
    const chromium = playwright.chromium || playwright.default?.chromium;
    assert(chromium, "Unable to load Playwright chromium");

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        acceptDownloads: true,
    });

    const pageErrors = [];
    const consoleErrors = [];
    const requestFailures = [];
    const apiErrors = [];
    const results = [];

    page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
    page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (text.includes("chrome-extension://")) return;
        if (text.includes("Failed to load resource")) return;
        consoleErrors.push(text);
    });
    page.on("response", async (response) => {
        const url = response.url();
        if (!url.includes("/api/v1/")) return;
        const status = response.status();
        if (status < 400) return;
        if (status === 404 && url.includes(`/api/v1/prs/${MISSING_PR_ID}`)) return;
        apiErrors.push(`${status} ${response.request().method()} ${url}`);
    });
    page.on("requestfailed", (request) => {
        const url = request.url();
        const errorText = request.failure()?.errorText || "unknown request failure";
        if (isIgnorableRequestFailure(url, errorText)) return;
        requestFailures.push({
            method: request.method(),
            url,
            error: errorText,
        });
    });

    async function step(name, fn) {
        try {
            const detail = await fn();
            results.push({ name, status: "PASS", detail });
        } catch (error) {
            results.push({
                name,
                status: "FAIL",
                detail: error instanceof Error ? error.message : String(error),
            });
        }
    }

    await step("Route sweep", async () => {
        const routes = ["/", "/inbox", "/stacks", "/queue", "/activity", "/insights", "/ai-rules", "/settings"];
        for (const route of routes) {
            const response = await page.goto(`${WEB_BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
            assert(response, `No response for ${route}`);
            assert(response.status() === 200, `Expected 200 for ${route}, got ${response.status()}`);
        }
        return routes.join(", ");
    });

    await step("Inbox happy path", async () => {
        await page.goto(`${WEB_BASE_URL}/inbox`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);

        const search = page.locator('input[placeholder*="Search pull requests"]');
        if (await search.isVisible().catch(() => false)) {
            await search.fill("");
        }
        await clickWhenVisible(page.getByRole("button", { name: /^all$/i }).first());
        const firstCard = page.locator("div.cursor-pointer.group").first();
        await clickWhenVisible(firstCard);
        await page.waitForURL(/\/inbox\/[^/]+$/, { timeout: 20000 });
        await page.getByRole("link", { name: /Back to Inbox/i }).waitFor({ state: "visible", timeout: 10000 });
        return "Opened PR detail from inbox list.";
    });

    await step("PR detail AI review and merge", async () => {
        const reviewButton = page.getByRole("button", { name: /Request AI Review/i }).first();
        await clickWhenVisible(reviewButton);
        await page.getByText(/AI review queued\./i).waitFor({ state: "visible", timeout: 15000 });

        const mergeButton = page.getByRole("button", { name: /Merge PR/i }).first();
        if (await mergeButton.isVisible().catch(() => false)) {
            await mergeButton.click();
            await page.getByText(/PR merged successfully\./i).waitFor({ state: "visible", timeout: 15000 });
            await page.getByRole("button", { name: /Merged/i }).waitFor({ state: "visible", timeout: 10000 });
            return "AI review requested and PR merged.";
        }

        return "AI review requested; merge button was not available.";
    });

    await step("PR detail bad path", async () => {
        await page.goto(`${WEB_BASE_URL}/inbox/${MISSING_PR_ID}`, { waitUntil: "domcontentloaded" });
        await page.getByText(/Error loading PR:/i).waitFor({ state: "visible", timeout: 15000 });
        return "Invalid PR id shows error.";
    });

    await step("Stacks create validation and create flow", async () => {
        await page.goto(`${WEB_BASE_URL}/stacks`, { waitUntil: "domcontentloaded" });
        await clickWhenVisible(page.getByTestId("new-stack-button"));
        await clickWhenVisible(page.getByTestId("create-stack-submit"));
        await page.getByText(/Stack name is required\./i).waitFor({ state: "visible", timeout: 10000 });

        const stackName = `Full Acceptance ${Date.now()}`;
        await page.getByTestId("stack-name-input").fill(stackName);
        await page.getByTestId("create-stack-submit").click();
        await page.waitForURL(/\/stacks\/[^/]+$/, { timeout: 20000 });
        await page.getByRole("link", { name: /Back to Stacks/i }).waitFor({ state: "visible", timeout: 10000 });
        return stackName;
    });

    await step("Stack detail sync and submit", async () => {
        await clickWhenVisible(page.getByRole("button", { name: /Sync Stack/i }).first());
        await page.getByText(/Stack synced successfully|Stack sync started\./i).waitFor({ state: "visible", timeout: 15000 });
        await clickWhenVisible(page.getByRole("button", { name: /Submit Stack/i }).first());
        await page.getByText(/Stack submitted/i).waitFor({ state: "visible", timeout: 15000 });
        return "Sync and submit both returned success feedback.";
    });

    await step("Queue controls and item actions", async () => {
        await page.goto(`${WEB_BASE_URL}/queue`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);

        const pauseButton = page.getByRole("button", { name: /Pause Queue/i }).first();
        const resumeButton = page.getByRole("button", { name: /Resume Queue/i }).first();

        if (await pauseButton.isVisible().catch(() => false)) {
            await pauseButton.click();
            await resumeButton.waitFor({ state: "visible", timeout: 15000 });
        }
        await resumeButton.click();
        await pauseButton.waitFor({ state: "visible", timeout: 15000 });

        const turboButton = page.getByRole("button", { name: /Enable Turbo|Disable Turbo/i }).first();
        const beforeTurbo = ((await turboButton.textContent()) || "").trim();
        await turboButton.click();
        await page.waitForTimeout(1000);
        const afterTurbo = ((await turboButton.textContent()) || "").trim();
        assert(beforeTurbo !== afterTurbo, `Turbo label did not change: ${beforeTurbo}`);
        await turboButton.click();
        await page.waitForTimeout(1000);

        const retryButton = page.locator('button[title="Retry"]').first();
        if (await retryButton.isVisible().catch(() => false)) {
            await retryButton.click();
            await page.waitForTimeout(1000);
        }

        const queueCardsBefore = await page.locator("div.rounded-xl.border").count();
        const removeButton = page.locator('button[title="Remove"]').first();
        if (await removeButton.isVisible().catch(() => false)) {
            await removeButton.click();
            await page.waitForTimeout(1500);
        }
        const queueCardsAfter = await page.locator("div.rounded-xl.border").count();
        return `Queue controls exercised; item count ${queueCardsBefore} -> ${queueCardsAfter}.`;
    });

    await step("Activity filters and load more", async () => {
        await page.goto(`${WEB_BASE_URL}/activity`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);
        for (const name of ["Reviews", "Stacks", "All Activity"]) {
            const button = page.getByRole("button", { name: new RegExp(`^${escapeRegex(name)}$`, "i") }).first();
            if (await button.isVisible().catch(() => false)) {
                await button.click();
                await page.waitForTimeout(500);
            }
        }
        const loadMore = page.getByRole("button", { name: /Load More Activity/i }).first();
        if (await loadMore.isVisible().catch(() => false)) {
            await loadMore.click();
            await page.waitForTimeout(1000);
        }
        return "Activity filters exercised.";
    });

    await step("Insights page render", async () => {
        await page.goto(`${WEB_BASE_URL}/insights`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);
        await page.getByRole("heading", { name: /AI Insights/i }).waitFor({ state: "visible", timeout: 15000 });
        return "Insights content rendered.";
    });

    await step("AI Rules full save and persistence", async () => {
        await page.goto(`${WEB_BASE_URL}/ai-rules`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);

        const provider = page.locator("select").nth(0);
        const model = page.locator("select").nth(1);
        const autoReview = page.locator('input[type="checkbox"]').nth(0);
        const ensemble = page.locator('input[type="checkbox"]').nth(1);
        const threshold = page.locator('input[type="range"]').first();

        await provider.selectOption("openai");
        await model.selectOption("gpt-4o");
        if (!(await autoReview.isChecked())) await autoReview.check();
        if (await ensemble.isChecked()) await ensemble.uncheck();
        await threshold.fill("82");

        await clickWhenVisible(page.getByRole("button", { name: /Save AI Rules/i }).first());
        await page.getByText(/AI rules saved\./i).waitFor({ state: "visible", timeout: 15000 });

        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);
        assert((await provider.inputValue()) === "openai", "AI provider did not persist");
        assert((await model.inputValue()) === "gpt-4o", "AI model did not persist");
        assert((await threshold.inputValue()) === "82", "Risk threshold did not persist");
        return "Provider/model/toggles/threshold persisted after reload.";
    });

    await step("Settings general configuration save", async () => {
        await page.goto(`${WEB_BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(7000);

        const aiProviderSelect = page.locator("select").filter({ has: page.locator('option[value="anthropic"]') }).first();
        await aiProviderSelect.selectOption("google");
        const mergeMethodSelect = page.locator("select").filter({ has: page.locator('option[value="squash"]') }).first();
        await mergeMethodSelect.selectOption("rebase");

        const slider = page.locator('input[type="range"]').first();
        await slider.fill("64");

        const toggleButtons = page.locator('button.relative.w-12.h-6');
        const toggleCount = await toggleButtons.count();
        assert(toggleCount >= 4, "Expected settings toggle buttons to render");
        await toggleButtons.nth(0).click();
        await toggleButtons.nth(1).click();

        await clickWhenVisible(page.getByRole("button", { name: /Save Changes/i }).first());
        await page.getByText(/Settings saved\./i).waitFor({ state: "visible", timeout: 15000 });

        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(7000);
        assert((await aiProviderSelect.inputValue()) === "google", "Settings AI provider did not persist");
        assert((await mergeMethodSelect.inputValue()) === "rebase", "Settings merge method did not persist");
        assert((await slider.inputValue()) === "64", "Settings risk threshold did not persist");
        return "Top-level settings changes persisted.";
    });

    await step("Settings diagnostics filters and exports", async () => {
        const reasonInput = page.getByPlaceholder("missing_signature_headers");
        await reasonInput.fill("missing_signature_headers");
        await page.waitForTimeout(1000);
        await clickWhenVisible(page.getByRole("button", { name: /Clear Filters/i }).first());
        assert((await reasonInput.inputValue()) === "", "Clear Filters did not reset reason input");

        const jsonDownloadPromise = page.waitForEvent("download", { timeout: 15000 });
        await clickWhenVisible(page.getByRole("button", { name: /Export JSON/i }).first());
        const jsonDownload = await jsonDownloadPromise;
        assert(/json/i.test(jsonDownload.suggestedFilename()), "Expected JSON export filename");

        const csvDownloadPromise = page.waitForEvent("download", { timeout: 15000 });
        await clickWhenVisible(page.getByRole("button", { name: /Export CSV/i }).first());
        const csvDownload = await csvDownloadPromise;
        assert(/csv/i.test(csvDownload.suggestedFilename()), "Expected CSV export filename");

        return "Clear Filters and JSON/CSV exports worked.";
    });

    await step("Settings alert triage single and bulk actions", async () => {
        let activeAlertRow = page.locator('[data-testid^="integration-alert-"]').first();
        const mutedAlertRowAtStart = page.locator('[data-testid^="integration-muted-alert-"]').first();
        if (!(await activeAlertRow.isVisible().catch(() => false)) && (await mutedAlertRowAtStart.isVisible().catch(() => false))) {
            await clickWhenVisible(mutedAlertRowAtStart.getByRole("button", { name: /^Unmute$/ }).first());
            await page.waitForTimeout(1500);
        }

        await activeAlertRow.waitFor({ state: "visible", timeout: 15000 });
        await clickWhenVisible(activeAlertRow.getByRole("button", { name: /^Acknowledge$/ }).first());
        await page.waitForTimeout(1500);
        await page.getByText(/Alert .* acknowledged\./i).last().waitFor({ state: "visible", timeout: 15000 });

        await clickWhenVisible(activeAlertRow.getByRole("button", { name: /Mute 2h/i }).first());
        await page.waitForTimeout(1500);
        await page.getByText(/Alert .* muted until/i).last().waitFor({ state: "visible", timeout: 15000 });

        const mutedAlertRow = page.locator('[data-testid^="integration-muted-alert-"]').first();
        await mutedAlertRow.waitFor({ state: "visible", timeout: 15000 });
        await clickWhenVisible(mutedAlertRow.getByRole("button", { name: /^Unmute$/ }).first());
        await page.waitForTimeout(1500);
        await page.getByText(/Alert .* unmuted\./i).last().waitFor({ state: "visible", timeout: 15000 });

        await clickWhenVisible(page.getByRole("button", { name: /Acknowledge All Active/i }).first());
        await page.waitForTimeout(1500);
        await page.getByText(/Bulk acknowledge processed/i).last().waitFor({ state: "visible", timeout: 15000 });

        await clickWhenVisible(page.getByRole("button", { name: /Mute All Active \(2h\)/i }).first());
        await page.waitForTimeout(1500);
        await page.getByText(/Bulk mute processed/i).last().waitFor({ state: "visible", timeout: 15000 });

        await clickWhenVisible(page.getByRole("button", { name: /Unmute All Muted/i }).first());
        await page.waitForTimeout(1500);
        await page.getByText(/Bulk unmute processed/i).last().waitFor({ state: "visible", timeout: 15000 });

        return "Single and bulk alert triage actions completed.";
    });

    await step("Settings incident escalation", async () => {
        await clickWhenVisible(page.getByRole("button", { name: /Escalate Incidents/i }).first());
        await page.getByText(/Escalation to|No incidents matched escalation criteria\./i).waitFor({
            state: "visible",
            timeout: 15000,
        });
        return "Incident escalation action returned a visible result.";
    });

    await step("Settings connection control plane", async () => {
        const firstConnectionRow = page.locator('[data-testid^="connection-row-"]').first();
        await firstConnectionRow.waitFor({ state: "visible", timeout: 15000 });

        let responsePromise = page.waitForResponse((response) =>
            /\/api\/v1\/integrations\/connections\/.+\/validate$/.test(response.url()) &&
            response.request().method() === "POST"
        );
        await clickWhenVisible(firstConnectionRow.getByRole("button", { name: /^Validate$/ }).first());
        assert((await responsePromise).status() === 200, "Connection validate request failed");

        responsePromise = page.waitForResponse((response) =>
            /\/api\/v1\/integrations\/connections\/.+\/validate$/.test(response.url()) &&
            response.request().method() === "POST"
        );
        await clickWhenVisible(firstConnectionRow.getByRole("button", { name: /Fail Validate/i }).first());
        assert((await responsePromise).status() === 200, "Connection fail-validate request failed");

        const disableButton = firstConnectionRow.getByRole("button", { name: /^Disable$/ }).first();
        if (await disableButton.isEnabled().catch(() => false)) {
            responsePromise = page.waitForResponse((response) =>
                /\/api\/v1\/integrations\/connections\/.+\/status$/.test(response.url()) &&
                response.request().method() === "POST"
            );
            await disableButton.click();
            assert((await responsePromise).status() === 200, "Connection disable request failed");
        }

        const enableButton = firstConnectionRow.getByRole("button", { name: /^Enable$/ }).first();
        if (await enableButton.isEnabled().catch(() => false)) {
            responsePromise = page.waitForResponse((response) =>
                /\/api\/v1\/integrations\/connections\/.+\/status$/.test(response.url()) &&
                response.request().method() === "POST"
            );
            await enableButton.click();
            assert((await responsePromise).status() === 200, "Connection enable request failed");
        }

        return "Validate/fail-validate/disable/enable path exercised.";
    });

    await step("Settings retry queues and issue-link actions", async () => {
        const retryButtons = page.getByRole("button", { name: /^Retry Due$/ });
        const retryCount = await retryButtons.count();
        assert(retryCount >= 3, `Expected 3 Retry Due buttons, found ${retryCount}`);
        const retryMatchers = [
            "/api/v1/integrations/webhooks/retry",
            "/api/v1/integrations/notifications/retry",
            "/api/v1/integrations/issue-links/retry-sync",
        ];
        for (let index = 0; index < 3; index += 1) {
            const retryPromise = page.waitForResponse((response) =>
                response.url().includes(retryMatchers[index]) && response.request().method() === "POST"
            );
            await retryButtons.nth(index).click();
            assert((await retryPromise).status() === 200, `Retry action ${index} failed`);
            await page.waitForTimeout(500);
        }

        const issueLinkSyncButtons = page.locator('button:enabled').filter({ hasText: /^Sync$/ });
        const issueLinkFailButtons = page.locator('button:enabled').filter({ hasText: /^Fail$/ });
        const enabledIssueLinkSyncCount = await issueLinkSyncButtons.count();
        const enabledIssueLinkFailCount = await issueLinkFailButtons.count();
        const enabledWebhookProcess = await page.locator('button:enabled').filter({ hasText: /^Process$/ }).count();
        const enabledNotificationDeliver = await page.locator('button:enabled').filter({ hasText: /^Deliver$/ }).count();

        return `Retry queues passed; enabled issue-link Sync=${enabledIssueLinkSyncCount}, enabled issue-link Fail=${enabledIssueLinkFailCount}, enabled webhook Process=${enabledWebhookProcess}, enabled notification Deliver=${enabledNotificationDeliver}.`;
    });

    await step("Settings danger zone and footer actions", async () => {
        await clickWhenVisible(page.getByRole("button", { name: /Reset AI Training/i }).first());
        await page.getByText(/Settings reset to defaults\. Click Save Changes to persist\./i).waitFor({
            state: "visible",
            timeout: 15000,
        });

        const beforeDeleteUrl = page.url();
        await clickWhenVisible(page.getByRole("button", { name: /Delete Organization/i }).first());
        await page.waitForTimeout(1000);
        const afterDeleteUrl = page.url();
        assert(beforeDeleteUrl === afterDeleteUrl, "Delete Organization unexpectedly changed route");
        return "Reset action shows message; Delete Organization has no wired effect.";
    });

    await browser.close();

    for (const result of results) {
        process.stdout.write(`[full-browser-acceptance] ${result.status} ${result.name}: ${result.detail}\n`);
    }

    if (apiErrors.length > 0) {
        process.stdout.write(`[full-browser-acceptance] API_ERRORS\n${apiErrors.join("\n")}\n`);
    }
    if (pageErrors.length > 0) {
        process.stdout.write(`[full-browser-acceptance] PAGE_ERRORS\n${pageErrors.join("\n")}\n`);
    }
    if (consoleErrors.length > 0) {
        process.stdout.write(`[full-browser-acceptance] CONSOLE_ERRORS\n${consoleErrors.join("\n")}\n`);
    }
    if (requestFailures.length > 0) {
        const formatted = requestFailures
            .map((entry) => `${entry.method} ${entry.url} :: ${entry.error}`)
            .join("\n");
        process.stdout.write(`[full-browser-acceptance] REQUEST_FAILURES\n${formatted}\n`);
    }

    if (
        results.some((result) => result.status === "FAIL") ||
        apiErrors.length > 0 ||
        pageErrors.length > 0 ||
        consoleErrors.length > 0 ||
        requestFailures.length > 0
    ) {
        process.exitCode = 1;
    }
}

run().catch((error) => {
    process.stderr.write(`[full-browser-acceptance] FAIL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
