import { describe, expect, it, vi } from "vitest";
import { buildTrayTemplate, toElectronTemplate } from "./electronTrayMenu.js";
import type { MenuModel } from "./menuModel.js";

function makeModel(): MenuModel {
    return {
        header: "Nexus Inbox | Total 1 | Open 1",
        pullRequests: [
            {
                prId: "pr_123",
                label: "#123 Improve auth flow",
                actions: [
                    {
                        actionId: "openInDashboard",
                        label: "Open in Dashboard",
                        description: "Open PR detail page in browser.",
                    },
                    {
                        actionId: "requestAiReview",
                        label: "Request AI Review",
                        description: "Queue a new AI review job.",
                    },
                ],
            },
        ],
    };
}

describe("electron tray template", () => {
    it("builds tray template with pull request actions and global controls", () => {
        const onRefresh = vi.fn();
        const onQuit = vi.fn();
        const onAction = vi.fn();

        const template = buildTrayTemplate(makeModel(), {
            onRefresh,
            onQuit,
            onPullRequestAction: onAction,
        });

        expect(template[0]?.label).toContain("Nexus Inbox");
        expect(template.some((item) => item.label === "Refresh")).toBe(true);
        expect(template.some((item) => item.label === "Quit")).toBe(true);

        const prSection = template.find((item) => item.label?.includes("#123"));
        expect(prSection?.submenu).toBeDefined();
        expect(prSection?.submenu?.map((item) => item.label)).toContain("Request AI Review");
    });

    it("converts to electron template and executes action callbacks", async () => {
        const onError = vi.fn();
        const onAction = vi.fn(async () => {});
        const onRefresh = vi.fn(async () => {});
        const onQuit = vi.fn(async () => {});

        const template = buildTrayTemplate(makeModel(), {
            onRefresh,
            onQuit,
            onPullRequestAction: onAction,
        });
        const electronTemplate = toElectronTemplate(template, onError);
        const prItem = electronTemplate.find((item) => item.label?.includes("#123"));
        const aiReview = Array.isArray(prItem?.submenu)
            ? prItem.submenu.find((item) => item.label === "Request AI Review")
            : undefined;

        aiReview?.click?.({} as never, {} as never, {} as never);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(onAction).toHaveBeenCalledWith("pr_123", "requestAiReview");
        expect(onError).not.toHaveBeenCalled();
    });

    it("renders update status actions when update is available", async () => {
        const onError = vi.fn();
        const onCheckForUpdates = vi.fn(async () => {});
        const onOpenUpdateDownload = vi.fn(async () => {});
        const onSnoozeUpdate = vi.fn(async () => {});
        const onSkipUpdateVersion = vi.fn(async () => {});

        const template = buildTrayTemplate(makeModel(), {
            onRefresh: vi.fn(async () => {}),
            onQuit: vi.fn(async () => {}),
            onPullRequestAction: vi.fn(async () => {}),
            updateStatus: {
                state: "available",
                label: "Update available: 0.2.0",
                latestVersion: "0.2.0",
                downloadUrl: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
                downloadFileName: "nexus-menubar-win-x64-0.2.0.zip",
                downloadSha256: "a".repeat(64),
                downloadSizeBytes: 123,
            },
            onCheckForUpdates,
            onOpenUpdateDownload,
            onSnoozeUpdate,
            onSkipUpdateVersion,
        });

        const electronTemplate = toElectronTemplate(template, onError);
        const checkUpdates = electronTemplate.find((item) => item.label === "Check for Updates");
        const downloadUpdate = electronTemplate.find((item) => item.label?.startsWith("Download Update"));
        const remindLater = electronTemplate.find((item) => item.label === "Remind Me Later");
        const skipVersion = electronTemplate.find((item) => item.label?.startsWith("Skip This Version"));

        checkUpdates?.click?.({} as never, {} as never, {} as never);
        downloadUpdate?.click?.({} as never, {} as never, {} as never);
        remindLater?.click?.({} as never, {} as never, {} as never);
        skipVersion?.click?.({} as never, {} as never, {} as never);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
        expect(onOpenUpdateDownload).toHaveBeenCalledTimes(1);
        expect(onOpenUpdateDownload).toHaveBeenCalledWith({
            url: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
            fileName: "nexus-menubar-win-x64-0.2.0.zip",
            expectedSha256: "a".repeat(64),
            expectedSizeBytes: 123,
        });
        expect(onSnoozeUpdate).toHaveBeenCalledTimes(1);
        expect(onSkipUpdateVersion).toHaveBeenCalledWith("0.2.0");
        expect(onError).not.toHaveBeenCalled();
    });

    it("renders cancel action while update download is in progress", async () => {
        const onError = vi.fn();
        const onCancelUpdateDownload = vi.fn(async () => {});

        const template = buildTrayTemplate(makeModel(), {
            onRefresh: vi.fn(async () => {}),
            onQuit: vi.fn(async () => {}),
            onPullRequestAction: vi.fn(async () => {}),
            updateStatus: {
                state: "downloading",
                label: "Downloading update...",
                latestVersion: "0.2.0",
                downloadUrl: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
                downloadFileName: "nexus-menubar-win-x64-0.2.0.zip",
                downloadSha256: "a".repeat(64),
                downloadSizeBytes: 123,
            },
            onCancelUpdateDownload,
            onCheckForUpdates: vi.fn(async () => {}),
        });

        const electronTemplate = toElectronTemplate(template, onError);
        const cancelDownload = electronTemplate.find((item) => item.label === "Cancel Download");

        cancelDownload?.click?.({} as never, {} as never, {} as never);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(onCancelUpdateDownload).toHaveBeenCalledTimes(1);
        expect(onError).not.toHaveBeenCalled();
    });

    it("renders installer handoff and retry actions for downloaded/error states", async () => {
        const onError = vi.fn();
        const onInstallDownloadedUpdate = vi.fn(async () => {});
        const onRevealDownloadedUpdate = vi.fn(async () => {});
        const onRetryUpdateDownload = vi.fn(async () => {});

        const readyTemplate = buildTrayTemplate(makeModel(), {
            onRefresh: vi.fn(async () => {}),
            onQuit: vi.fn(async () => {}),
            onPullRequestAction: vi.fn(async () => {}),
            updateStatus: {
                state: "readyToInstall",
                label: "Ready to install update",
                latestVersion: "0.2.0",
                downloadUrl: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
                downloadFileName: "nexus-menubar-win-x64-0.2.0.zip",
                downloadSha256: "a".repeat(64),
                downloadSizeBytes: 123,
                downloadedFilePath: "C:/Users/test/Downloads/Nexus Updates/nexus-menubar-win-x64-0.2.0.zip",
            },
            onInstallDownloadedUpdate,
            onRevealDownloadedUpdate,
            onRetryUpdateDownload,
            onCheckForUpdates: vi.fn(async () => {}),
        });
        const readyElectronTemplate = toElectronTemplate(readyTemplate, onError);
        const installDownloaded = readyElectronTemplate.find(
            (item) => item.label === "Install Downloaded Update"
        );
        const revealDownloaded = readyElectronTemplate.find((item) => item.label === "Reveal Downloaded File");
        const redownload = readyElectronTemplate.find((item) => item.label === "Re-download Update");

        installDownloaded?.click?.({} as never, {} as never, {} as never);
        revealDownloaded?.click?.({} as never, {} as never, {} as never);
        redownload?.click?.({} as never, {} as never, {} as never);

        const errorTemplate = buildTrayTemplate(makeModel(), {
            onRefresh: vi.fn(async () => {}),
            onQuit: vi.fn(async () => {}),
            onPullRequestAction: vi.fn(async () => {}),
            updateStatus: {
                state: "error",
                label: "Download failed",
                latestVersion: "0.2.0",
                downloadUrl: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
                downloadFileName: "nexus-menubar-win-x64-0.2.0.zip",
                downloadSha256: "a".repeat(64),
                downloadSizeBytes: 123,
            },
            onRetryUpdateDownload,
            onCheckForUpdates: vi.fn(async () => {}),
        });
        const errorElectronTemplate = toElectronTemplate(errorTemplate, onError);
        const retryDownload = errorElectronTemplate.find((item) => item.label === "Retry Download");
        retryDownload?.click?.({} as never, {} as never, {} as never);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(onInstallDownloadedUpdate).toHaveBeenCalledWith(
            "C:/Users/test/Downloads/Nexus Updates/nexus-menubar-win-x64-0.2.0.zip"
        );
        expect(onRevealDownloadedUpdate).toHaveBeenCalledWith(
            "C:/Users/test/Downloads/Nexus Updates/nexus-menubar-win-x64-0.2.0.zip"
        );
        expect(onRetryUpdateDownload).toHaveBeenCalledTimes(2);
        expect(onRetryUpdateDownload).toHaveBeenNthCalledWith(1, {
            url: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
            fileName: "nexus-menubar-win-x64-0.2.0.zip",
            expectedSha256: "a".repeat(64),
            expectedSizeBytes: 123,
        });
        expect(onRetryUpdateDownload).toHaveBeenNthCalledWith(2, {
            url: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
            fileName: "nexus-menubar-win-x64-0.2.0.zip",
            expectedSha256: "a".repeat(64),
            expectedSizeBytes: 123,
        });
        expect(onError).not.toHaveBeenCalled();
    });
});
