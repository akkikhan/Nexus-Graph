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

const MUTATION_EVENT_TYPES = new Set<AgentRunAuditType>(["command", "file_edit"]);

const SECRET_PATTERNS: RegExp[] = [
    /\bghp_[A-Za-z0-9]{20,}\b/g,
    /\bgho_[A-Za-z0-9]{20,}\b/g,
    /\bghu_[A-Za-z0-9]{20,}\b/g,
    /\bghs_[A-Za-z0-9]{20,}\b/g,
    /\bghr_[A-Za-z0-9]{20,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    /\bglpat-[A-Za-z0-9_\-=]{20,}\b/g,
    /\bsk-[A-Za-z0-9]{20,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bAIza[0-9A-Za-z\-_]{20,}\b/g,
    /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[A-Za-z0-9_\-./+=]{8,}['"]?/gi,
];

const SECRET_FIELD_PATTERN = /(?:token|secret|password|passwd|api[_-]?key|private[_-]?key|authorization|auth[_-]?header)/i;

const DEFAULT_ALLOWED_PROVIDERS = ["anthropic", "openai", "google", "nexus-ai"];
const RAW_ALLOWED_PROVIDERS = (process.env.NEXUS_AGENT_ALLOWED_PROVIDERS || "")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
const ALLOWED_PROVIDERS = RAW_ALLOWED_PROVIDERS.length > 0 ? RAW_ALLOWED_PROVIDERS : DEFAULT_ALLOWED_PROVIDERS;

const RAW_MAX_BUDGET = Number(process.env.NEXUS_AGENT_MAX_BUDGET_CENTS ?? 5000);
const MAX_BUDGET_CENTS = Number.isFinite(RAW_MAX_BUDGET) && RAW_MAX_BUDGET > 0 ? Math.floor(RAW_MAX_BUDGET) : 5000;

const RAW_DEFAULT_BUDGET = Number(process.env.NEXUS_AGENT_DEFAULT_BUDGET_CENTS ?? 500);
const DEFAULT_BUDGET_CENTS = Number.isFinite(RAW_DEFAULT_BUDGET) && RAW_DEFAULT_BUDGET > 0
    ? Math.min(Math.floor(RAW_DEFAULT_BUDGET), MAX_BUDGET_CENTS)
    : Math.min(500, MAX_BUDGET_CENTS);

const RAW_MUTATION_COST = Number(process.env.NEXUS_AGENT_DEFAULT_MUTATION_COST_CENTS ?? 5);
const DEFAULT_MUTATION_COST_CENTS = Number.isFinite(RAW_MUTATION_COST) && RAW_MUTATION_COST >= 0
    ? Math.floor(RAW_MUTATION_COST)
    : 5;

const allowedTransitions: Record<AgentRunStatus, AgentRunStatus[]> = {
    planned: ["running", "failed"],
    running: ["awaiting_approval", "completed", "failed"],
    awaiting_approval: ["running", "failed"],
    completed: [],
    failed: [],
};

export interface CreateAgentRunInput {
    userId?: string;
    repoId?: string;
    prId?: string;
    stackId?: string;
    provider?: string;
    model?: string;
    prompt: string;
    plan?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    budgetCents?: number;
    requiresApproval?: boolean;
    approvalCheckpoint?: string;
}

export interface TransitionAgentRunInput {
    status: AgentRunStatus;
    message?: string;
    actor?: string;
    awaitingApprovalReason?: string;
    approvalCheckpoint?: string;
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

function sanitizeUnknown(value: unknown, keyHint?: string): unknown {
    if (typeof keyHint === "string" && SECRET_FIELD_PATTERN.test(keyHint)) {
        return "[REDACTED_SECRET]";
    }
    if (typeof value === "string") return redactSecrets(value);
    if (Array.isArray(value)) return value.map((entry) => sanitizeUnknown(entry));
    if (value && typeof value === "object") {
        const sanitized: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            sanitized[key] = sanitizeUnknown(entry, key);
        }
        return sanitized;
    }
    return value;
}

function normalizeProvider(value?: string): string {
    return (value || "").trim().toLowerCase();
}

function normalizeModel(value?: string): string | null {
    const trimmed = (value || "").trim();
    return trimmed.length > 0 ? trimmed : null;
}

function isProviderAllowed(provider: string): boolean {
    return ALLOWED_PROVIDERS.includes(provider);
}

function parseBudgetCents(value: unknown): number | null {
    if (value === undefined || value === null) return DEFAULT_BUDGET_CENTS;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const rounded = Math.floor(numeric);
    if (rounded <= 0 || rounded > MAX_BUDGET_CENTS) return null;
    return rounded;
}

function parseEventCostCents(details: Record<string, unknown>, isMutationEvent: boolean): number | null {
    if (Object.prototype.hasOwnProperty.call(details, "costCents")) {
        const numeric = Number((details as any).costCents);
        if (!Number.isFinite(numeric)) return null;
        const rounded = Math.floor(numeric);
        if (rounded < 0) return null;
        return rounded;
    }
    return isMutationEvent ? DEFAULT_MUTATION_COST_CENTS : 0;
}

function normalizeRun(run: any, auditEventsCount?: number) {
    const budgetCents = Number(run.budgetCents ?? DEFAULT_BUDGET_CENTS);
    const budgetSpentCents = Number(run.budgetSpentCents ?? 0);
    return {
        id: run.id,
        userId: run.userId || undefined,
        repoId: run.repoId || undefined,
        prId: run.prId || undefined,
        stackId: run.stackId || undefined,
        provider: run.provider,
        model: run.model || undefined,
        prompt: run.prompt,
        plan: run.plan || {},
        status: run.status,
        budgetCents,
        budgetSpentCents,
        budgetRemainingCents: Math.max(budgetCents - budgetSpentCents, 0),
        requiresApproval: run.requiresApproval === true,
        approvalCheckpoint: run.approvalCheckpoint || undefined,
        awaitingApprovalReason: run.awaitingApprovalReason || undefined,
        lastApprovedAt: run.lastApprovedAt ? toIso(run.lastApprovedAt) : undefined,
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
        const provider = normalizeProvider(input.provider) || "anthropic";
        if (!isProviderAllowed(provider)) {
            return {
                reason: "provider_not_allowed" as const,
                provider,
                allowedProviders: ALLOWED_PROVIDERS,
            };
        }

        const budgetCents = parseBudgetCents(input.budgetCents);
        if (budgetCents === null) {
            return {
                reason: "invalid_budget" as const,
                maxBudgetCents: MAX_BUDGET_CENTS,
            };
        }

        const requiresApproval = input.requiresApproval === true;
        const approvalCheckpoint = (input.approvalCheckpoint || "").trim() || null;
        if (requiresApproval && !approvalCheckpoint) {
            return {
                reason: "approval_checkpoint_required" as const,
            };
        }

        const now = new Date();
        const [run] = await db
            .insert(agentRuns)
            .values({
                userId: input.userId,
                repoId: input.repoId,
                prId: input.prId,
                stackId: input.stackId,
                provider,
                model: normalizeModel(input.model),
                prompt: redactSecrets(input.prompt),
                plan: sanitizeUnknown(input.plan || {}),
                status: "planned",
                budgetCents,
                budgetSpentCents: 0,
                requiresApproval,
                approvalCheckpoint,
                metadata: sanitizeUnknown(input.metadata || {}),
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        if (!run) return { reason: "insert_failed" as const };

        await db.insert(agentRunAuditEvents).values({
            runId: run.id,
            type: "note",
            actor: "system",
            message: "Agent run created in planned state.",
            details: sanitizeUnknown({
                source: "api.create-agent-run",
                provider,
                budgetCents,
                requiresApproval: run.requiresApproval === true,
                approvalCheckpoint: approvalCheckpoint || undefined,
            }),
        });

        return {
            reason: "ok" as const,
            run: normalizeRun(run, 1),
        };
    },

    async listRuns(filters: {
        userId?: string;
        repoId?: string;
        prId?: string;
        stackId?: string;
        provider?: string;
        status?: AgentRunStatus;
        limit?: number;
        offset?: number;
    }) {
        const conditions = [];
        if (filters.userId) conditions.push(eq(agentRuns.userId, filters.userId));
        if (filters.repoId) conditions.push(eq(agentRuns.repoId, filters.repoId));
        if (filters.prId) conditions.push(eq(agentRuns.prId, filters.prId));
        if (filters.stackId) conditions.push(eq(agentRuns.stackId, filters.stackId));
        if (filters.provider) conditions.push(eq(agentRuns.provider, normalizeProvider(filters.provider)));
        if (filters.status) conditions.push(eq(agentRuns.status, filters.status));

        const rows = await db
            .select({
                id: agentRuns.id,
                userId: agentRuns.userId,
                repoId: agentRuns.repoId,
                prId: agentRuns.prId,
                stackId: agentRuns.stackId,
                provider: agentRuns.provider,
                model: agentRuns.model,
                prompt: agentRuns.prompt,
                plan: agentRuns.plan,
                status: agentRuns.status,
                budgetCents: agentRuns.budgetCents,
                budgetSpentCents: agentRuns.budgetSpentCents,
                requiresApproval: agentRuns.requiresApproval,
                approvalCheckpoint: agentRuns.approvalCheckpoint,
                awaitingApprovalReason: agentRuns.awaitingApprovalReason,
                lastApprovedAt: agentRuns.lastApprovedAt,
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
                agentRuns.provider,
                agentRuns.model,
                agentRuns.prompt,
                agentRuns.plan,
                agentRuns.status,
                agentRuns.budgetCents,
                agentRuns.budgetSpentCents,
                agentRuns.requiresApproval,
                agentRuns.approvalCheckpoint,
                agentRuns.awaitingApprovalReason,
                agentRuns.lastApprovedAt,
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
                provider: agentRuns.provider,
                model: agentRuns.model,
                prompt: agentRuns.prompt,
                plan: agentRuns.plan,
                status: agentRuns.status,
                budgetCents: agentRuns.budgetCents,
                budgetSpentCents: agentRuns.budgetSpentCents,
                requiresApproval: agentRuns.requiresApproval,
                approvalCheckpoint: agentRuns.approvalCheckpoint,
                awaitingApprovalReason: agentRuns.awaitingApprovalReason,
                lastApprovedAt: agentRuns.lastApprovedAt,
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
                agentRuns.provider,
                agentRuns.model,
                agentRuns.prompt,
                agentRuns.plan,
                agentRuns.status,
                agentRuns.budgetCents,
                agentRuns.budgetSpentCents,
                agentRuns.requiresApproval,
                agentRuns.approvalCheckpoint,
                agentRuns.awaitingApprovalReason,
                agentRuns.lastApprovedAt,
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

        const eventType = (input.type || "note") as AgentRunAuditType;
        const isMutationEvent = MUTATION_EVENT_TYPES.has(eventType);
        if (isMutationEvent && run.status !== "running") {
            return {
                reason: "mutation_not_running" as const,
                status: run.status as AgentRunStatus,
            };
        }

        if (isMutationEvent && run.requiresApproval === true) {
            return {
                reason: "approval_required" as const,
                run: normalizeRun(run),
            };
        }

        const detailsInput = input.details || {};
        const eventCostCents = parseEventCostCents(detailsInput, isMutationEvent);
        if (eventCostCents === null) {
            return {
                reason: "invalid_budget_cost" as const,
            };
        }

        const budgetCents = Number(run.budgetCents ?? DEFAULT_BUDGET_CENTS);
        const currentSpent = Number(run.budgetSpentCents ?? 0);
        const nextSpent = currentSpent + eventCostCents;
        if (nextSpent > budgetCents) {
            return {
                reason: "budget_exceeded" as const,
                budgetCents,
                budgetSpentCents: currentSpent,
                eventCostCents,
            };
        }

        const now = new Date();
        let persistedEvent: any = null;
        await db.transaction(async (tx: any) => {
            const [event] = await tx
                .insert(agentRunAuditEvents)
                .values({
                    runId,
                    type: eventType,
                    actor: input.actor || "system",
                    message: input.message ? redactSecrets(input.message) : null,
                    command: input.command ? redactSecrets(input.command) : null,
                    filePath: input.filePath,
                    details: sanitizeUnknown({
                        ...detailsInput,
                        costCents: eventCostCents,
                    }),
                })
                .returning();

            await tx
                .update(agentRuns)
                .set({
                    budgetSpentCents: nextSpent,
                    updatedAt: now,
                })
                .where(eq(agentRuns.id, runId));

            persistedEvent = event || null;
        });

        if (!persistedEvent) {
            return { reason: "insert_failed" as const };
        }

        return {
            reason: "ok" as const,
            event: normalizeAuditEvent(persistedEvent),
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

        if (nextStatus === "awaiting_approval" && !(input.approvalCheckpoint || "").trim()) {
            return {
                reason: "approval_checkpoint_required" as const,
                run: normalizeRun(existing),
            };
        }

        if (nextStatus === "running" && currentStatus === "awaiting_approval") {
            const expectedCheckpoint = (existing.approvalCheckpoint || "").trim();
            const providedCheckpoint = (input.approvalCheckpoint || "").trim();
            if (!expectedCheckpoint || !providedCheckpoint) {
                return {
                    reason: "approval_checkpoint_required" as const,
                    run: normalizeRun(existing),
                };
            }
            if (expectedCheckpoint !== providedCheckpoint) {
                return {
                    reason: "approval_checkpoint_mismatch" as const,
                    run: normalizeRun(existing),
                };
            }
        }

        if (nextStatus === "running" && currentStatus !== "awaiting_approval" && existing.requiresApproval === true) {
            return {
                reason: "approval_required" as const,
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
            if (currentStatus === "awaiting_approval") {
                patch.lastApprovedAt = now;
            }
        }

        if (nextStatus === "awaiting_approval") {
            patch.requiresApproval = true;
            patch.approvalCheckpoint = (input.approvalCheckpoint || "").trim();
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
                approvalCheckpoint: input.approvalCheckpoint || undefined,
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
