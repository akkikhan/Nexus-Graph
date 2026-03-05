import type { MenuModel } from "./menuModel.js";
import type { PullRequestActionId } from "./types.js";
import type { MenuItemConstructorOptions } from "electron";

export interface TrayTemplateItem {
    label?: string;
    type?: "normal" | "separator";
    enabled?: boolean;
    submenu?: TrayTemplateItem[];
    run?: () => Promise<void> | void;
}

export interface TrayUpdateStatus {
    state: "idle" | "checking" | "available" | "upToDate" | "rolloutDeferred" | "incompatible" | "error";
    label: string;
    latestVersion?: string;
    downloadUrl?: string;
    downloadFileName?: string;
    downloadSha256?: string;
    downloadSizeBytes?: number;
}

export interface TrayDownloadRequest {
    url: string;
    fileName?: string;
    expectedSha256?: string;
    expectedSizeBytes?: number;
}

interface BuildTrayTemplateOptions {
    onRefresh: () => Promise<void> | void;
    onQuit: () => Promise<void> | void;
    onPullRequestAction: (prId: string, actionId: PullRequestActionId) => Promise<void> | void;
    updateStatus?: TrayUpdateStatus;
    onCheckForUpdates?: () => Promise<void> | void;
    onOpenUpdateDownload?: (request: TrayDownloadRequest) => Promise<void> | void;
    onSnoozeUpdate?: () => Promise<void> | void;
    onSkipUpdateVersion?: (version: string) => Promise<void> | void;
}

export function buildTrayTemplate(
    model: MenuModel,
    options: BuildTrayTemplateOptions
): TrayTemplateItem[] {
    const items: TrayTemplateItem[] = [
        {
            label: model.header,
            enabled: false,
        },
        { type: "separator" },
    ];

    if (model.pullRequests.length === 0) {
        items.push({
            label: "No open pull requests",
            enabled: false,
        });
    } else {
        for (const section of model.pullRequests) {
            items.push({
                label: section.label,
                submenu: section.actions.map((action) => ({
                    label: action.label,
                    run: () => options.onPullRequestAction(section.prId, action.actionId),
                })),
            });
        }
    }

    if (options.updateStatus) {
        items.push(
            { type: "separator" },
            {
                label: options.updateStatus.label,
                enabled: false,
            }
        );

        if (
            options.updateStatus.state === "available" &&
            options.updateStatus.downloadUrl &&
            options.onOpenUpdateDownload
        ) {
            const updateVersion = options.updateStatus.latestVersion || "latest";
            const downloadUrl = options.updateStatus.downloadUrl;
            const downloadRequest: TrayDownloadRequest = {
                url: downloadUrl,
                fileName: options.updateStatus.downloadFileName,
                expectedSha256: options.updateStatus.downloadSha256,
                expectedSizeBytes: options.updateStatus.downloadSizeBytes,
            };
            items.push({
                label: `Download Update (${updateVersion})`,
                run: () => options.onOpenUpdateDownload?.(downloadRequest),
            });
            if (options.onSnoozeUpdate) {
                items.push({
                    label: "Remind Me Later",
                    run: options.onSnoozeUpdate,
                });
            }
            if (options.onSkipUpdateVersion && options.updateStatus.latestVersion) {
                const latestVersion = options.updateStatus.latestVersion;
                items.push({
                    label: `Skip This Version (${latestVersion})`,
                    run: () => options.onSkipUpdateVersion?.(latestVersion),
                });
            }
        }

        items.push({
            label: "Check for Updates",
            enabled: Boolean(options.onCheckForUpdates),
            run: options.onCheckForUpdates,
        });
    }

    items.push(
        { type: "separator" },
        {
            label: "Refresh",
            run: options.onRefresh,
        },
        {
            label: "Quit",
            run: options.onQuit,
        }
    );

    return items;
}

export function toElectronTemplate(
    items: TrayTemplateItem[],
    onError: (error: unknown) => void
): MenuItemConstructorOptions[] {
    return items.map((item) => {
        const run = item.run;
        const type: MenuItemConstructorOptions["type"] = item.type === "separator" ? "separator" : "normal";
        const mapped: MenuItemConstructorOptions = {
            type,
            enabled: item.enabled,
            label: item.label,
            submenu: item.submenu ? toElectronTemplate(item.submenu, onError) : undefined,
            click: run
                ? () => {
                    void Promise.resolve(run()).catch(onError);
                }
                : undefined,
        };
        return mapped;
    });
}
