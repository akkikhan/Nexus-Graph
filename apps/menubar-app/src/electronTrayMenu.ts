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

interface BuildTrayTemplateOptions {
    onRefresh: () => Promise<void> | void;
    onQuit: () => Promise<void> | void;
    onPullRequestAction: (prId: string, actionId: PullRequestActionId) => Promise<void> | void;
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
