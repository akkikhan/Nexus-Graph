export interface PullRequest {
    id: string;
    number: number;
    title: string;
    status: "open" | "closed" | "merged" | "draft";
    author: {
        username: string;
        avatar: string;
    };
    repository: {
        name: string;
        id: string;
    };
    riskLevel: "low" | "medium" | "high" | "critical";
    riskScore: number;
    aiSummary: string;
    createdAt: string;
    updatedAt: string;
    // Optional fields that might not be in the list view yet
    comments?: number;
    linesAdded?: number;
    linesRemoved?: number;
}

export interface PullRequestFileChange {
    path: string;
    additions: number;
    deletions: number;
}

export interface PullRequestDetail extends PullRequest {
    description?: string;
    headBranch?: string;
    baseBranch?: string;
    files?: PullRequestFileChange[];
    reviews?: Array<{ id: string; status: string; reviewer?: string }>;
}

export interface PRListResponse {
    prs: PullRequest[];
    total: number;
    limit: number;
    offset: number;
}

export interface AiRule {
    id: string;
    orgId: string;
    repoId: string | null;
    name: string;
    description?: string | null;
    prompt: string;
    regexPattern?: string | null;
    filePatterns?: string[];
    severity: "info" | "warning" | "high" | "critical" | string;
    enabled: boolean;
    createdAt?: string;
    updatedAt?: string;
}

const API_BASE_URL = "/api/v1";

async function parseResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
    if (!res.ok) {
        let payload: any = null;
        try {
            payload = await res.json();
        } catch {
            // No JSON payload available.
        }
        const error = typeof payload?.error === "string" ? payload.error : "";
        const details = typeof payload?.details === "string" ? payload.details : "";
        const message = [error, details].filter(Boolean).join(": ");
        throw new Error(message || fallbackMessage);
    }
    return res.json() as Promise<T>;
}

export async function fetchPRs(options?: {
    status?: "open" | "closed" | "merged" | "all";
    limit?: number;
    offset?: number;
}): Promise<PullRequest[]> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (typeof options?.limit === "number") params.set("limit", String(options.limit));
    if (typeof options?.offset === "number") params.set("offset", String(options.offset));
    const qs = params.toString();
    const res = await fetch(`${API_BASE_URL}/prs${qs ? `?${qs}` : ""}`);
    const data = await parseResponse<PRListResponse>(res, "Failed to fetch PRs");
    return data.prs;
}

export async function fetchPRById(id: string): Promise<PullRequestDetail> {
    const res = await fetch(`${API_BASE_URL}/prs/${id}`);
    const data = await parseResponse<{ pr: PullRequestDetail }>(res, "Failed to fetch PR details");
    return data.pr as PullRequestDetail;
}

export async function mergePR(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE_URL}/prs/${id}/merge`, { method: "POST" });
    return parseResponse<{ success: boolean }>(res, "Failed to merge PR");
}

export async function requestPRReview(id: string): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`${API_BASE_URL}/prs/${id}/request-review`, { method: "POST" });
    return parseResponse<{ success: boolean; message?: string }>(
        res,
        "Failed to request AI review"
    );
}

export async function fetchAiRules(): Promise<AiRule[]> {
    const res = await fetch(`${API_BASE_URL}/ai-rules`);
    const data = await parseResponse<{ rules: AiRule[] }>(res, "Failed to fetch AI rules");
    return data.rules || [];
}

export async function createAiRule(input: {
    name: string;
    prompt: string;
    description?: string;
    repoId?: string;
    regexPattern?: string;
    filePatterns?: string[];
    severity?: "info" | "warning" | "high" | "critical";
    enabled?: boolean;
}): Promise<{ rule: AiRule }> {
    const res = await fetch(`${API_BASE_URL}/ai-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    return parseResponse<{ rule: AiRule }>(res, "Failed to create AI rule");
}

export async function setAiRuleEnabled(input: { id: string; enabled: boolean }): Promise<{ rule: AiRule }> {
    const res = await fetch(`${API_BASE_URL}/ai-rules/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: input.enabled }),
    });
    return parseResponse<{ rule: AiRule }>(res, "Failed to update AI rule");
}

export async function deleteAiRule(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE_URL}/ai-rules/${id}`, { method: "DELETE" });
    return parseResponse<{ success: boolean }>(res, "Failed to delete AI rule");
}

export interface ActivityItem {
    id: string;
    type: string;
    icon: string;
    color: string;
    bgColor: string;
    title: string;
    description: string;
    timestamp: string;
    pr?: {
        number: number;
        title: string;
    };
    user?: {
        username: string;
    };
    relatedPr?: {
        number: number;
        title: string;
    };
    stack?: {
        name: string;
        branches: number;
    };
    details?: {
        critical: number;
        warnings: number;
        suggestions: number;
    };
}

export async function fetchActivity(): Promise<ActivityItem[]> {
    const res = await fetch(`${API_BASE_URL}/activity`);
    const data = await parseResponse<{ activities: ActivityItem[] }>(res, "Failed to fetch activity");
    return data.activities;
}

export interface StackBranch {
    name: string;
    order: number;
    status: string;
    prNumber: number | null;
    pr?: {
        number: number;
        title: string;
        riskScore?: number;
    };
}

export interface StackItem {
    id: string;
    name: string;
    description?: string;
    repository: {
        id: string;
        name: string;
    };
    baseBranch: string;
    branches: StackBranch[];
    mergableCount: number;
    totalPRs: number;
    createdAt: string;
    updatedAt?: string;
}

export interface StackDetailBranch {
    name: string;
    order: number;
    status: string;
    pr?: {
        number: number;
        title: string;
        riskScore?: number;
    };
}

