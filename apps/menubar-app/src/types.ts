export type PullRequestStatus =
    | "open"
    | "closed"
    | "merged"
    | "draft"
    | "approved"
    | "changes_requested";

export interface PullRequest {
    id: string;
    number: number;
    title: string;
    status: PullRequestStatus;
    riskLevel: "low" | "medium" | "high" | "critical";
    aiSummary?: string;
    repository: {
        id: string;
        name: string;
    };
    author: {
        username: string;
        avatar?: string;
    };
    createdAt: string;
    updatedAt: string;
}

export interface PullRequestListResponse {
    prs: PullRequest[];
    total: number;
    limit: number;
    offset: number;
}

export type PullRequestActionId =
    | "openInDashboard"
    | "requestAiReview"
    | "markDraft"
    | "markOpen"
    | "markClosed"
    | "merge";

