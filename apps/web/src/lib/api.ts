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

export interface IntegrationWebhookAuthEvent {
    id: string;
    provider: "slack" | "linear" | "jira";
    repoId?: string;
    eventType: string;
    externalEventId: string;
    outcome: "rejected" | "config_error";
    reason: string;
    statusCode: number;
    signaturePresent: boolean;
    timestampPresent: boolean;
    requestTimestamp?: string;
    requestSkewSeconds?: number;
    details?: Record<string, unknown>;
    createdAt: string;
}

export interface IntegrationWebhookAuthEventListOptions {
    provider?: "slack" | "linear" | "jira";
    repoId?: string;
    outcome?: "rejected" | "config_error";
    reason?: string;
    sinceMinutes?: number;
    limit?: number;
    offset?: number;
}

export interface IntegrationWebhookAuthEventsResponse {
    events: IntegrationWebhookAuthEvent[];
    total: number;
    limit: number;
    offset: number;
}

export type IntegrationWebhookAuthEventExportFormat = "json" | "csv";

export async function fetchIntegrationWebhookAuthEvents(
    options: IntegrationWebhookAuthEventListOptions = {}
): Promise<IntegrationWebhookAuthEventsResponse> {
    const params = new URLSearchParams();
    if (options.provider) params.set("provider", options.provider);
    if (options.repoId) params.set("repoId", options.repoId);
    if (options.outcome) params.set("outcome", options.outcome);
    if (options.reason) params.set("reason", options.reason);
    if (typeof options.sinceMinutes === "number") params.set("sinceMinutes", String(options.sinceMinutes));
    if (typeof options.limit === "number") params.set("limit", String(options.limit));
    if (typeof options.offset === "number") params.set("offset", String(options.offset));
    const query = params.toString();
    const res = await fetch(`${API_BASE_URL}/integrations/webhook-auth-events${query ? `?${query}` : ""}`);
    return parseResponse<IntegrationWebhookAuthEventsResponse>(res, "Failed to fetch webhook auth events");
}

function parseContentDispositionFilename(header: string | null, fallback: string): string {
    if (!header) return fallback;
    const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (encodedMatch?.[1]) {
        try {
            return decodeURIComponent(encodedMatch[1]);
        } catch {
            // Fall through to plain filename parsing.
        }
    }
    const plainMatch = header.match(/filename="?([^";]+)"?/i);
    if (plainMatch?.[1]) return plainMatch[1];
    return fallback;
}

export async function exportIntegrationWebhookAuthEvents(
    options: IntegrationWebhookAuthEventListOptions = {},
    format: IntegrationWebhookAuthEventExportFormat = "json"
): Promise<{ blob: Blob; filename: string }> {
    const params = new URLSearchParams();
    if (options.provider) params.set("provider", options.provider);
    if (options.repoId) params.set("repoId", options.repoId);
    if (options.outcome) params.set("outcome", options.outcome);
    if (options.reason) params.set("reason", options.reason);
    if (typeof options.sinceMinutes === "number") params.set("sinceMinutes", String(options.sinceMinutes));
    params.set("format", format);
    const query = params.toString();
    const res = await fetch(`${API_BASE_URL}/integrations/webhook-auth-events/export${query ? `?${query}` : ""}`);
    if (!res.ok) {
        let payload: any = null;
        try {
            payload = await res.json();
        } catch {
            // Ignore non-JSON error bodies.
        }
        const error = typeof payload?.error === "string" ? payload.error : "";
        const details = typeof payload?.details === "string" ? payload.details : "";
        const message = [error, details].filter(Boolean).join(": ");
        throw new Error(message || "Failed to export webhook auth events");
    }
    const blob = await res.blob();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fallback = `nexus-webhook-auth-events-${stamp}.${format}`;
    const filename = parseContentDispositionFilename(res.headers.get("content-disposition"), fallback);
    return { blob, filename };
}

export interface IntegrationConnection {
    id: string;
    repoId: string;
    provider: "slack" | "linear" | "jira";
    status: "active" | "disabled" | "error";
    displayName: string;
    config: Record<string, unknown>;
    tokenRef?: string;
    lastValidatedAt?: string;
    lastError?: string;
    createdAt: string;
    updatedAt: string;
}

export interface IntegrationConnectionsResponse {
    connections: IntegrationConnection[];
    total: number;
    limit: number;
    offset: number;
}

