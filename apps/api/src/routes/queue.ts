/**
 * NEXUS API - Queue Routes
 */

import { Hono } from "hono";
import { queueRepository } from "../repositories/queue.js";

const queueRouter = new Hono();

function details(error: unknown): string {
    return queueRepository.errorMessage(error);
}

async function resolveRepoId(queryRepoId?: string): Promise<string | null> {
    return queueRepository.resolveRepoId(queryRepoId);
}

queueRouter.get("/", async (c) => {
    const repoId = c.req.query("repoId");
    try {
        return c.json(await queueRepository.snapshot(repoId));
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for queue snapshot",
                details: details(error),
            },
            503
        );
    }
});

queueRouter.post("/pause", async (c) => {
    const repoId = await resolveRepoId(c.req.query("repoId"));
    if (!repoId) {
        return c.json({ error: "No repository available for queue operations" }, 404);
    }

    try {
        const controls = await queueRepository.pause(repoId);
        return c.json({ success: true, paused: controls.paused });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for queue pause",
                details: details(error),
            },
            503
        );
    }
});

queueRouter.post("/resume", async (c) => {
    const repoId = await resolveRepoId(c.req.query("repoId"));
    if (!repoId) {
        return c.json({ error: "No repository available for queue operations" }, 404);
    }

    try {
        const controls = await queueRepository.resume(repoId);
        return c.json({ success: true, paused: controls.paused });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for queue resume",
                details: details(error),
            },
            503
        );
    }
});

queueRouter.post("/turbo", async (c) => {
    const payload = await c.req.json().catch(() => ({}));
    const repoId =
        await resolveRepoId(
            c.req.query("repoId") ||
                (typeof payload?.repoId === "string" ? payload.repoId : undefined)
        );
    if (!repoId) {
        return c.json({ error: "No repository available for queue operations" }, 404);
    }

    try {
        const current = await queueRepository.snapshot(repoId);
        const enabled =
            typeof payload?.enabled === "boolean"
                ? payload.enabled
                : !current.controls.turbo;
        const controls = await queueRepository.setTurbo(repoId, enabled);
        return c.json({ success: true, turbo: controls.turbo });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for queue turbo update",
                details: details(error),
            },
            503
        );
    }
});

queueRouter.post("/:id/retry", async (c) => {
    const id = c.req.param("id");
    const repoId = await resolveRepoId(c.req.query("repoId"));
    if (!repoId) {
        return c.json({ error: "No repository available for queue operations" }, 404);
    }

    try {
        const retried = await queueRepository.retry(repoId, id);
        if (!retried) {
            return c.json({ error: "Queue item not found" }, 404);
        }
        return c.json({ success: true });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for queue retry",
                details: details(error),
            },
            503
        );
    }
});

queueRouter.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const repoId = await resolveRepoId(c.req.query("repoId"));
    if (!repoId) {
        return c.json({ error: "No repository available for queue operations" }, 404);
    }

    try {
        const removed = await queueRepository.remove(repoId, id);
        if (!removed) {
            return c.json({ error: "Queue item not found" }, 404);
        }
        return c.json({ success: true, removedId: id });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for queue removal",
                details: details(error),
            },
            503
        );
    }
});

export { queueRouter };
