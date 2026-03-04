/**
 * NEXUS Repository Layer - Pull Requests
 */

import { eq, desc, and, sql } from "drizzle-orm";
import { db, pullRequests, reviews, comments, users, repositories, branches } from "../db/index.js";

export interface CreatePRInput {
    repositoryId: string;
    authorId?: string;
    branchId?: string;
    title: string;
    description?: string;
    headBranch: string;
    baseBranch: string;
    draft?: boolean;
    stackId?: string;
    requestAIReview?: boolean;
}

export interface UpdatePRInput {
    title?: string;
    description?: string;
    status?: "draft" | "open" | "approved" | "changes_requested" | "merged" | "closed";
    isDraft?: boolean;
    aiSummary?: string;
    riskScore?: number;
    riskLevel?: "low" | "medium" | "high" | "critical";
    riskFactors?: any[];
    estimatedReviewMinutes?: number;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

function inferRiskLevel(score: number): "low" | "medium" | "high" | "critical" {
    if (score >= 85) return "critical";
    if (score >= 65) return "high";
    if (score >= 35) return "medium";
    return "low";
}

function inferRiskScore(title: string, description?: string): number {
    const text = `${title} ${description || ""}`.toLowerCase();
    let score = 28;
    if (text.includes("auth") || text.includes("payment") || text.includes("security")) score += 42;
    if (text.includes("db") || text.includes("migration") || text.includes("schema")) score += 24;
    if (text.includes("refactor")) score += 14;
    if (text.includes("fix")) score += 8;
    return Math.max(5, Math.min(95, score));
}

async function resolveRepositoryId(repositoryRef: string): Promise<string | null> {
    const repository = await db.query.repositories.findFirst({
        where: sql`${repositories.id} = ${repositoryRef}
        OR ${repositories.externalId} = ${repositoryRef}
        OR ${repositories.name} = ${repositoryRef}
        OR ${repositories.fullName} = ${repositoryRef}`,
        columns: { id: true },
    });
    return repository?.id || null;
}

async function resolveAuthorId(authorId?: string): Promise<string | null> {
    if (authorId) {
        const author = await db.query.users.findFirst({
            where: sql`${users.id} = ${authorId}
            OR ${users.email} = ${authorId}
            OR ${users.name} = ${authorId}`,
            columns: { id: true },
        });
        if (author?.id) return author.id;
    }

    const fallback = await db.query.users.findFirst({
        columns: { id: true },
        orderBy: [desc(users.createdAt)],
    });
    return fallback?.id || null;
}

async function nextPRNumber(repoId: string): Promise<number> {
    const [row] = await db
        .select({
            maxNumber: sql<number>`coalesce(max(${pullRequests.number}), 0)`,
        })
        .from(pullRequests)
        .where(eq(pullRequests.repoId, repoId));
    return Number(row?.maxNumber || 0) + 1;
}

export const prRepository = {
    errorMessage,

    /**
     * Create a new pull request
     */
    async create(input: CreatePRInput) {
        const repoId = await resolveRepositoryId(input.repositoryId);
        const authorId = await resolveAuthorId(input.authorId);
        if (!repoId || !authorId) return null;

        let branchId: string | null = input.branchId || null;
        if (!branchId) {
            const branch = await db.query.branches.findFirst({
                where: and(
                    eq(branches.repoId, repoId),
                    eq(branches.name, input.headBranch),
                    input.stackId ? eq(branches.stackId, input.stackId) : sql`true`
                ),
                columns: { id: true },
                orderBy: [desc(branches.updatedAt)],
            });
            branchId = branch?.id || null;
        }

        const number = await nextPRNumber(repoId);
        const riskScore = inferRiskScore(input.title, input.description);
        const riskLevel = inferRiskLevel(riskScore);
        const isDraft = input.draft === true;

        const [pr] = await db
            .insert(pullRequests)
            .values({
                repoId,
                branchId,
                authorId,
                number,
                externalId: `nexus_${repoId}_${number}`,
                title: input.title,
                description: input.description,
                url: `https://example.com/pr/${number}`,
                isDraft,
                status: isDraft ? "draft" : "open",
                linesAdded: 0,
                linesRemoved: 0,
                filesChanged: 0,
                commitsCount: 1,
                riskScore,
                riskLevel,
                aiSummary: input.requestAIReview
                    ? "AI review requested and queued."
                    : "Initial PR created. AI review not yet requested.",
            })
            .returning();

        if (!pr) return null;
        return this.findById(pr.id);
    },

    /**
     * Find PR by ID
     */
    async findById(id: string) {
        const pr = await db.query.pullRequests.findFirst({
            where: eq(pullRequests.id, id),
            with: {
                author: true,
                repository: true,
                reviews: {
                    with: { user: true },
                    orderBy: [desc(reviews.createdAt)],
                },
                comments: {
                    with: { user: true },
                    orderBy: [desc(comments.createdAt)],
                },
            },
        });

        return pr;
    },

    /**
     * Find PR by repo and number
     */
    async findByRepoAndNumber(repoId: string, number: number) {
        return db.query.pullRequests.findFirst({
            where: and(
                eq(pullRequests.repoId, repoId),
                eq(pullRequests.number, number)
            ),
            with: {
                author: true,
                repository: true,
            },
        });
    },

    /**
     * List PRs with filters
     */
    async list(options: {
        repoId?: string;
        authorId?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }) {
        const conditions = [];

        if (options.repoId) {
            conditions.push(eq(pullRequests.repoId, options.repoId));
        }
        if (options.authorId) {
            conditions.push(eq(pullRequests.authorId, options.authorId));
        }
        if (options.status) {
            conditions.push(eq(pullRequests.status, options.status as any));
        }

        const prs = await db.query.pullRequests.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            with: {
                author: true,
                repository: true,
            },
            orderBy: [desc(pullRequests.createdAt)],
            limit: options.limit ?? 20,
            offset: options.offset ?? 0,
        });

