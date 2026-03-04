import { describe, expect, it, vi } from "vitest";
import { NexusMenuBarApp, type MenuBarSystemAdapter } from "./menuBarApp.js";
import type { NexusClient } from "./nexusClient.js";
import type { PullRequest } from "./types.js";

function makePullRequest(overrides: Partial<PullRequest>): PullRequest {
    return {
        id: "pr_1",
        number: 1,
        title: "Test PR",
        status: "open",
        riskLevel: "medium",
        repository: {
            id: "repo_1",
            name: "org/repo",
        },
        author: {
            username: "alice",
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

function makeClientMock(prs: PullRequest[]): NexusClient {
    return {
        listPullRequests: vi.fn(async () => prs),
        requestAiReview: vi.fn(async () => ({ success: true, jobId: "job_1" })),
        mergePullRequest: vi.fn(async () => ({ success: true, pr: prs[0]! })),
        updatePullRequestStatus: vi.fn(async () => ({ pr: prs[0]! })),
    } as unknown as NexusClient;
}

function makeSystemMock(): MenuBarSystemAdapter {
    return {
        openExternal: vi.fn(async () => {}),
    };
}

describe("NexusMenuBarApp", () => {
    it("refreshes and builds menu model", async () => {
        const prs = [makePullRequest({})];
        const client = makeClientMock(prs);
        const system = makeSystemMock();
        const app = new NexusMenuBarApp(client, system, {
            webBaseUrl: "http://localhost:3000",
        });

        const model = await app.refresh(10);
        expect(model.pullRequests).toHaveLength(1);
        expect(model.pullRequests[0]?.label).toContain("Test PR");
    });

    it("runs dashboard and review actions", async () => {
        const prs = [makePullRequest({ id: "pr_100", number: 100 })];
        const client = makeClientMock(prs);
        const system = makeSystemMock();
        const app = new NexusMenuBarApp(client, system, {
            webBaseUrl: "http://localhost:3000/",
        });

        await app.refresh();
        const openResult = await app.runAction("pr_100", "openInDashboard");
        expect(openResult.message).toContain("Opened PR #100");
        expect(system.openExternal).toHaveBeenCalledWith("http://localhost:3000/inbox/pr_100");

        const reviewResult = await app.runAction("pr_100", "requestAiReview");
        expect(reviewResult.message).toContain("AI review queued");
    });

    it("throws for unknown pull request action target", async () => {
        const client = makeClientMock([makePullRequest({ id: "known" })]);
        const app = new NexusMenuBarApp(client, makeSystemMock(), {
            webBaseUrl: "http://localhost:3000",
        });
        await app.refresh();

        await expect(app.runAction("unknown", "requestAiReview")).rejects.toThrow(
            "Pull request not found in menu cache"
        );
    });
});

