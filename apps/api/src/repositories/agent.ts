/**
 * NEXUS Repository Layer - Agent Runs
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import * as nexusDb from "../db/index.js";

const { db } = nexusDb;
const agentRuns = (nexusDb as any).agentRuns;
const agentRunAuditEvents = (nexusDb as any).agentRunAuditEvents;

type AgentRunStatus = "planned" | "running" | "awaiting_approval" | "completed" | "failed";
type AgentRunAuditType = "status_transition" | "checkpoint" | "command" | "file_edit" | "note" | "error";

const SECRET_PATTERNS: RegExp[] = [
    /\bghp_[A-Za-z0-9]{20,}\b/g,
    /\bgho_[A-Za-z0-9]{20,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    /\b(?:api[_-]?key|token|secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{10,}['"]?/gi,
];

const allowedTransitions: Record<AgentRunStatus, AgentRunStatus[]> = {
    planned: ["running", "failed"],
    running: ["awaiting_approval", "completed", "failed"],
    awaiting_approval: ["running", "completed", "failed"],
    completed: [],
    failed: [],
};

export interface CreateAgentRunInput {
    userId?: string;
    repoId?: string;
    prId?: string;
    stackId?: string;
    prompt: string;
    plan?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    requiresApproval?: boolean;
}

export interface TransitionAgentRunInput {
    status: AgentRunStatus;
    message?: string;
    actor?: string;
    awaitingApprovalReason?: string;
    errorMessage?: string;
    details?: Record<string, unknown>;
}

export interface AppendAgentAuditEventInput {
    type?: AgentRunAuditType;
    actor?: string;
    message?: string;
    command?: string;
    filePath?: string;
    details?: Record<string, unknown>;
}

function toIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return value;
    return new Date().toISOString();
}

function coerceCount(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function redactSecrets(value: string): string {
    return SECRET_PATTERNS.reduce(
        (next, pattern) => next.replace(pattern, "[REDACTED_SECRET]"),
        value
    );
}

function sanitizeUnknown(value: unknown): unknown {
    if (typeof value === "string") return redactSecrets(value);
    if (Array.isArray(value)) return value.map(sanitizeUnknown);
    if (value && typeof value === "object") {
        const sanitized: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            sanitized[key] = sanitizeUnknown(entry);
        }
        return sanitized;
    }
    return value;
}

function normalizeRun(run: any, auditEventsCount?: number) {
    return {
        id: run.id,
        userId: run.userId || undefined,
        repoId: run.repoId || undefined,
        prId: run.prId || undefined,
        stackId: run.stackId || undefined,
        prompt: run.prompt,
        plan: run.plan || {},
        status: run.status,
        requiresApproval: run.requiresApproval === true,
        awaitingApprovalReason: run.awaitingApprovalReason || undefined,
        errorMessage: run.errorMessage || undefined,
        metadata: run.metadata || {},
        startedAt: run.startedAt ? toIso(run.startedAt) : undefined,
        completedAt: run.completedAt ? toIso(run.completedAt) : undefined,
        auditEventsCount: typeof auditEventsCount === "number" ? auditEventsCount : undefined,
        createdAt: toIso(run.createdAt),
        updatedAt: toIso(run.updatedAt),
    };
}

function normalizeAuditEvent(event: any) {
    return {
        id: event.id,
        runId: event.runId,
        type: event.type,
        actor: event.actor,
        message: event.message || undefined,
        command: event.command || undefined,
        filePath: event.filePath || undefined,
        details: event.details || {},
        createdAt: toIso(event.createdAt),
    };
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

function canTransition(from: AgentRunStatus, to: AgentRunStatus): boolean {
    return allowedTransitions[from].includes(to);
}

async function findRunById(runId: string) {
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
    return run || null;
}

export const agentRepository = {
    errorMessage,

    async createRun(input: CreateAgentRunInput) {
        const now = new Date();
        const [run] = await db
            .insert(agentRuns)
            .values({
                userId: input.userId,
                repoId: input.repoId,
                prId: input.prId,
                stackId: input.stackId,
                prompt: redactSecrets(input.prompt),
                plan: sanitizeUnknown(input.plan || {}),
                status: "planned",
                requiresApproval: input.requiresApproval === true,
                metadata: sanitizeUnknown(input.metadata || {}),
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        if (!run) return null;

        await db.insert(agentRunAuditEvents).values({
            runId: run.id,
            type: "note",
            actor: "system",
            message: "Agent run created in planned state.",
            details: sanitizeUnknown({
                source: "api.create-agent-run",
                requiresApproval: run.requiresApproval === true,
            }),
        });

        return normalizeRun(run, 1);
    },

    async listRuns(filters: {
        userId?: string;
        repoId?: string;
        prId?: string;
        stackId?: string;
        status?: AgentRunStatus;
        limit?: number;
        offset?: number;
    }) {
        const conditions = [];
        if (filters.userId) conditions.push(eq(agentRuns.userId, filters.userId));
        if (filters.repoId) conditions.push(eq(agentRuns.repoId, filters.repoId));
        if (filters.prId) conditions.push(eq(agentRuns.prId, filters.prId));
        if (filters.stackId) conditions.push(eq(agentRuns.stackId, filters.stackId));
        if (filters.status) conditions.push(eq(agentRuns.status, filters.status));

        const rows = await db
            .select({
                id: agentRuns.id,
                userId: agentRuns.userId,
                repoId: agentRuns.repoId,
                prId: agentRuns.prId,
                stackId: agentRuns.stackId,
                prompt: agentRuns.prompt,
                plan: agentRuns.plan,
                status: agentRuns.status,
                requiresApproval: agentRuns.requiresApproval,
                awaitingApprovalReason: agentRuns.awaitingApprovalReason,
                errorMessage: agentRuns.errorMessage,
                metadata: agentRuns.metadata,
                startedAt: agentRuns.startedAt,
                completedAt: agentRuns.completedAt,
                createdAt: agentRuns.createdAt,
                updatedAt: agentRuns.updatedAt,
                auditEventsCount: sql<number>`count(${agentRunAuditEvents.id})`,
            })
            .from(agentRuns)
            .leftJoin(agentRunAuditEvents, eq(agentRunAuditEvents.runId, agentRuns.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .groupBy(
                agentRuns.id,
                agentRuns.userId,
                agentRuns.repoId,
                agentRuns.prId,
                agentRuns.stackId,
                agentRuns.prompt,
                agentRuns.plan,
                agentRuns.status,
                agentRuns.requiresApproval,
                agentRuns.awaitingApprovalReason,
                agentRuns.errorMessage,
                agentRuns.metadata,
                agentRuns.startedAt,
                agentRuns.completedAt,
                agentRuns.createdAt,
                agentRuns.updatedAt
            )
            .orderBy(desc(agentRuns.updatedAt))
            .limit(Math.min(Math.max(filters.limit ?? 20, 1), 100))
            .offset(Math.max(filters.offset ?? 0, 0));

        return rows.map((row: any) => normalizeRun(row, coerceCount(row.auditEventsCount)));
    },

    async getRun(runId: string) {
        const [row] = await db
            .select({
                id: agentRuns.id,
                userId: agentRuns.userId,
                repoId: agentRuns.repoId,
                prId: agentRuns.prId,
                stackId: agentRuns.stackId,
                prompt: agentRuns.prompt,
                plan: agentRuns.plan,
                status: agentRuns.status,
                requiresApproval: agentRuns.requiresApproval,
                awaitingApprovalReason: agentRuns.awaitingApprovalReason,
                errorMessage: agentRuns.errorMessage,
                metadata: agentRuns.metadata,
                startedAt: agentRuns.startedAt,
                completedAt: agentRuns.completedAt,
                createdAt: agentRuns.createdAt,
                updatedAt: agentRuns.updatedAt,
                auditEventsCount: sql<number>`count(${agentRunAuditEvents.id})`,
            })
            .from(agentRuns)
            .leftJoin(agentRunAuditEvents, eq(agentRunAuditEvents.runId, agentRuns.id))
            .where(eq(agentRuns.id, runId))
            .groupBy(
                agentRuns.id,
                agentRuns.userId,
                agentRuns.repoId,
                agentRuns.prId,
                agentRuns.stackId,
                agentRuns.prompt,
                agentRuns.plan,
                agentRuns.status,
                agentRuns.requiresApproval,
                agentRuns.awaitingApprovalReason,
                agentRuns.errorMessage,
                agentRuns.metadata,
                agentRuns.startedAt,
                agentRuns.completedAt,
                agentRuns.createdAt,
                agentRuns.updatedAt
            )
            .limit(1);
        if (!row) return null;
        return normalizeRun(row, coerceCount(row.auditEventsCount));
    },

    async listAuditEvents(runId: string, limit = 100) {
        const events = await db
            .select()
            .from(agentRunAuditEvents)
            .where(eq(agentRunAuditEvents.runId, runId))
            .orderBy(asc(agentRunAuditEvents.createdAt))
            .limit(Math.min(Math.max(limit, 1), 500));
        return events.map(normalizeAuditEvent);
    },

    async appendAuditEvent(runId: string, input: AppendAgentAuditEventInput) {
        const run = await findRunById(runId);
        if (!run) {
            return { reason: "run_not_found" as const };
        }

        const [event] = await db
            .insert(agentRunAuditEvents)
            .values({
                runId,
                type: input.type || "note",
                actor: input.actor || "system",
                message: input.message ? redactSecrets(input.message) : null,
                command: input.command ? redactSecrets(input.command) : null,
                filePath: input.filePath,
                details: sanitizeUnknown(input.details || {}),
            })
            .returning();
        if (!event) {
            return { reason: "insert_failed" as const };
        }

        await db
            .update(agentRuns)
            .set({ updatedAt: new Date() })
            .where(eq(agentRuns.id, runId));

        return {
            reason: "ok" as const,
            event: normalizeAuditEvent(event),
        };
    },

    async transitionRun(runId: string, input: TransitionAgentRunInput) {
        const existing = await findRunById(runId);
        if (!existing) {
            return { reason: "run_not_found" as const };
        }

        const currentStatus = existing.status as AgentRunStatus;
        const nextStatus = input.status;
        if (currentStatus === nextStatus) {
            return { reason: "noop" as const, run: normalizeRun(existing) };
        }

        if (!canTransition(currentStatus, nextStatus)) {
            return {
                reason: "invalid_transition" as const,
                from: currentStatus,
                to: nextStatus,
                run: normalizeRun(existing),
            };
        }

        if (nextStatus === "awaiting_approval" && !(input.awaitingApprovalReason || "").trim()) {
            return {
                reason: "approval_reason_required" as const,
                run: normalizeRun(existing),
            };
        }

        const now = new Date();
        const patch: Record<string, unknown> = {
            status: nextStatus,
            updatedAt: now,
            metadata: sanitizeUnknown({
                ...(existing.metadata || {}),
                lastTransition: {
                    from: currentStatus,
                    to: nextStatus,
                    at: now.toISOString(),
                },
            }),
        };

        if (nextStatus === "running") {
            patch.startedAt = existing.startedAt || now;
            patch.awaitingApprovalReason = null;
            patch.errorMessage = null;
            patch.completedAt = null;
            patch.requiresApproval = false;
        }

        if (nextStatus === "awaiting_approval") {
            patch.requiresApproval = true;
            patch.awaitingApprovalReason = (input.awaitingApprovalReason || "").trim();
            patch.errorMessage = null;
        }

        if (nextStatus === "completed") {
            patch.completedAt = now;
            patch.awaitingApprovalReason = null;
            patch.errorMessage = null;
            patch.requiresApproval = false;
        }

        if (nextStatus === "failed") {
            patch.completedAt = now;
            patch.errorMessage = redactSecrets((input.errorMessage || "").trim() || "Agent run failed.");
        }

        const [updated] = await db
            .update(agentRuns)
            .set(patch)
            .where(eq(agentRuns.id, runId))
            .returning();
        if (!updated) {
            return { reason: "update_failed" as const };
        }

        const transitionMessage = (input.message || "").trim() || `Run moved ${currentStatus} -> ${nextStatus}.`;

        await db.insert(agentRunAuditEvents).values({
            runId,
            type: "status_transition",
            actor: input.actor || "system",
            message: redactSecrets(transitionMessage),
            details: sanitizeUnknown({
                from: currentStatus,
                to: nextStatus,
                ...(input.details || {}),
            }),
        });

        const run = await this.getRun(runId);
        return {
            reason: "ok" as const,
            run,
        };
    },
};