export async function fetchIntegrationConnections(options: {
    repoId?: string;
    provider?: "slack" | "linear" | "jira";
    status?: "active" | "disabled" | "error";
    limit?: number;
    offset?: number;
} = {}): Promise<IntegrationConnectionsResponse> {
    const params = new URLSearchParams();
    if (options.repoId) params.set("repoId", options.repoId);
    if (options.provider) params.set("provider", options.provider);
    if (options.status) params.set("status", options.status);
    if (typeof options.limit === "number") params.set("limit", String(options.limit));
    if (typeof options.offset === "number") params.set("offset", String(options.offset));
    const query = params.toString();
    const res = await fetch(`${API_BASE_URL}/integrations/connections${query ? `?${query}` : ""}`);
    return parseResponse<IntegrationConnectionsResponse>(res, "Failed to fetch integration connections");
}

export interface IntegrationMetrics {
    totals: {
        connections: number;
        issueLinks: number;
        deliveries: number;
        webhookEvents: number;
        webhookAuthFailures: number;
        webhookAuthConfigErrors: number;
        issueSyncAttempts: number;
        pending: number;
        retrying: number;
        delivered: number;
        failed: number;
        deadLetter: number;
        webhooksReceived: number;
        webhooksProcessed: number;
        webhooksFailed: number;
        webhooksDeadLetter: number;
        issueSyncPending: number;
        issueSyncSynced: number;
        issueSyncFailed: number;
        issueSyncDeadLetter: number;
    };
    providers: Record<string, number>;
    webhookAuth: {
        failuresByProvider: Record<string, number>;
        failuresByReason: Record<string, number>;
        failureRatePct: number;
    };
    retryQueue: {
        notificationQueued: number;
        webhookQueued: number;
        oldestNotificationDueAt?: string;
        oldestWebhookDueAt?: string;
    };
    successRatePct: number;
    generatedAt: string;
}

export async function fetchIntegrationMetrics(repoId?: string): Promise<IntegrationMetrics> {
    const params = new URLSearchParams();
    if (repoId) params.set("repoId", repoId);
    const query = params.toString();
    const res = await fetch(`${API_BASE_URL}/integrations/metrics${query ? `?${query}` : ""}`);
    return parseResponse<IntegrationMetrics>(res, "Failed to fetch integration metrics");
}

export interface IntegrationAlertStatus {
    status: "healthy" | "warning" | "critical";
    alerts: Array<{
        code: string;
        severity: "warning" | "critical";
        message: string;
        value: number;
        threshold: number;
    }>;
    thresholds: {
        minSuccessRatePct: number;
        maxRetryQueueAgeSeconds: number;
        webhookAuthWindowMinutes: number;
        maxWebhookAuthFailures: number;
        maxWebhookAuthFailureRatePct: number;
    };
    queueAges: {
        oldestNotificationRetryAgeSeconds: number | null;
        oldestWebhookRetryAgeSeconds: number | null;
    };
    webhookAuthWindow: {
        startAt: string;
        failures: number;
        ingested: number;
        failureRatePct: number;
        configErrors: number;
    };
    generatedAt: string;
}

export async function fetchIntegrationAlerts(options: {
    repoId?: string;
    minSuccessRatePct?: number;
    maxRetryQueueAgeSeconds?: number;
    webhookAuthWindowMinutes?: number;
    maxWebhookAuthFailures?: number;
    maxWebhookAuthFailureRatePct?: number;
} = {}): Promise<IntegrationAlertStatus> {
    const params = new URLSearchParams();
    if (options.repoId) params.set("repoId", options.repoId);
    if (typeof options.minSuccessRatePct === "number") params.set("minSuccessRatePct", String(options.minSuccessRatePct));
    if (typeof options.maxRetryQueueAgeSeconds === "number") {
        params.set("maxRetryQueueAgeSeconds", String(options.maxRetryQueueAgeSeconds));
    }
    if (typeof options.webhookAuthWindowMinutes === "number") {
        params.set("webhookAuthWindowMinutes", String(options.webhookAuthWindowMinutes));
    }
    if (typeof options.maxWebhookAuthFailures === "number") {
        params.set("maxWebhookAuthFailures", String(options.maxWebhookAuthFailures));
    }
    if (typeof options.maxWebhookAuthFailureRatePct === "number") {
        params.set("maxWebhookAuthFailureRatePct", String(options.maxWebhookAuthFailureRatePct));
    }
    const query = params.toString();
    const res = await fetch(`${API_BASE_URL}/integrations/alerts${query ? `?${query}` : ""}`);
    return parseResponse<IntegrationAlertStatus>(res, "Failed to fetch integration alert status");
}

