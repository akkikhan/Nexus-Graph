/**
 * NEXUS API - Activity Routes
 */

import { Hono } from "hono";
import path from "path";
import { readFile } from "fs/promises";
import { activityRepository, ActivityItem } from "../repositories/activity.js";

const activityRouter = new Hono();
const SERVER_STACK_FILE = path.join(process.cwd(), ".nexus", "server-stack.json");
const LOCAL_STACK_FILE = path.join(process.cwd(), ".nexus", "stack.json");

interface LocalStackData {
    trunk: string;
    branches: Record<
        string,
        {
            name: string;
            position: number;
            prNumber?: number;
            prStatus?: string;
        }
    >;
}

const SUPPORTED_ACTIVITY_TYPE_FILTERS = new Set([
    "ai_review",
    "review_requested",
    "pr_merged",
    "stack_updated",
    "integration_event",
]);

function formatRelativeTime(dateValue: unknown): string {
    const date =
        dateValue instanceof Date
            ? dateValue
            : new Date(typeof dateValue === "string" ? dateValue : Date.now());
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.floor(diffMs / 60000));
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

async function loadLocalStackData(): Promise<LocalStackData | null> {
    for (const candidate of [SERVER_STACK_FILE, LOCAL_STACK_FILE]) {
        try {
            const raw = await readFile(candidate, "utf8");
            const parsed = JSON.parse(raw);
            if (
                parsed &&
                typeof parsed === "object" &&
                typeof parsed.trunk === "string" &&
                parsed.branches &&
                typeof parsed.branches === "object"
            ) {
                return parsed as LocalStackData;
            }
        } catch {
            // Try next snapshot source.
        }
    }
    return null;
}

function errorMessage(error: unknown): string {
    return activityRepository.errorMessage(error);
}

/**
 * GET /activity - List recent activity
 */
activityRouter.get("/", async (c) => {
    const limit = Math.min(
        Math.max(Number(c.req.query("limit") || 20), 1),
        50
    );
    const rawType = (c.req.query("type") || "all").trim();
    const typeFilter = rawType === "all" ? null : rawType;

    if (typeFilter && !SUPPORTED_ACTIVITY_TYPE_FILTERS.has(typeFilter)) {
        return c.json(
            {
                error: "Unsupported activity type filter",
                details: `Supported values: all, ${Array.from(SUPPORTED_ACTIVITY_TYPE_FILTERS).join(", ")}`,
            },
            400
        );
    }

    const activities: ActivityItem[] = [];
    let dbError: string | null = null;

    try {
        if (typeFilter === "integration_event") {
            activities.push(...(await activityRepository.listIntegrationEvents(limit)));
        } else {
            activities.push(...(await activityRepository.list(limit)));
        }
    } catch (error) {
        dbError = errorMessage(error);
    }

    const localStack = await loadLocalStackData();
    if (localStack && (!typeFilter || typeFilter === "stack_updated")) {
        activities.push({
            id: "act-stack-local",
            type: "stack_updated",
            icon: "GitBranch",
            color: "text-nexus-500",
            bgColor: "bg-nexus-500/10",
            title: "Stack Snapshot Synced",
            description: `Local stack includes ${Object.keys(localStack.branches).length} branches`,
            timestamp: "just now",
            stack: {
                name: "local-stack",
                branches: Object.keys(localStack.branches).length,
            },
        });
    }

    const filtered = typeFilter ? activities.filter((item) => item.type === typeFilter) : activities;

    if (filtered.length === 0 && dbError) {
        return c.json(
            {
                error: "Database unavailable for activity feed",
                details: dbError,
            },
            503
        );
    }

    const window = filtered.slice(0, limit);
    return c.json({
        activities: window,
        total: window.length,
        limit,
        offset: 0,
        filter: typeFilter || "all",
    });
});

export { activityRouter };
