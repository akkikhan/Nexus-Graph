/**
 * NEXUS Repository Layer - Reviews
 */

import { and, desc, eq } from "drizzle-orm";
import { db, comments, pullRequests, repositories, reviews, users } from "../db/index.js";

type ReviewAction = "approve" | "request_changes" | "comment";

export interface CreateReviewInput {
    prId: string;
    action: ReviewAction;
    body?: string;
    userId?: string;
    comments?: Array<{
        path: string;
        line: number;
        body: string;
        side?: "LEFT" | "RIGHT";
    }>;
}

export interface CreateCommentInput {
    prId: string;
    body: string;
    path?: string;
    line?: number;
    side?: "LEFT" | "RIGHT";
    userId?: string;
    replyTo?: string;
}

function actionToStatus(action: ReviewAction): "approved" | "changes_requested" | "commented" {
    if (action === "approve") return "approved";
    if (action === "request_changes") return "changes_requested";
    return "commented";
}

function statusToAction(
    status: "approved" | "changes_requested" | "commented" | null | undefined
): ReviewAction {
    if (status === "approved") return "approve";
    if (status === "changes_requested") return "request_changes";
    return "comment";
}

function urgencyFromRisk(score: number): "high" | "medium" | "low" {
    if (score >= 70) return "high";
    if (score >= 35) return "medium";
    return "low";
}

function toIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return value;
    return new Date().toISOString();
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

async function loadReviewById(id: string) {
    return db.query.reviews.findFirst({
        where: eq(reviews.id, id),
        with: {
            user: true,
            comments: {
                orderBy: [desc(comments.createdAt)],
            },
        },
    });
}

function mapReview(review: any) {
    const authorName = review.user?.name || review.user?.email || review.user?.id || "current-user";
    const mapped = {
        id: review.id,
        prId: review.prId,
        author: {
            username: review.isAi ? "NEXUS AI" : authorName,
            avatar: review.user?.avatar || "",
        },
        action: statusToAction(review.status),
        body: review.body || "",
        comments: (review.comments || []).map((comment: any) => ({
            id: comment.id,
            path: comment.filePath || undefined,
            line: comment.lineNumber || undefined,
            body: comment.body,
            side: comment.side || undefined,
            severity: comment.aiSeverity || undefined,
            category: comment.aiCategory || undefined,
            resolved: comment.wasAccepted === true,
            replyTo: comment.reviewId ? undefined : undefined,
            createdAt: toIso(comment.createdAt),
        })),
        isAI: review.isAi === true,
        aiMetadata:
            review.isAi === true
                ? {
                    model: review.aiModel || "unknown",
                }
                : undefined,
        createdAt: toIso(review.createdAt),
    };
    return mapped;
}

function mapComment(comment: any, user: any) {
    return {
        id: comment.id,
        prId: comment.prId,
        body: comment.body,
        path: comment.filePath || undefined,
        line: comment.lineNumber || undefined,
        side: comment.side || undefined,
        replyTo: undefined,
        resolved: comment.wasAccepted === true,
        author: {
            username: user?.name || user?.email || user?.id || "current-user",
            avatar: user?.avatar || "",
        },
        createdAt: toIso(comment.createdAt),
    };
}

export const reviewRepository = {
    errorMessage,

    async listByPR(prId: string) {
        const reviewRows = await db.query.reviews.findMany({
            where: eq(reviews.prId, prId),
            with: {
                user: true,
                comments: {
                    orderBy: [desc(comments.createdAt)],
                },
            },
            orderBy: [desc(reviews.createdAt)],
        });

        return reviewRows.map(mapReview);
    },

    async create(input: CreateReviewInput) {
        const [created] = await db
            .insert(reviews)
            .values({
                prId: input.prId,
                userId: input.userId,
                status: actionToStatus(input.action),
                body: input.body,
                isAi: false,
            })
            .returning();

        if (!created) return null;

        if (input.comments && input.comments.length > 0) {
            await db.insert(comments).values(
                input.comments.map((comment) => ({
                    prId: input.prId,
                    reviewId: created.id,
                    userId: input.userId,
                    filePath: comment.path,
                    lineNumber: comment.line,
                    side: comment.side,
                    body: comment.body,
                    isAi: false,
                }))
            );
        }

        const hydrated = await loadReviewById(created.id);
        return hydrated ? mapReview(hydrated) : null;
    },

    async addComment(input: CreateCommentInput) {
        const [created] = await db
            .insert(comments)
            .values({
                prId: input.prId,
                userId: input.userId,
                body: input.body,
                filePath: input.path,
                lineNumber: input.line,
                side: input.side,
                isAi: false,
            })
            .returning();

        if (!created) return null;

        const user = input.userId
            ? await db.query.users.findFirst({
                where: eq(users.id, input.userId),
                columns: { id: true, name: true, email: true, avatar: true },
            })
            : null;

        return mapComment(created, user);
    },

    async resolveComment(id: string) {
        const [updated] = await db
            .update(comments)
            .set({
                wasAccepted: true,
            })
            .where(eq(comments.id, id))
            .returning();

        if (!updated) return null;
        return {
            id: updated.id,
            resolved: true,
            resolvedAt: new Date().toISOString(),
        };
    },

    async pending(limit = 20) {
        const rows = await db
            .select({
                prId: pullRequests.id,
                prNumber: pullRequests.number,
                prTitle: pullRequests.title,
                riskScore: pullRequests.riskScore,
                requestedAt: pullRequests.updatedAt,
                repoName: repositories.fullName,
                authorName: users.name,
            })
            .from(pullRequests)
            .innerJoin(repositories, eq(pullRequests.repoId, repositories.id))
            .leftJoin(users, eq(pullRequests.authorId, users.id))
            .where(eq(pullRequests.status, "open"))
            .orderBy(desc(pullRequests.riskScore), desc(pullRequests.updatedAt))
            .limit(limit);

        return rows.map((row) => {
            const riskScore = Math.round(row.riskScore || 0);
            return {
                prId: row.prId,
                prNumber: row.prNumber,
                prTitle: row.prTitle,
                repository: { name: row.repoName },
                author: { username: row.authorName || "unknown" },
                requestedAt: toIso(row.requestedAt),
                urgency: urgencyFromRisk(riskScore),
                riskScore,
            };
        });
    },

    async pullRequestExists(prId: string): Promise<boolean> {
        const pr = await db.query.pullRequests.findFirst({
            where: eq(pullRequests.id, prId),
            columns: { id: true },
        });
        return Boolean(pr);
    },
};

