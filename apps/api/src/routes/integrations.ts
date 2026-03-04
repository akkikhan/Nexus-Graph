/**
 * NEXUS API - Integrations and Notifications Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { integrationsRepository } from "../repositories/integrations.js";
import { verifyIntegrationWebhookSignature } from "../lib/webhook-security.js";

const integrationsRouter = new Hono();

const providerSchema = z.enum(["slack", "linear", "jira"]);
const connectionStatusSchema = z.enum(["active", "disabled", "error"]);
const issueLinkStatusSchema = z.enum(["linked", "sync_pending", "sync_failed"]);
const deliveryStatusSchema = z.enum(["pending", "retrying", "delivered", "failed", "dead_letter"]);
const webhookStatusSchema = z.enum(["received", "processed", "failed", "dead_letter"]);
const webhookAuthOutcomeSchema = z.enum(["rejected", "config_error"]);

const listConnectionsSchema = z.object({
    repoId: z.string().optional(),
    provider: providerSchema.optional(),
    status: connectionStatusSchema.optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
});

const createConnectionSchema = z.object({
    repoId: z.string(),
    provider: providerSchema,
    displayName: z.string().min(1),
    status: connectionStatusSchema.optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    tokenRef: z.string().optional(),
});

const listIssueLinksSchema = z.object({
    repoId: z.string().optional(),
    prId: z.string().optional(),
    provider: providerSchema.optional(),
    status: issueLinkStatusSchema.optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
});

const createIssueLinkSchema = z.object({
    repoId: z.string(),
    prId: z.string(),
    provider: providerSchema,
    issueKey: z.string().min(1),
    issueTitle: z.string().optional(),
    issueUrl: z.string().url().optional(),
    externalIssueId: z.string().optional(),
    status: issueLinkStatusSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

const listIssueLinkSyncEventsSchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
});

const syncIssueLinkSchema = z.object({
    simulateFailure: z.boolean().optional(),
    responseCode: z.coerce.number().int().min(100).max(599).optional(),
    latencyMs: z.coerce.number().int().min(0).optional(),
    errorMessage: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
});

const retryIssueLinksSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    repoId: z.string().optional(),
});

const listIssueLinkActionAuditsSchema = z.object({
    repoId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

const listNotificationsSchema = z.object({
    repoId: z.string().optional(),
    connectionId: z.string().optional(),
    status: deliveryStatusSchema.optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
});

const enqueueNotificationSchema = z.object({
    connectionId: z.string(),
    repoId: z.string(),
    prId: z.string().optional(),
    channel: z.string().min(1),
    eventType: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional(),
    maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
    correlationId: z.string().optional(),
});

const deliverNotificationSchema = z.object({
    simulateFailure: z.boolean().optional(),
    responseCode: z.coerce.number().int().min(100).max(599).optional(),
    latencyMs: z.coerce.number().int().min(0).optional(),
    errorMessage: z.string().optional(),
});

const retryNotificationsSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    repoId: z.string().optional(),
});

const listNotificationActionAuditsSchema = z.object({
    repoId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

const listWebhookEventsSchema = z.object({
    provider: providerSchema.optional(),
    repoId: z.string().optional(),
    status: webhookStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

const listWebhookAuthEventsSchema = z.object({
    provider: providerSchema.optional(),
    repoId: z.string().optional(),
    outcome: webhookAuthOutcomeSchema.optional(),
    reason: z.string().optional(),
    sinceMinutes: z.coerce.number().int().min(1).max(43_200).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});

const exportWebhookAuthEventsSchema = z.object({
    provider: providerSchema.optional(),
    repoId: z.string().optional(),
    outcome: webhookAuthOutcomeSchema.optional(),
    reason: z.string().optional(),
    sinceMinutes: z.coerce.number().int().min(1).max(43_200).optional(),
    format: z.enum(["json", "csv"]).default("json"),
    maxRows: z.coerce.number().int().min(1).max(5_000).default(5_000),
});

const ingestWebhookSchema = z.object({
    eventType: z.string().min(1),
    externalEventId: z.string().min(1),
    repoId: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
    correlationId: z.string().optional(),
});

const processWebhookSchema = z.object({
    simulateFailure: z.boolean().optional(),
    responseCode: z.coerce.number().int().min(100).max(599).optional(),
    latencyMs: z.coerce.number().int().min(0).optional(),
    errorMessage: z.string().optional(),
});

const retryWebhooksSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    repoId: z.string().optional(),
});

const listWebhookActionAuditsSchema = z.object({
    repoId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

const slackActionSchema = z.object({
    externalEventId: z.string().min(1),
    repoId: z.string().optional(),
    teamId: z.string().min(1),
    channelId: z.string().optional(),
    userId: z.string().optional(),
    actionType: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional(),
    correlationId: z.string().optional(),
});

const metricsSchema = z.object({
    repoId: z.string().optional(),
});

const alertsSchema = z.object({
    repoId: z.string().optional(),
    minSuccessRatePct: z.coerce.number().min(1).max(100).optional(),
    maxRetryQueueAgeSeconds: z.coerce.number().int().min(30).max(86_400).optional(),
    webhookAuthWindowMinutes: z.coerce.number().int().min(5).max(1_440).optional(),
    maxWebhookAuthFailures: z.coerce.number().int().min(0).max(100_000).optional(),
    maxWebhookAuthFailureRatePct: z.coerce.number().min(0).max(100).optional(),
});

function details(error: unknown): string {
    return integrationsRepository.errorMessage(error);
}

type WebhookAuthEventExportRow = {
    id: string;
    provider: "slack" | "linear" | "jira";
    outcome: "rejected" | "config_error";
    reason: string;
    statusCode: number;
    signaturePresent: boolean;
    timestampPresent: boolean;
    eventType: string;
    externalEventId: string;
    repoId?: string;
    requestTimestamp?: string;
    requestSkewSeconds?: number;
    createdAt: string;
};

function buildWebhookAuthEventsCsv(events: WebhookAuthEventExportRow[]): string {
    const headers = [
        "id",
        "provider",
        "outcome",
        "reason",
        "statusCode",
        "signaturePresent",
        "timestampPresent",
        "eventType",
        "externalEventId",
        "repoId",
        "requestTimestamp",
        "requestSkewSeconds",
        "createdAt",
    ];
    const escapeCell = (value: unknown): string => {
        const raw = value === undefined || value === null ? "" : String(value);
        return `"${raw.replace(/"/g, "\"\"")}"`;
    };
    const rows = events.map((event) => [
        event.id,
        event.provider,
        event.outcome,
        event.reason,
        event.statusCode,
        event.signaturePresent,
        event.timestampPresent,
        event.eventType,
        event.externalEventId,
        event.repoId || "",
        event.requestTimestamp || "",
        event.requestSkewSeconds ?? "",
        event.createdAt,
    ]);
    const lines = [headers, ...rows].map((row) => row.map((cell) => escapeCell(cell)).join(","));
    return lines.join("\n");
}

async function recordWebhookAuthFailure(input: {
    provider: "slack" | "linear" | "jira";
    repoId?: string;
    eventType: string;
    externalEventId: string;
    outcome?: "rejected" | "config_error";
    reason: string;
    statusCode: number;
    signaturePresent?: boolean;
    timestampPresent?: boolean;
    requestTimestampSeconds?: number;
    requestSkewSeconds?: number;
    details?: Record<string, unknown>;
}) {
    try {
        await integrationsRepository.recordWebhookAuthFailure(input);
    } catch {
        // Best effort: rejection response should not depend on auth-event telemetry persistence.
    }
}

async function recordWebhookActionAudit(input: {
    action: string;
    repoId?: string;
    webhookEventId?: string;
    outcome: "success" | "error";
    summary: string;
    metadata?: Record<string, unknown>;
}) {
    try {
        await integrationsRepository.recordWebhookActionAudit(input);
    } catch {
        // Best effort: webhook action must not fail due to audit insert issues.
    }
}

async function recordNotificationActionAudit(input: {
    action: string;
    repoId?: string;
    deliveryId?: string;
    outcome: "success" | "error";
    summary: string;
    metadata?: Record<string, unknown>;
}) {
    try {
        await integrationsRepository.recordNotificationActionAudit(input);
    } catch {
        // Best effort: notification operation should not fail due to audit insert issues.
    }
}

async function recordIssueLinkActionAudit(input: {
    action: string;
    repoId?: string;
    issueLinkId?: string;
    outcome: "success" | "error";
    summary: string;
    metadata?: Record<string, unknown>;
}) {
    try {
        await integrationsRepository.recordIssueLinkActionAudit(input);
    } catch {
        // Best effort: issue-link operation should not fail due to audit insert issues.
    }
}

integrationsRouter.get("/connections", zValidator("query", listConnectionsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const connections = await integrationsRepository.listConnections(query);
        return c.json({
            connections,
            total: connections.length,
            limit: query.limit,
            offset: query.offset,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration connection listing",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/connections", zValidator("json", createConnectionSchema), async (c) => {
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.createConnection(body);
        if (result.reason === "invalid_provider") return c.json({ error: "Unsupported integration provider" }, 400);
        if (result.reason === "connection_exists") {
            return c.json(
                {
                    error: "Integration connection already exists for repo/provider",
                    connection: result.connection,
                },
                409
            );
        }
        if (result.reason === "insert_failed") return c.json({ error: "Failed to create integration connection" }, 500);
        return c.json({ connection: result.connection }, 201);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration connection creation",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/issue-links", zValidator("query", listIssueLinksSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const links = await integrationsRepository.listIssueLinks(query);
        return c.json({
            links,
            total: links.length,
            limit: query.limit,
            offset: query.offset,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for issue link listing",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/issue-links", zValidator("json", createIssueLinkSchema), async (c) => {
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.createIssueLink(body);
        if (result.reason === "invalid_issue_provider") {
            return c.json({ error: "Issue links only support linear or jira providers" }, 400);
        }
        if (result.reason === "connection_not_configured") {
            return c.json({ error: "No active integration connection for issue provider on repo" }, 409);
        }
        if (result.reason === "issue_link_exists") {
            return c.json(
                {
                    error: "Issue link already exists for this PR/provider/key",
                    issueLink: result.issueLink,
                },
                409
            );
        }
        if (result.reason === "insert_failed") return c.json({ error: "Failed to create issue link" }, 500);
        return c.json({ issueLink: result.issueLink }, 201);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for issue link creation",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/issue-links/:id/sync-events", zValidator("query", listIssueLinkSyncEventsSchema), async (c) => {
    const id = c.req.param("id");
    const query = c.req.valid("query");
    try {
        const events = await integrationsRepository.listIssueLinkSyncEvents(id, query.limit);
        return c.json({
            events,
            total: events.length,
            limit: query.limit,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for issue link sync-event listing",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/issue-link-action-audits", zValidator("query", listIssueLinkActionAuditsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const events = await integrationsRepository.listIssueLinkActionAudits(query);
        return c.json({
            events,
            total: events.length,
            limit: query.limit,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for issue-link action-audit listing",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/issue-links/:id/sync", zValidator("json", syncIssueLinkSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.syncIssueLinkBacklink(id, body);
        if (result.reason === "issue_link_not_found") return c.json({ error: "Issue link not found" }, 404);
        if (result.reason === "invalid_issue_provider") {
            return c.json(
                {
                    error: "Issue provider does not support back-link sync",
                    issueLink: result.issueLink,
                },
                409
            );
        }
        if (result.reason === "sync_dead_lettered") {
            return c.json(
                {
                    error: "Issue link back-link sync is dead-lettered",
                    issueLink: result.issueLink,
                    syncEvent: result.syncEvent,
                },
                409
            );
        }
        if (result.reason === "sync_update_failed") return c.json({ error: "Failed to update issue link sync state" }, 500);
        await recordIssueLinkActionAudit({
            action: body.simulateFailure ? "integration.issue_link.manual_fail" : "integration.issue_link.manual_sync",
            repoId: result.issueLink.repoId,
            issueLinkId: result.issueLink.id,
            outcome: result.reason === "sync_failed" ? "error" : "success",
            summary: `Issue link ${result.issueLink.issueKey} is now ${result.issueLink.status}.`,
            metadata: {
                mode: body.simulateFailure ? "fail" : "sync",
                provider: result.issueLink.provider,
                syncReason: result.reason,
                syncEventStatus: result.syncEvent?.status,
                syncAttemptNumber: result.syncEvent?.attemptNumber,
            },
        });
        return c.json({
            success: true,
            reason: result.reason,
            issueLink: result.issueLink,
            syncEvent: result.syncEvent,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for issue link back-link sync",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/issue-links/retry-sync", zValidator("json", retryIssueLinksSchema), async (c) => {
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.retryIssueLinkSyncs(body.limit, body.repoId);
        for (const outcome of result.outcomes) {
            if (!outcome.repoId) continue;
            await recordIssueLinkActionAudit({
                action: "integration.issue_link.retry_sync",
                repoId: outcome.repoId,
                issueLinkId: outcome.id,
                outcome:
                    outcome.status === "sync_failed" || outcome.reason === "sync_update_failed" ? "error" : "success",
                summary: `Retried issue link ${outcome.issueKey || outcome.id} -> ${outcome.status || outcome.reason}.`,
                metadata: {
                    reason: outcome.reason,
                    status: outcome.status,
                    provider: outcome.provider,
                },
            });
        }
        return c.json({
            success: true,
            ...result,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for issue-link retry sync worker",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/webhooks", zValidator("query", listWebhookEventsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const events = await integrationsRepository.listWebhookEvents(query);
        return c.json({
            events,
            total: events.length,
            limit: query.limit,
            offset: query.offset,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration webhook listing",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/webhook-action-audits", zValidator("query", listWebhookActionAuditsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const events = await integrationsRepository.listWebhookActionAudits(query);
        return c.json({
            events,
            total: events.length,
            limit: query.limit,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration webhook action-audit listing",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/webhook-auth-events", zValidator("query", listWebhookAuthEventsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const events = await integrationsRepository.listWebhookAuthEvents(query);
        return c.json({
            events,
            total: events.length,
            limit: query.limit,
            offset: query.offset,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration webhook auth-event listing",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/webhook-auth-events/export", zValidator("query", exportWebhookAuthEventsSchema), async (c) => {
    const query = c.req.valid("query");
    const events: WebhookAuthEventExportRow[] = [];
    const pageSize = 200;
    let offset = 0;
    try {
        while (events.length < query.maxRows) {
            const batchLimit = Math.min(pageSize, query.maxRows - events.length);
            const batch = await integrationsRepository.listWebhookAuthEvents({
                provider: query.provider,
                repoId: query.repoId,
                outcome: query.outcome,
                reason: query.reason,
                sinceMinutes: query.sinceMinutes,
                limit: batchLimit,
                offset,
            });
            if (batch.length === 0) break;
            events.push(...(batch as WebhookAuthEventExportRow[]));
            if (batch.length < batchLimit) break;
            offset += batch.length;
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const commonHeaders = {
            "cache-control": "no-store",
        };
        if (query.format === "csv") {
            const csv = buildWebhookAuthEventsCsv(events);
            return c.body(csv, 200, {
                ...commonHeaders,
                "content-type": "text/csv; charset=utf-8",
                "content-disposition": `attachment; filename=\"nexus-webhook-auth-events-${stamp}.csv\"`,
            });
        }
        return c.body(JSON.stringify(events, null, 2), 200, {
            ...commonHeaders,
            "content-type": "application/json; charset=utf-8",
            "content-disposition": `attachment; filename=\"nexus-webhook-auth-events-${stamp}.json\"`,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration webhook auth-event export",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/webhooks/provider/:provider", zValidator("json", ingestWebhookSchema), async (c) => {
    const provider = c.req.param("provider");
    const body = c.req.valid("json");
    const signature = c.req.header("x-nexus-webhook-signature");
    const timestamp = c.req.header("x-nexus-webhook-timestamp");
    const verification = providerSchema.safeParse(provider);
    if (verification.success) {
        const verified = verifyIntegrationWebhookSignature({
            provider: verification.data,
            eventType: body.eventType,
            externalEventId: body.externalEventId,
            body,
            signatureHeader: signature,
            timestampHeader: timestamp,
        });
        if (!verified.ok) {
            await recordWebhookAuthFailure({
                provider: verification.data,
                repoId: body.repoId,
                eventType: body.eventType,
                externalEventId: body.externalEventId,
                outcome: verified.reason === "missing_secret" ? "config_error" : "rejected",
                reason: verified.reason,
                statusCode: verified.status,
                signaturePresent: verified.metadata.signaturePresent,
                timestampPresent: verified.metadata.timestampPresent,
                requestTimestampSeconds: verified.metadata.parsedTimestampSeconds,
                requestSkewSeconds: verified.metadata.requestSkewSeconds,
                details: {
                    route: "integrations.webhooks.provider",
                },
            });
            return c.json(
                {
                    error:
                        verified.status === 503
                            ? "Webhook signature configuration unavailable"
                            : "Invalid webhook signature",
                    code: verified.reason,
                },
                verified.status
            );
        }
    }
    try {
        const result = await integrationsRepository.ingestWebhook({
            provider,
            ...body,
        });
        if (result.reason === "invalid_provider") return c.json({ error: "Unsupported webhook provider" }, 400);
        if (result.reason === "webhook_exists") {
            return c.json(
                {
                    error: "Webhook event already ingested",
                    event: result.event,
                },
                409
            );
        }
        if (result.reason === "insert_failed") return c.json({ error: "Failed to ingest webhook event" }, 500);
        return c.json({ event: result.event }, 201);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for webhook ingestion",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/webhooks/:id/process", zValidator("json", processWebhookSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.processWebhookEvent(id, body);
        if (result.reason === "webhook_not_found") return c.json({ error: "Webhook event not found" }, 404);
        if (result.reason === "terminal_status") {
            return c.json(
                {
                    error: "Webhook event is already terminal",
                    event: result.event,
                },
                409
            );
        }
        if (result.reason === "update_failed") return c.json({ error: "Failed to update webhook event state" }, 500);
        await recordWebhookActionAudit({
            action: body.simulateFailure ? "integration.webhook.manual_fail" : "integration.webhook.manual_process",
            repoId: result.event.repoId,
            webhookEventId: result.event.id,
            outcome: result.event.status === "failed" || result.event.status === "dead_letter" ? "error" : "success",
            summary: `Webhook ${result.event.externalEventId} is now ${result.event.status}.`,
            metadata: {
                mode: body.simulateFailure ? "fail" : "process",
                eventType: result.event.eventType,
                attempts: result.event.attempts,
                maxAttempts: result.event.maxAttempts,
            },
        });
        return c.json({
            success: true,
            reason: result.reason,
            event: result.event,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for webhook processing",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/webhooks/retry", zValidator("json", retryWebhooksSchema), async (c) => {
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.retryDueWebhookEvents(body.limit, body.repoId);
        for (const outcome of result.outcomes) {
            if (!outcome.repoId) continue;
            await recordWebhookActionAudit({
                action: "integration.webhook.retry_due",
                repoId: outcome.repoId,
                webhookEventId: outcome.id,
                outcome:
                    outcome.status === "failed" || outcome.status === "dead_letter" || outcome.reason === "update_failed"
                        ? "error"
                        : "success",
                summary: `Retried webhook ${outcome.externalEventId || outcome.id} -> ${outcome.status || outcome.reason}.`,
                metadata: {
                    reason: outcome.reason,
                    status: outcome.status,
                },
            });
        }
        return c.json({
            success: true,
            ...result,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for webhook retry worker",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/slack/actions", zValidator("json", slackActionSchema), async (c) => {
    const body = c.req.valid("json");
    const signature = c.req.header("x-nexus-webhook-signature");
    const timestamp = c.req.header("x-nexus-webhook-timestamp");
    const verified = verifyIntegrationWebhookSignature({
        provider: "slack",
        eventType: `slack.action.${body.actionType}`,
        externalEventId: body.externalEventId,
        body,
        signatureHeader: signature,
        timestampHeader: timestamp,
    });
    if (!verified.ok) {
        await recordWebhookAuthFailure({
            provider: "slack",
            repoId: body.repoId,
            eventType: `slack.action.${body.actionType}`,
            externalEventId: body.externalEventId,
            outcome: verified.reason === "missing_secret" ? "config_error" : "rejected",
            reason: verified.reason,
            statusCode: verified.status,
            signaturePresent: verified.metadata.signaturePresent,
            timestampPresent: verified.metadata.timestampPresent,
            requestTimestampSeconds: verified.metadata.parsedTimestampSeconds,
            requestSkewSeconds: verified.metadata.requestSkewSeconds,
            details: {
                route: "integrations.slack.actions",
            },
        });
        return c.json(
            {
                error:
                    verified.status === 503
                        ? "Webhook signature configuration unavailable"
                        : "Invalid webhook signature",
                code: verified.reason,
            },
            verified.status
        );
    }
    try {
        const result = await integrationsRepository.handleSlackActionCallback(body);
        if (result.reason === "duplicate") {
            return c.json(
                {
                    error: "Slack callback already processed",
                    event: result.event,
                },
                409
            );
        }
        if (result.reason === "invalid_provider") return c.json({ error: "Unsupported provider for Slack callback" }, 400);
        if (result.reason === "insert_failed") return c.json({ error: "Failed to ingest Slack callback" }, 500);
        return c.json(
            {
                success: true,
                event: result.event,
                processingReason: result.processingReason,
                processedEvent: result.processedEvent,
            },
            201
        );
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for Slack callback handling",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/notifications", zValidator("query", listNotificationsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const deliveries = await integrationsRepository.listNotifications(query);
        return c.json({
            deliveries,
            total: deliveries.length,
            limit: query.limit,
            offset: query.offset,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for notification listing",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get(
    "/notification-action-audits",
    zValidator("query", listNotificationActionAuditsSchema),
    async (c) => {
        const query = c.req.valid("query");
        try {
            const events = await integrationsRepository.listNotificationActionAudits(query);
            return c.json({
                events,
                total: events.length,
                limit: query.limit,
            });
        } catch (error) {
            return c.json(
                {
                    error: "Database unavailable for integration notification action-audit listing",
                    details: details(error),
                },
                503
            );
        }
    }
);

integrationsRouter.post("/notifications", zValidator("json", enqueueNotificationSchema), async (c) => {
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.enqueueNotification(body);
        if (result.reason === "connection_not_found") return c.json({ error: "Integration connection not found" }, 404);
        if (result.reason === "connection_inactive") return c.json({ error: "Integration connection is not active" }, 409);
        if (result.reason === "unsupported_notification_provider") {
            return c.json({ error: "Notification delivery currently supports slack connections only" }, 400);
        }
        if (result.reason === "connection_repo_mismatch") {
            return c.json({ error: "connectionId does not belong to repoId" }, 409);
        }
        if (result.reason === "insert_failed") return c.json({ error: "Failed to enqueue notification" }, 500);
        return c.json({ delivery: result.delivery }, 201);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for notification enqueue",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/notifications/:id", async (c) => {
    const id = c.req.param("id");
    try {
        const detail = await integrationsRepository.getNotification(id);
        if (!detail) return c.json({ error: "Notification delivery not found" }, 404);
        return c.json(detail);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for notification detail",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/notifications/:id/deliver", zValidator("json", deliverNotificationSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.deliverNotification(id, body);
        if (result.reason === "delivery_not_found") return c.json({ error: "Notification delivery not found" }, 404);
        if (result.reason === "terminal_status") {
            return c.json(
                {
                    error: "Notification delivery is already terminal",
                    delivery: result.delivery,
                },
                409
            );
        }
        if (result.reason === "update_failed") return c.json({ error: "Failed to persist notification delivery update" }, 500);
        await recordNotificationActionAudit({
            action: body.simulateFailure ? "integration.notification.manual_fail" : "integration.notification.manual_deliver",
            repoId: result.delivery.repoId,
            deliveryId: result.delivery.id,
            outcome:
                result.delivery.status === "failed" || result.delivery.status === "dead_letter" ? "error" : "success",
            summary: `Notification ${result.delivery.correlationId} is now ${result.delivery.status}.`,
            metadata: {
                mode: body.simulateFailure ? "fail" : "deliver",
                eventType: result.delivery.eventType,
                channel: result.delivery.channel,
                attempts: result.delivery.attempts,
                maxAttempts: result.delivery.maxAttempts,
            },
        });
        return c.json({
            success: true,
            reason: result.reason,
            delivery: result.delivery,
            attempt: result.attempt,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for notification delivery",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/notifications/retry", zValidator("json", retryNotificationsSchema), async (c) => {
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.retryDueNotifications(body.limit, body.repoId);
        for (const outcome of result.outcomes) {
            if (!outcome.repoId) continue;
            await recordNotificationActionAudit({
                action: "integration.notification.retry_due",
                repoId: outcome.repoId,
                deliveryId: outcome.id,
                outcome:
                    outcome.status === "failed" || outcome.status === "dead_letter" || outcome.reason === "update_failed"
                        ? "error"
                        : "success",
                summary: `Retried notification ${outcome.correlationId || outcome.id} -> ${outcome.status || outcome.reason}.`,
                metadata: {
                    reason: outcome.reason,
                    status: outcome.status,
                },
            });
        }
        return c.json({
            success: true,
            ...result,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for notification retry worker",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/metrics", zValidator("query", metricsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const metrics = await integrationsRepository.metrics(query.repoId);
        return c.json(metrics);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration metrics",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/alerts", zValidator("query", alertsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const alertStatus = await integrationsRepository.alertStatus(query);
        return c.json(alertStatus);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration alerts",
                details: details(error),
            },
            503
        );
    }
});

export { integrationsRouter };
