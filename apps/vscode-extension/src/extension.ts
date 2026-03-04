import * as vscode from "vscode";
import { NexusClient, createNexusClient } from "./nexusClient";
import { NexusInboxProvider, NexusPullRequestItem } from "./inboxProvider";
import {
    buildPullRequestActions,
    formatInboxSummary,
    summarizeInbox,
    type PullRequestActionId,
} from "./prActions";
import type { PullRequest } from "./types";

function readConfig(): {
    apiBaseUrl: string;
    webBaseUrl: string;
    inboxLimit: number;
    requestTimeoutMs: number;
} {
    const config = vscode.workspace.getConfiguration("nexus");
    return {
        apiBaseUrl: config.get<string>("apiBaseUrl", "http://localhost:3001"),
        webBaseUrl: config.get<string>("webBaseUrl", "http://localhost:3000").replace(/\/+$/, ""),
        inboxLimit: config.get<number>("inboxLimit", 20),
        requestTimeoutMs: config.get<number>("requestTimeoutMs", 8000),
    };
}

function getClient(): NexusClient {
    const config = readConfig();
    return createNexusClient({
        apiBaseUrl: config.apiBaseUrl,
        requestTimeoutMs: config.requestTimeoutMs,
    });
}

async function pickPullRequest(
    item: NexusPullRequestItem | undefined,
    provider: NexusInboxProvider
): Promise<PullRequest | undefined> {
    if (item) return item.pr;

    const cached = provider.getPullRequests();
    if (cached.length > 0) {
        const pick = await vscode.window.showQuickPick(
            cached.map((pr) => ({
                label: `#${pr.number} ${pr.title}`,
                description: `${pr.repository.name} (${pr.status}, ${pr.riskLevel})`,
                pr,
            })),
            { placeHolder: "Select a pull request" }
        );
        return pick?.pr;
    }

    await provider.refresh();
    const refreshed = provider.getPullRequests();
    if (refreshed.length === 0) {
        vscode.window.showWarningMessage("Nexus inbox is empty.");
        return undefined;
    }

    const pick = await vscode.window.showQuickPick(
        refreshed.map((pr) => ({
            label: `#${pr.number} ${pr.title}`,
            description: `${pr.repository.name} (${pr.status}, ${pr.riskLevel})`,
            pr,
        })),
        { placeHolder: "Select a pull request" }
    );
    return pick?.pr;
}

async function runPullRequestAction(
    actionId: PullRequestActionId,
    pr: PullRequest,
    provider: NexusInboxProvider
): Promise<void> {
    const client = getClient();
    const { webBaseUrl } = readConfig();

    if (actionId === "openInDashboard") {
        await vscode.env.openExternal(vscode.Uri.parse(`${webBaseUrl}/inbox/${pr.id}`));
        return;
    }

    if (actionId === "requestAiReview") {
        const result = await client.requestAiReview(pr.id);
        const job = result.jobId ? ` (${result.jobId})` : "";
        vscode.window.showInformationMessage(`AI review queued${job}.`);
        await provider.refresh();
        return;
    }

    if (actionId === "merge") {
        await client.mergePullRequest(pr.id);
        vscode.window.showInformationMessage(`Merged PR #${pr.number}.`);
        await provider.refresh();
        return;
    }

    if (actionId === "markDraft") {
        await client.updatePullRequestStatus(pr.id, "draft");
        vscode.window.showInformationMessage(`PR #${pr.number} marked as draft.`);
        await provider.refresh();
        return;
    }

    if (actionId === "markOpen") {
        await client.updatePullRequestStatus(pr.id, "open");
        vscode.window.showInformationMessage(`PR #${pr.number} marked as open.`);
        await provider.refresh();
        return;
    }

    if (actionId === "markClosed") {
        await client.updatePullRequestStatus(pr.id, "closed");
        vscode.window.showInformationMessage(`PR #${pr.number} closed.`);
        await provider.refresh();
        return;
    }
}

async function showInboxSummary(provider: NexusInboxProvider): Promise<void> {
    const client = getClient();
    const prs = await client.listPullRequests({
        status: "all",
        limit: readConfig().inboxLimit,
        offset: 0,
    });
    const summary = summarizeInbox(prs);
    vscode.window.showInformationMessage(`Nexus Inbox Summary | ${formatInboxSummary(summary)}`);
    if (provider.getPullRequests().length === 0) {
        await provider.refresh();
    }
}

async function openPullRequest(item: NexusPullRequestItem | undefined, provider: NexusInboxProvider): Promise<void> {
    const pr = await pickPullRequest(item, provider);
    if (!pr) return;
    await runPullRequestAction("openInDashboard", pr, provider);
}

async function requestAiReview(item: NexusPullRequestItem | undefined, provider: NexusInboxProvider): Promise<void> {
    const pr = await pickPullRequest(item, provider);
    if (!pr) return;
    await runPullRequestAction("requestAiReview", pr, provider);
}

async function pullRequestActions(item: NexusPullRequestItem | undefined, provider: NexusInboxProvider): Promise<void> {
    const pr = await pickPullRequest(item, provider);
    if (!pr) return;

    const actions = buildPullRequestActions(pr);
    const pick = await vscode.window.showQuickPick(
        actions.map((action) => ({
            label: action.label,
            description: action.description,
            actionId: action.id,
        })),
        {
            placeHolder: `Choose action for PR #${pr.number}`,
        }
    );
    if (!pick) return;

    await runPullRequestAction(pick.actionId, pr, provider);
}

export function activate(context: vscode.ExtensionContext): void {
    const provider = new NexusInboxProvider(
        () => getClient(),
        () => readConfig().inboxLimit
    );

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("nexusInbox", provider),
        vscode.commands.registerCommand("nexus.refreshInbox", async () => {
            await provider.refresh();
            vscode.window.showInformationMessage("Nexus inbox refreshed.");
        }),
        vscode.commands.registerCommand("nexus.showInboxSummary", async () => {
            await showInboxSummary(provider);
        }),
        vscode.commands.registerCommand("nexus.pullRequestActions", async (item?: NexusPullRequestItem) => {
            try {
                await pullRequestActions(item, provider);
            } catch (error) {
                const text = error instanceof Error ? error.message : "Unknown error";
                vscode.window.showErrorMessage(`Nexus action failed: ${text}`);
            }
        }),
        vscode.commands.registerCommand("nexus.requestAiReview", async (item?: NexusPullRequestItem) => {
            try {
                await requestAiReview(item, provider);
            } catch (error) {
                const text = error instanceof Error ? error.message : "Unknown error";
                vscode.window.showErrorMessage(`AI review request failed: ${text}`);
            }
        }),
        vscode.commands.registerCommand("nexus.openPullRequest", async (item?: NexusPullRequestItem) => {
            await openPullRequest(item, provider);
        })
    );

    void provider.refresh();
}

export function deactivate(): void {}

