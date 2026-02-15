/**
 * NEXUS API - AI Rules Routes
 *
 * Minimal CRUD for "ai_rules" table.
 * Currently assumes a single-tenant-ish setup: if orgId is omitted, we pick the first org.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { aiRules, db, organizations } from "../db/index.js";

const aiRulesRouter = new Hono();

const listSchema = z.object({
    orgId: z.string().uuid().optional(),
    repoId: z.string().uuid().optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
});

const createSchema = z.object({
    orgId: z.string().uuid().optional(),
    repoId: z.string().uuid().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    prompt: z.string().min(1),
    regexPattern: z.string().optional(),
    filePatterns: z.array(z.string()).optional(),
    severity: z.enum(["info", "warning", "high", "critical"]).optional(),
    enabled: z.boolean().optional(),
});

const updateSchema = z.object({
    repoId: z.string().uuid().nullable().optional(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    prompt: z.string().min(1).optional(),
    regexPattern: z.string().nullable().optional(),
    filePatterns: z.array(z.string()).optional(),
    severity: z.enum(["info", "warning", "high", "critical"]).optional(),
    enabled: z.boolean().optional(),
});

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

function mapRule(rule: any) {
    return {
        id: rule.id,
        orgId: rule.orgId,
        repoId: rule.repoId ?? null,
        name: rule.name,
        description: rule.description ?? null,
        prompt: rule.prompt,
        regexPattern: rule.regexPattern ?? null,
        filePatterns: Array.isArray(rule.filePatterns) ? rule.filePatterns : [],
        severity: rule.severity ?? "warning",
        enabled: !!rule.enabled,
        createdAt: rule.createdAt instanceof Date ? rule.createdAt.toISOString() : rule.createdAt,
        updatedAt: rule.updatedAt instanceof Date ? rule.updatedAt.toISOString() : rule.updatedAt,
    };
}

async function resolveOrgId(explicit?: string): Promise<string> {
    if (explicit) return explicit;
    const rows = await db
        .select({ id: organizations.id })
        .from(organizations)
        .orderBy(asc(organizations.createdAt))
        .limit(1);
    const id = rows?.[0]?.id;
    if (!id) throw new Error("No organization found");
    return id;
}

/**
 * GET /ai-rules
 */
aiRulesRouter.get("/", zValidator("query", listSchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const orgId = await resolveOrgId(query.orgId);
        const where =
            query.repoId
                ? and(
                    eq(aiRules.orgId, orgId),
                    or(eq(aiRules.repoId, query.repoId), isNull(aiRules.repoId))
                )
                : and(eq(aiRules.orgId, orgId));

        const rows = await db
            .select()
            .from(aiRules)
            .where(where)
            .orderBy(asc(aiRules.createdAt))
            .limit(query.limit)
            .offset(query.offset);

        return c.json({ rules: rows.map(mapRule) });
    } catch (error) {
        return c.json(
            { error: "Database unavailable for AI rules listing", details: errorMessage(error) },
            503
        );
    }
});

/**
 * POST /ai-rules
 */
aiRulesRouter.post("/", zValidator("json", createSchema), async (c) => {
    const body = c.req.valid("json");
    try {
        const orgId = await resolveOrgId(body.orgId);
        const now = new Date();

        const inserted = await db
            .insert(aiRules)
            .values({
                orgId,
                repoId: body.repoId ?? null,
                name: body.name,
                description: body.description ?? null,
                prompt: body.prompt,
                regexPattern: body.regexPattern ?? null,
                filePatterns: body.filePatterns ?? [],
                severity: body.severity ?? "warning",
                enabled: typeof body.enabled === "boolean" ? body.enabled : true,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        const rule = inserted?.[0];
        return c.json({ rule: mapRule(rule) }, 201);
    } catch (error) {
        return c.json(
            { error: "Database unavailable for AI rule create", details: errorMessage(error) },
            503
        );
    }
});

/**
 * PATCH /ai-rules/:id
 */
aiRulesRouter.patch("/:id", zValidator("json", updateSchema), async (c) => {
    const id = c.req.param("id");
    const updates = c.req.valid("json");
    try {
        const updated = await db
            .update(aiRules)
            .set({
                ...updates,
                updatedAt: new Date(),
            } as any)
            .where(eq(aiRules.id, id))
            .returning();

        const rule = updated?.[0];
        if (!rule) return c.json({ error: "AI rule not found" }, 404);
        return c.json({ rule: mapRule(rule) });
    } catch (error) {
        return c.json(
            { error: "Database unavailable for AI rule update", details: errorMessage(error) },
            503
        );
    }
});

/**
 * DELETE /ai-rules/:id
 */
aiRulesRouter.delete("/:id", async (c) => {
    const id = c.req.param("id");
    try {
        const deleted = await db
            .delete(aiRules)
            .where(eq(aiRules.id, id))
            .returning({ id: aiRules.id });
        if (!deleted?.length) return c.json({ error: "AI rule not found" }, 404);
        return c.json({ success: true });
    } catch (error) {
        return c.json(
            { error: "Database unavailable for AI rule delete", details: errorMessage(error) },
            503
        );
    }
});

export { aiRulesRouter };

