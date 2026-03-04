import type { PullRequest, PullRequestActionId } from "./types.js";

export interface InboxSummary {
    total: number;
    open: number;
    draft: number;
    merged: number;
    closed: number;
    highOrCriticalRisk: number;
}

export interface MenuActionItem {
    actionId: PullRequestActionId;
    label: string;
    description: string;
}

export interface PullRequestMenuSection {
    label: string;
    prId: string;
    actions: MenuActionItem[];
}

export interface MenuModel {
    header: string;
    pullRequests: PullRequestMenuSection[];
}

export function summarizeInbox(prs: PullRequest[]): InboxSummary {
    const summary: InboxSummary = {
        total: prs.length,
        open: 0,
        draft: 0,
        merged: 0,
        closed: 0,
        highOrCriticalRisk: 0,
    };

    for (const pr of prs) {
        if (pr.status === "draft") summary.draft += 1;
        else if (pr.status === "merged") summary.merged += 1;
        else if (pr.status === "closed") summary.closed += 1;
        else summary.open += 1;

        if (pr.riskLevel === "high" || pr.riskLevel === "critical") {
            summary.highOrCriticalRisk += 1;
        }
    }

    return summary;
}

export function formatInboxSummary(summary: InboxSummary): string {
    return [
        `Nexus Inbox`,
        `Total ${summary.total}`,
        `Open ${summary.open}`,
        `Draft ${summary.draft}`,
        `High/Critical ${summary.highOrCriticalRisk}`,
    ].join(" | ");
}

export function buildPullRequestActions(pr: PullRequest): MenuActionItem[] {
    const actions: MenuActionItem[] = [
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
    ];

    if (pr.status === "draft") {
        actions.push({
            actionId: "markOpen",
            label: "Mark Open",
            description: "Set status to open.",
        });
    } else if (pr.status === "open" || pr.status === "approved" || pr.status === "changes_requested") {
        actions.push({
            actionId: "markDraft",
            label: "Mark Draft",
            description: "Set status to draft.",
        });
    }

    if (pr.status !== "merged" && pr.status !== "closed") {
        actions.push({
            actionId: "markClosed",
            label: "Close PR",
            description: "Set status to closed.",
        });
    }

    if (pr.status === "open" || pr.status === "approved") {
        actions.push({
            actionId: "merge",
            label: "Merge PR",
            description: "Merge the pull request.",
        });
    }

    return actions;
}

export function buildMenuModel(prs: PullRequest[]): MenuModel {
    const summary = summarizeInbox(prs);
    return {
        header: formatInboxSummary(summary),
        pullRequests: prs.map((pr) => ({
            prId: pr.id,
            label: `#${pr.number} ${pr.title} (${pr.status}, ${pr.riskLevel})`,
            actions: buildPullRequestActions(pr),
        })),
    };
}

