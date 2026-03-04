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
});

