import { buildMenuModel, type MenuModel } from "./menuModel.js";
import type { PullRequest, PullRequestActionId } from "./types.js";
import type { NexusClient } from "./nexusClient.js";

export interface MenuBarAppConfig {
    webBaseUrl: string;
}

export interface MenuBarActionResult {
    actionId: PullRequestActionId;
    prId: string;
    message: string;
}

export interface MenuBarSystemAdapter {
    openExternal(url: string): Promise<void>;
}

export class NexusMenuBarApp {
    private pullRequests: PullRequest[] = [];
    private readonly webBaseUrl: string;

    constructor(
        private readonly client: NexusClient,
        private readonly systemAdapter: MenuBarSystemAdapter,
        config: MenuBarAppConfig
    ) {
        this.webBaseUrl = config.webBaseUrl.replace(/\/+$/, "");
    }

    async refresh(limit = 20): Promise<MenuModel> {
        this.pullRequests = await this.client.listPullRequests({
            status: "open",
            limit,
            offset: 0,
        });
        return buildMenuModel(this.pullRequests);
    }

    getMenuModel(): MenuModel {
        return buildMenuModel(this.pullRequests);
    }

    async runAction(prId: string, actionId: PullRequestActionId): Promise<MenuBarActionResult> {
        const pr = this.pullRequests.find((candidate) => candidate.id === prId);
        if (!pr) {
            throw new Error(`Pull request not found in menu cache: ${prId}`);
        }

        if (actionId === "openInDashboard") {
            await this.systemAdapter.openExternal(`${this.webBaseUrl}/inbox/${prId}`);
            return {
                actionId,
                prId,
                message: `Opened PR #${pr.number} in dashboard.`,
            };
        }

        if (actionId === "requestAiReview") {
            const response = await this.client.requestAiReview(prId);
            const suffix = response.jobId ? ` (${response.jobId})` : "";
            return {
                actionId,
                prId,
                message: `AI review queued${suffix}.`,
            };
        }

        if (actionId === "merge") {
            await this.client.mergePullRequest(prId);
            return {
                actionId,
                prId,
                message: `Merged PR #${pr.number}.`,
            };
        }

        if (actionId === "markDraft") {
            await this.client.updatePullRequestStatus(prId, "draft");
            return {
                actionId,
                prId,
                message: `PR #${pr.number} marked as draft.`,
            };
        }

        if (actionId === "markOpen") {
            await this.client.updatePullRequestStatus(prId, "open");
            return {
                actionId,
                prId,
                message: `PR #${pr.number} marked as open.`,
            };
        }

        await this.client.updatePullRequestStatus(prId, "closed");
        return {
            actionId,
            prId,
            message: `PR #${pr.number} closed.`,
        };
    }
}

