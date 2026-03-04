/**
 * NEXUS Repository Layer - Pull Requests
 */

import { and, desc, eq, sql } from "drizzle-orm";
import * as nexusDb from "../db/index.js";

const { branches, comments, db, pullRequests, repositories, reviews, users } = nexusDb;
const aiReviewJobs = (nexusDb as any).aiReviewJobs;

type RiskLevel = "low" | "medium" | "high" | "critical";
type AIReviewJobStatus = "queued" | "running" | "completed" | "failed";
type AISeverity = "critical" | "error" | "warning" | "info";

interface AIReviewJobMetadata {
    source?: string;
    summary?: string;
    statusHistory?: Array<{
        status: AIReviewJobStatus;
        at: string;
        source: string;
    }>;
    [key: string]: unknown;
}

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
    riskLevel?: RiskLevel;
    riskFactors?: any[];
    estimatedReviewMinutes?: number;
}

export interface AIReviewFindingInput {
    path?: string;
    line?: number;
    side?: "LEFT" | "RIGHT";
    body: string;
    severity?: AISeverity;
    category?: string;
    suggestionCode?: string;
}

export interface CompleteAIReviewJobInput {
    summary?: string;
    findings?: AIReviewFindingInput[];
    model?: string;
    provider?: string;
    riskScore?: number;
    riskLevel?: RiskLevel;
    riskFactors?: any[];
    estimatedReviewMinutes?: number;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

function inferRiskLevel(score: number): RiskLevel {
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

function normalizeSeverity(severity?: string): AISeverity {
    if (severity === "critical" || severity === "error" || severity === "warning" || severity === "info") {
        return severity;
    }
    return "warning";
}

function defaultFindingsForPR(pr: {
    title: string;
    riskLevel: RiskLevel | null;
    riskScore: number | null;
}): AIReviewFindingInput[] {
    const level = pr.riskLevel || inferRiskLevel(Math.round(pr.riskScore || 0));
    if (level === "critical" || level === "high") {
        return [
            {
                path: "src/payment/retry.ts",
                line: 42,
                side: "RIGHT",
                body: `High-risk flow detected in "${pr.title}". Verify idempotency and race-condition handling.`,
                severity: "error",
                category: "reliability",
            },
            {
                path: "src/api/handlers.ts",
                line: 18,
                side: "RIGHT",
                body: "Confirm authorization and input validation are enforced on all updated handlers.",
                severity: "warning",
                category: "security",
            },
        ];
    }

    return [
        {
            path: "src/index.ts",
            line: 1,
            side: "RIGHT",
            body: `Review "${pr.title}" for test coverage and edge-case behavior before merge.`,
            severity: "info",
            category: "quality",
        },
    ];
}

function summarizeFindings(findings: AIReviewFindingInput[]): string {
    if (findings.length === 0) {
        return "AI review completed with no actionable findings.";
    }

    const counts = findings.reduce(
        (acc, finding) => {
            const sev = normalizeSeverity(finding.severity);
            acc[sev] += 1;
            return acc;
        },
        { critical: 0, error: 0, warning: 0, info: 0 }
    );
    return [
        "AI review completed.",
        `Findings: ${findings.length} total`,
        `(critical: ${counts.critical}, error: ${counts.error}, warning: ${counts.warning}, info: ${counts.info}).`,
    ].join(" ");
}

function isBlockingSeverity(severity?: string): boolean {
    const normalized = normalizeSeverity(severity);
    return normalized === "critical" || normalized === "error";
}

function toMetadata(metadata: unknown): AIReviewJobMetadata {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return {};
    }
    return metadata as AIReviewJobMetadata;
}

function appendJobStatus(
    metadata: unknown,
    status: AIReviewJobStatus,
    source: string,
    at = new Date()
): AIReviewJobMetadata {
    const next = { ...toMetadata(metadata) };
    const history = Array.isArray(next.statusHistory) ? [...next.statusHistory] : [];
    history.push({
        status,
        at: at.toISOString(),
        source,
    });
    next.statusHistory = history;
    return next;
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

async function findAIReviewJob(prId: string, jobId: string) {
    const [job] = await db
        .select()
        .from(aiReviewJobs)
        .where(and(eq(aiReviewJobs.id, jobId), eq(aiReviewJobs.prId, prId)))
        .limit(1);
    return job || null;
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
            where: and(eq(pullRequests.repoId, repoId), eq(pullRequests.number, number)),
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
            riskLevel: RiskLevel;
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

    /**
     * Queue an AI review job for a PR.
     */
    async requestAIReview(id: string, requestedByUserId?: string) {
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

        const now = new Date();
        const metadata = appendJobStatus(
            { source: "api.request-review" },
            "queued",
            "api.request-review",
            now
        );

        const [job] = await db
            .insert(aiReviewJobs)
            .values({
                prId: id,
                requestedByUserId,
                status: "queued",
                provider: "nexus-ai",
                model: "nexus-ai-queued",
                metadata,
            })
            .returning({
                id: aiReviewJobs.id,
                status: aiReviewJobs.status,
            });

        await db.insert(reviews).values({
            prId: id,
            status: "commented",
            body: "AI review requested and queued for processing.",
            isAi: true,
            aiModel: "nexus-ai-queued",
            externalId: job?.id,
        });

        await db
            .update(pullRequests)
            .set({
                aiSummary: pr.aiSummary || `AI review requested for "${pr.title}"`,
                updatedAt: now,
            })
            .where(eq(pullRequests.id, id));

        return {
            prId: id,
            jobId: job?.id || `ai-review-${Date.now()}`,
            status: job?.status || "queued",
            message: "AI review queued",
        };
    },

    async listAIReviewJobs(prId: string, limit = 20) {
        return db
            .select()
            .from(aiReviewJobs)
            .where(eq(aiReviewJobs.prId, prId))
            .orderBy(desc(aiReviewJobs.createdAt))
            .limit(Math.min(Math.max(limit, 1), 100));
    },

    async getAIReviewJob(prId: string, jobId: string) {
        return findAIReviewJob(prId, jobId);
    },

    async startAIReviewJob(prId: string, jobId: string) {
        const existing = await findAIReviewJob(prId, jobId);
        if (!existing) return null;
        if (existing.status !== "queued") return existing;

        const now = new Date();
        const [started] = await db
            .update(aiReviewJobs)
            .set({
                status: "running",
                startedAt: existing.startedAt || now,
                updatedAt: now,
                metadata: appendJobStatus(existing.metadata, "running", "api.start-ai-review", now),
            })
            .where(and(eq(aiReviewJobs.id, jobId), eq(aiReviewJobs.prId, prId)))
            .returning();

        return started || existing;
    },

    async completeAIReviewJob(prId: string, jobId: string, input: CompleteAIReviewJobInput) {
        const job = await findAIReviewJob(prId, jobId);
        if (!job) return null;
        if (job.status === "failed") {
            return {
                blocked: true,
                reason: "job_failed",
                job,
                findingsPersisted: 0,
            };
        }
        if (job.status === "completed") {
            return {
                blocked: false,
                reason: "already_completed",
                job,
                findingsPersisted: job.findingsCount || 0,
            };
        }

        const [pr] = await db
            .select({
                id: pullRequests.id,
                title: pullRequests.title,
                riskScore: pullRequests.riskScore,
                riskLevel: pullRequests.riskLevel,
            })
            .from(pullRequests)
            .where(eq(pullRequests.id, prId))
            .limit(1);
        if (!pr) return null;

        const now = new Date();
        const findings = (input.findings && input.findings.length > 0 ? input.findings : defaultFindingsForPR(pr)).map(
            (finding) => ({
                ...finding,
                severity: normalizeSeverity(finding.severity),
            })
        );
        const summary = (input.summary || "").trim() || summarizeFindings(findings);
        const model = (input.model || "").trim() || job.model || "nexus-ai-simulated";
        const provider = (input.provider || "").trim() || job.provider || "nexus-ai";
        const reviewStatus = findings.some((finding) => isBlockingSeverity(finding.severity))
            ? "changes_requested"
            : "commented";

        await db.transaction(async (tx) => {
            if (job.status === "queued") {
                await tx
                    .update(aiReviewJobs)
                    .set({
                        status: "running",
                        startedAt: job.startedAt || now,
                        updatedAt: now,
                        metadata: appendJobStatus(job.metadata, "running", "api.complete-ai-review", now),
                    })
                    .where(and(eq(aiReviewJobs.id, jobId), eq(aiReviewJobs.prId, prId)));
            }

            const [persistedReview] = await tx
                .insert(reviews)
                .values({
                    prId,
                    status: reviewStatus,
                    body: summary,
                    isAi: true,
                    aiModel: model,
                    externalId: jobId,
                })
                .returning({ id: reviews.id });

            if (persistedReview?.id && findings.length > 0) {
                await tx.insert(comments).values(
                    findings.map((finding) => ({
                        prId,
                        reviewId: persistedReview.id,
                        body: finding.body,
                        filePath: finding.path,
                        lineNumber: finding.line,
                        side: finding.side || "RIGHT",
                        suggestionCode: finding.suggestionCode,
                        isAi: true,
                        aiModel: model,
                        aiCategory: finding.category || "quality",
                        aiSeverity: finding.severity,
                    }))
                );
            }

            const completedMetadata = appendJobStatus(
                {
                    ...toMetadata(job.metadata),
                    source: "api.complete-ai-review",
                    summary,
                },
                "completed",
                "api.complete-ai-review",
                now
            );

            await tx
                .update(aiReviewJobs)
                .set({
                    status: "completed",
                    provider,
                    model,
                    findingsCount: findings.length,
                    errorMessage: null,
                    startedAt: job.startedAt || now,
                    completedAt: now,
                    updatedAt: now,
                    metadata: completedMetadata,
                })
                .where(and(eq(aiReviewJobs.id, jobId), eq(aiReviewJobs.prId, prId)));

            const nextRiskScore = typeof input.riskScore === "number"
                ? input.riskScore
                : Math.round(pr.riskScore || 0);
            const nextRiskLevel = input.riskLevel || inferRiskLevel(nextRiskScore);

            await tx
                .update(pullRequests)
                .set({
                    aiSummary: summary,
                    riskScore: nextRiskScore,
                    riskLevel: nextRiskLevel,
                    riskFactors: Array.isArray(input.riskFactors) ? input.riskFactors : undefined,
                    estimatedReviewMinutes:
                        typeof input.estimatedReviewMinutes === "number"
                            ? input.estimatedReviewMinutes
                            : undefined,
                    updatedAt: now,
                })
                .where(eq(pullRequests.id, prId));
        });

        const completedJob = await findAIReviewJob(prId, jobId);
        return {
            blocked: false,
            reason: "completed",
            job: completedJob,
            findingsPersisted: findings.length,
        };
    },

    async failAIReviewJob(prId: string, jobId: string, failureMessage: string) {
        const job = await findAIReviewJob(prId, jobId);
        if (!job) return null;
        if (job.status === "completed" || job.status === "failed") return job;

        const now = new Date();
        const [failedJob] = await db
            .update(aiReviewJobs)
            .set({
                status: "failed",
                errorMessage: failureMessage,
                startedAt: job.startedAt || now,
                completedAt: now,
                updatedAt: now,
                metadata: appendJobStatus(job.metadata, "failed", "api.fail-ai-review", now),
            })
            .where(and(eq(aiReviewJobs.id, jobId), eq(aiReviewJobs.prId, prId)))
            .returning();

        await db
            .insert(reviews)
            .values({
                prId,
                status: "commented",
                body: `AI review failed: ${failureMessage}`,
                isAi: true,
                aiModel: job.model || "nexus-ai",
                externalId: jobId,
            });

        return failedJob || job;
    },
};
