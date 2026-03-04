/**
 * NEXUS Repository Layer - Merge Queue
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, mergeQueue, pullRequests, repositories, users } from "../db/index.js";

const ACTIVE_DB_STATUSES: Array<"pending" | "running" | "passed"> = [
    "pending",
    "running",
    "passed",
];
const RECENT_DB_STATUSES: Array<"merged" | "failed"> = ["merged", "failed"];
const MINUTE = 60_000;
const DAY = 24 * 60 * 60 * 1000;

type QueueControls = {
    paused: boolean;
    turbo: boolean;
};

type QueueSnapshot = {
    active: Array<{
        id: string;
        position: number;
        pr: {
            number: number;
            title: string;
            author: { username: string; avatar: string };
            repository: string;
        };
        status: "running" | "pending";
        ciStatus: "in_progress" | "waiting";
        ciProgress?: number;
        estimatedTimeRemaining: string;
        addedAt: string;
        attempts: number;
        priority?: "high";
    }>;
    recent: Array<{
        pr: { number: number; title: string };
        status: "merged" | "failed";
        mergedAt?: string;
        failedAt?: string;
        duration?: string;
        reason?: string;
        attempts?: number;
    }>;
    controls: QueueControls;
    stats: {
        queueLength: number;
        avgWaitTime: string;
        successRate: number;
        throughput: string;
    };
};

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function parseControls(settings: unknown): QueueControls {
    const root = asRecord(settings) || {};
    const queue = asRecord(root.queue) || {};

    const pausedRaw = queue.paused ?? root.queuePaused;
    const turboRaw = queue.turbo ?? root.queueTurbo;

    return {
        paused: pausedRaw === true,
        turbo: turboRaw === true,
    };
}

function withControls(settings: unknown, updates: Partial<QueueControls>): Record<string, unknown> {
    const root = asRecord(settings) ? { ...(settings as Record<string, unknown>) } : {};
    const queue = asRecord(root.queue) ? { ...(root.queue as Record<string, unknown>) } : {};

    if (typeof updates.paused === "boolean") queue.paused = updates.paused;
    if (typeof updates.turbo === "boolean") queue.turbo = updates.turbo;

    root.queue = queue;
    return root;
}

function formatRelativeTime(dateValue: Date | string | null | undefined): string {
    if (!dateValue) return "just now";
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    const diffMs = Date.now() - date.getTime();
    if (Number.isNaN(diffMs)) return "just now";

    const minutes = Math.max(1, Math.floor(diffMs / MINUTE));
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatDuration(startedAt: Date | null, completedAt: Date | null): string | undefined {
    if (!startedAt || !completedAt) return undefined;
    const seconds = Math.max(1, Math.round((completedAt.getTime() - startedAt.getTime()) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    if (minutes <= 0) return `${remaining}s`;
    return `${minutes}m ${remaining}s`;
}

function statusToActive(status: string): "running" | "pending" {
    return status === "running" ? "running" : "pending";
}

function ciProgress(status: "running" | "pending", turbo: boolean): number | undefined {
    if (status !== "running") return undefined;
    return turbo ? 85 : 55;
}

function estimatedTime(position: number, status: "running" | "pending", turbo: boolean): string {
    if (status === "running") {
        return turbo ? "3m" : "4m";
    }
    const perItem = turbo ? 4 : 6;
    const minutes = Math.max(4, perItem * position);
    return `~${minutes}m`;
}

async function resolveRepoId(explicitRepoId?: string): Promise<string | null> {
    if (explicitRepoId) {
        const repo = await db.query.repositories.findFirst({
            where: eq(repositories.id, explicitRepoId),
            columns: { id: true },
        });
        return repo?.id || null;
    }

    const [queuedRepo] = await db
        .select({ repoId: mergeQueue.repoId })
        .from(mergeQueue)
        .orderBy(asc(mergeQueue.createdAt))
        .limit(1);
    if (queuedRepo?.repoId) return queuedRepo.repoId;

    const repo = await db.query.repositories.findFirst({
        columns: { id: true },
        orderBy: [asc(repositories.createdAt)],
    });
    return repo?.id || null;
}

async function getControls(repoId: string): Promise<QueueControls> {
    const repo = await db.query.repositories.findFirst({
        where: eq(repositories.id, repoId),
        columns: { settings: true },
    });
    return parseControls(repo?.settings);
}

async function saveControls(repoId: string, updates: Partial<QueueControls>): Promise<QueueControls> {
    const repo = await db.query.repositories.findFirst({
        where: eq(repositories.id, repoId),
        columns: { settings: true },
    });
    if (!repo) {
        throw new Error(`Repository ${repoId} not found`);
    }

    const settings = withControls(repo.settings, updates);
    await db
        .update(repositories)
        .set({ settings, updatedAt: new Date() })
        .where(eq(repositories.id, repoId));
    return parseControls(settings);
}

async function rebalanceActivePositions(repoId: string): Promise<void> {
    const activeRows = await db
        .select({
            id: mergeQueue.id,
            position: mergeQueue.position,
        })
        .from(mergeQueue)
        .where(
            and(
                eq(mergeQueue.repoId, repoId),
                inArray(mergeQueue.status, ACTIVE_DB_STATUSES)
            )
        )
        .orderBy(asc(mergeQueue.position), asc(mergeQueue.createdAt));

    for (let index = 0; index < activeRows.length; index += 1) {
        const desired = index + 1;
        if (activeRows[index].position === desired) continue;
        await db
            .update(mergeQueue)
            .set({ position: desired })
            .where(eq(mergeQueue.id, activeRows[index].id));
    }
}

async function enforceHeadState(repoId: string, controls: QueueControls): Promise<void> {
    const rows = await db
        .select({
            id: mergeQueue.id,
            status: mergeQueue.status,
            ciStatus: mergeQueue.ciStatus,
            startedAt: mergeQueue.startedAt,
        })
        .from(mergeQueue)
        .where(
            and(
                eq(mergeQueue.repoId, repoId),
                inArray(mergeQueue.status, ACTIVE_DB_STATUSES)
            )
        )
        .orderBy(asc(mergeQueue.position), asc(mergeQueue.createdAt));

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const isHead = !controls.paused && index === 0;
        const desiredStatus = isHead ? "running" : "pending";
        const desiredCiStatus = isHead ? "in_progress" : "waiting";
        const desiredStartedAt = isHead ? row.startedAt || new Date() : null;

        const needsUpdate =
            row.status !== desiredStatus ||
            row.ciStatus !== desiredCiStatus ||
            ((row.startedAt === null) !== (desiredStartedAt === null));
        if (!needsUpdate) continue;

        await db
            .update(mergeQueue)
            .set({
                status: desiredStatus,
                ciStatus: desiredCiStatus,
                startedAt: desiredStartedAt,
            })
            .where(eq(mergeQueue.id, row.id));
    }
}

async function buildSnapshot(repoId: string): Promise<QueueSnapshot> {
    const controls = await getControls(repoId);
    await rebalanceActivePositions(repoId);
    await enforceHeadState(repoId, controls);

    const activeRows = await db
        .select({
            id: mergeQueue.id,
            position: mergeQueue.position,
            priority: mergeQueue.priority,
            status: mergeQueue.status,
            ciStatus: mergeQueue.ciStatus,
            attempts: mergeQueue.attempts,
            createdAt: mergeQueue.createdAt,
            prNumber: pullRequests.number,
            prTitle: pullRequests.title,
            repoName: repositories.fullName,
            authorName: users.name,
            authorAvatar: users.avatar,
        })
        .from(mergeQueue)
        .innerJoin(pullRequests, eq(mergeQueue.prId, pullRequests.id))
        .innerJoin(repositories, eq(mergeQueue.repoId, repositories.id))
        .leftJoin(users, eq(pullRequests.authorId, users.id))
        .where(
            and(
                eq(mergeQueue.repoId, repoId),
                inArray(mergeQueue.status, ACTIVE_DB_STATUSES)
            )
        )
        .orderBy(asc(mergeQueue.position), asc(mergeQueue.createdAt));

    const recentRows = await db
        .select({
            status: mergeQueue.status,
            attempts: mergeQueue.attempts,
            completedAt: mergeQueue.completedAt,
            startedAt: mergeQueue.startedAt,
            errorMessage: mergeQueue.errorMessage,
            prNumber: pullRequests.number,
            prTitle: pullRequests.title,
        })
        .from(mergeQueue)
        .innerJoin(pullRequests, eq(mergeQueue.prId, pullRequests.id))
        .where(
            and(
                eq(mergeQueue.repoId, repoId),
                inArray(mergeQueue.status, RECENT_DB_STATUSES)
            )
        )
        .orderBy(desc(mergeQueue.completedAt), desc(mergeQueue.createdAt))
        .limit(12);

    const active = activeRows.map((row) => {
        const status = statusToActive(row.status);
        const queueCiStatus: "in_progress" | "waiting" =
            status === "running" ? "in_progress" : "waiting";
        return {
            id: row.id,
            position: row.position,
            pr: {
                number: row.prNumber,
                title: row.prTitle,
                author: {
                    username: row.authorName || "unknown",
                    avatar: row.authorAvatar || "",
                },
                repository: row.repoName,
            },
            status,
            ciStatus: queueCiStatus,
            ciProgress: ciProgress(status, controls.turbo),
            estimatedTimeRemaining: estimatedTime(row.position, status, controls.turbo),
            addedAt: formatRelativeTime(row.createdAt),
            attempts: row.attempts ?? 0,
            priority: (row.priority ?? 0) > 0 ? "high" as const : undefined,
        };
    });

    const recent = recentRows.map((row) => {
        const completion = formatRelativeTime(row.completedAt);
        return {
            pr: { number: row.prNumber, title: row.prTitle },
            status: row.status === "failed" ? "failed" as const : "merged" as const,
            mergedAt: row.status === "merged" ? completion : undefined,
            failedAt: row.status === "failed" ? completion : undefined,
            duration: formatDuration(row.startedAt, row.completedAt),
            reason: row.status === "failed" ? row.errorMessage || "Unknown failure" : undefined,
            attempts: row.status === "failed" ? row.attempts ?? 0 : undefined,
        };
    });

    const mergedCount = recent.filter((item) => item.status === "merged").length;
    const totalRecent = Math.max(recent.length, 1);
    const averageWait =
        active.length === 0
            ? 0
            : Math.round(
                active.reduce((sum, item) => {
                    const created = activeRows.find((row) => row.id === item.id)?.createdAt;
                    if (!created) return sum;
                    return sum + Math.max(1, Math.round((Date.now() - created.getTime()) / MINUTE));
                }, 0) / active.length
            );
    const throughputPerDay = recentRows.filter((row) => {
        if (!row.completedAt) return false;
        return Date.now() - row.completedAt.getTime() <= DAY;
    }).length;

    return {
        active,
        recent,
        controls,
        stats: {
            queueLength: active.length,
            avgWaitTime: `${Math.max(1, averageWait)}m`,
            successRate: Math.round((mergedCount / totalRecent) * 100),
            throughput: `${Math.max(throughputPerDay, mergedCount)}/day`,
        },
    };
}

export const queueRepository = {
    async resolveRepoId(repoId?: string) {
        return resolveRepoId(repoId);
    },

    async snapshot(repoId?: string): Promise<QueueSnapshot> {
        const resolvedRepoId = await resolveRepoId(repoId);
        if (!resolvedRepoId) {
            return {
                active: [],
                recent: [],
                controls: { paused: false, turbo: false },
                stats: {
                    queueLength: 0,
                    avgWaitTime: "0m",
                    successRate: 100,
                    throughput: "0/day",
                },
            };
        }
        return buildSnapshot(resolvedRepoId);
    },

    async pause(repoId: string): Promise<QueueControls> {
        const controls = await saveControls(repoId, { paused: true });
        await enforceHeadState(repoId, controls);
        return controls;
    },

    async resume(repoId: string): Promise<QueueControls> {
        const controls = await saveControls(repoId, { paused: false });
        await enforceHeadState(repoId, controls);
        return controls;
    },

    async setTurbo(repoId: string, enabled: boolean): Promise<QueueControls> {
        const controls = await saveControls(repoId, { turbo: enabled });
        await enforceHeadState(repoId, controls);
        return controls;
    },

    async retry(repoId: string, id: string): Promise<boolean> {
        const [item] = await db
            .select({ id: mergeQueue.id })
            .from(mergeQueue)
            .where(
                and(
                    eq(mergeQueue.repoId, repoId),
                    eq(mergeQueue.id, id),
                    inArray(mergeQueue.status, ACTIVE_DB_STATUSES)
                )
            )
            .limit(1);
        if (!item) return false;

        await db
            .update(mergeQueue)
            .set({
                status: "pending",
                ciStatus: "waiting",
                attempts: sql`coalesce(${mergeQueue.attempts}, 0) + 1`,
                errorMessage: null,
                startedAt: null,
                completedAt: null,
                createdAt: new Date(),
            })
            .where(eq(mergeQueue.id, id));

        const controls = await getControls(repoId);
        await rebalanceActivePositions(repoId);
        await enforceHeadState(repoId, controls);
        return true;
    },

    async remove(repoId: string, id: string): Promise<boolean> {
        const [removed] = await db
            .delete(mergeQueue)
            .where(
                and(
                    eq(mergeQueue.repoId, repoId),
                    eq(mergeQueue.id, id),
                    inArray(mergeQueue.status, ACTIVE_DB_STATUSES)
                )
            )
            .returning({ id: mergeQueue.id });
        if (!removed) return false;

        const controls = await getControls(repoId);
        await rebalanceActivePositions(repoId);
        await enforceHeadState(repoId, controls);
        return true;
    },

    errorMessage,
};
