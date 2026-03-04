/**
 * NEXUS API - Contextual Chat Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { chatRepository } from "../repositories/chat.js";

const chatRouter = new Hono();

const sessionStatusSchema = z.enum(["active", "archived"]);

const listSessionsSchema = z.object({
    userId: z.string().optional(),
    repoId: z.string().optional(),
    prId: z.string().optional(),
    stackId: z.string().optional(),
    status: sessionStatusSchema.optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
});

const createSessionSchema = z.object({
    userId: z.string().optional(),
    repoId: z.string().optional(),
    prId: z.string().optional(),
    stackId: z.string().optional(),
    title: z.string().max(120).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
});

const listMessagesSchema = z.object({
    limit: z.coerce.number().min(1).max(500).default(100),
});

const citationSchema = z.object({
    type: z.string().optional(),
    title: z.string().optional(),
    url: z.string().url().optional(),
    snippet: z.string().optional(),
    file: z.string().optional(),
    line: z.number().int().positive().optional(),
});

const toolActionSchema = z.object({
    name: z.string(),
    status: z.enum(["planned", "running", "completed", "failed"]).optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    error: z.string().optional(),
});

const provenanceSchema = z
    .object({
        source: z.string().optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
        citations: z.array(citationSchema).optional(),
        toolActions: z.array(toolActionSchema).optional(),
        latencyMs: z.number().int().min(0).optional(),
    })
    .passthrough();

const createMessageSchema = z
    .object({
        role: z.enum(["user", "assistant", "system", "tool"]),
        content: z.string().min(1),
        provider: z.string().optional(),
        model: z.string().optional(),
        citations: z.array(citationSchema).optional(),
        toolActions: z.array(toolActionSchema).optional(),
        provenance: provenanceSchema.optional(),
        promptTokens: z.number().int().min(0).optional(),
        completionTokens: z.number().int().min(0).optional(),
        totalTokens: z.number().int().min(0).optional(),
    })
    .superRefine((value, ctx) => {
        if (value.role === "assistant" && !value.provenance) {
            ctx.addIssue({
                code: "custom",
                message: "Assistant messages require provenance metadata.",
                path: ["provenance"],
            });
        }
    });

function details(error: unknown): string {
    return chatRepository.errorMessage(error);
}

/**
 * GET /chat/sessions - List chat sessions
 */
chatRouter.get("/sessions", zValidator("query", listSessionsSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const sessions = await chatRepository.listSessions(query);
        return c.json({
            sessions,
            total: sessions.length,
            limit: query.limit,
            offset: query.offset,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for chat session listing",
                details: details(error),
            },
            503
        );
    }
});

/**
 * POST /chat/sessions - Create chat session
 */
chatRouter.post("/sessions", zValidator("json", createSessionSchema), async (c) => {
    const body = c.req.valid("json");
    try {
        const session = await chatRepository.createSession(body);
        if (!session) {
            return c.json({ error: "Failed to create chat session" }, 500);
        }
        return c.json({ session }, 201);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for chat session creation",
                details: details(error),
            },
            503
        );
    }
});

/**
 * GET /chat/sessions/:id - Get chat session
 */
chatRouter.get("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    try {
        const session = await chatRepository.getSession(id);
        if (!session) {
            return c.json({ error: "Chat session not found" }, 404);
        }
        return c.json({ session });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for chat session detail",
                details: details(error),
            },
            503
        );
    }
});

/**
 * GET /chat/sessions/:id/messages - List chat messages
 */
chatRouter.get("/sessions/:id/messages", zValidator("query", listMessagesSchema), async (c) => {
    const id = c.req.param("id");
    const query = c.req.valid("query");
    try {
        const session = await chatRepository.getSession(id);
        if (!session) {
            return c.json({ error: "Chat session not found" }, 404);
        }
        const messages = await chatRepository.listMessages(id, query.limit);
        return c.json({
            messages,
            total: messages.length,
            limit: query.limit,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for chat message listing",
                details: details(error),
            },
            503
        );
    }
});

/**
 * POST /chat/sessions/:id/messages - Persist chat message
 */
chatRouter.post("/sessions/:id/messages", zValidator("json", createMessageSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    try {
        const appended = await chatRepository.appendMessage(id, body);
        if (appended.reason === "session_not_found") {
            return c.json({ error: "Chat session not found" }, 404);
        }
        if (appended.reason === "insert_failed") {
            return c.json({ error: "Failed to persist chat message" }, 500);
        }
        return c.json(
            {
                success: true,
                session: appended.session,
                message: appended.message,
            },
            201
        );
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for chat message creation",
                details: details(error),
            },
            503
        );
    }
});

export { chatRouter };

