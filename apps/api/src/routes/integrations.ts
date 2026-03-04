/**
 * NEXUS API - Integrations and Notifications Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { integrationsRepository } from "../repositories/integrations.js";

const integrationsRouter = new Hono();

const providerSchema = z.enum(["slack", "linear", "jira"]);
const connectionStatusSchema = z.enum(["active", "disabled", "error"]);
const issueLinkStatusSchema = z.enum(["linked", "sync_pending", "sync_failed"]);
const deliveryStatusSchema = z.enum(["pending", "retrying", "delivered", "failed", "dead_letter"]);

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
});

const metricsSchema = z.object({
    repoId: z.string().optional(),
});

function details(error: unknown): string {
    return integrationsRepository.errorMessage(error);
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
        const result = await integrationsRepository.retryDueNotifications(body.limit);
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

export { integrationsRouter };
