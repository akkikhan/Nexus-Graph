/**
 * NEXUS Repository Layer - Activity
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db, branches, comments, mergeQueue, pullRequests, reviews, stacks, users } from "../db/index.js";
import * as nexusDb from "../db/index.js";

const auditLog = (nexusDb as any).auditLog;
const INTEGRATION_AUDIT_ENTITY_TYPES = [
    "integration_connection",
    "integration_issue_link",
    "integration_notification",
    "integration_webhook",
] as const;

export interface ActivityItem {
    id: string;
    type: string;
    icon: string;
    color: string;
    bgColor: string;
    title: string;
    description: string;
    timestamp: string;
    pr?: {
        number: number;
        title: string;
    };
    details?: {
        critical: number;
        warnings: number;
        suggestions: number;
    };
    stack?: {
        name: string;
        branches: number;
    };
    integration?: {
        provider?: "slack" | "linear" | "jira";
        scope: "connection" | "issue_link" | "webhook" | "notification" | "slack_action";
        action: string;
        outcome: "success" | "error";
        summary?: string;
    };
}

type InternalActivity = ActivityItem & { ts: number };

function toIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return value;
    return new Date().toISOString();
}

function toTimestamp(value: unknown): number {
    const iso = toIso(value);
    const ts = Date.parse(iso);
    return Number.isNaN(ts) ? Date.now() : ts;
}

function formatRelativeTime(dateValue: unknown): string {
    const date =
        dateValue instanceof Date
            ? dateValue
            : new Date(typeof dateValue === "string" ? dateValue : Date.now());
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.floor(diffMs / 60000));
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

function riskDetails(score: number) {
    if (score >= 75) return { critical: 1, warnings: 2, suggestions: 0 };
    if (score >= 50) return { critical: 0, warnings: 2, suggestions: 1 };
    if (score >= 25) return { critical: 0, warnings: 1, suggestions: 2 };
    return { critical: 0, warnings: 0, suggestions: 1 };
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

function mapPRActivity(pr: any, index: number): InternalActivity {
    const number = pr.number || 0;
    const title = pr.title || "Untitled PR";
    const score = Math.round(pr.riskScore || 0);
    const eventDate = pr.updatedAt || pr.mergedAt || pr.createdAt;

    if (pr.status === "merged") {
        return {
            id: `act-pr-merged-${pr.id || index}`,
            type: "pr_merged",
            icon: "GitMerge",
            color: "text-green-500",
            bgColor: "bg-green-500/10",
            title: "PR Merged",
            description: `#${number} merged successfully`,
            timestamp: formatRelativeTime(eventDate),
            pr: { number, title },
            ts: toTimestamp(eventDate),
        };
    }

    return {
        id: `act-pr-review-${pr.id || index}`,
        type: "ai_review",
        icon: "Bot",
        color: score >= 75 ? "text-red-500" : "text-purple-500",
        bgColor: score >= 75 ? "bg-red-500/10" : "bg-purple-500/10",
        title: "AI Review Completed",
        description: pr.aiSummary || `Risk analysis generated for "${title}"`,
        timestamp: formatRelativeTime(eventDate),
        pr: { number, title },
        details: riskDetails(score),
        ts: toTimestamp(eventDate),
    };
}

function integrationScopeFromEntityType(
    entityType: string
): "connection" | "issue_link" | "webhook" | "notification" | "slack_action" {
    if (entityType === "integration_connection") return "connection";
    if (entityType === "integration_issue_link") return "issue_link";
    if (entityType === "integration_notification") return "notification";
    return "webhook";
}

function normalizeIntegrationAction(action: string): string {
    const trimmed = (action || "").trim();
    if (!trimmed) return "event";
    if (trimmed.startsWith("integration.")) {
        const parts = trimmed.split(".");
        return parts.slice(2).join("_") || parts.slice(1).join("_") || "event";
    }
    return trimmed;
}

function mapIntegrationActivity(row: any): InternalActivity {
    const metadata =
        row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};
    const providerValue = typeof metadata.provider === "string" ? metadata.provider : undefined;
    const provider =
        providerValue === "slack" || providerValue === "linear" || providerValue === "jira"
            ? providerValue
            : undefined;
    const outcome = String(metadata.outcome || "success").toLowerCase() === "error" ? "error" : "success";
    const scope = integrationScopeFromEntityType(String(row.entityType || ""));
    const action = normalizeIntegrationAction(String(row.action || ""));
    const summary =
        typeof metadata.summary === "string" && metadata.summary.trim() ? metadata.summary.trim() : undefined;
    const fallbackDescription = [provider ? `[${provider}]` : null, action.replaceAll("_", " ")]
        .filter(Boolean)
        .join(" ");

    return {
        id: `act-integration-${row.id}`,
        type: "integration_event",
        icon: "Globe",
        color: outcome === "error" ? "text-red-500" : "text-cyan-400",
        bgColor: outcome === "error" ? "bg-red-500/10" : "bg-cyan-500/10",
        title: `Integration ${scope.replaceAll("_", " ")}`,
        description: summary || fallbackDescription || "Integration event",
        timestamp: formatRelativeTime(row.createdAt),
        integration: {
            provider,
            scope,
            action,
            outcome,
            summary,
        },
        ts: toTimestamp(row.createdAt),
    };
}

async function fetchIntegrationAudits(limit: number): Promise<any[]> {
    const take = Math.min(Math.max(limit, 1), 200);
    return db
        .select()
        .from(auditLog)
        .where(inArray(auditLog.entityType, INTEGRATION_AUDIT_ENTITY_TYPES as unknown as string[]))
        .orderBy(desc(auditLog.createdAt))
        .limit(take);
}

export const activityRepository = {
    errorMessage,

    async listIntegrationEvents(limit: number): Promise<ActivityItem[]> {
        const take = Math.min(Math.max(limit, 1), 200);
        const audits = await fetchIntegrationAudits(take);
        return audits
            .map((row) => mapIntegrationActivity(row))
            .sort((a, b) => b.ts - a.ts)
            .slice(0, take)
            .map(({ ts: _ts, ...item }) => item);
    },

    async list(limit: number): Promise<ActivityItem[]> {
        const take = Math.min(Math.max(limit, 1), 50);

        const [prs, recentReviews, recentQueue, recentStacks, integrationAudits] = await Promise.all([
            db.query.pullRequests.findMany({
                with: {
                    author: true,
                    repository: true,
                },
                orderBy: [desc(pullRequests.updatedAt)],
                limit: Math.max(8, take),
            }),
            db
                .select({
                    id: reviews.id,
                    createdAt: reviews.createdAt,
                    status: reviews.status,
                    reviewerName: users.name,
                    prNumber: pullRequests.number,
                    prTitle: pullRequests.title,
                    prId: pullRequests.id,
                })
                .from(reviews)
                .leftJoin(users, eq(reviews.userId, users.id))
                .innerJoin(pullRequests, eq(reviews.prId, pullRequests.id))
                .orderBy(desc(reviews.createdAt))
                .limit(Math.max(8, take)),
            db
                .select({
                    id: mergeQueue.id,
                    status: mergeQueue.status,
                    completedAt: mergeQueue.completedAt,
                    createdAt: mergeQueue.createdAt,
                    errorMessage: mergeQueue.errorMessage,
                    prNumber: pullRequests.number,
                    prTitle: pullRequests.title,
                })
                .from(mergeQueue)
                .innerJoin(pullRequests, eq(mergeQueue.prId, pullRequests.id))
                .where(inArray(mergeQueue.status, ["merged", "failed"]))
                .orderBy(desc(mergeQueue.completedAt), desc(mergeQueue.createdAt))
                .limit(Math.max(6, Math.floor(take / 2))),
            db
                .select({
                    id: stacks.id,
                    name: stacks.name,
                    updatedAt: stacks.updatedAt,
                    branchCount: branches.id,
                })
                .from(stacks)
                .leftJoin(branches, eq(branches.stackId, stacks.id))
                .orderBy(desc(stacks.updatedAt))
                .limit(Math.max(4, Math.floor(take / 2))),
            fetchIntegrationAudits(Math.max(10, take)),
        ]);

        const activities: InternalActivity[] = [];

        prs.forEach((pr, index) => activities.push(mapPRActivity(pr, index)));

        for (const review of recentReviews) {
            const ts = toTimestamp(review.createdAt);
            const reviewerName = review.reviewerName || "reviewer";
            const prNumber = review.prNumber || 0;
            const prTitle = review.prTitle || "Untitled PR";
            activities.push({
                id: `act-review-${review.id}`,
                type: "review_requested",
                icon: "MessageSquare",
                color: "text-blue-400",
                bgColor: "bg-blue-500/10",
                title: "Review Submitted",
                description: `@${reviewerName} marked #${prNumber} as ${review.status.replaceAll("_", " ")}`,
                timestamp: formatRelativeTime(review.createdAt),
                pr: {
                    number: prNumber,
                    title: prTitle,
                },
                ts,
            });
        }

        for (const queueItem of recentQueue) {
            const eventDate = queueItem.completedAt || queueItem.createdAt;
            const prNumber = queueItem.prNumber || 0;
            const prTitle = queueItem.prTitle || "Untitled PR";

            if (queueItem.status === "merged") {
                activities.push({
                    id: `act-queue-merged-${queueItem.id}`,
                    type: "pr_merged",
                    icon: "GitMerge",
                    color: "text-green-500",
                    bgColor: "bg-green-500/10",
                    title: "Queue Merge Completed",
                    description: `#${prNumber} merged from queue`,
                    timestamp: formatRelativeTime(eventDate),
                    pr: { number: prNumber, title: prTitle },
                    ts: toTimestamp(eventDate),
                });
            } else {
                activities.push({
                    id: `act-queue-failed-${queueItem.id}`,
                    type: "ai_review",
                    icon: "XCircle",
                    color: "text-red-500",
                    bgColor: "bg-red-500/10",
                    title: "Queue Run Failed",
                    description: queueItem.errorMessage || `#${prNumber} failed merge queue checks`,
                    timestamp: formatRelativeTime(eventDate),
                    pr: { number: prNumber, title: prTitle },
                    details: { critical: 1, warnings: 1, suggestions: 0 },
                    ts: toTimestamp(eventDate),
                });
            }
        }

        const stackMap = new Map<string, { id: string; name: string; updatedAt: unknown; branches: number }>();
        for (const row of recentStacks) {
            const existing = stackMap.get(row.id);
            if (!existing) {
                stackMap.set(row.id, {
                    id: row.id,
                    name: row.name,
                    updatedAt: row.updatedAt,
                    branches: row.branchCount ? 1 : 0,
                });
            } else if (row.branchCount) {
                existing.branches += 1;
            }
        }

        for (const stack of stackMap.values()) {
            activities.push({
                id: `act-stack-${stack.id}`,
                type: "stack_updated",
                icon: "GitBranch",
                color: "text-nexus-500",
                bgColor: "bg-nexus-500/10",
                title: "Stack Updated",
                description: `Stack "${stack.name}" has ${stack.branches} branch${stack.branches === 1 ? "" : "es"}`,
                timestamp: formatRelativeTime(stack.updatedAt),
                stack: {
                    name: stack.name,
                    branches: stack.branches,
                },
                ts: toTimestamp(stack.updatedAt),
            });
        }

        for (const audit of integrationAudits) {
            activities.push(mapIntegrationActivity(audit));
        }

        return activities
            .sort((a, b) => b.ts - a.ts)
            .slice(0, take)
            .map(({ ts: _ts, ...item }) => item);
    },
};