        return prs;
    },

    /**
     * Update a PR
     */
    async update(id: string, input: UpdatePRInput) {
        const updatePayload: any = {
            updatedAt: new Date(),
        };
        if (typeof input.title === "string") updatePayload.title = input.title;
        if (typeof input.description === "string") updatePayload.description = input.description;
        if (typeof input.status === "string") updatePayload.status = input.status;
        if (typeof input.isDraft === "boolean") updatePayload.isDraft = input.isDraft;
        if (typeof input.aiSummary === "string") updatePayload.aiSummary = input.aiSummary;
        if (typeof input.riskScore === "number") updatePayload.riskScore = input.riskScore;
        if (typeof input.riskLevel === "string") updatePayload.riskLevel = input.riskLevel;
        if (Array.isArray(input.riskFactors)) updatePayload.riskFactors = input.riskFactors;
        if (typeof input.estimatedReviewMinutes === "number") {
            updatePayload.estimatedReviewMinutes = input.estimatedReviewMinutes;
        }

        const [existing] = await db
            .select({ id: pullRequests.id })
            .from(pullRequests)
            .where(eq(pullRequests.id, id))
            .limit(1);
        if (!existing) return null;

        const [updated] = await db
            .update(pullRequests)
            .set(updatePayload)
            .where(eq(pullRequests.id, id))
            .returning();

        if (!updated) return null;
        return this.findById(updated.id);
    },

    /**
     * Update AI analysis results
     */
    async updateAIAnalysis(
        id: string,
        analysis: {
            aiSummary: string;
            riskScore: number;
            riskLevel: "low" | "medium" | "high" | "critical";
            riskFactors: any[];
            estimatedReviewMinutes: number;
        }
    ) {
        return this.update(id, analysis);
    },

    /**
     * Get PRs pending review for a user
     */
    async getPendingReviews(userId: string) {
        void userId;
        // In a full implementation, would join with review requests table
        const prs = await db.query.pullRequests.findMany({
            where: eq(pullRequests.status, "open"),
            with: {
                author: true,
                repository: true,
            },
            orderBy: [desc(pullRequests.riskScore)],
            limit: 20,
        });

        return prs;
    },

    /**
     * Get PR statistics for a repository
     */
    async getStats(repoId: string) {
        const stats = await db
            .select({
                total: sql<number>`count(*)`,
                open: sql<number>`count(*) filter (where status = 'open')`,
                merged: sql<number>`count(*) filter (where status = 'merged')`,
                avgRiskScore: sql<number>`avg(risk_score)`,
                avgTimeToMerge: sql<number>`avg(extract(epoch from (merged_at - created_at)) / 3600)`,
            })
            .from(pullRequests)
            .where(eq(pullRequests.repoId, repoId));

        return stats[0];
    },

    /**
     * Mark PR as merged
     */
    async markMerged(id: string) {
        return this.update(id, {
            status: "merged",
        });
    },

    async requestAIReview(id: string) {
        const [pr] = await db
            .select({
                id: pullRequests.id,
                title: pullRequests.title,
                aiSummary: pullRequests.aiSummary,
            })
            .from(pullRequests)
            .where(eq(pullRequests.id, id))
            .limit(1);
        if (!pr) return null;

        const [queuedReview] = await db
            .insert(reviews)
            .values({
                prId: id,
                status: "commented",
                body: "AI review requested and queued for processing.",
                isAi: true,
                aiModel: "nexus-ai-queued",
            })
            .returning({
                id: reviews.id,
            });

        await db
            .update(pullRequests)
            .set({
                aiSummary:
                    pr.aiSummary ||
                    `AI review requested for "${pr.title}"`,
                updatedAt: new Date(),
            })
            .where(eq(pullRequests.id, id));

        return {
            prId: id,
            jobId: queuedReview?.id || `ai-review-${Date.now()}`,
            message: "AI review queued",
        };
    },
};
