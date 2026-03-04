/**
 * NEXUS Repository Layer - Contextual Chat
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import * as nexusDb from "../db/index.js";

const { db } = nexusDb;
const chatSessions = (nexusDb as any).chatSessions;
const chatMessages = (nexusDb as any).chatMessages;

type ChatRole = "user" | "assistant" | "system" | "tool";

const SECRET_PATTERNS: RegExp[] = [
    /\bghp_[A-Za-z0-9]{20,}\b/g,
    /\bgho_[A-Za-z0-9]{20,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    /\b(?:api[_-]?key|token|secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{10,}['"]?/gi,
];

export interface CreateChatSessionInput {
    userId?: string;
    repoId?: string;
    prId?: string;
    stackId?: string;
    title?: string;
    context?: Record<string, unknown>;
}

export interface CreateChatMessageInput {
    role: ChatRole;
    content: string;
    provider?: string;
    model?: string;
    citations?: unknown[];
    toolActions?: unknown[];
    provenance?: Record<string, unknown>;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
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

function normalizeSession(session: any, messageCount?: number) {
    return {
        id: session.id,
        userId: session.userId || undefined,
        repoId: session.repoId || undefined,
        prId: session.prId || undefined,
        stackId: session.stackId || undefined,
        title: session.title,
        status: session.status,
        context: session.context || {},
        messageCount: typeof messageCount === "number" ? messageCount : undefined,
        lastMessageAt: session.lastMessageAt ? toIso(session.lastMessageAt) : undefined,
        createdAt: toIso(session.createdAt),
        updatedAt: toIso(session.updatedAt),
    };
}

function normalizeMessage(message: any) {
    return {
        id: message.id,
        sessionId: message.sessionId,
        role: message.role,
        content: message.content,
        provider: message.provider || undefined,
        model: message.model || undefined,
        citations: Array.isArray(message.citations) ? message.citations : [],
        toolActions: Array.isArray(message.toolActions) ? message.toolActions : [],
        provenance: message.provenance || {},
        promptTokens: message.promptTokens || undefined,
        completionTokens: message.completionTokens || undefined,
        totalTokens: message.totalTokens || undefined,
        createdAt: toIso(message.createdAt),
    };
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

export const chatRepository = {
    errorMessage,

    async createSession(input: CreateChatSessionInput) {
        const title = (input.title || "").trim() || "New chat";
        const [created] = await db
            .insert(chatSessions)
            .values({
                userId: input.userId,
                repoId: input.repoId,
                prId: input.prId,
                stackId: input.stackId,
                title,
                status: "active",
                context: sanitizeUnknown(input.context || {}),
            })
            .returning();
        if (!created) return null;

        return normalizeSession(created, 0);
    },

    async listSessions(filters: {
        userId?: string;
        repoId?: string;
        prId?: string;
        stackId?: string;
        status?: "active" | "archived";
        limit?: number;
        offset?: number;
    }) {
        const conditions = [];
        if (filters.userId) conditions.push(eq(chatSessions.userId, filters.userId));
        if (filters.repoId) conditions.push(eq(chatSessions.repoId, filters.repoId));
        if (filters.prId) conditions.push(eq(chatSessions.prId, filters.prId));
        if (filters.stackId) conditions.push(eq(chatSessions.stackId, filters.stackId));
        if (filters.status) conditions.push(eq(chatSessions.status, filters.status));

        const sessions = await db
            .select({
                id: chatSessions.id,
                userId: chatSessions.userId,
                repoId: chatSessions.repoId,
                prId: chatSessions.prId,
                stackId: chatSessions.stackId,
                title: chatSessions.title,
                status: chatSessions.status,
                context: chatSessions.context,
                lastMessageAt: chatSessions.lastMessageAt,
                createdAt: chatSessions.createdAt,
                updatedAt: chatSessions.updatedAt,
                messageCount: sql<number>`count(${chatMessages.id})`,
            })
            .from(chatSessions)
            .leftJoin(chatMessages, eq(chatMessages.sessionId, chatSessions.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .groupBy(
                chatSessions.id,
                chatSessions.userId,
                chatSessions.repoId,
                chatSessions.prId,
                chatSessions.stackId,
                chatSessions.title,
                chatSessions.status,
                chatSessions.context,
                chatSessions.lastMessageAt,
                chatSessions.createdAt,
                chatSessions.updatedAt
            )
            .orderBy(desc(chatSessions.updatedAt))
            .limit(Math.min(Math.max(filters.limit ?? 20, 1), 100))
            .offset(Math.max(filters.offset ?? 0, 0));

        return sessions.map((session: any) => normalizeSession(session, coerceCount(session.messageCount)));
    },

    async getSession(sessionId: string) {
        const [session] = await db
            .select({
                id: chatSessions.id,
                userId: chatSessions.userId,
                repoId: chatSessions.repoId,
                prId: chatSessions.prId,
                stackId: chatSessions.stackId,
                title: chatSessions.title,
                status: chatSessions.status,
                context: chatSessions.context,
                lastMessageAt: chatSessions.lastMessageAt,
                createdAt: chatSessions.createdAt,
                updatedAt: chatSessions.updatedAt,
                messageCount: sql<number>`count(${chatMessages.id})`,
            })
            .from(chatSessions)
            .leftJoin(chatMessages, eq(chatMessages.sessionId, chatSessions.id))
            .where(eq(chatSessions.id, sessionId))
            .groupBy(
                chatSessions.id,
                chatSessions.userId,
                chatSessions.repoId,
                chatSessions.prId,
                chatSessions.stackId,
                chatSessions.title,
                chatSessions.status,
                chatSessions.context,
                chatSessions.lastMessageAt,
                chatSessions.createdAt,
                chatSessions.updatedAt
            )
            .limit(1);
        if (!session) return null;
        return normalizeSession(session, coerceCount(session.messageCount));
    },

    async listMessages(sessionId: string, limit = 100) {
        const rows = await db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.sessionId, sessionId))
            .orderBy(asc(chatMessages.createdAt))
            .limit(Math.min(Math.max(limit, 1), 500));

        return rows.map(normalizeMessage);
    },

    async appendMessage(sessionId: string, input: CreateChatMessageInput) {
        const [session] = await db
            .select()
            .from(chatSessions)
            .where(eq(chatSessions.id, sessionId))
            .limit(1);
        if (!session) {
            return {
                reason: "session_not_found" as const,
            };
        }

        const [existingCount] = await db
            .select({
                count: sql<number>`count(*)`,
            })
            .from(chatMessages)
            .where(eq(chatMessages.sessionId, sessionId));

        const now = new Date();
        const safeContent = redactSecrets(input.content);
        const safeCitations = Array.isArray(input.citations) ? sanitizeUnknown(input.citations) : [];
        const safeToolActions = Array.isArray(input.toolActions) ? sanitizeUnknown(input.toolActions) : [];
        const safeProvenance = sanitizeUnknown(input.provenance || {});

        const [createdMessage] = await db
            .insert(chatMessages)
            .values({
                sessionId,
                role: input.role,
                content: safeContent,
                provider: input.provider,
                model: input.model,
                citations: safeCitations,
                toolActions: safeToolActions,
                provenance: safeProvenance,
                promptTokens: input.promptTokens,
                completionTokens: input.completionTokens,
                totalTokens: input.totalTokens,
            })
            .returning();
        if (!createdMessage) {
            return {
                reason: "insert_failed" as const,
            };
        }

        const isFirstMessage = coerceCount(existingCount?.count) === 0;
        const shouldAutotitle =
            isFirstMessage &&
            input.role === "user" &&
            typeof session.title === "string" &&
            session.title.trim().toLowerCase() === "new chat";

        const nextTitle = shouldAutotitle
            ? safeContent.replace(/\s+/g, " ").trim().slice(0, 80) || "New chat"
            : session.title;

        await db
            .update(chatSessions)
            .set({
                title: nextTitle,
                lastMessageAt: now,
                updatedAt: now,
            })
            .where(eq(chatSessions.id, sessionId));

        const [updatedSession] = await db
            .select()
            .from(chatSessions)
            .where(eq(chatSessions.id, sessionId))
            .limit(1);

        return {
            reason: "ok" as const,
            session: updatedSession ? normalizeSession(updatedSession) : null,
            message: normalizeMessage(createdMessage),
        };
    },
};

