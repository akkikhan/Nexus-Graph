/**
 * NEXUS Repository Layer - Integrations and Notification Delivery
 */

import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import * as nexusDb from "../db/index.js";

const { db } = nexusDb;
const integrationConnections = (nexusDb as any).integrationConnections;
const issueLinks = (nexusDb as any).issueLinks;
const notificationDeliveries = (nexusDb as any).notificationDeliveries;
const notificationDeliveryAttempts = (nexusDb as any).notificationDeliveryAttempts;
const integrationWebhookEvents = (nexusDb as any).integrationWebhookEvents;
const integrationWebhookAuthEvents = (nexusDb as any).integrationWebhookAuthEvents;
const issueLinkSyncEvents = (nexusDb as any).issueLinkSyncEvents;

type IntegrationProvider = "slack" | "linear" | "jira";
type IntegrationConnectionStatus = "active" | "disabled" | "error";
type IssueLinkStatus = "linked" | "sync_pending" | "sync_failed";
type NotificationDeliveryStatus = "pending" | "retrying" | "delivered" | "failed" | "dead_letter";
type IntegrationWebhookStatus = "received" | "processed" | "failed" | "dead_letter";
type IntegrationWebhookAuthOutcome = "rejected" | "config_error";
type IssueLinkSyncStatus = "pending" | "synced" | "failed" | "dead_letter";
type IntegrationAlertSeverity = "warning" | "critical";
type IntegrationAlertStatus = "healthy" | "warning" | "critical";

const PROVIDERS: IntegrationProvider[] = ["slack", "linear", "jira"];
const ISSUE_LINK_PROVIDERS = new Set<IntegrationProvider>(["linear", "jira"]);
const DELIVERY_RETRYABLE_STATUSES: NotificationDeliveryStatus[] = ["pending", "retrying", "failed"];
const WEBHOOK_RETRYABLE_STATUSES: IntegrationWebhookStatus[] = ["received", "failed"];
const ISSUE_LINK_RETRYABLE_STATUSES: IssueLinkStatus[] = ["sync_pending", "sync_failed"];

const RAW_ISSUE_LINK_MAX_SYNC_ATTEMPTS = Number(process.env.NEXUS_ISSUE_LINK_MAX_SYNC_ATTEMPTS ?? 3);
const ISSUE_LINK_MAX_SYNC_ATTEMPTS = Number.isFinite(RAW_ISSUE_LINK_MAX_SYNC_ATTEMPTS) && RAW_ISSUE_LINK_MAX_SYNC_ATTEMPTS > 0
    ? Math.floor(RAW_ISSUE_LINK_MAX_SYNC_ATTEMPTS)
    : 3;
const RAW_INTEGRATION_ALERT_MIN_SUCCESS_RATE_PCT = Number(process.env.NEXUS_INTEGRATION_ALERT_MIN_SUCCESS_RATE_PCT ?? 95);
const DEFAULT_INTEGRATION_ALERT_MIN_SUCCESS_RATE_PCT =
    Number.isFinite(RAW_INTEGRATION_ALERT_MIN_SUCCESS_RATE_PCT) && RAW_INTEGRATION_ALERT_MIN_SUCCESS_RATE_PCT >= 1
        ? Math.min(Math.max(Math.round(RAW_INTEGRATION_ALERT_MIN_SUCCESS_RATE_PCT), 1), 100)
        : 95;
const RAW_INTEGRATION_ALERT_MAX_RETRY_AGE_SECONDS = Number(process.env.NEXUS_INTEGRATION_ALERT_MAX_RETRY_AGE_SECONDS ?? 300);
const DEFAULT_INTEGRATION_ALERT_MAX_RETRY_AGE_SECONDS =
    Number.isFinite(RAW_INTEGRATION_ALERT_MAX_RETRY_AGE_SECONDS) && RAW_INTEGRATION_ALERT_MAX_RETRY_AGE_SECONDS >= 30
        ? Math.min(Math.max(Math.round(RAW_INTEGRATION_ALERT_MAX_RETRY_AGE_SECONDS), 30), 86_400)
        : 300;
const RAW_WEBHOOK_AUTH_ALERT_WINDOW_MINUTES = Number(process.env.NEXUS_WEBHOOK_AUTH_ALERT_WINDOW_MINUTES ?? 60);
const DEFAULT_WEBHOOK_AUTH_ALERT_WINDOW_MINUTES =
    Number.isFinite(RAW_WEBHOOK_AUTH_ALERT_WINDOW_MINUTES) && RAW_WEBHOOK_AUTH_ALERT_WINDOW_MINUTES >= 5
        ? Math.min(Math.max(Math.round(RAW_WEBHOOK_AUTH_ALERT_WINDOW_MINUTES), 5), 1_440)
        : 60;
const RAW_WEBHOOK_AUTH_ALERT_MAX_FAILURES = Number(process.env.NEXUS_WEBHOOK_AUTH_ALERT_MAX_FAILURES ?? 5);
const DEFAULT_WEBHOOK_AUTH_ALERT_MAX_FAILURES =
    Number.isFinite(RAW_WEBHOOK_AUTH_ALERT_MAX_FAILURES) && RAW_WEBHOOK_AUTH_ALERT_MAX_FAILURES >= 0
        ? Math.min(Math.max(Math.round(RAW_WEBHOOK_AUTH_ALERT_MAX_FAILURES), 0), 100_000)
        : 5;
