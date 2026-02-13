/**
 * NEXUS API - Activity Routes
 */

import { Hono } from "hono";
import path from "path";
import { readFile } from "fs/promises";
import { prRepository } from "../repositories/pr.js";

const activityRouter = new Hono();
const SERVER_STACK_FILE = path.join(process.cwd(), ".nexus", "server-stack.json");
const LOCAL_STACK_FILE = path.join(process.cwd(), ".nexus", "stack.json");

interface ActivityItem {
    id: string;
    type: string;
    icon: string;
    color: string;
    bgColor: string;
    title: string;
    description: string;
    timestamp: string;
    pr?: {
        number: number;
        title: string;
    };
    details?: {
        critical: number;
        warnings: number;
        suggestions: number;
    };
    stack?: {
        name: string;
        branches: number;
    };
}

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

function riskDetails(score: number) {
    if (score >= 75) {
        return { critical: 1, warnings: 2, suggestions: 0 };
    }
    if (score >= 50) {
        return { critical: 0, warnings: 2, suggestions: 1 };
    }
    if (score >= 25) {
        return { critical: 0, warnings: 1, suggestions: 2 };
    }
    return { critical: 0, warnings: 0, suggestions: 1 };
}

function mapPRToActivity(pr: any, index: number): ActivityItem {
    const number = pr.number || 0;
    const title = pr.title || "Untitled PR";
    const score = Math.round(pr.riskScore || 0);

    if (pr.status === "merged") {
        return {
            id: `act-pr-merged-${pr.id || index}`,
            type: "pr_merged",
            icon: "GitMerge",
            color: "text-green-500",
            bgColor: "bg-green-500/10",
            title: "PR Merged",
            description: `#${number} merged successfully`,
            timestamp: formatRelativeTime(pr.updatedAt || pr.mergedAt || pr.createdAt),
            pr: { number, title },
        };
    }

    return {
        id: `act-pr-review-${pr.id || index}`,
        type: "ai_review",
        icon: "Bot",
        color: score >= 75 ? "text-red-500" : "text-purple-500",
        bgColor: score >= 75 ? "bg-red-500/10" : "bg-purple-500/10",
        title: "AI Review Completed",
        description:
            pr.aiSummary ||
            `Risk analysis generated for "${title}"`,
        timestamp: formatRelativeTime(pr.updatedAt || pr.createdAt),
        pr: { number, title },
        details: riskDetails(score),
    };
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
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

/**
 * GET /activity - List recent activity
 */
activityRouter.get("/", async (c) => {
    const limit = Math.min(
        Math.max(Number(c.req.query("limit") || 20), 1),
        50
    );

    const activities: ActivityItem[] = [];
    let dbError: string | null = null;

    try {
        const prs = await prRepository.list({
            limit,
            offset: 0,
        });
        activities.push(...prs.map(mapPRToActivity));
    } catch (error) {
        dbError = errorMessage(error);
    }

    const localStack = await loadLocalStackData();
    if (localStack) {
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

    if (activities.length === 0 && dbError) {
        return c.json(
            {
                error: "Database unavailable for activity feed",
                details: dbError,
            },
            503
        );
    }

    const filtered = activities.slice(0, limit);
    return c.json({
        activities: filtered,
        total: filtered.length,
        limit,
        offset: 0,
        filter: "all",
    });
});

export { activityRouter };
