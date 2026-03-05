/**
 * NEXUS API - Integrations and Notifications Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { integrationsRepository } from "../repositories/integrations.js";
import { verifyIntegrationWebhookSignature } from "../lib/webhook-security.js";
import { getRealtimeServer } from "../realtime/websocket.js";

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

const validateConnectionSchema = z.object({
    simulateFailure: z.boolean().optional(),
    responseCode: z.coerce.number().int().min(100).max(599).optional(),
    latencyMs: z.coerce.number().int().min(0).optional(),
    errorMessage: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
});

const updateConnectionStatusSchema = z.object({
    status: z.enum(["active", "disabled"]),
    reason: z.string().optional(),
});

const listConnectionActionAuditsSchema = z.object({
    repoId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
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
    minDeliverySamples: z.coerce.number().int().min(0).max(100_000).optional(),
    minWebhookAuthSamples: z.coerce.number().int().min(0).max(100_000).optional(),
});
const alertTriageAuditsSchema = z.object({
    repoId: z.string().optional(),
    alertCode: z.string().min(1).max(120).optional(),
    action: z.enum(["acknowledge", "mute", "unmute"]).optional(),
    actor: z.string().min(1).max(120).optional(),
    sinceMinutes: z.coerce.number().int().min(1).max(43_200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});
const incidentTimelineSchema = z.object({
    repoId: z.string().optional(),
    provider: z.enum(["slack", "linear", "jira"]).optional(),
    scope: z
        .enum(["alert_triage", "alert_escalation", "webhook_auth", "webhook_processing", "notification_delivery", "issue_sync"])
        .optional(),
    severity: z.enum(["warning", "critical"]).optional(),
    sinceMinutes: z.coerce.number().int().min(1).max(43_200).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
});
const incidentSlaSummarySchema = z.object({
    repoId: z.string().optional(),
    windowMinutes: z.coerce.number().int().min(1).max(43_200).optional(),
    warningSlaMinutes: z.coerce.number().int().min(0).max(43_200).optional(),
    criticalSlaMinutes: z.coerce.number().int().min(0).max(43_200).optional(),
});
const incidentEscalationsSchema = z.object({
    repoId: z.string().optional(),
    alertCode: z.string().min(1).max(120).optional(),
    target: z.enum(["slack", "pagerduty", "email", "runbook"]).optional(),
    mode: z.enum(["breaches", "active", "muted", "custom"]).optional(),
    actor: z.string().trim().min(1).max(120).optional(),
    sinceMinutes: z.coerce.number().int().min(1).max(43_200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});
const escalateIncidentSchema = z.object({
    repoId: z.string(),
    target: z.enum(["slack", "pagerduty", "email", "runbook"]),
    mode: z.enum(["breaches", "active", "muted", "custom"]).default("breaches"),
    actor: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
    alertCodes: z.array(z.string().min(1)).max(100).optional(),
    windowMinutes: z.coerce.number().int().min(1).max(43_200).optional(),
    warningSlaMinutes: z.coerce.number().int().min(0).max(43_200).optional(),
    criticalSlaMinutes: z.coerce.number().int().min(0).max(43_200).optional(),
    cooldownMinutes: z.coerce.number().int().min(0).max(43_200).optional(),
});
const alertCodeParamSchema = z.object({
    alertCode: z.string().min(1).max(120),
});
const alertTriageSchema = z.object({
    repoId: z.string(),
    alertCodes: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(2_000).default(500),
});
const acknowledgeAlertSchema = z.object({
    repoId: z.string(),
    actor: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
});
const muteAlertSchema = z.object({
    repoId: z.string(),
    actor: z.string().trim().min(1).max(120).optional(),
    reason: z.string().trim().max(500).optional(),
    durationMinutes: z.coerce.number().int().min(5).max(43_200).optional(),
});
const unmuteAlertSchema = z.object({
    repoId: z.string(),
    actor: z.string().trim().min(1).max(120).optional(),
    reason: z.string().trim().max(500).optional(),
});
const bulkAlertTriageSchema = z.object({
    repoId: z.string(),
    action: z.enum(["acknowledge", "mute", "unmute"]),
    alertCodes: z.array(z.string().min(1)).min(1).max(100),
    actor: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
    reason: z.string().trim().max(500).optional(),
    durationMinutes: z.coerce.number().int().min(5).max(43_200).optional(),
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

async function recordConnectionActionAudit(input: {
    action: string;
    repoId?: string;
    connectionId?: string;
    outcome: "success" | "error";
    summary: string;
    metadata?: Record<string, unknown>;
}) {
    try {
        await integrationsRepository.recordConnectionActionAudit(input);
    } catch {
        // Best effort: connection operation should not fail due to audit insert issues.
    }
}

type IntegrationRealtimeScope =
    | "connection"
    | "issue_link"
    | "webhook"
    | "notification"
    | "slack_action"
    | "alert";

function notifyIntegrationUpdate(input: {
    repoId?: string;
    scope: IntegrationRealtimeScope;
    action: string;
    outcome: "success" | "error";
    entityId?: string;
    metadata?: Record<string, unknown>;
}) {
    try {
        const realtime = getRealtimeServer();
        if (!realtime) return;
        const payload = {
            scope: input.scope,
            action: input.action,
            outcome: input.outcome,
            entityId: input.entityId,
            repoId: input.repoId,
            metadata: input.metadata || {},
            emittedAt: new Date().toISOString(),
        };
        if (input.repoId) {
            realtime.notifyIntegrationUpdate(input.repoId, payload);
            return;
        }
        realtime.broadcast("integration:updated", "integrations", payload);
    } catch {
        // Best effort: realtime fanout should not fail request handling.
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
        notifyIntegrationUpdate({
            repoId: result.connection.repoId,
            scope: "connection",
            action: "created",
            outcome: "success",
            entityId: result.connection.id,
            metadata: {
                provider: result.connection.provider,
                status: result.connection.status,
            },
        });
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

integrationsRouter.post("/connections/:id/validate", zValidator("json", validateConnectionSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.validateConnection(id, body);
        if (result.reason === "connection_not_found") return c.json({ error: "Integration connection not found" }, 404);
        if (result.reason === "update_failed") return c.json({ error: "Failed to validate integration connection" }, 500);
        await recordConnectionActionAudit({
            action: body.simulateFailure ? "integration.connection.manual_validate_fail" : "integration.connection.manual_validate",
            repoId: result.connection.repoId,
            connectionId: result.connection.id,
            outcome: result.reason === "validation_failed" ? "error" : "success",
            summary: `Connection ${result.connection.displayName} is now ${result.connection.status}.`,
            metadata: {
                provider: result.connection.provider,
                status: result.connection.status,
                reason: result.reason,
            },
        });
        notifyIntegrationUpdate({
            repoId: result.connection.repoId,
            scope: "connection",
            action: body.simulateFailure ? "manual_validate_fail" : "manual_validate",
            outcome: result.reason === "validation_failed" ? "error" : "success",
            entityId: result.connection.id,
            metadata: {
                provider: result.connection.provider,
                status: result.connection.status,
                reason: result.reason,
            },
        });
        return c.json({
            success: true,
            reason: result.reason,
            connection: result.connection,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration connection validation",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/connections/:id/status", zValidator("json", updateConnectionStatusSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.setConnectionStatus(id, body.status, {
            reason: body.reason,
        });
        if (result.reason === "connection_not_found") return c.json({ error: "Integration connection not found" }, 404);
        if (result.reason === "update_failed") return c.json({ error: "Failed to update integration connection status" }, 500);
        await recordConnectionActionAudit({
            action: "integration.connection.set_status",
            repoId: result.connection.repoId,
            connectionId: result.connection.id,
            outcome: "success",
            summary: `Connection ${result.connection.displayName} status set to ${result.connection.status}.`,
            metadata: {
                provider: result.connection.provider,
                status: result.connection.status,
                reason: body.reason,
            },
        });
        notifyIntegrationUpdate({
            repoId: result.connection.repoId,
            scope: "connection",
            action: "set_status",
            outcome: "success",
            entityId: result.connection.id,
            metadata: {
                provider: result.connection.provider,
                status: result.connection.status,
                reason: result.reason,
            },
        });
        return c.json({
            success: true,
            reason: result.reason,
            connection: result.connection,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration connection status update",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/connection-action-audits", zValidator("query", listConnectionActionAuditsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const events = await integrationsRepository.listConnectionActionAudits(query);
        return c.json({
            events,
            total: events.length,
            limit: query.limit,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration connection action-audit listing",
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
        notifyIntegrationUpdate({
            repoId: result.issueLink.repoId,
            scope: "issue_link",
            action: "created",
            outcome: "success",
            entityId: result.issueLink.id,
            metadata: {
                provider: result.issueLink.provider,
                status: result.issueLink.status,
                issueKey: result.issueLink.issueKey,
            },
        });
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
        notifyIntegrationUpdate({
            repoId: result.issueLink.repoId,
            scope: "issue_link",
            action: body.simulateFailure ? "manual_fail" : "manual_sync",
            outcome: result.reason === "sync_failed" ? "error" : "success",
            entityId: result.issueLink.id,
            metadata: {
                provider: result.issueLink.provider,
                status: result.issueLink.status,
                issueKey: result.issueLink.issueKey,
                reason: result.reason,
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
            notifyIntegrationUpdate({
                repoId: outcome.repoId,
                scope: "issue_link",
                action: "retry_sync",
                outcome:
                    outcome.status === "sync_failed" || outcome.reason === "sync_update_failed" ? "error" : "success",
                entityId: outcome.id,
                metadata: {
                    provider: outcome.provider,
                    status: outcome.status,
                    issueKey: outcome.issueKey,
                    reason: outcome.reason,
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
        notifyIntegrationUpdate({
            repoId: result.event.repoId,
            scope: "webhook",
            action: "ingested",
            outcome: "success",
            entityId: result.event.id,
            metadata: {
                provider: result.event.provider,
                eventType: result.event.eventType,
                status: result.event.status,
                externalEventId: result.event.externalEventId,
            },
        });
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
        notifyIntegrationUpdate({
            repoId: result.event.repoId,
            scope: "webhook",
            action: body.simulateFailure ? "manual_fail" : "manual_process",
            outcome: result.event.status === "failed" || result.event.status === "dead_letter" ? "error" : "success",
            entityId: result.event.id,
            metadata: {
                provider: result.event.provider,
                eventType: result.event.eventType,
                status: result.event.status,
                reason: result.reason,
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
            notifyIntegrationUpdate({
                repoId: outcome.repoId,
                scope: "webhook",
                action: "retry_due",
                outcome:
                    outcome.status === "failed" || outcome.status === "dead_letter" || outcome.reason === "update_failed"
                        ? "error"
                        : "success",
                entityId: outcome.id,
                metadata: {
                    status: outcome.status,
                    reason: outcome.reason,
                    externalEventId: outcome.externalEventId,
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
        notifyIntegrationUpdate({
            repoId: body.repoId,
            scope: "slack_action",
            action: "callback_processed",
            outcome: result.processingReason === "processed" ? "success" : "error",
            entityId: result.event.id,
            metadata: {
                actionType: body.actionType,
                processingReason: result.processingReason,
                eventType: result.event.eventType,
                correlationId: body.correlationId,
            },
        });
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
        notifyIntegrationUpdate({
            repoId: result.delivery.repoId,
            scope: "notification",
            action: "enqueued",
            outcome: "success",
            entityId: result.delivery.id,
            metadata: {
                status: result.delivery.status,
                eventType: result.delivery.eventType,
                channel: result.delivery.channel,
                correlationId: result.delivery.correlationId,
            },
        });
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
        notifyIntegrationUpdate({
            repoId: result.delivery.repoId,
            scope: "notification",
            action: body.simulateFailure ? "manual_fail" : "manual_deliver",
            outcome:
                result.delivery.status === "failed" || result.delivery.status === "dead_letter" ? "error" : "success",
            entityId: result.delivery.id,
            metadata: {
                status: result.delivery.status,
                reason: result.reason,
                channel: result.delivery.channel,
                correlationId: result.delivery.correlationId,
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
            notifyIntegrationUpdate({
                repoId: outcome.repoId,
                scope: "notification",
                action: "retry_due",
                outcome:
                    outcome.status === "failed" || outcome.status === "dead_letter" || outcome.reason === "update_failed"
                        ? "error"
                        : "success",
                entityId: outcome.id,
                metadata: {
                    status: outcome.status,
                    reason: outcome.reason,
                    correlationId: outcome.correlationId,
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

integrationsRouter.get("/alerts/triage-audits", zValidator("query", alertTriageAuditsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const audits = await integrationsRepository.listAlertTriageAudits({
            repoId: query.repoId,
            alertCode: query.alertCode,
            action: query.action,
            actor: query.actor,
            sinceMinutes: query.sinceMinutes,
            limit: query.limit,
            offset: query.offset,
        });
        return c.json(audits);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration alert triage audits",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/incidents/timeline", zValidator("query", incidentTimelineSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const timeline = await integrationsRepository.listIncidentTimeline({
            repoId: query.repoId,
            provider: query.provider,
            scope: query.scope,
            severity: query.severity,
            sinceMinutes: query.sinceMinutes,
            limit: query.limit,
        });
        return c.json(timeline);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integrations incident timeline",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/incidents/sla-summary", zValidator("query", incidentSlaSummarySchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const summary = await integrationsRepository.incidentSlaSummary({
            repoId: query.repoId,
            windowMinutes: query.windowMinutes,
            warningSlaMinutes: query.warningSlaMinutes,
            criticalSlaMinutes: query.criticalSlaMinutes,
        });
        return c.json(summary);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integrations incident SLA summary",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/incidents/escalations", zValidator("query", incidentEscalationsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const audits = await integrationsRepository.listIncidentEscalations({
            repoId: query.repoId,
            alertCode: query.alertCode,
            target: query.target,
            mode: query.mode,
            actor: query.actor,
            sinceMinutes: query.sinceMinutes,
            limit: query.limit,
            offset: query.offset,
        });
        return c.json(audits);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integrations incident escalations",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post("/incidents/escalate", zValidator("json", escalateIncidentSchema), async (c) => {
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.escalateIncidentAlerts({
            repoId: body.repoId,
            target: body.target,
            mode: body.mode,
            actor: body.actor,
            note: body.note,
            alertCodes: body.alertCodes,
            windowMinutes: body.windowMinutes,
            warningSlaMinutes: body.warningSlaMinutes,
            criticalSlaMinutes: body.criticalSlaMinutes,
            cooldownMinutes: body.cooldownMinutes,
        });
        if (result.reason === "repo_not_found") {
            return c.json({ error: "Repository not found for incident escalation" }, 404);
        }
        if (
            result.reason === "invalid_escalation_target" ||
            result.reason === "invalid_escalation_mode" ||
            result.reason === "alert_codes_required"
        ) {
            return c.json({ error: "Invalid incident escalation request", reason: result.reason }, 400);
        }
        if (result.reason === "no_alerts_to_escalate") {
            return c.json({
                success: true,
                reason: result.reason,
                target: body.target,
                mode: body.mode,
                cooldownMinutes: body.cooldownMinutes ?? 30,
                processed: 0,
                succeeded: 0,
                failed: 0,
                skippedCooldown: 0,
                results: [],
            });
        }
        if (result.reason !== "ok") {
            return c.json({ error: "Failed to escalate incidents" }, 400);
        }
        notifyIntegrationUpdate({
            repoId: body.repoId,
            scope: "alert",
            action: "escalate",
            outcome: result.failed > 0 ? "error" : "success",
            metadata: {
                target: result.target,
                mode: result.mode,
                processed: result.processed,
                succeeded: result.succeeded,
                failed: result.failed,
                skippedCooldown: result.skippedCooldown,
                cooldownMinutes: result.cooldownMinutes,
                alertCodes: result.results.map((entry) => entry.alertCode),
            },
        });
        return c.json({
            success: true,
            ...result,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integrations incident escalation",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.get("/alerts/triage", zValidator("query", alertTriageSchema), async (c) => {
    const query = c.req.valid("query");
    const alertCodes = (query.alertCodes || "")
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean);
    try {
        const triage = await integrationsRepository.listAlertTriageStates({
            repoId: query.repoId,
            alertCodes: alertCodes.length > 0 ? alertCodes : undefined,
            limit: query.limit,
        });
        if (triage.reason !== "ok") {
            return c.json(
                {
                    error: triage.reason === "repo_not_found" ? "Repository not found for alert triage" : "Invalid alert triage request",
                },
                triage.reason === "repo_not_found" ? 404 : 400
            );
        }
        return c.json({
            states: triage.states,
            total: triage.states.length,
            limit: query.limit,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for integration alert triage",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post(
    "/alerts/:alertCode/acknowledge",
    zValidator("param", alertCodeParamSchema),
    zValidator("json", acknowledgeAlertSchema),
    async (c) => {
        const params = c.req.valid("param");
        const body = c.req.valid("json");
        try {
            const result = await integrationsRepository.acknowledgeAlert({
                repoId: body.repoId,
                alertCode: params.alertCode,
                actor: body.actor,
                note: body.note,
            });
            if (result.reason === "repo_not_found") {
                return c.json({ error: "Repository not found for alert acknowledge" }, 404);
            }
            if (result.reason !== "acknowledged") {
                return c.json({ error: "Failed to acknowledge integration alert", reason: result.reason }, 400);
            }
            notifyIntegrationUpdate({
                repoId: body.repoId,
                scope: "alert",
                action: "acknowledge",
                outcome: "success",
                entityId: result.alertCode,
                metadata: {
                    state: result.state,
                },
            });
            return c.json({
                success: true,
                reason: result.reason,
                alertCode: result.alertCode,
                state: result.state,
            });
        } catch (error) {
            return c.json(
                {
                    error: "Database unavailable for integration alert acknowledge",
                    details: details(error),
                },
                503
            );
        }
    }
);

integrationsRouter.post("/alerts/bulk-triage", zValidator("json", bulkAlertTriageSchema), async (c) => {
    const body = c.req.valid("json");
    try {
        const result = await integrationsRepository.bulkTriageAlerts({
            repoId: body.repoId,
            action: body.action,
            alertCodes: body.alertCodes,
            actor: body.actor,
            note: body.note,
            reason: body.reason,
            durationMinutes: body.durationMinutes,
        });
        if (result.reason === "repo_not_found") {
            return c.json({ error: "Repository not found for bulk triage" }, 404);
        }
        if (result.reason !== "ok") {
            return c.json({ error: "Failed to apply bulk triage action", reason: result.reason }, 400);
        }
        notifyIntegrationUpdate({
            repoId: body.repoId,
            scope: "alert",
            action: `bulk_${body.action}`,
            outcome: result.failed > 0 ? "error" : "success",
            metadata: {
                processed: result.processed,
                succeeded: result.succeeded,
                failed: result.failed,
                alertCodes: body.alertCodes,
            },
        });
        return c.json({
            success: true,
            ...result,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for bulk alert triage",
                details: details(error),
            },
            503
        );
    }
});

integrationsRouter.post(
    "/alerts/:alertCode/mute",
    zValidator("param", alertCodeParamSchema),
    zValidator("json", muteAlertSchema),
    async (c) => {
        const params = c.req.valid("param");
        const body = c.req.valid("json");
        try {
            const result = await integrationsRepository.muteAlert({
                repoId: body.repoId,
                alertCode: params.alertCode,
                actor: body.actor,
                reason: body.reason,
                durationMinutes: body.durationMinutes,
            });
            if (result.reason === "repo_not_found") {
                return c.json({ error: "Repository not found for alert mute" }, 404);
            }
            if (result.reason !== "muted") {
                return c.json({ error: "Failed to mute integration alert", reason: result.reason }, 400);
            }
            notifyIntegrationUpdate({
                repoId: body.repoId,
                scope: "alert",
                action: "mute",
                outcome: "success",
                entityId: result.alertCode,
                metadata: {
                    durationMinutes: result.durationMinutes,
                    mutedUntil: result.mutedUntil,
                    state: result.state,
                },
            });
            return c.json({
                success: true,
                reason: result.reason,
                alertCode: result.alertCode,
                durationMinutes: result.durationMinutes,
                mutedUntil: result.mutedUntil,
                state: result.state,
            });
        } catch (error) {
            return c.json(
                {
                    error: "Database unavailable for integration alert mute",
                    details: details(error),
                },
                503
            );
        }
    }
);

integrationsRouter.post(
    "/alerts/:alertCode/unmute",
    zValidator("param", alertCodeParamSchema),
    zValidator("json", unmuteAlertSchema),
    async (c) => {
        const params = c.req.valid("param");
        const body = c.req.valid("json");
        try {
            const result = await integrationsRepository.unmuteAlert({
                repoId: body.repoId,
                alertCode: params.alertCode,
                actor: body.actor,
                reason: body.reason,
            });
            if (result.reason === "repo_not_found") {
                return c.json({ error: "Repository not found for alert unmute" }, 404);
            }
            if (result.reason !== "unmuted") {
                return c.json({ error: "Failed to unmute integration alert", reason: result.reason }, 400);
            }
            notifyIntegrationUpdate({
                repoId: body.repoId,
                scope: "alert",
                action: "unmute",
                outcome: "success",
                entityId: result.alertCode,
                metadata: {
                    state: result.state,
                },
            });
            return c.json({
                success: true,
                reason: result.reason,
                alertCode: result.alertCode,
                state: result.state,
            });
        } catch (error) {
            return c.json(
                {
                    error: "Database unavailable for integration alert unmute",
                    details: details(error),
                },
                503
            );
        }
    }
);

export { integrationsRouter };
