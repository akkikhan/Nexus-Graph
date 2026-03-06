import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { settingsRepository } from "../repositories/settings.js";

const settingsRouter = new Hono();

const appSettingsSchema = z.object({
    ai_provider: z.enum(["anthropic", "openai", "google"]),
    ai_model: z.string().min(1),
    ensemble_mode: z.boolean(),
    auto_review: z.boolean(),
    risk_threshold: z.number().min(0).max(100),
    merge_queue_enabled: z.boolean(),
    require_ci: z.boolean(),
    auto_rebase: z.boolean(),
    merge_method: z.enum(["merge", "squash", "rebase"]),
    email_reviews: z.boolean(),
    email_ai_findings: z.boolean(),
    slack_enabled: z.boolean(),
    desktop_notifications: z.boolean(),
});

const updateSettingsSchema = z.object({
    userId: z.string().optional(),
    settings: appSettingsSchema,
});

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

settingsRouter.get("/", async (c) => {
    const userId = c.req.query("userId");

    try {
        const result = await settingsRepository.get(userId || undefined);
        if (!result) {
            return c.json({ error: "No user available for settings persistence" }, 404);
        }

        return c.json({
            settings: result.settings,
            userId: result.userId,
            updatedAt: result.updatedAt.toISOString(),
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for settings lookup",
                details: errorMessage(error),
            },
            503
        );
    }
});

settingsRouter.put("/", zValidator("json", updateSettingsSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const result = await settingsRepository.update({
            userId: body.userId,
            settings: body.settings,
        });
        if (!result) {
            return c.json({ error: "No user available for settings persistence" }, 404);
        }

        return c.json({
            settings: result.settings,
            userId: result.userId,
            updatedAt: result.updatedAt.toISOString(),
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for settings update",
                details: errorMessage(error),
            },
            503
        );
    }
});

export { settingsRouter };