export interface IntegrationWebhookEvent {
    id: string;
    provider: "slack" | "linear" | "jira";
    repoId?: string;
    eventType: string;
    externalEventId: string;
    payload: Record<string, unknown>;
    status: "received" | "processed" | "failed" | "dead_letter";
    attempts: number;
    maxAttempts: number;
    nextAttemptAt?: string;
    lastAttemptAt?: string;
    processedAt?: string;
    errorMessage?: string;
    correlationId: string;
    createdAt: string;
    updatedAt: string;
}

export interface IntegrationWebhookEventsResponse {
    events: IntegrationWebhookEvent[];
    total: number;
    limit: number;
    offset: number;
}

export interface IntegrationWebhookActionAuditEvent {
    id: string;
    action: string;
    entityType: string;
    entityId?: string;
    repoId?: string;
    webhookEventId?: string;
    outcome: "success" | "error";
    summary: string;
    metadata: Record<string, unknown>;
    createdAt: string;
}

export interface IntegrationWebhookActionAuditsResponse {
    events: IntegrationWebhookActionAuditEvent[];
    total: number;
    limit: number;
}

export async function fetchIntegrationWebhookEvents(options: {
    provider?: "slack" | "linear" | "jira";
    repoId?: string;
    status?: "received" | "processed" | "failed" | "dead_letter";
    limit?: number;
    offset?: number;
} = {}): Promise<IntegrationWebhookEventsResponse> {
    const params = new URLSearchParams();
    if (options.provider) params.set("provider", options.provider);
    if (options.repoId) params.set("repoId", options.repoId);
    if (options.status) params.set("status", options.status);
    if (typeof options.limit === "number") params.set("limit", String(options.limit));
    if (typeof options.offset === "number") params.set("offset", String(options.offset));
    const query = params.toString();
    const res = await fetch(`${API_BASE_URL}/integrations/webhooks${query ? `?${query}` : ""}`);
    return parseResponse<IntegrationWebhookEventsResponse>(res, "Failed to fetch integration webhooks");
}

export async function fetchIntegrationWebhookActionAudits(options: {
    repoId?: string;
    limit?: number;
} = {}): Promise<IntegrationWebhookActionAuditsResponse> {
    const params = new URLSearchParams();
    if (options.repoId) params.set("repoId", options.repoId);
    if (typeof options.limit === "number") params.set("limit", String(options.limit));
    const query = params.toString();
    const res = await fetch(`${API_BASE_URL}/integrations/webhook-action-audits${query ? `?${query}` : ""}`);
    return parseResponse<IntegrationWebhookActionAuditsResponse>(res, "Failed to fetch webhook action audits");
}

export async function processIntegrationWebhookEvent(
    id: string,
    input: {
        simulateFailure?: boolean;
        responseCode?: number;
        latencyMs?: number;
        errorMessage?: string;
    } = {}
): Promise<{
    success: boolean;
    reason: string;
    event: IntegrationWebhookEvent;
}> {
    const res = await fetch(`${API_BASE_URL}/integrations/webhooks/${id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    return parseResponse<{ success: boolean; reason: string; event: IntegrationWebhookEvent }>(
        res,
        "Failed to process integration webhook event"
    );
}

export async function retryDueIntegrationWebhooks(limit = 20, repoId?: string): Promise<{
    success: boolean;
    processed: number;
    outcomes: Array<{
        id: string;
        reason: string;
        status?: "received" | "processed" | "failed" | "dead_letter";
        repoId?: string;
        externalEventId?: string;
    }>;
}> {
    const res = await fetch(`${API_BASE_URL}/integrations/webhooks/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, repoId }),
    });
    return parseResponse<{
        success: boolean;
        processed: number;
        outcomes: Array<{
            id: string;
            reason: string;
            status?: "received" | "processed" | "failed" | "dead_letter";
            repoId?: string;
            externalEventId?: string;
        }>;
    }>(res, "Failed to retry due integration webhooks");
}
