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

const aiReviewJobListSchema = z.object({
    limit: z.coerce.number().min(1).max(100).default(20),
});

const completeAIReviewJobSchema = z.object({
    summary: z.string().optional(),
    findings: z
        .array(
            z.object({
                path: z.string().optional(),
                line: z.number().int().positive().optional(),
                side: z.enum(["LEFT", "RIGHT"]).optional(),
                body: z.string().min(1),
                severity: z.enum(["critical", "error", "warning", "info"]).optional(),
                category: z.string().optional(),
                suggestionCode: z.string().optional(),
            })
        )
        .optional(),
    model: z.string().optional(),
    provider: z.string().optional(),
    riskScore: z.number().min(0).max(100).optional(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
    riskFactors: z.array(z.unknown()).optional(),
    estimatedReviewMinutes: z.number().int().min(0).optional(),
});

const failAIReviewJobSchema = z.object({
    error: z.string().min(1),
});
const prIdParamSchema = z.string().uuid();

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

function mapAIReviewJob(job: any) {
    return {
        id: job.id,
        prId: job.prId,
        status: job.status,
        provider: job.provider || undefined,
        model: job.model || undefined,
        findingsCount: job.findingsCount || 0,
        errorMessage: job.errorMessage || undefined,
        startedAt: job.startedAt ? toIso(job.startedAt) : undefined,
        completedAt: job.completedAt ? toIso(job.completedAt) : undefined,
        createdAt: toIso(job.createdAt),
        updatedAt: toIso(job.updatedAt),
        metadata: job.metadata || {},
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
    const parsedId = prIdParamSchema.safeParse(id);
    if (!parsedId.success) {
        return c.json({ error: "Invalid pull request id" }, 400);
    }

    try {
        const pr = await prRepository.findById(parsedId.data);
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
            const queued = await prRepository.requestAIReview(created.id, body.userId);
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

/**
 * GET /prs/:id/ai-review-jobs - List AI review jobs for a PR
 */
prRouter.get("/:id/ai-review-jobs", zValidator("query", aiReviewJobListSchema), async (c) => {
    const id = c.req.param("id");
    const query = c.req.valid("query");

    try {
        const jobs = await prRepository.listAIReviewJobs(id, query.limit);
        return c.json({
            jobs: jobs.map(mapAIReviewJob),
            total: jobs.length,
            limit: query.limit,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for AI review job listing",
                details: errorMessage(error),
            },
            503
        );
    }
});

/**
 * GET /prs/:id/ai-review-jobs/:jobId - Get AI review job status
 */
prRouter.get("/:id/ai-review-jobs/:jobId", async (c) => {
    const id = c.req.param("id");
    const jobId = c.req.param("jobId");

    try {
        const job = await prRepository.getAIReviewJob(id, jobId);
        if (!job) return c.json({ error: "AI review job not found" }, 404);
        return c.json({ job: mapAIReviewJob(job) });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for AI review job detail",
                details: errorMessage(error),
            },
            503
        );
    }
});

/**
 * POST /prs/:id/ai-review-jobs/:jobId/start - Mark AI review job running
 */
prRouter.post("/:id/ai-review-jobs/:jobId/start", async (c) => {
    const id = c.req.param("id");
    const jobId = c.req.param("jobId");

    try {
        const job = await prRepository.startAIReviewJob(id, jobId);
        if (!job) return c.json({ error: "AI review job not found" }, 404);
        return c.json({
            success: true,
            job: mapAIReviewJob(job),
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for AI review job start",
                details: errorMessage(error),
            },
            503
        );
    }
});

/**
 * POST /prs/:id/ai-review-jobs/:jobId/complete - Persist AI review findings
 */
prRouter.post("/:id/ai-review-jobs/:jobId/complete", zValidator("json", completeAIReviewJobSchema), async (c) => {
    const id = c.req.param("id");
    const jobId = c.req.param("jobId");
    const body = c.req.valid("json");

    try {
        const result = await prRepository.completeAIReviewJob(id, jobId, body);
        if (!result) return c.json({ error: "AI review job not found" }, 404);
        if (result.blocked) {
            return c.json(
                {
                    error: "AI review job cannot be completed from failed state",
                    reason: result.reason,
                    job: result.job ? mapAIReviewJob(result.job) : undefined,
                },
                409
            );
        }

        return c.json({
            success: true,
            reason: result.reason,
            findingsPersisted: result.findingsPersisted,
            job: result.job ? mapAIReviewJob(result.job) : undefined,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for AI review completion",
                details: errorMessage(error),
            },
            503
        );
    }
});

/**
 * POST /prs/:id/ai-review-jobs/:jobId/fail - Persist AI review failure
 */
prRouter.post("/:id/ai-review-jobs/:jobId/fail", zValidator("json", failAIReviewJobSchema), async (c) => {
    const id = c.req.param("id");
    const jobId = c.req.param("jobId");
    const body = c.req.valid("json");

    try {
        const job = await prRepository.failAIReviewJob(id, jobId, body.error);
        if (!job) return c.json({ error: "AI review job not found" }, 404);
        return c.json({
            success: true,
            job: mapAIReviewJob(job),
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for AI review failure update",
                details: errorMessage(error),
            },
            503
        );
    }
});

export { prRouter };