const RAW_WEBHOOK_AUTH_ALERT_MAX_FAILURE_RATE_PCT = Number(process.env.NEXUS_WEBHOOK_AUTH_ALERT_MAX_FAILURE_RATE_PCT ?? 5);
const DEFAULT_WEBHOOK_AUTH_ALERT_MAX_FAILURE_RATE_PCT =
    Number.isFinite(RAW_WEBHOOK_AUTH_ALERT_MAX_FAILURE_RATE_PCT) && RAW_WEBHOOK_AUTH_ALERT_MAX_FAILURE_RATE_PCT >= 0
        ? Math.min(Math.max(Math.round(RAW_WEBHOOK_AUTH_ALERT_MAX_FAILURE_RATE_PCT), 0), 100)
        : 5;

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

function normalizeWebhookEvent(row: any) {
    return {
        id: row.id,
        provider: row.provider,
        repoId: row.repoId || undefined,
        eventType: row.eventType,
        externalEventId: row.externalEventId,
        payload: row.payload || {},
        status: row.status,
        attempts: Number(row.attempts || 0),
        maxAttempts: Number(row.maxAttempts || 0),
        nextAttemptAt: row.nextAttemptAt ? toIso(row.nextAttemptAt) : undefined,
        lastAttemptAt: row.lastAttemptAt ? toIso(row.lastAttemptAt) : undefined,
        processedAt: row.processedAt ? toIso(row.processedAt) : undefined,
        errorMessage: row.errorMessage || undefined,
        correlationId: row.correlationId,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
    };
}

function normalizeIssueLinkSyncEvent(row: any) {
    return {
        id: row.id,
        issueLinkId: row.issueLinkId,
        provider: row.provider,
        status: row.status,
        attemptNumber: Number(row.attemptNumber || 0),
        errorMessage: row.errorMessage || undefined,
        responseCode: row.responseCode || undefined,
        latencyMs: row.latencyMs || undefined,
        details: row.details || {},
        createdAt: toIso(row.createdAt),
    };
}

function normalizeWebhookAuthEvent(row: any) {
    return {
        id: row.id,
        provider: row.provider,
        repoId: row.repoId || undefined,
        eventType: row.eventType,
        externalEventId: row.externalEventId,
        outcome: row.outcome,
        reason: row.reason,
        statusCode: Number(row.statusCode || 0),
        signaturePresent: Boolean(row.signaturePresent),
        timestampPresent: Boolean(row.timestampPresent),
        requestTimestamp: row.requestTimestamp ? toIso(row.requestTimestamp) : undefined,
        requestSkewSeconds:
            typeof row.requestSkewSeconds === "number" ? Number(row.requestSkewSeconds) : undefined,
        details: row.details || {},
        createdAt: toIso(row.createdAt),
    };
}

function computeBackoffMs(attemptNumber: number): number {
    return Math.min(60_000, 2_000 * Math.max(attemptNumber, 1));
}

function clampInteger(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(Math.round(value), min), max);
}

