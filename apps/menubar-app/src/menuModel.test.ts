import { describe, expect, it } from "vitest";
import { buildMenuModel, buildPullRequestActions, summarizeInbox } from "./menuModel.js";
import type { PullRequest } from "./types.js";

function makePullRequest(overrides: Partial<PullRequest>): PullRequest {
    return {
        id: "pr_1",
        number: 1,
        title: "Test PR",
        status: "open",
        riskLevel: "low",
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

describe("menuModel", () => {
    it("summarizes inbox by status and risk", () => {
        const summary = summarizeInbox([
            makePullRequest({ status: "open", riskLevel: "critical" }),
            makePullRequest({ id: "pr_2", number: 2, status: "draft", riskLevel: "high" }),
            makePullRequest({ id: "pr_3", number: 3, status: "merged", riskLevel: "low" }),
            makePullRequest({ id: "pr_4", number: 4, status: "closed", riskLevel: "medium" }),
        ]);

        expect(summary).toEqual({
            total: 4,
            open: 1,
            draft: 1,
            merged: 1,
            closed: 1,
            highOrCriticalRisk: 2,
        });
    });

    it("builds quick actions and menu sections", () => {
        const prs = [
            makePullRequest({ status: "open" }),
            makePullRequest({ id: "pr_2", number: 2, status: "draft" }),
        ];
        const model = buildMenuModel(prs);

        expect(model.header).toContain("Nexus Inbox");
        expect(model.pullRequests).toHaveLength(2);
        expect(model.pullRequests[0]?.actions.map((a) => a.actionId)).toContain("merge");
        expect(model.pullRequests[1]?.actions.map((a) => a.actionId)).toContain("markOpen");

        const closedActions = buildPullRequestActions(makePullRequest({ status: "closed" }));
        expect(closedActions.map((a) => a.actionId)).not.toContain("merge");
    });
});

