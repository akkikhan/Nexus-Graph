import type { PullRequest } from "./types";

export type PullRequestActionId =
    | "openInDashboard"
    | "requestAiReview"
    | "markDraft"
    | "markOpen"
    | "markClosed"
    | "merge";

export interface PullRequestAction {
    id: PullRequestActionId;
    label: string;
    description: string;
}

export interface InboxSummary {
    total: number;
    open: number;
    draft: number;
    merged: number;
    closed: number;
    highOrCriticalRisk: number;
}

export function buildPullRequestActions(pr: PullRequest): PullRequestAction[] {
    const actions: PullRequestAction[] = [
        {
            id: "openInDashboard",
            label: "Open in Nexus Dashboard",
            description: "Open pull request detail in browser.",
        },
        {
            id: "requestAiReview",
            label: "Request AI Review",
            description: "Queue a new AI review run for this pull request.",
        },
    ];

    if (pr.status === "draft") {
        actions.push({
            id: "markOpen",
            label: "Mark as Open",
            description: "Set pull request status to open.",
        });
    } else if (pr.status === "open" || pr.status === "approved" || pr.status === "changes_requested") {
        actions.push({
            id: "markDraft",
            label: "Mark as Draft",
            description: "Move pull request back to draft state.",
        });
    }

    if (pr.status !== "closed" && pr.status !== "merged") {
        actions.push({
            id: "markClosed",
            label: "Close Pull Request",
            description: "Set pull request status to closed.",
        });
    }

    if (pr.status === "open" || pr.status === "approved") {
        actions.push({
            id: "merge",
            label: "Merge Pull Request",
            description: "Merge pull request using Nexus API.",
        });
    }

    return actions;
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
        `Total: ${summary.total}`,
        `Open: ${summary.open}`,
        `Draft: ${summary.draft}`,
        `Merged: ${summary.merged}`,
        `Closed: ${summary.closed}`,
        `High/Critical risk: ${summary.highOrCriticalRisk}`,
    ].join(" | ");
}

