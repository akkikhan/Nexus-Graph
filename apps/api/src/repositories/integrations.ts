/**
 * NEXUS Repository Layer - Integrations and Notification Delivery
 */

import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, lte } from "drizzle-orm";
import * as nexusDb from "../db/index.js";

const { db } = nexusDb;
const integrationConnections = (nexusDb as any).integrationConnections;
const issueLinks = (nexusDb as any).issueLinks;
const notificationDeliveries = (nexusDb as any).notificationDeliveries;
const notificationDeliveryAttempts = (nexusDb as any).notificationDeliveryAttempts;

type IntegrationProvider = "slack" | "linear" | "jira";
type IntegrationConnectionStatus = "active" | "disabled" | "error";
type IssueLinkStatus = "linked" | "sync_pending" | "sync_failed";
type NotificationDeliveryStatus = "pending" | "retrying" | "delivered" | "failed" | "dead_letter";

const PROVIDERS: IntegrationProvider[] = ["slack", "linear", "jira"];
const ISSUE_LINK_PROVIDERS = new Set<IntegrationProvider>(["linear", "jira"]);
const DELIVERY_RETRYABLE_STATUSES: NotificationDeliveryStatus[] = ["pending", "retrying", "failed"];

const SECRET_FIELD_PATTERN = /(?:token|secret|password|api[_-]?key|authorization|auth[_-]?header)/i;
const SECRET_PATTERNS: RegExp[] = [
    /\bghp_[A-Za-z0-9]{20,}\b/g,
    /\bgho_[A-Za-z0-9]{20,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    /\bglpat-[A-Za-z0-9_\-=]{20,}\b/g,
    /\bsk-[A-Za-z0-9]{20,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[A-Za-z0-9_\-./+=]{8,}['"]?/gi,
];

function redactSecrets(value: string): string {
    return SECRET_PATTERNS.reduce((next, pattern) => next.replace(pattern, "[REDACTED_SECRET]"), value);
}

function sanitizeUnknown(value: unknown, keyHint?: string): unknown {
    if (typeof keyHint === "string" && SECRET_FIELD_PATTERN.test(keyHint)) return "[REDACTED_SECRET]";
    if (typeof value === "string") return redactSecrets(value);
    if (Array.isArray(value)) return value.map((entry) => sanitizeUnknown(entry));
    if (value && typeof value === "object") {
        const sanitized: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            sanitized[key] = sanitizeUnknown(entry, key);
        }
        return sanitized;
    }
    return value;
}

function normalizeProvider(value?: string): IntegrationProvider | null {
    const normalized = (value || "").trim().toLowerCase() as IntegrationProvider;
    return PROVIDERS.includes(normalized) ? normalized : null;
}

function toIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return value;
    return new Date().toISOString();
}

function normalizeConnection(row: any) {
    return {
        id: row.id,
        repoId: row.repoId,
        provider: row.provider,
        status: row.status,
        displayName: row.displayName,
        config: row.config || {},
        tokenRef: row.tokenRef || undefined,
        lastValidatedAt: row.lastValidatedAt ? toIso(row.lastValidatedAt) : undefined,
        lastError: row.lastError || undefined,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
    };
}

function normalizeIssueLink(row: any) {
    return {
        id: row.id,
        repoId: row.repoId,
        prId: row.prId,
        provider: row.provider,
        issueKey: row.issueKey,
        issueTitle: row.issueTitle || undefined,
        issueUrl: row.issueUrl || undefined,
        externalIssueId: row.externalIssueId || undefined,
        status: row.status,
        metadata: row.metadata || {},
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
    };
}

function normalizeDelivery(row: any) {
    return {
        id: row.id,
        connectionId: row.connectionId,
        repoId: row.repoId,
        prId: row.prId || undefined,
        channel: row.channel,
        eventType: row.eventType,
        payload: row.payload || {},
        status: row.status,
        attempts: Number(row.attempts || 0),
        maxAttempts: Number(row.maxAttempts || 0),
        nextAttemptAt: row.nextAttemptAt ? toIso(row.nextAttemptAt) : undefined,
        lastAttemptAt: row.lastAttemptAt ? toIso(row.lastAttemptAt) : undefined,
        deliveredAt: row.deliveredAt ? toIso(row.deliveredAt) : undefined,
        errorMessage: row.errorMessage || undefined,
        correlationId: row.correlationId,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
    };
}

function normalizeAttempt(row: any) {
    return {
        id: row.id,
        deliveryId: row.deliveryId,
        attemptNumber: Number(row.attemptNumber || 0),
        status: row.status,
        errorMessage: row.errorMessage || undefined,
        responseCode: row.responseCode || undefined,
        latencyMs: row.latencyMs || undefined,
        createdAt: toIso(row.createdAt),
    };
}

function computeBackoffMs(attemptNumber: number): number {
    return Math.min(60_000, 2_000 * Math.max(attemptNumber, 1));
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

async function findConnection(connectionId: string) {
    const [row] = await db.select().from(integrationConnections).where(eq(integrationConnections.id, connectionId)).limit(1);
    return row || null;
}

async function findDelivery(deliveryId: string) {
    const [row] = await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, deliveryId)).limit(1);
    return row || null;
}

