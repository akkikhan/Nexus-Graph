import { afterEach, describe, expect, it, vi } from "vitest";
import { NexusClient, NexusClientError } from "./nexusClient";

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("NexusClient", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("lists pull requests with expected query params", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse({
                prs: [],
                total: 0,
                limit: 5,
                offset: 10,
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const client = new NexusClient({
            apiBaseUrl: "http://localhost:3001/",
            timeoutMs: 5000,
        });

        await client.listPullRequests({
            status: "open",
            limit: 5,
            offset: 10,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "http://localhost:3001/api/v1/prs?status=open&limit=5&offset=10"
        );
    });

    it("sends request AI review command", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse({
                success: true,
                jobId: "job_123",
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const client = new NexusClient({
            apiBaseUrl: "http://localhost:3001",
        });

        const response = await client.requestAiReview("pr_abc");
        expect(response.success).toBe(true);

        const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "http://localhost:3001/api/v1/prs/pr_abc/request-review"
        );
        expect(requestInit.method).toBe("POST");
    });

    it("throws typed API error for non-2xx responses", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("db unavailable", { status: 503 })));
        const client = new NexusClient({
            apiBaseUrl: "http://localhost:3001",
        });

        await expect(client.mergePullRequest("pr_abc")).rejects.toBeInstanceOf(NexusClientError);
        await expect(client.mergePullRequest("pr_abc")).rejects.toMatchObject({ status: 503 });
    });
});

