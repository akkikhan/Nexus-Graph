import { app, Menu, Tray, dialog, nativeImage, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeReleaseChannel } from "./releaseMetadata.js";
import { createNexusClient } from "./nexusClient.js";
import { NexusMenuBarApp } from "./menuBarApp.js";
import {
    buildTrayTemplate,
    toElectronTemplate,
    type TrayUpdateStatus,
} from "./electronTrayMenu.js";
import { UpdateDecisionStore } from "./updateDecisionStore.js";
import { checkForMenubarUpdate, resolveManifestUrl } from "./updateClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiBaseUrl = process.env.NEXUS_API_BASE_URL || "http://localhost:3001";
const webBaseUrl = process.env.NEXUS_WEB_BASE_URL || "http://localhost:3000";
const inboxLimit = Number(process.env.NEXUS_INBOX_LIMIT || 20);
const refreshIntervalMs = Number(process.env.NEXUS_TRAY_REFRESH_MS || 60000);
const trayIconPath = process.env.NEXUS_TRAY_ICON;
const releaseChannel = normalizeReleaseChannel(process.env.NEXUS_MENUBAR_RELEASE_CHANNEL || "stable");
const updateManifestUrl = resolveManifestUrl(
    process.env.NEXUS_MENUBAR_UPDATE_MANIFEST_URL ||
        process.env.NEXUS_MENUBAR_UPDATE_BASE_URL ||
        "https://downloads.nexus.dev/menubar",
    releaseChannel
);
const updateCheckIntervalMs = Number(process.env.NEXUS_MENUBAR_UPDATE_CHECK_MS || 3600000);
const updateSnoozeHours = Number(process.env.NEXUS_MENUBAR_UPDATE_SNOOZE_HOURS || 24);
const rolloutKey =
    process.env.NEXUS_MENUBAR_ROLLOUT_KEY ||
    `${os.hostname()}|${process.env.USERNAME || process.env.USER || "user"}`;
const runtimePlatform =
    process.platform === "win32"
        ? "win"
        : process.platform === "darwin"
          ? "mac"
          : process.platform === "linux"
            ? "linux"
            : process.platform;

let tray: Tray | null = null;
let refreshTimer: NodeJS.Timeout | undefined;
let updateTimer: NodeJS.Timeout | undefined;
let updateDecisionStore: UpdateDecisionStore | null = null;
let updateStatus: TrayUpdateStatus = {
    state: "idle",
    label: `Updates (${releaseChannel}): not checked`,
};

const client = createNexusClient({
    apiBaseUrl,
    requestTimeoutMs: 8000,
});

const trayApp = new NexusMenuBarApp(
    client,
    {
        openExternal: async (url: string) => {
            await shell.openExternal(url);
        },
    },
    {
        webBaseUrl,
    }
);

function resolveTrayImage() {
    if (trayIconPath && fs.existsSync(trayIconPath)) {
        return nativeImage.createFromPath(trayIconPath);
    }

    const localIcon = path.resolve(__dirname, "..", "assets", "tray-icon.png");
    if (fs.existsSync(localIcon)) {
        return nativeImage.createFromPath(localIcon);
    }

    // 1x1 neutral fallback icon so tray always initializes.
    return nativeImage.createFromDataURL(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAusB9YwdH8YAAAAASUVORK5CYII="
    );
}

