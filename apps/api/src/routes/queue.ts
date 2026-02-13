/**
 * NEXUS API - Queue Routes
 */

import { Hono } from "hono";

type QueueItemStatus = "running" | "pending";
type QueueCiStatus = "in_progress" | "waiting";
type QueuePriority = "high";

interface QueueItem {
    id: string;
    position: number;
    pr: {
        number: number;
        title: string;
        author: { username: string; avatar: string };
        repository: string;
    };
    status: QueueItemStatus;
    ciStatus: QueueCiStatus;
    ciProgress?: number;
    estimatedTimeRemaining: string;
    addedAt: string;
    attempts: number;
    priority?: QueuePriority;
}

interface RecentQueueResult {
    pr: { number: number; title: string };
    status: "merged" | "failed";
    mergedAt?: string;
    failedAt?: string;
    duration?: string;
    reason?: string;
    attempts?: number;
}

const queueRouter = new Hono();

const queueState: {
    paused: boolean;
    turbo: boolean;
    active: QueueItem[];
    recent: RecentQueueResult[];
} = {
    paused: false,
    turbo: false,
    active: [
        {
            id: "queue-1",
            position: 1,
            pr: {
                number: 234,
                title: "Add user authentication with OAuth",
                author: { username: "johndoe", avatar: "" },
                repository: "nexus/platform",
            },
            status: "running",
            ciStatus: "in_progress",
            ciProgress: 65,
            estimatedTimeRemaining: "4m",
            addedAt: "10 minutes ago",
            attempts: 1,
        },
        {
            id: "queue-2",
            position: 2,
            pr: {
                number: 231,
                title: "Fix payment race condition",
                author: { username: "janedoe", avatar: "" },
                repository: "nexus/billing",
            },
            status: "pending",
            ciStatus: "waiting",
            estimatedTimeRemaining: "~12m",
            addedAt: "8 minutes ago",
            attempts: 0,
            priority: "high",
        },
        {
            id: "queue-3",
            position: 3,
            pr: {
                number: 228,
                title: "Update dependencies",
                author: { username: "dependabot", avatar: "" },
                repository: "nexus/platform",
            },
            status: "pending",
            ciStatus: "waiting",
            estimatedTimeRemaining: "~18m",
            addedAt: "5 minutes ago",
            attempts: 0,
        },
    ],
    recent: [
        {
            pr: { number: 220, title: "Add error boundaries" },
            status: "merged",
            mergedAt: "15 minutes ago",
            duration: "3m 42s",
        },
        {
            pr: { number: 218, title: "Fix memory leak in worker" },
            status: "merged",
            mergedAt: "32 minutes ago",
            duration: "5m 18s",
        },
        {
            pr: { number: 215, title: "Optimize database queries" },
            status: "failed",
            failedAt: "1 hour ago",
            reason: "Flaky test in payment module",
            attempts: 3,
        },
    ],
};

function syncQueueHeadState() {
    queueState.active = queueState.active
        .sort((a, b) => a.position - b.position)
        .map((item, index) => ({ ...item, position: index + 1 }));

    if (queueState.paused) {
        queueState.active = queueState.active.map((item) => ({
            ...item,
            status: "pending",
            ciStatus: "waiting",
        }));
        return;
    }

    queueState.active = queueState.active.map((item, index) => {
        if (index === 0) {
            return {
                ...item,
                status: "running",
                ciStatus: "in_progress",
                ciProgress: item.ciProgress || (queueState.turbo ? 85 : 55),
            };
        }

        return {
            ...item,
            status: "pending",
            ciStatus: "waiting",
        };
    });
}

function queueStats() {
    const queueLength = queueState.active.length;
    const merged = queueState.recent.filter((item) => item.status === "merged").length;
    const totalRecent = Math.max(queueState.recent.length, 1);

    return {
        queueLength,
        avgWaitTime: queueState.turbo ? "5m" : "8m",
        successRate: Math.round((merged / totalRecent) * 100),
        throughput: queueState.turbo ? "31/day" : "24/day",
    };
}

queueRouter.get("/", async (c) => {
    syncQueueHeadState();
    return c.json({
        active: queueState.active,
        recent: queueState.recent,
        controls: {
            paused: queueState.paused,
            turbo: queueState.turbo,
        },
        stats: queueStats(),
    });
});

queueRouter.post("/pause", async (c) => {
    queueState.paused = true;
    syncQueueHeadState();
    return c.json({ success: true, paused: queueState.paused });
});

queueRouter.post("/resume", async (c) => {
    queueState.paused = false;
    syncQueueHeadState();
    return c.json({ success: true, paused: queueState.paused });
});

queueRouter.post("/turbo", async (c) => {
    const payload = await c.req.json().catch(() => ({}));
    if (typeof payload?.enabled === "boolean") {
        queueState.turbo = payload.enabled;
    } else {
        queueState.turbo = !queueState.turbo;
    }
    syncQueueHeadState();
    return c.json({ success: true, turbo: queueState.turbo });
});

queueRouter.post("/:id/retry", async (c) => {
    const id = c.req.param("id");
    const target = queueState.active.find((item) => item.id === id);
    if (!target) {
        return c.json({ error: "Queue item not found" }, 404);
    }

    target.attempts += 1;
    target.addedAt = "just now";
    target.ciProgress = queueState.turbo ? 20 : 10;

    syncQueueHeadState();
    return c.json({ success: true, item: target });
});

queueRouter.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const before = queueState.active.length;
    queueState.active = queueState.active.filter((item) => item.id !== id);
    if (queueState.active.length === before) {
        return c.json({ error: "Queue item not found" }, 404);
    }

    syncQueueHeadState();
    return c.json({ success: true, removedId: id });
});

export { queueRouter };
