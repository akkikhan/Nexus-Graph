/**
 * NEXUS Repository Layer - Pull Requests
 */

import { eq, desc, and, sql } from "drizzle-orm";
import { db, pullRequests, reviews, comments, users, repositories } from "../db";

export interface CreatePRInput {
    repoId: string;
    branchId?: string;
    authorId: string;
    number: number;
    externalId: string;
    title: string;
    description?: string;
    url: string;
    isDraft?: boolean;
    linesAdded?: number;
    linesRemoved?: number;
    filesChanged?: number;
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

export const prRepository = {
    /**
     * Create a new pull request
     */
    async create(input: CreatePRInput) {
        const [pr] = await db
            .insert(pullRequests)
            .values({
                repoId: input.repoId,
                branchId: input.branchId,
                authorId: input.authorId,
                number: input.number,
                externalId: input.externalId,
                title: input.title,
                description: input.description,
                url: input.url,
                isDraft: input.isDraft ?? false,
                status: input.isDraft ? "draft" : "open",
                linesAdded: input.linesAdded ?? 0,
                linesRemoved: input.linesRemoved ?? 0,
                filesChanged: input.filesChanged ?? 0,
            })
            .returning();

        return pr;
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
        const [updated] = await db
            .update(pullRequests)
            .set({
                ...input,
                updatedAt: new Date(),
            })
            .where(eq(pullRequests.id, id))
            .returning();

        return updated;
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
};
