/**
 * NEXUS API - Pull Request Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prRepository } from "../repositories/pr.js";

const prRouter = new Hono();

// Schemas
const listPRsSchema = z.object({
    status: z.enum(["open", "closed", "merged", "all"]).optional(),
    author: z.string().optional(),
    reviewer: z.string().optional(),
    repo: z.string().optional(),
    userId: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
});

const createPRSchema = z.object({
    repositoryId: z.string(),
    userId: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    headBranch: z.string(),
    baseBranch: z.string(),
    draft: z.boolean().default(false),
    stackId: z.string().optional(),
    requestAIReview: z.boolean().default(true),
});

const updatePRSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    baseBranch: z.string().optional(),
    draft: z.boolean().optional(),
    reviewers: z.array(z.string()).optional(),
    status: z.enum(["draft", "open", "approved", "changes_requested", "merged", "closed"]).optional(),
});

function mapStatus(
    status: string | null | undefined
): "open" | "closed" | "merged" | "draft" {
    if (status === "merged") return "merged";
    if (status === "closed") return "closed";
    if (status === "draft") return "draft";
    return "open";
}

function mapRiskLevel(
    level: string | null | undefined
): "low" | "medium" | "high" | "critical" {
    if (level === "critical") return "critical";
    if (level === "high") return "high";
    if (level === "medium") return "medium";
    return "low";
}

function toIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return value;
    return new Date().toISOString();
}

function mapPR(pr: any) {
    return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        status: mapStatus(pr.status),
        author: {
            username:
                pr.author?.name ||
                pr.author?.email ||
                pr.author?.id ||
                "unknown",
            avatar: pr.author?.avatar || "",
        },
        repository: {
            name:
                pr.repository?.fullName ||
                pr.repository?.name ||
                pr.repoId ||
                "unknown/repository",
            id: pr.repository?.id || pr.repoId || "unknown",
        },
        riskLevel: mapRiskLevel(pr.riskLevel),
        riskScore: Math.round(pr.riskScore || 0),
        aiSummary: pr.aiSummary || "No AI summary yet",
        createdAt: toIso(pr.createdAt),
        updatedAt: toIso(pr.updatedAt),
        comments: Array.isArray(pr.comments) ? pr.comments.length : 0,
        linesAdded: pr.linesAdded || 0,
        linesRemoved: pr.linesRemoved || 0,
    };
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

// Routes

/**
 * GET /prs - List pull requests
 */
prRouter.get("/", zValidator("query", listPRsSchema), async (c) => {
    const query = c.req.valid("query");

    const mappedStatus = query.status && query.status !== "all" ? query.status : undefined;
    try {
        const prs = await prRepository.list({
            repoId: query.repo,
            authorId: query.author,
            status: mappedStatus,
            limit: query.limit,
            offset: query.offset,
        });

        return c.json({
            prs: prs.map(mapPR),
            total: prs.length,
            limit: query.limit,
            offset: query.offset,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for pull request listing",
                details: errorMessage(error),
            },
            503
        );
    }
});

/**
 * GET /prs/:id - Get single PR
 */
prRouter.get("/:id", async (c) => {
    const id = c.req.param("id");

    try {
        const pr = await prRepository.findById(id);
        if (pr) {
            return c.json({ pr: mapPR(pr) });
        }
        return c.json({ error: "Pull request not found" }, 404);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for pull request detail",
                details: errorMessage(error),
            },
            503
        );
    }
});

/**
 * POST /prs - Create a new PR
 */
prRouter.post("/", zValidator("json", createPRSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const created = await prRepository.create({
            repositoryId: body.repositoryId,
            authorId: body.userId,
            title: body.title,
            description: body.description,
            headBranch: body.headBranch,
            baseBranch: body.baseBranch,
            draft: body.draft,
            stackId: body.stackId,
            requestAIReview: body.requestAIReview,
        });
        if (!created) {
            return c.json(
                {
                    error: "Repository or author not found for pull request creation",
                },
                404
            );
        }

        let reviewJobId: string | undefined;
        if (body.requestAIReview) {
            const queued = await prRepository.requestAIReview(created.id);
            reviewJobId = queued?.jobId;
        }

        return c.json(
            {
                pr: mapPR(created),
                ...(reviewJobId ? { reviewJobId } : {}),
            },
            201
        );
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for pull request creation",
                details: errorMessage(error),
            },
            503
        );
    }
});

/**
 * PATCH /prs/:id - Update a PR
 */
prRouter.patch("/:id", zValidator("json", updatePRSchema), async (c) => {
    const id = c.req.param("id");
    const updates = c.req.valid("json");

    try {
        const mappedUpdates: any = {};
        if (typeof updates.title === "string") mappedUpdates.title = updates.title;
        if (typeof updates.description === "string") mappedUpdates.description = updates.description;
        if (typeof updates.status === "string") mappedUpdates.status = updates.status;
        if (typeof updates.draft === "boolean") {
            mappedUpdates.isDraft = updates.draft;
            if (!updates.status) {
                mappedUpdates.status = updates.draft ? "draft" : "open";
            }
        }

        const pr = await prRepository.update(id, mappedUpdates);
        if (!pr) return c.json({ error: "Pull request not found" }, 404);
        return c.json({ pr: mapPR(pr) });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for pull request update",
                details: errorMessage(error),
            },
            503
        );
    }
});

/**
 * POST /prs/:id/merge - Merge a PR
 */
prRouter.post("/:id/merge", async (c) => {
    const id = c.req.param("id");

    try {
        const pr = await prRepository.markMerged(id);
        if (!pr) return c.json({ error: "Pull request not found" }, 404);
        return c.json({
            success: true,
            pr: mapPR(pr),
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for pull request merge",
                details: errorMessage(error),
            },
            503
        );
    }
});

/**
 * POST /prs/:id/request-review - Request AI review
 */
prRouter.post("/:id/request-review", async (c) => {
    const id = c.req.param("id");

    try {
        const queued = await prRepository.requestAIReview(id);
        if (!queued) return c.json({ error: "Pull request not found" }, 404);
        return c.json({
            success: true,
            message: queued.message,
            jobId: queued.jobId,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for pull request review request",
                details: errorMessage(error),
            },
            503
        );
    }
});

export { prRouter };