export interface StackDetail extends Omit<StackItem, "branches"> {
    branches: StackDetailBranch[];
}

export interface CreateStackInput {
    name: string;
    repositoryId: string;
    baseBranch?: string;
    description?: string;
}

export interface CreateStackResult {
    stack: {
        id: string;
        name?: string;
        baseBranch?: string;
        createdAt?: string;
    };
}

export async function fetchStacks(): Promise<StackItem[]> {
    const res = await fetch(`${API_BASE_URL}/stacks`);
    const data = await parseResponse<{ stacks?: StackItem[] }>(res, "Failed to fetch stacks");
    return data.stacks || [];
}

export async function fetchStackById(id: string): Promise<StackDetail> {
    const res = await fetch(`${API_BASE_URL}/stacks/${id}`);
    const data = await parseResponse<{ stack: StackDetail }>(res, "Failed to fetch stack");
    return data.stack as StackDetail;
}

export async function syncStack(id: string): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`${API_BASE_URL}/stacks/${id}/sync`, { method: "POST" });
    return parseResponse<{ success: boolean; message?: string }>(res, "Failed to sync stack");
}

export async function submitStack(id: string): Promise<{ success: boolean; message?: string; prsCreated?: number }> {
    const res = await fetch(`${API_BASE_URL}/stacks/${id}/submit`, { method: "POST" });
    return parseResponse<{ success: boolean; message?: string; prsCreated?: number }>(
        res,
        "Failed to submit stack"
    );
}

export async function createStack(input: CreateStackInput): Promise<CreateStackResult> {
    const res = await fetch(`${API_BASE_URL}/stacks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: input.name,
            repositoryId: input.repositoryId,
            baseBranch: input.baseBranch || "main",
            description: input.description,
        }),
    });
    return parseResponse<CreateStackResult>(res, "Failed to create stack");
}

export interface InsightsVelocityTrendPoint {
    period: string;
    velocity: number;
}

export interface InsightsDashboard {
    velocity: {
        currentSprint: {
            committed: number;
            completed: number;
            predicted: number;
            accuracy: number;
        };
        trend: InsightsVelocityTrendPoint[];
    };
    codeHealth: {
        score: number;
        trend: string;
        breakdown: {
            testCoverage: number;
            typeSafety: number;
            documentation: number;
            complexity: number;
        };
    };
    reviewerHealth: {
        averageReviewTime: string;
        fatigueAlerts: number;
        topReviewers: Array<{
            username: string;
            reviews: number;
            quality: number;
        }>;
    };
    aiInsights: Array<{
        type: string;
        severity: "high" | "warning" | "medium" | "low";
        message: string;
        action: string;
    }>;
    bottlenecks: Array<{
        type: string;
        description: string;
        avgHours?: number;
        avgMinutes?: number;
    }>;
}

export async function fetchInsightsDashboard(): Promise<InsightsDashboard> {
    const res = await fetch(`${API_BASE_URL}/insights/dashboard`);
    return parseResponse<InsightsDashboard>(res, "Failed to fetch insights dashboard");
}

export interface QueueActiveItem {
    id: string;
    position: number;
    pr: {
        number: number;
        title: string;
        author: { username: string; avatar: string };
        repository: string;
    };
    status: "running" | "pending";
    ciStatus: "in_progress" | "waiting";
    ciProgress?: number;
    estimatedTimeRemaining: string;
    addedAt: string;
    attempts: number;
    priority?: "high";
}

export interface QueueRecentItem {
    pr: { number: number; title: string };
    status: "merged" | "failed";
    mergedAt?: string;
    failedAt?: string;
    duration?: string;
    reason?: string;
    attempts?: number;
}

export interface QueueSnapshot {
    active: QueueActiveItem[];
    recent: QueueRecentItem[];
    controls: {
        paused: boolean;
        turbo: boolean;
    };
    stats: {
        queueLength: number;
        avgWaitTime: string;
        successRate: number;
        throughput: string;
    };
}

export async function fetchQueue(): Promise<QueueSnapshot> {
    const res = await fetch(`${API_BASE_URL}/queue`);
    return parseResponse<QueueSnapshot>(res, "Failed to fetch queue");
}

export async function pauseQueue(): Promise<{ success: boolean; paused: boolean }> {
    const res = await fetch(`${API_BASE_URL}/queue/pause`, { method: "POST" });
    return parseResponse<{ success: boolean; paused: boolean }>(res, "Failed to pause queue");
}

export async function resumeQueue(): Promise<{ success: boolean; paused: boolean }> {
    const res = await fetch(`${API_BASE_URL}/queue/resume`, { method: "POST" });
    return parseResponse<{ success: boolean; paused: boolean }>(res, "Failed to resume queue");
}

export async function setQueueTurbo(enabled: boolean): Promise<{ success: boolean; turbo: boolean }> {
    const res = await fetch(`${API_BASE_URL}/queue/turbo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
    });
    return parseResponse<{ success: boolean; turbo: boolean }>(res, "Failed to update turbo mode");
}

export async function retryQueueItem(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE_URL}/queue/${id}/retry`, { method: "POST" });
    return parseResponse<{ success: boolean }>(res, "Failed to retry queue item");
}

export async function removeQueueItem(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE_URL}/queue/${id}`, { method: "DELETE" });
    return parseResponse<{ success: boolean }>(res, "Failed to remove queue item");
}

export interface SystemHealth {
    status: "healthy" | "degraded";
    version: string;
    timestamp: string;
    database: {
        connected: boolean;
        latencyMs: number;
        error?: string;
    };
    websocket?: {
        status?: string;
        connectedClients?: number;
    };
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
    const res = await fetch(`${API_BASE_URL}/health`);
    return parseResponse<SystemHealth>(res, "Failed to fetch system health");
}
