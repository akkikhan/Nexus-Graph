/**
 * NEXUS API - Agent Run Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { agentRepository } from "../repositories/agent.js";

const agentRouter = new Hono();

const agentRunStatusSchema = z.enum(["planned", "running", "awaiting_approval", "completed", "failed"]);
const agentAuditTypeSchema = z.enum(["status_transition", "checkpoint", "command", "file_edit", "note", "error"]);

const listRunsSchema = z.object({
    userId: z.string().optional(),
    repoId: z.string().optional(),
    prId: z.string().optional(),
    stackId: z.string().optional(),
    status: agentRunStatusSchema.optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
});

const createRunSchema = z.object({
    userId: z.string().optional(),
    repoId: z.string().optional(),
    prId: z.string().optional(),
    stackId: z.string().optional(),
    prompt: z.string().min(1),
    plan: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    requiresApproval: z.boolean().optional(),
});

const transitionRunSchema = z.object({
    status: agentRunStatusSchema,
    message: z.string().optional(),
    actor: z.string().optional(),
    awaitingApprovalReason: z.string().optional(),
    errorMessage: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
});

const listAuditEventsSchema = z.object({
    limit: z.coerce.number().min(1).max(500).default(100),
});

const appendAuditEventSchema = z.object({
    type: agentAuditTypeSchema.optional(),
    actor: z.string().optional(),
    message: z.string().optional(),
    command: z.string().optional(),
    filePath: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
});

function details(error: unknown): string {
    return agentRepository.errorMessage(error);
}

/**
 * GET /agents/runs - List agent runs
 */
agentRouter.get("/runs", zValidator("query", listRunsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const runs = await agentRepository.listRuns(query);
        return c.json({
            runs,
            total: runs.length,
            limit: query.limit,
            offset: query.offset,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for agent run listing",
                details: details(error),
            },
            503
        );
    }
});

/**
 * POST /agents/runs - Create agent run
 */
agentRouter.post("/runs", zValidator("json", createRunSchema), async (c) => {
    const body = c.req.valid("json");
    try {
        const run = await agentRepository.createRun(body);
        if (!run) {
            return c.json({ error: "Failed to create agent run" }, 500);
        }
        return c.json({ run }, 201);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for agent run creation",
                details: details(error),
            },
            503
        );
    }
});

/**
 * GET /agents/runs/:id - Get agent run
 */
agentRouter.get("/runs/:id", async (c) => {
    const id = c.req.param("id");
    try {
        const run = await agentRepository.getRun(id);
        if (!run) return c.json({ error: "Agent run not found" }, 404);
        return c.json({ run });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for agent run detail",
                details: details(error),
            },
            503
        );
    }
});

/**
 * POST /agents/runs/:id/transition - Transition agent run lifecycle status
 */
agentRouter.post("/runs/:id/transition", zValidator("json", transitionRunSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    try {
        const result = await agentRepository.transitionRun(id, body);
        if (result.reason === "run_not_found") return c.json({ error: "Agent run not found" }, 404);
        if (result.reason === "approval_reason_required") {
            return c.json({ error: "awaitingApprovalReason is required for awaiting_approval state" }, 400);
        }
        if (result.reason === "invalid_transition") {
            return c.json(
                {
                    error: "Invalid agent run lifecycle transition",
                    from: result.from,
                    to: result.to,
                    run: result.run,
                },
                409
            );
        }
        if (result.reason === "update_failed") {
            return c.json({ error: "Failed to update agent run state" }, 500);
        }
        return c.json({
            success: true,
            reason: result.reason,
            run: result.run,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for agent run transition",
                details: details(error),
            },
            503
        );
    }
});

/**
 * GET /agents/runs/:id/audit - List audit events for an agent run
 */
agentRouter.get("/runs/:id/audit", zValidator("query", listAuditEventsSchema), async (c) => {
    const id = c.req.param("id");
    const query = c.req.valid("query");
    try {
        const run = await agentRepository.getRun(id);
        if (!run) return c.json({ error: "Agent run not found" }, 404);
        const events = await agentRepository.listAuditEvents(id, query.limit);
        return c.json({
            events,
            total: events.length,
            limit: query.limit,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for agent audit listing",
                details: details(error),
            },
            503
        );
    }
});

/**
 * POST /agents/runs/:id/audit - Append audit event to agent run
 */
agentRouter.post("/runs/:id/audit", zValidator("json", appendAuditEventSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    try {
        const result = await agentRepository.appendAuditEvent(id, body);
        if (result.reason === "run_not_found") return c.json({ error: "Agent run not found" }, 404);
        if (result.reason === "insert_failed") return c.json({ error: "Failed to persist agent audit event" }, 500);
        return c.json(
            {
                success: true,
                event: result.event,
            },
            201
        );
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for agent audit creation",
                details: details(error),
            },
            503
        );
    }
});

export { agentRouter };

