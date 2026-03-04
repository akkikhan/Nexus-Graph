import type { PullRequest, PullRequestListResponse, PullRequestStatus } from "./types";

interface NexusClientOptions {
    apiBaseUrl: string;
    timeoutMs?: number;
}

interface RequestAiReviewResponse {
    success: boolean;
    message?: string;
    jobId?: string;
}

interface UpdatePullRequestStatusResponse {
    pr: PullRequest;
}

interface MergePullRequestResponse {
    success: boolean;
    pr: PullRequest;
}

function normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

function toQuery(params: Record<string, string | number | undefined>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue;
        query.set(key, String(value));
    }
    return query.toString();
}

export class NexusClientError extends Error {
    readonly status: number;
    readonly responseText?: string;

    constructor(message: string, status: number, responseText?: string) {
        super(message);
        this.name = "NexusClientError";
        this.status = status;
        this.responseText = responseText;
    }
}

export class NexusClient {
    private readonly apiBaseUrl: string;
    private readonly timeoutMs: number;

    constructor(options: NexusClientOptions) {
        this.apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl);
        this.timeoutMs = options.timeoutMs ?? 8000;
    }

    async listPullRequests(input?: {
        status?: "open" | "closed" | "merged" | "all";
        limit?: number;
        offset?: number;
    }): Promise<PullRequest[]> {
        const query = toQuery({
            status: input?.status ?? "open",
            limit: input?.limit ?? 20,
            offset: input?.offset ?? 0,
        });
        const response = await this.request<PullRequestListResponse>(`/api/v1/prs?${query}`);
        return response.prs;
    }

    async requestAiReview(prId: string): Promise<RequestAiReviewResponse> {
        return this.request<RequestAiReviewResponse>(`/api/v1/prs/${prId}/request-review`, {
            method: "POST",
        });
    }

    async mergePullRequest(prId: string): Promise<MergePullRequestResponse> {
        return this.request<MergePullRequestResponse>(`/api/v1/prs/${prId}/merge`, {
            method: "POST",
        });
    }

    async updatePullRequestStatus(
        prId: string,
        status: Extract<PullRequestStatus, "open" | "draft" | "closed">
    ): Promise<UpdatePullRequestStatusResponse> {
        return this.request<UpdatePullRequestStatusResponse>(`/api/v1/prs/${prId}`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
        });
    }

    private async request<T>(path: string, init?: RequestInit): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(init?.headers as Record<string, string> | undefined),
        };

        try {
            const response = await fetch(`${this.apiBaseUrl}${path}`, {
                ...init,
                headers,
                signal: controller.signal,
            });

            if (!response.ok) {
                const bodyText = await response.text().catch(() => "");
                const suffix = bodyText ? `: ${bodyText}` : "";
                throw new NexusClientError(
                    `Nexus API request failed (${response.status})${suffix}`,
                    response.status,
                    bodyText || undefined
                );
            }

            return (await response.json()) as T;
        } catch (error) {
            if (error instanceof NexusClientError) {
                throw error;
            }
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error(`Nexus API request timed out after ${this.timeoutMs}ms`);
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }
}

export function createNexusClient(config: {
    apiBaseUrl: string;
    requestTimeoutMs: number;
}): NexusClient {
    return new NexusClient({
        apiBaseUrl: config.apiBaseUrl,
        timeoutMs: config.requestTimeoutMs,
    });
}