function retryAgeSeconds(now: Date, dueAt?: string): number | null {
    if (!dueAt) return null;
    const parsed = Date.parse(dueAt);
    if (!Number.isFinite(parsed)) return null;
    const ageMs = now.getTime() - parsed;
    return Math.max(Math.round(ageMs / 1000), 0);
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

async function findWebhookEvent(webhookEventId: string) {
    const [row] = await db.select().from(integrationWebhookEvents).where(eq(integrationWebhookEvents.id, webhookEventId)).limit(1);
    return row || null;
}

async function findIssueLink(issueLinkId: string) {
    const [row] = await db.select().from(issueLinks).where(eq(issueLinks.id, issueLinkId)).limit(1);
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
                status: input.status || "sync_pending",
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

    async listIssueLinkSyncEvents(issueLinkId: string, limit = 50) {
        const events = await db
            .select()
            .from(issueLinkSyncEvents)
            .where(eq(issueLinkSyncEvents.issueLinkId, issueLinkId))
            .orderBy(asc(issueLinkSyncEvents.attemptNumber))
            .limit(Math.min(Math.max(limit, 1), 200));
        return events.map(normalizeIssueLinkSyncEvent);
    },

    async syncIssueLinkBacklink(
        issueLinkId: string,
        input: {
            simulateFailure?: boolean;
            responseCode?: number;
            latencyMs?: number;
            errorMessage?: string;
            details?: Record<string, unknown>;
        } = {}
    ) {
        const link = await findIssueLink(issueLinkId);
        if (!link) return { reason: "issue_link_not_found" as const };
        if (!ISSUE_LINK_PROVIDERS.has(link.provider as IntegrationProvider)) {
            return { reason: "invalid_issue_provider" as const, issueLink: normalizeIssueLink(link) };
        }

        const [latestAttempt] = await db
            .select()
            .from(issueLinkSyncEvents)
            .where(eq(issueLinkSyncEvents.issueLinkId, issueLinkId))
            .orderBy(desc(issueLinkSyncEvents.attemptNumber))
            .limit(1);

        if (latestAttempt?.status === "dead_letter") {
            return {
                reason: "sync_dead_lettered" as const,
                issueLink: normalizeIssueLink(link),
                syncEvent: normalizeIssueLinkSyncEvent(latestAttempt),
            };
        }

        const attemptNumber = Number(latestAttempt?.attemptNumber || 0) + 1;
        const shouldFail = input.simulateFailure === true;
        const now = new Date();
        const responseCode = Number(input.responseCode || (shouldFail ? 502 : 200));
        const latencyMs = Math.max(Number(input.latencyMs || (shouldFail ? 410 : 140)), 0);

        let updatedLink: any = null;
        let createdSyncEvent: any = null;

        await db.transaction(async (tx: any) => {
            if (shouldFail) {
                const deadLetter = attemptNumber >= ISSUE_LINK_MAX_SYNC_ATTEMPTS;
                const nextStatus: IssueLinkSyncStatus = deadLetter ? "dead_letter" : "failed";
                const safeError = redactSecrets((input.errorMessage || "Issue back-link sync failed").trim());

                const [event] = await tx
                    .insert(issueLinkSyncEvents)
                    .values({
                        issueLinkId,
                        provider: link.provider,
                        status: nextStatus,
                        attemptNumber,
                        errorMessage: safeError,
                        responseCode,
                        latencyMs,
                        details: sanitizeUnknown(input.details || {}),
                        createdAt: now,
                    })
                    .returning();

                const [updated] = await tx
                    .update(issueLinks)
                    .set({
                        status: "sync_failed",
                        metadata: sanitizeUnknown({
                            ...(link.metadata || {}),
                            lastSync: {
                                at: now.toISOString(),
                                status: nextStatus,
                                attemptNumber,
                                errorMessage: safeError,
                                responseCode,
                                latencyMs,
                            },
                        }),
                        updatedAt: now,
                    })
                    .where(eq(issueLinks.id, issueLinkId))
                    .returning();

                createdSyncEvent = event || null;
                updatedLink = updated || null;
                return;
            }

            const [event] = await tx
                .insert(issueLinkSyncEvents)
                .values({
                    issueLinkId,
                    provider: link.provider,
                    status: "synced",
                    attemptNumber,
                    errorMessage: null,
                    responseCode,
                    latencyMs,
                    details: sanitizeUnknown(input.details || {}),
                    createdAt: now,
                })
                .returning();

            const [updated] = await tx
                .update(issueLinks)
                .set({
                    status: "linked",
                    metadata: sanitizeUnknown({
                        ...(link.metadata || {}),
                        lastSync: {
                            at: now.toISOString(),
                            status: "synced",
                            attemptNumber,
                            responseCode,
                            latencyMs,
                        },
                    }),
                    updatedAt: now,
                })
                .where(eq(issueLinks.id, issueLinkId))
                .returning();

            createdSyncEvent = event || null;
            updatedLink = updated || null;
        });

        if (!updatedLink || !createdSyncEvent) return { reason: "sync_update_failed" as const };
        return {
            reason: shouldFail ? "sync_failed" as const : "synced" as const,
            issueLink: normalizeIssueLink(updatedLink),
            syncEvent: normalizeIssueLinkSyncEvent(createdSyncEvent),
        };
    },

    async retryIssueLinkSyncs(limit = 20) {
        const rows = await db
            .select()
            .from(issueLinks)
            .where(inArray(issueLinks.status, ISSUE_LINK_RETRYABLE_STATUSES))
            .orderBy(asc(issueLinks.updatedAt))
            .limit(Math.min(Math.max(limit, 1), 100));

        const outcomes: Array<{ id: string; reason: string; status?: IssueLinkStatus }> = [];
        for (const row of rows) {
            const result = await this.syncIssueLinkBacklink(row.id);
            outcomes.push({
                id: row.id,
                reason: result.reason,
                status: (result as any).issueLink?.status,
            });
        }

        return {
            processed: rows.length,
            outcomes,
        };
    },

    async ingestWebhook(input: {
        provider: string;
        eventType: string;
        externalEventId: string;
        repoId?: string;
        payload?: Record<string, unknown>;
        maxAttempts?: number;
        correlationId?: string;
    }) {
        const provider = normalizeProvider(input.provider);
        if (!provider) return { reason: "invalid_provider" as const };

        const [existing] = await db
            .select()
            .from(integrationWebhookEvents)
            .where(
                and(
                    eq(integrationWebhookEvents.provider, provider),
                    eq(integrationWebhookEvents.externalEventId, input.externalEventId.trim())
                )
            )
            .limit(1);
        if (existing) {
            return {
                reason: "webhook_exists" as const,
                event: normalizeWebhookEvent(existing),
            };
        }

        const maxAttempts = Math.min(Math.max(Number(input.maxAttempts ?? 3), 1), 10);
        const correlationId = (input.correlationId || "").trim() || `wh-${randomUUID()}`;
        const now = new Date();
        const [inserted] = await db
            .insert(integrationWebhookEvents)
            .values({
                provider,
                repoId: input.repoId || null,
                eventType: input.eventType.trim(),
                externalEventId: input.externalEventId.trim(),
                payload: sanitizeUnknown(input.payload || {}),
                status: "received",
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
            event: normalizeWebhookEvent(inserted),
        };
    },

    async listWebhookEvents(filters: {
        provider?: string;
        repoId?: string;
        status?: IntegrationWebhookStatus;
        limit?: number;
        offset?: number;
    }) {
        const conditions = [];
        const provider = normalizeProvider(filters.provider);
        if (filters.provider && provider) conditions.push(eq(integrationWebhookEvents.provider, provider));
        if (filters.repoId) conditions.push(eq(integrationWebhookEvents.repoId, filters.repoId));
        if (filters.status) conditions.push(eq(integrationWebhookEvents.status, filters.status));

        const rows = await db
            .select()
            .from(integrationWebhookEvents)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(integrationWebhookEvents.createdAt))
            .limit(Math.min(Math.max(filters.limit ?? 20, 1), 100))
            .offset(Math.max(filters.offset ?? 0, 0));

        return rows.map(normalizeWebhookEvent);
    },

    async listWebhookAuthEvents(filters: {
        provider?: string;
        repoId?: string;
        outcome?: IntegrationWebhookAuthOutcome;
        reason?: string;
        sinceMinutes?: number;
        limit?: number;
        offset?: number;
    }) {
        const conditions = [];
        const provider = normalizeProvider(filters.provider);
        if (filters.provider && provider) conditions.push(eq(integrationWebhookAuthEvents.provider, provider));
        if (filters.repoId) conditions.push(eq(integrationWebhookAuthEvents.repoId, filters.repoId));
        if (filters.outcome) conditions.push(eq(integrationWebhookAuthEvents.outcome, filters.outcome));
        if (filters.reason) conditions.push(eq(integrationWebhookAuthEvents.reason, filters.reason.trim()));
        if (filters.sinceMinutes && Number.isFinite(filters.sinceMinutes) && filters.sinceMinutes > 0) {
            const since = new Date(Date.now() - clampInteger(filters.sinceMinutes, 1, 43_200) * 60_000);
            conditions.push(gte(integrationWebhookAuthEvents.createdAt, since));
        }

        const rows = await db
            .select()
            .from(integrationWebhookAuthEvents)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(integrationWebhookAuthEvents.createdAt))
            .limit(Math.min(Math.max(filters.limit ?? 50, 1), 200))
            .offset(Math.max(filters.offset ?? 0, 0));

        return rows.map(normalizeWebhookAuthEvent);
    },

    async processWebhookEvent(
        webhookEventId: string,
        input: {
            simulateFailure?: boolean;
            responseCode?: number;
            latencyMs?: number;
            errorMessage?: string;
        } = {}
    ) {
        const event = await findWebhookEvent(webhookEventId);
        if (!event) return { reason: "webhook_not_found" as const };
        if (event.status === "processed" || event.status === "dead_letter") {
            return {
                reason: "terminal_status" as const,
                event: normalizeWebhookEvent(event),
            };
        }

        const attemptNumber = Number(event.attempts || 0) + 1;
        const shouldFail = input.simulateFailure === true || Boolean((event.payload || {})["simulateFailure"]);
        const now = new Date();
        const responseCode = Number(input.responseCode || (shouldFail ? 500 : 200));
        const latencyMs = Math.max(Number(input.latencyMs || (shouldFail ? 300 : 100)), 0);
        const patch: Record<string, unknown> = {
            attempts: attemptNumber,
            lastAttemptAt: now,
            updatedAt: now,
        };

        if (shouldFail) {
            const deadLetter = attemptNumber >= Number(event.maxAttempts || 3);
            patch.status = deadLetter ? "dead_letter" : "failed";
            patch.nextAttemptAt = deadLetter ? now : new Date(now.getTime() + computeBackoffMs(attemptNumber));
            patch.errorMessage = redactSecrets((input.errorMessage || "Webhook processing failed").trim());
            patch.payload = sanitizeUnknown({
                ...(event.payload || {}),
                lastAttempt: {
                    at: now.toISOString(),
                    responseCode,
                    latencyMs,
                },
            });
        } else {
            patch.status = "processed";
            patch.processedAt = now;
            patch.errorMessage = null;
            patch.payload = sanitizeUnknown({
                ...(event.payload || {}),
                lastAttempt: {
                    at: now.toISOString(),
                    responseCode,
                    latencyMs,
                },
            });
        }

        const [updated] = await db
            .update(integrationWebhookEvents)
            .set(patch)
            .where(eq(integrationWebhookEvents.id, webhookEventId))
            .returning();
        if (!updated) return { reason: "update_failed" as const };

        return {
            reason: shouldFail ? "failed" as const : "processed" as const,
            event: normalizeWebhookEvent(updated),
        };
    },

    async retryDueWebhookEvents(limit = 20) {
        const now = new Date();
        const due = await db
            .select()
            .from(integrationWebhookEvents)
            .where(
                and(
                    inArray(integrationWebhookEvents.status, WEBHOOK_RETRYABLE_STATUSES),
                    lte(integrationWebhookEvents.nextAttemptAt, now)
                )
            )
            .orderBy(asc(integrationWebhookEvents.nextAttemptAt))
            .limit(Math.min(Math.max(limit, 1), 100));

        const outcomes: Array<{ id: string; reason: string; status?: IntegrationWebhookStatus }> = [];
        for (const row of due) {
            const result = await this.processWebhookEvent(row.id);
            outcomes.push({
                id: row.id,
                reason: result.reason,
                status: (result as any).event?.status,
            });
        }

        return {
            processed: due.length,
            outcomes,
        };
    },

    async handleSlackActionCallback(input: {
        externalEventId: string;
        repoId?: string;
        teamId: string;
        channelId?: string;
        userId?: string;
        actionType: string;
        payload?: Record<string, unknown>;
        correlationId?: string;
    }) {
        const ingestion = await this.ingestWebhook({
            provider: "slack",
            eventType: `slack.action.${input.actionType.trim()}`,
            externalEventId: input.externalEventId,
            repoId: input.repoId,
            payload: {
                teamId: input.teamId,
                channelId: input.channelId,
                userId: input.userId,
                actionType: input.actionType,
                ...(input.payload || {}),
            },
            correlationId: input.correlationId,
        });

        if (ingestion.reason === "webhook_exists") {
            return {
                reason: "duplicate" as const,
                event: ingestion.event,
            };
        }
        if (ingestion.reason !== "ok") return ingestion;

        const processing = await this.processWebhookEvent(ingestion.event.id);
        return {
            reason: "ok" as const,
            event: ingestion.event,
            processingReason: processing.reason,
            processedEvent: (processing as any).event || undefined,
        };
    },

    async recordWebhookAuthFailure(input: {
        provider: string;
        repoId?: string;
        eventType: string;
        externalEventId: string;
        outcome?: IntegrationWebhookAuthOutcome;
        reason: string;
        statusCode: number;
        signaturePresent?: boolean;
        timestampPresent?: boolean;
        requestTimestampSeconds?: number;
        requestSkewSeconds?: number;
        details?: Record<string, unknown>;
    }) {
        const provider = normalizeProvider(input.provider);
        if (!provider) return { reason: "invalid_provider" as const };

        const now = new Date();
        const requestTimestamp =
            Number.isFinite(Number(input.requestTimestampSeconds)) && Number(input.requestTimestampSeconds) > 0
                ? new Date(Number(input.requestTimestampSeconds) * 1000)
                : null;

        const [inserted] = await db
            .insert(integrationWebhookAuthEvents)
            .values({
                provider,
                repoId: input.repoId || null,
                eventType: input.eventType.trim(),
                externalEventId: input.externalEventId.trim(),
                outcome: input.outcome || "rejected",
                reason: input.reason.trim(),
                statusCode: clampInteger(Number(input.statusCode), 100, 599),
                signaturePresent: input.signaturePresent === true,
                timestampPresent: input.timestampPresent === true,
                requestTimestamp,
                requestSkewSeconds:
                    Number.isFinite(Number(input.requestSkewSeconds))
                        ? clampInteger(Number(input.requestSkewSeconds), -31_536_000, 31_536_000)
                        : null,
                details: sanitizeUnknown(input.details || {}),
                createdAt: now,
            })
            .returning();

        if (!inserted) return { reason: "insert_failed" as const };
        return {
            reason: "ok" as const,
            event: normalizeWebhookAuthEvent(inserted),
        };
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
        const webhookConditions = [];
        const webhookAuthConditions = [];
        if (repoId) {
            connectionConditions.push(eq(integrationConnections.repoId, repoId));
            issueConditions.push(eq(issueLinks.repoId, repoId));
            deliveryConditions.push(eq(notificationDeliveries.repoId, repoId));
            webhookConditions.push(eq(integrationWebhookEvents.repoId, repoId));
            webhookAuthConditions.push(eq(integrationWebhookAuthEvents.repoId, repoId));
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
        const [webhookEventsCountRow] = await db
            .select({ value: count() })
            .from(integrationWebhookEvents)
            .where(webhookConditions.length > 0 ? and(...webhookConditions) : undefined);
        const [issueSyncAttemptsCountRow] = await db
            .select({ value: count() })
            .from(issueLinkSyncEvents)
            .leftJoin(issueLinks, eq(issueLinkSyncEvents.issueLinkId, issueLinks.id))
            .where(issueConditions.length > 0 ? and(...issueConditions) : undefined);
        const [webhookAuthFailuresCountRow] = await db
            .select({ value: count() })
            .from(integrationWebhookAuthEvents)
            .where(webhookAuthConditions.length > 0 ? and(...webhookAuthConditions) : undefined);

        const deliveryStatusRows = await db
            .select({
                status: notificationDeliveries.status,
                value: count(),
            })
            .from(notificationDeliveries)
            .where(deliveryConditions.length > 0 ? and(...deliveryConditions) : undefined)
            .groupBy(notificationDeliveries.status);

        const webhookStatusRows = await db
            .select({
                status: integrationWebhookEvents.status,
                value: count(),
            })
            .from(integrationWebhookEvents)
            .where(webhookConditions.length > 0 ? and(...webhookConditions) : undefined)
            .groupBy(integrationWebhookEvents.status);

        const issueSyncStatusRows = await db
            .select({
                status: issueLinkSyncEvents.status,
                value: count(),
            })
            .from(issueLinkSyncEvents)
            .leftJoin(issueLinks, eq(issueLinkSyncEvents.issueLinkId, issueLinks.id))
            .where(issueConditions.length > 0 ? and(...issueConditions) : undefined)
            .groupBy(issueLinkSyncEvents.status);

        const providerRows = await db
            .select({
                provider: integrationConnections.provider,
                value: count(),
            })
            .from(integrationConnections)
            .where(connectionConditions.length > 0 ? and(...connectionConditions) : undefined)
            .groupBy(integrationConnections.provider);
        const webhookAuthProviderRows = await db
            .select({
                provider: integrationWebhookAuthEvents.provider,
                value: count(),
            })
            .from(integrationWebhookAuthEvents)
            .where(webhookAuthConditions.length > 0 ? and(...webhookAuthConditions) : undefined)
            .groupBy(integrationWebhookAuthEvents.provider);
        const webhookAuthReasonRows = await db
            .select({
                reason: integrationWebhookAuthEvents.reason,
                value: count(),
            })
            .from(integrationWebhookAuthEvents)
            .where(webhookAuthConditions.length > 0 ? and(...webhookAuthConditions) : undefined)
            .groupBy(integrationWebhookAuthEvents.reason);
        const webhookAuthOutcomeRows = await db
            .select({
                outcome: integrationWebhookAuthEvents.outcome,
                value: count(),
            })
            .from(integrationWebhookAuthEvents)
            .where(webhookAuthConditions.length > 0 ? and(...webhookAuthConditions) : undefined)
            .groupBy(integrationWebhookAuthEvents.outcome);

        const notificationRetryQueueRows = await db
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

        const webhookRetryQueueRows = await db
            .select({
                value: count(),
            })
            .from(integrationWebhookEvents)
            .where(
                and(
                    webhookConditions.length > 0 ? and(...webhookConditions) : undefined,
                    inArray(integrationWebhookEvents.status, WEBHOOK_RETRYABLE_STATUSES)
                )
            );

        const [oldestNotificationDue] = await db
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

        const [oldestWebhookDue] = await db
            .select({ nextAttemptAt: integrationWebhookEvents.nextAttemptAt })
            .from(integrationWebhookEvents)
            .where(
                and(
                    webhookConditions.length > 0 ? and(...webhookConditions) : undefined,
                    inArray(integrationWebhookEvents.status, WEBHOOK_RETRYABLE_STATUSES)
                )
            )
            .orderBy(asc(integrationWebhookEvents.nextAttemptAt))
            .limit(1);

        const deliveryStatusCounts: Record<string, number> = {};
        for (const row of deliveryStatusRows) {
            deliveryStatusCounts[row.status] = Number(row.value || 0);
        }

        const webhookStatusCounts: Record<string, number> = {};
        for (const row of webhookStatusRows) {
            webhookStatusCounts[row.status] = Number(row.value || 0);
        }

        const issueSyncStatusCounts: Record<string, number> = {};
        for (const row of issueSyncStatusRows) {
            issueSyncStatusCounts[row.status] = Number(row.value || 0);
        }

        const providerCounts: Record<string, number> = {};
        for (const row of providerRows) {
            providerCounts[row.provider] = Number(row.value || 0);
        }
        const webhookAuthProviderCounts: Record<string, number> = {};
        for (const row of webhookAuthProviderRows) {
            webhookAuthProviderCounts[row.provider] = Number(row.value || 0);
        }
        const webhookAuthReasonCounts: Record<string, number> = {};
        for (const row of webhookAuthReasonRows) {
            webhookAuthReasonCounts[row.reason] = Number(row.value || 0);
        }
        const webhookAuthOutcomeCounts: Record<string, number> = {};
        for (const row of webhookAuthOutcomeRows) {
            webhookAuthOutcomeCounts[row.outcome] = Number(row.value || 0);
        }

        const delivered = deliveryStatusCounts.delivered || 0;
        const failed = (deliveryStatusCounts.failed || 0) + (deliveryStatusCounts.dead_letter || 0);
        const denominator = delivered + failed;
        const webhookAuthFailures = Number(webhookAuthFailuresCountRow?.value || 0);
        const webhookAuthDenominator = webhookAuthFailures + Number(webhookEventsCountRow?.value || 0);
        const webhookAuthFailureRatePct =
            webhookAuthDenominator > 0 ? Math.round((webhookAuthFailures / webhookAuthDenominator) * 100) : 0;

        return {
            totals: {
                connections: Number(connectionsCountRow?.value || 0),
                issueLinks: Number(issueLinksCountRow?.value || 0),
                deliveries: Number(deliveriesCountRow?.value || 0),
                webhookEvents: Number(webhookEventsCountRow?.value || 0),
                webhookAuthFailures,
                webhookAuthConfigErrors: webhookAuthOutcomeCounts.config_error || 0,
                issueSyncAttempts: Number(issueSyncAttemptsCountRow?.value || 0),
                pending: deliveryStatusCounts.pending || 0,
                retrying: deliveryStatusCounts.retrying || 0,
                delivered,
                failed: deliveryStatusCounts.failed || 0,
                deadLetter: deliveryStatusCounts.dead_letter || 0,
                webhooksReceived: webhookStatusCounts.received || 0,
                webhooksProcessed: webhookStatusCounts.processed || 0,
                webhooksFailed: webhookStatusCounts.failed || 0,
                webhooksDeadLetter: webhookStatusCounts.dead_letter || 0,
                issueSyncPending: issueSyncStatusCounts.pending || 0,
                issueSyncSynced: issueSyncStatusCounts.synced || 0,
                issueSyncFailed: issueSyncStatusCounts.failed || 0,
                issueSyncDeadLetter: issueSyncStatusCounts.dead_letter || 0,
            },
            providers: providerCounts,
            webhookAuth: {
                failuresByProvider: webhookAuthProviderCounts,
                failuresByReason: webhookAuthReasonCounts,
                failureRatePct: webhookAuthFailureRatePct,
            },
            retryQueue: {
                notificationQueued: Number(notificationRetryQueueRows[0]?.value || 0),
                webhookQueued: Number(webhookRetryQueueRows[0]?.value || 0),
                oldestNotificationDueAt: oldestNotificationDue?.nextAttemptAt
                    ? toIso(oldestNotificationDue.nextAttemptAt)
                    : undefined,
                oldestWebhookDueAt: oldestWebhookDue?.nextAttemptAt ? toIso(oldestWebhookDue.nextAttemptAt) : undefined,
            },
            successRatePct: denominator > 0 ? Math.round((delivered / denominator) * 100) : 100,
            generatedAt: new Date().toISOString(),
        };
    },

    async alertStatus(input: {
        repoId?: string;
        minSuccessRatePct?: number;
        maxRetryQueueAgeSeconds?: number;
        webhookAuthWindowMinutes?: number;
        maxWebhookAuthFailures?: number;
        maxWebhookAuthFailureRatePct?: number;
    } = {}) {
        const minSuccessRatePct = clampInteger(
            Number(input.minSuccessRatePct ?? DEFAULT_INTEGRATION_ALERT_MIN_SUCCESS_RATE_PCT),
            1,
            100
        );
        const maxRetryQueueAgeSeconds = clampInteger(
            Number(input.maxRetryQueueAgeSeconds ?? DEFAULT_INTEGRATION_ALERT_MAX_RETRY_AGE_SECONDS),
            30,
            86_400
        );
        const webhookAuthWindowMinutes = clampInteger(
            Number(input.webhookAuthWindowMinutes ?? DEFAULT_WEBHOOK_AUTH_ALERT_WINDOW_MINUTES),
            5,
            1_440
        );
        const maxWebhookAuthFailures = clampInteger(
            Number(input.maxWebhookAuthFailures ?? DEFAULT_WEBHOOK_AUTH_ALERT_MAX_FAILURES),
            0,
            100_000
        );
        const maxWebhookAuthFailureRatePct = clampInteger(
            Number(input.maxWebhookAuthFailureRatePct ?? DEFAULT_WEBHOOK_AUTH_ALERT_MAX_FAILURE_RATE_PCT),
            0,
            100
        );

        const metrics = await this.metrics(input.repoId);
        const now = new Date();
        const webhookAuthWindowStart = new Date(now.getTime() - webhookAuthWindowMinutes * 60_000);
        const webhookAuthRecentConditions = [gte(integrationWebhookAuthEvents.createdAt, webhookAuthWindowStart)];
        const webhookIngestionRecentConditions = [gte(integrationWebhookEvents.createdAt, webhookAuthWindowStart)];
        if (input.repoId) {
            webhookAuthRecentConditions.push(eq(integrationWebhookAuthEvents.repoId, input.repoId));
            webhookIngestionRecentConditions.push(eq(integrationWebhookEvents.repoId, input.repoId));
        }
        const [webhookAuthRecentCountRow] = await db
            .select({ value: count() })
            .from(integrationWebhookAuthEvents)
            .where(and(...webhookAuthRecentConditions));
        const [webhookIngestionRecentCountRow] = await db
            .select({ value: count() })
            .from(integrationWebhookEvents)
            .where(and(...webhookIngestionRecentConditions));
        const [webhookAuthRecentConfigErrorRow] = await db
            .select({ value: count() })
            .from(integrationWebhookAuthEvents)
            .where(
                and(
                    ...webhookAuthRecentConditions,
                    eq(integrationWebhookAuthEvents.outcome, "config_error")
                )
            );
        const webhookAuthRecentFailures = Number(webhookAuthRecentCountRow?.value || 0);
        const webhookIngestionRecent = Number(webhookIngestionRecentCountRow?.value || 0);
        const webhookAuthRecentDenominator = webhookAuthRecentFailures + webhookIngestionRecent;
        const webhookAuthRecentFailureRatePct =
            webhookAuthRecentDenominator > 0
                ? Math.round((webhookAuthRecentFailures / webhookAuthRecentDenominator) * 100)
                : 0;
        const webhookAuthRecentConfigErrors = Number(webhookAuthRecentConfigErrorRow?.value || 0);
        const alerts: Array<{
            code: string;
            severity: IntegrationAlertSeverity;
            message: string;
            value: number;
            threshold: number;
        }> = [];

        if (metrics.totals.deadLetter > 0) {
            alerts.push({
                code: "notification_dead_letter",
                severity: "critical",
                message: "Notification deliveries are in dead-letter state.",
                value: metrics.totals.deadLetter,
                threshold: 0,
            });
        }
        if (metrics.totals.webhooksDeadLetter > 0) {
            alerts.push({
                code: "webhook_dead_letter",
                severity: "critical",
                message: "Webhook events are in dead-letter state.",
                value: metrics.totals.webhooksDeadLetter,
                threshold: 0,
            });
        }
        if (metrics.totals.issueSyncDeadLetter > 0) {
            alerts.push({
                code: "issue_sync_dead_letter",
                severity: "critical",
                message: "Issue-link sync is in dead-letter state.",
                value: metrics.totals.issueSyncDeadLetter,
                threshold: 0,
            });
        }
        if (metrics.successRatePct < minSuccessRatePct) {
            alerts.push({
                code: "delivery_success_rate_low",
                severity: "warning",
                message: "Delivery success rate is below threshold.",
                value: metrics.successRatePct,
                threshold: minSuccessRatePct,
            });
        }
        if (webhookAuthRecentFailures > maxWebhookAuthFailures) {
            alerts.push({
                code: "webhook_auth_failures_high",
                severity: "warning",
                message: "Webhook auth failure count is above threshold.",
                value: webhookAuthRecentFailures,
                threshold: maxWebhookAuthFailures,
            });
        }
        if (webhookAuthRecentFailureRatePct > maxWebhookAuthFailureRatePct) {
            alerts.push({
                code: "webhook_auth_failure_rate_high",
                severity: "warning",
                message: "Webhook auth failure rate is above threshold.",
                value: webhookAuthRecentFailureRatePct,
                threshold: maxWebhookAuthFailureRatePct,
            });
        }
        if (webhookAuthRecentConfigErrors > 0) {
            alerts.push({
                code: "webhook_auth_config_error",
                severity: "critical",
                message: "Webhook auth configuration errors detected.",
                value: webhookAuthRecentConfigErrors,
                threshold: 0,
            });
        }

        const oldestNotificationRetryAgeSeconds = retryAgeSeconds(now, metrics.retryQueue.oldestNotificationDueAt);
        if (
            oldestNotificationRetryAgeSeconds !== null &&
            metrics.retryQueue.notificationQueued > 0 &&
            oldestNotificationRetryAgeSeconds > maxRetryQueueAgeSeconds
        ) {
            alerts.push({
                code: "notification_retry_stale",
                severity: "warning",
                message: "Oldest pending notification retry is stale.",
                value: oldestNotificationRetryAgeSeconds,
                threshold: maxRetryQueueAgeSeconds,
            });
        }

        const oldestWebhookRetryAgeSeconds = retryAgeSeconds(now, metrics.retryQueue.oldestWebhookDueAt);
        if (
            oldestWebhookRetryAgeSeconds !== null &&
            metrics.retryQueue.webhookQueued > 0 &&
            oldestWebhookRetryAgeSeconds > maxRetryQueueAgeSeconds
        ) {
            alerts.push({
                code: "webhook_retry_stale",
                severity: "warning",
                message: "Oldest pending webhook retry is stale.",
                value: oldestWebhookRetryAgeSeconds,
                threshold: maxRetryQueueAgeSeconds,
            });
        }

        let status: IntegrationAlertStatus = "healthy";
        if (alerts.some((alert) => alert.severity === "critical")) status = "critical";
        else if (alerts.length > 0) status = "warning";

        return {
            status,
            alerts,
            thresholds: {
                minSuccessRatePct,
                maxRetryQueueAgeSeconds,
                webhookAuthWindowMinutes,
                maxWebhookAuthFailures,
                maxWebhookAuthFailureRatePct,
            },
            queueAges: {
                oldestNotificationRetryAgeSeconds,
                oldestWebhookRetryAgeSeconds,
            },
            webhookAuthWindow: {
                startAt: webhookAuthWindowStart.toISOString(),
                failures: webhookAuthRecentFailures,
                ingested: webhookIngestionRecent,
                failureRatePct: webhookAuthRecentFailureRatePct,
                configErrors: webhookAuthRecentConfigErrors,
            },
            generatedAt: now.toISOString(),
        };
    },
};