function handleError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[menubar] ${message}\n`);
    dialog.showErrorBox("Nexus Menu Bar Error", message);
}

async function rebuildMenu() {
    if (!tray) return;
    const model = await trayApp.refresh(inboxLimit);
    const template = buildTrayTemplate(model, {
        onRefresh: async () => {
            await rebuildMenu();
        },
        onQuit: () => {
            app.quit();
        },
        onPullRequestAction: async (prId, actionId) => {
            const result = await trayApp.runAction(prId, actionId);
            process.stdout.write(`[menubar] ${result.message}\n`);
            await rebuildMenu();
        },
        updateStatus,
        onCheckForUpdates: async () => {
            await refreshUpdateStatus(true);
        },
        onOpenUpdateDownload: async (url) => {
            await shell.openExternal(url);
        },
        onSnoozeUpdate: async () => {
            const store = ensureUpdateDecisionStore();
            await store.snooze(updateSnoozeHours);
            updateStatus = {
                ...updateStatus,
                state: "rolloutDeferred",
                label: `Updates (${releaseChannel}): reminder snoozed (${updateSnoozeHours}h)`,
            };
            await rebuildMenu();
        },
        onSkipUpdateVersion: async (version) => {
            const store = ensureUpdateDecisionStore();
            await store.skipVersion(version);
            updateStatus = {
                ...updateStatus,
                state: "rolloutDeferred",
                label: `Updates (${releaseChannel}): skipped ${version}`,
                latestVersion: version,
            };
            await rebuildMenu();
        },
    });
    const menu = Menu.buildFromTemplate(toElectronTemplate(template, handleError));
    tray.setContextMenu(menu);
    tray.setToolTip(model.header);
}

async function refreshUpdateStatus(manualCheck = false) {
    updateStatus = {
        state: "checking",
        label: `Updates (${releaseChannel}): checking...`,
    };
    await rebuildMenu().catch((error) => {
        process.stderr.write(`[menubar] failed to render update state: ${String(error)}\n`);
    });

    const result = await checkForMenubarUpdate({
        manifestUrl: updateManifestUrl,
        currentVersion: app.getVersion(),
        channel: releaseChannel,
        platform: runtimePlatform,
        arch: process.arch,
        rolloutKey,
    });

    if (result.status === "available") {
        const latestVersion = result.latestVersion;
        if (!latestVersion) {
            updateStatus = {
                state: "error",
                label: `Updates (${releaseChannel}): invalid update payload`,
            };
            await rebuildMenu();
            if (manualCheck) {
                process.stdout.write("[menubar] Update payload was missing latest version metadata.\n");
            }
            return;
        }

        const suppressed = updateDecisionStore
            ? !updateDecisionStore.shouldSurfaceUpdate(latestVersion)
            : false;
        if (suppressed) {
            updateStatus = {
                state: "rolloutDeferred",
                label: `Updates (${releaseChannel}): ${latestVersion} hidden (snoozed/skipped)`,
                latestVersion,
            };
            await rebuildMenu();
            if (manualCheck) {
                process.stdout.write(`[menubar] Update ${latestVersion} is hidden by local preference.\n`);
            }
            return;
        }
        updateStatus = {
            state: "available",
            label: `Update available (${releaseChannel}): ${latestVersion}`,
            latestVersion,
            downloadUrl: result.downloadUrl,
        };
    } else if (result.status === "upToDate") {
        updateStatus = {
            state: "upToDate",
            label: `Updates (${releaseChannel}): up to date (${result.currentVersion})`,
            latestVersion: result.latestVersion,
        };
    } else if (result.status === "rolloutDeferred") {
        updateStatus = {
            state: "rolloutDeferred",
            label: `Updates (${releaseChannel}): staged rollout (${result.latestVersion})`,
            latestVersion: result.latestVersion,
        };
    } else if (result.status === "incompatible") {
        updateStatus = {
            state: "incompatible",
            label: `Updates (${releaseChannel}): no artifact for ${runtimePlatform}/${process.arch}`,
            latestVersion: result.latestVersion,
        };
    } else {
        updateStatus = {
            state: "error",
            label: `Updates (${releaseChannel}): check failed`,
        };
        process.stderr.write(`[menubar] update check failed: ${result.message}\n`);
    }

    await rebuildMenu();

    if (manualCheck) {
        process.stdout.write(`[menubar] ${result.message}\n`);
    }
}

async function bootstrap() {
    await app.whenReady();

    updateDecisionStore = new UpdateDecisionStore(
        path.resolve(app.getPath("userData"), "update-decision-state.json")
    );
    await updateDecisionStore.load();

    if (process.platform === "darwin") {
        app.dock?.hide();
    }

    tray = new Tray(resolveTrayImage());
    tray.setToolTip("Nexus Inbox");
    if (process.platform === "darwin") {
        tray.setTitle("Nexus");
    }
    tray.on("double-click", () => {
        void shell.openExternal(`${webBaseUrl.replace(/\/+$/, "")}/inbox`);
    });

    await rebuildMenu();
    await refreshUpdateStatus();

    if (refreshIntervalMs > 0) {
        refreshTimer = setInterval(() => {
            void rebuildMenu().catch(handleError);
        }, refreshIntervalMs);
    }

    if (updateCheckIntervalMs > 0) {
        updateTimer = setInterval(() => {
            void refreshUpdateStatus().catch(handleError);
        }, updateCheckIntervalMs);
    }
}

app.on("window-all-closed", () => {});

app.on("before-quit", () => {
    if (refreshTimer) clearInterval(refreshTimer);
    if (updateTimer) clearInterval(updateTimer);
});

bootstrap().catch(handleError);

function ensureUpdateDecisionStore(): UpdateDecisionStore {
    if (!updateDecisionStore) {
        throw new Error("Update decision store is not initialized.");
    }
    return updateDecisionStore;
}