export const integrationsRepository = {
    errorMessage,

    async createConnection(input: {
        repoId: string;
        provider: string;
        displayName: string;
        status?: IntegrationConnectionStatus;
        config?: Record<string, unknown>;
        tokenRef?: string;
    }) {
        const provider = normalizeProvider(input.provider);
        if (!provider) return { reason: "invalid_provider" as const };

        const [existing] = await db
            .select()
            .from(integrationConnections)
            .where(and(eq(integrationConnections.repoId, input.repoId), eq(integrationConnections.provider, provider)))
            .limit(1);
        if (existing) {
            return {
                reason: "connection_exists" as const,
                connection: normalizeConnection(existing),
            };
        }

        const now = new Date();
        const [inserted] = await db
            .insert(integrationConnections)
            .values({
                repoId: input.repoId,
                provider,
                status: input.status || "active",
                displayName: input.displayName.trim(),
                config: sanitizeUnknown(input.config || {}),
                tokenRef: input.tokenRef ? redactSecrets(input.tokenRef) : null,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        if (!inserted) return { reason: "insert_failed" as const };
        return {
            reason: "ok" as const,
            connection: normalizeConnection(inserted),
        };
    },

    async listConnections(filters: {
        repoId?: string;
        provider?: string;
        status?: IntegrationConnectionStatus;
        limit?: number;
        offset?: number;
    }) {
        const conditions = [];
        if (filters.repoId) conditions.push(eq(integrationConnections.repoId, filters.repoId));
        const provider = normalizeProvider(filters.provider);
        if (filters.provider && provider) conditions.push(eq(integrationConnections.provider, provider));
        if (filters.status) conditions.push(eq(integrationConnections.status, filters.status));

        const rows = await db
            .select()
            .from(integrationConnections)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(integrationConnections.updatedAt))
            .limit(Math.min(Math.max(filters.limit ?? 20, 1), 100))
            .offset(Math.max(filters.offset ?? 0, 0));

        return rows.map(normalizeConnection);
    },

    async createIssueLink(input: {
        repoId: string;
        prId: string;
        provider: string;
        issueKey: string;
        issueTitle?: string;
        issueUrl?: string;
        externalIssueId?: string;
        status?: IssueLinkStatus;
        metadata?: Record<string, unknown>;
    }) {
        const provider = normalizeProvider(input.provider);
        if (!provider || !ISSUE_LINK_PROVIDERS.has(provider)) {
            return { reason: "invalid_issue_provider" as const };
        }

        const [connection] = await db
            .select()
            .from(integrationConnections)
            .where(
                and(
                    eq(integrationConnections.repoId, input.repoId),
                    eq(integrationConnections.provider, provider),
                    eq(integrationConnections.status, "active")
                )
            )
            .limit(1);
        if (!connection) return { reason: "connection_not_configured" as const };

        const [existing] = await db
            .select()
            .from(issueLinks)
            .where(and(eq(issueLinks.prId, input.prId), eq(issueLinks.provider, provider), eq(issueLinks.issueKey, input.issueKey)))
            .limit(1);
        if (existing) {
            return {
                reason: "issue_link_exists" as const,
                issueLink: normalizeIssueLink(existing),
            };
        }

        const now = new Date();
        const [inserted] = await db
            .insert(issueLinks)
            .values({
                repoId: input.repoId,
                prId: input.prId,
                provider,
                issueKey: input.issueKey.trim(),
                issueTitle: input.issueTitle || null,
                issueUrl: input.issueUrl || null,
                externalIssueId: input.externalIssueId || null,
                status: input.status || "linked",
                metadata: sanitizeUnknown(input.metadata || {}),
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        if (!inserted) return { reason: "insert_failed" as const };
        return {
            reason: "ok" as const,
            issueLink: normalizeIssueLink(inserted),
        };
    },

    async listIssueLinks(filters: {
        repoId?: string;
        prId?: string;
        provider?: string;
        status?: IssueLinkStatus;
        limit?: number;
        offset?: number;
    }) {
        const conditions = [];
        if (filters.repoId) conditions.push(eq(issueLinks.repoId, filters.repoId));
        if (filters.prId) conditions.push(eq(issueLinks.prId, filters.prId));
        const provider = normalizeProvider(filters.provider);
        if (filters.provider && provider) conditions.push(eq(issueLinks.provider, provider));
        if (filters.status) conditions.push(eq(issueLinks.status, filters.status));

        const rows = await db
            .select()
            .from(issueLinks)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(issueLinks.updatedAt))
            .limit(Math.min(Math.max(filters.limit ?? 20, 1), 100))
            .offset(Math.max(filters.offset ?? 0, 0));

        return rows.map(normalizeIssueLink);
    },

    async enqueueNotification(input: {
        connectionId: string;
        repoId: string;
        prId?: string;
        channel: string;
        eventType: string;
        payload?: Record<string, unknown>;
        maxAttempts?: number;
        correlationId?: string;
    }) {
        const connection = await findConnection(input.connectionId);
        if (!connection) return { reason: "connection_not_found" as const };
        if (connection.status !== "active") return { reason: "connection_inactive" as const };
        if (connection.provider !== "slack") return { reason: "unsupported_notification_provider" as const };
        if (connection.repoId !== input.repoId) return { reason: "connection_repo_mismatch" as const };

        const maxAttempts = Math.min(Math.max(Number(input.maxAttempts ?? 3), 1), 10);
        const correlationId = (input.correlationId || "").trim() || `notif-${randomUUID()}`;
        const now = new Date();

        const [inserted] = await db
            .insert(notificationDeliveries)
            .values({
                connectionId: input.connectionId,
                repoId: input.repoId,
                prId: input.prId || null,
                channel: input.channel.trim(),
                eventType: input.eventType.trim(),
                payload: sanitizeUnknown(input.payload || {}),
                status: "pending",
                attempts: 0,
                maxAttempts,
                nextAttemptAt: now,
                correlationId,
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        if (!inserted) return { reason: "insert_failed" as const };

        return {
            reason: "ok" as const,
            delivery: normalizeDelivery(inserted),
        };
    },

    async listNotifications(filters: {
        repoId?: string;
        connectionId?: string;
        status?: NotificationDeliveryStatus;
        limit?: number;
        offset?: number;
    }) {
        const conditions = [];
        if (filters.repoId) conditions.push(eq(notificationDeliveries.repoId, filters.repoId));
        if (filters.connectionId) conditions.push(eq(notificationDeliveries.connectionId, filters.connectionId));
        if (filters.status) conditions.push(eq(notificationDeliveries.status, filters.status));

        const rows = await db
            .select()
            .from(notificationDeliveries)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(notificationDeliveries.createdAt))
            .limit(Math.min(Math.max(filters.limit ?? 20, 1), 100))
            .offset(Math.max(filters.offset ?? 0, 0));

        return rows.map(normalizeDelivery);
    },

    async getNotification(deliveryId: string) {
        const delivery = await findDelivery(deliveryId);
        if (!delivery) return null;

        const attempts = await db
            .select()
            .from(notificationDeliveryAttempts)
            .where(eq(notificationDeliveryAttempts.deliveryId, deliveryId))
            .orderBy(asc(notificationDeliveryAttempts.attemptNumber));

        return {
            delivery: normalizeDelivery(delivery),
            attempts: attempts.map(normalizeAttempt),
        };
    },

    async deliverNotification(
        deliveryId: string,
        input: {
            simulateFailure?: boolean;
            responseCode?: number;
            latencyMs?: number;
            errorMessage?: string;
        } = {}
    ) {
        const delivery = await findDelivery(deliveryId);
        if (!delivery) return { reason: "delivery_not_found" as const };
        if (delivery.status === "delivered" || delivery.status === "dead_letter") {
            return {
                reason: "terminal_status" as const,
                delivery: normalizeDelivery(delivery),
            };
        }

        const attemptNumber = Number(delivery.attempts || 0) + 1;
        const shouldFail = input.simulateFailure === true || Boolean((delivery.payload || {})["simulateFailure"]);
        const now = new Date();
        const responseCode = Number(input.responseCode || (shouldFail ? 500 : 200));
        const latencyMs = Math.max(Number(input.latencyMs || (shouldFail ? 350 : 120)), 0);

        let updatedDelivery: any = null;
        let attemptRow: any = null;

        await db.transaction(async (tx: any) => {
            if (shouldFail) {
                const deadLetter = attemptNumber >= Number(delivery.maxAttempts || 3);
                const nextStatus: NotificationDeliveryStatus = deadLetter ? "dead_letter" : "retrying";
                const nextAttemptAt = deadLetter ? now : new Date(now.getTime() + computeBackoffMs(attemptNumber));
                const errorMessage = redactSecrets((input.errorMessage || "Provider delivery failed").trim());

                const [updated] = await tx
                    .update(notificationDeliveries)
                    .set({
                        status: nextStatus,
                        attempts: attemptNumber,
                        lastAttemptAt: now,
                        nextAttemptAt,
                        errorMessage,
                        updatedAt: now,
                    })
                    .where(eq(notificationDeliveries.id, deliveryId))
                    .returning();

                const [attempt] = await tx
                    .insert(notificationDeliveryAttempts)
                    .values({
                        deliveryId,
                        attemptNumber,
                        status: deadLetter ? "dead_letter" : "failed",
                        errorMessage,
                        responseCode,
                        latencyMs,
                        createdAt: now,
                    })
                    .returning();

                updatedDelivery = updated || null;
                attemptRow = attempt || null;
                return;
            }

            const [updated] = await tx
                .update(notificationDeliveries)
                .set({
                    status: "delivered",
                    attempts: attemptNumber,
                    lastAttemptAt: now,
                    deliveredAt: now,
                    errorMessage: null,
                    updatedAt: now,
                })
                .where(eq(notificationDeliveries.id, deliveryId))
                .returning();

            const [attempt] = await tx
                .insert(notificationDeliveryAttempts)
                .values({
                    deliveryId,
                    attemptNumber,
                    status: "delivered",
                    errorMessage: null,
                    responseCode,
                    latencyMs,
                    createdAt: now,
                })
                .returning();

            updatedDelivery = updated || null;
            attemptRow = attempt || null;
        });

        if (!updatedDelivery || !attemptRow) return { reason: "update_failed" as const };
        return {
            reason: shouldFail ? "failed" as const : "delivered" as const,
            delivery: normalizeDelivery(updatedDelivery),
            attempt: normalizeAttempt(attemptRow),
        };
    },

    async retryDueNotifications(limit = 20) {
        const now = new Date();
        const due = await db
            .select()
            .from(notificationDeliveries)
            .where(
                and(
                    inArray(notificationDeliveries.status, DELIVERY_RETRYABLE_STATUSES),
                    lte(notificationDeliveries.nextAttemptAt, now)
                )
            )
            .orderBy(asc(notificationDeliveries.nextAttemptAt))
            .limit(Math.min(Math.max(limit, 1), 100));

        const outcomes: Array<{ id: string; reason: string; status?: NotificationDeliveryStatus }> = [];
        for (const row of due) {
            const result = await this.deliverNotification(row.id);
            outcomes.push({
                id: row.id,
                reason: result.reason,
                status: (result as any).delivery?.status,
            });
        }

        return {
            processed: due.length,
            outcomes,
        };
    },

    async metrics(repoId?: string) {
        const connectionConditions = [];
        const issueConditions = [];
        const deliveryConditions = [];
        if (repoId) {
            connectionConditions.push(eq(integrationConnections.repoId, repoId));
            issueConditions.push(eq(issueLinks.repoId, repoId));
            deliveryConditions.push(eq(notificationDeliveries.repoId, repoId));
        }

        const [connectionsCountRow] = await db
            .select({ value: count() })
            .from(integrationConnections)
            .where(connectionConditions.length > 0 ? and(...connectionConditions) : undefined);
        const [issueLinksCountRow] = await db
            .select({ value: count() })
            .from(issueLinks)
            .where(issueConditions.length > 0 ? and(...issueConditions) : undefined);
        const [deliveriesCountRow] = await db
            .select({ value: count() })
            .from(notificationDeliveries)
            .where(deliveryConditions.length > 0 ? and(...deliveryConditions) : undefined);

        const deliveredRows = await db
            .select({
                status: notificationDeliveries.status,
                value: count(),
            })
            .from(notificationDeliveries)
            .where(deliveryConditions.length > 0 ? and(...deliveryConditions) : undefined)
            .groupBy(notificationDeliveries.status);

        const providerRows = await db
            .select({
                provider: integrationConnections.provider,
                value: count(),
            })
            .from(integrationConnections)
            .where(connectionConditions.length > 0 ? and(...connectionConditions) : undefined)
            .groupBy(integrationConnections.provider);

        const retryQueueRows = await db
            .select({
                value: count(),
            })
            .from(notificationDeliveries)
            .where(
                and(
                    deliveryConditions.length > 0 ? and(...deliveryConditions) : undefined,
                    inArray(notificationDeliveries.status, ["pending", "retrying"])
                )
            );

        const [oldestDue] = await db
            .select({ nextAttemptAt: notificationDeliveries.nextAttemptAt })
            .from(notificationDeliveries)
            .where(
                and(
                    deliveryConditions.length > 0 ? and(...deliveryConditions) : undefined,
                    inArray(notificationDeliveries.status, ["pending", "retrying"])
                )
            )
            .orderBy(asc(notificationDeliveries.nextAttemptAt))
            .limit(1);

        const statusCounts: Record<string, number> = {};
        for (const row of deliveredRows) {
            statusCounts[row.status] = Number(row.value || 0);
        }

        const providerCounts: Record<string, number> = {};
        for (const row of providerRows) {
            providerCounts[row.provider] = Number(row.value || 0);
        }

        const delivered = statusCounts.delivered || 0;
        const failed = (statusCounts.failed || 0) + (statusCounts.dead_letter || 0);
        const denominator = delivered + failed;

        return {
            totals: {
                connections: Number(connectionsCountRow?.value || 0),
                issueLinks: Number(issueLinksCountRow?.value || 0),
                deliveries: Number(deliveriesCountRow?.value || 0),
                pending: statusCounts.pending || 0,
                retrying: statusCounts.retrying || 0,
                delivered,
                failed: statusCounts.failed || 0,
                deadLetter: statusCounts.dead_letter || 0,
            },
            providers: providerCounts,
            retryQueue: {
                queued: Number(retryQueueRows[0]?.value || 0),
                oldestDueAt: oldestDue?.nextAttemptAt ? toIso(oldestDue.nextAttemptAt) : undefined,
            },
            successRatePct: denominator > 0 ? Math.round((delivered / denominator) * 100) : 100,
            generatedAt: new Date().toISOString(),
        };
    },
};
