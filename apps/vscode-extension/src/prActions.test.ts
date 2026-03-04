import { describe, expect, it } from "vitest";
import { buildPullRequestActions, formatInboxSummary, summarizeInbox } from "./prActions";
import type { PullRequest } from "./types";

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

describe("buildPullRequestActions", () => {
    it("returns merge action for open pull requests", () => {
        const actions = buildPullRequestActions(
            makePullRequest({
                status: "open",
            })
        );
        expect(actions.map((action) => action.id)).toContain("merge");
        expect(actions.map((action) => action.id)).toContain("markDraft");
    });

    it("returns mark-open action for draft pull requests", () => {
        const actions = buildPullRequestActions(
            makePullRequest({
                status: "draft",
            })
        );
        expect(actions.map((action) => action.id)).toContain("markOpen");
        expect(actions.map((action) => action.id)).not.toContain("merge");
    });
});

describe("summarizeInbox", () => {
    it("summarizes status and risk counts", () => {
        const summary = summarizeInbox([
            makePullRequest({ status: "open", riskLevel: "critical" }),
            makePullRequest({ id: "pr_2", number: 2, status: "draft", riskLevel: "high" }),
            makePullRequest({ id: "pr_3", number: 3, status: "merged", riskLevel: "low" }),
        ]);

        expect(summary).toEqual({
            total: 3,
            open: 1,
            draft: 1,
            merged: 1,
            closed: 0,
            highOrCriticalRisk: 2,
        });

        const text = formatInboxSummary(summary);
        expect(text).toContain("Total: 3");
        expect(text).toContain("High/Critical risk: 2");
    });
});

