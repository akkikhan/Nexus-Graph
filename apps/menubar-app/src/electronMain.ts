import { app, Menu, Tray, dialog, nativeImage, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNexusClient } from "./nexusClient.js";
import { NexusMenuBarApp } from "./menuBarApp.js";
import { buildTrayTemplate, toElectronTemplate } from "./electronTrayMenu.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiBaseUrl = process.env.NEXUS_API_BASE_URL || "http://localhost:3001";
const webBaseUrl = process.env.NEXUS_WEB_BASE_URL || "http://localhost:3000";
const inboxLimit = Number(process.env.NEXUS_INBOX_LIMIT || 20);
const refreshIntervalMs = Number(process.env.NEXUS_TRAY_REFRESH_MS || 60000);
const trayIconPath = process.env.NEXUS_TRAY_ICON;

let tray: Tray | null = null;
let refreshTimer: NodeJS.Timeout | undefined;

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
    });
    const menu = Menu.buildFromTemplate(toElectronTemplate(template, handleError));
    tray.setContextMenu(menu);
    tray.setToolTip(model.header);
}

async function bootstrap() {
    await app.whenReady();

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

    if (refreshIntervalMs > 0) {
        refreshTimer = setInterval(() => {
            void rebuildMenu().catch(handleError);
        }, refreshIntervalMs);
    }
}

app.on("window-all-closed", () => {});

app.on("before-quit", () => {
    if (refreshTimer) clearInterval(refreshTimer);
});

bootstrap().catch(handleError);
