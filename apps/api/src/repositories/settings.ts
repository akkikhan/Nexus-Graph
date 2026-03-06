import { asc, eq, sql } from "drizzle-orm";
import { db, users } from "../db/index.js";

export type AppSettingsValue = string | number | boolean;
export type AppSettingsRecord = Record<string, AppSettingsValue>;

const SETTINGS_NAMESPACE = "nexusPreferences";

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function isAppSettingsValue(value: unknown): value is AppSettingsValue {
    return typeof value === "string" || typeof value === "boolean" || typeof value === "number";
}

function sanitizeSettings(input: unknown): AppSettingsRecord {
    if (!isObjectRecord(input)) return {};

    return Object.entries(input).reduce<AppSettingsRecord>((acc, [key, value]) => {
        if (!isAppSettingsValue(value)) return acc;
        acc[key] = value;
        return acc;
    }, {});
}

async function resolveUserId(userRef?: string): Promise<string | null> {
    if (userRef) {
        const user = isUuid(userRef)
            ? await db.query.users.findFirst({
                where: eq(users.id, userRef),
                columns: { id: true },
            })
            : await db.query.users.findFirst({
                where: sql`${users.id} = ${userRef}
                OR ${users.email} = ${userRef}
                OR ${users.name} = ${userRef}`,
                columns: { id: true },
            });
        if (user?.id) return user.id;
    }

    const fallback = await db.query.users.findFirst({
        columns: { id: true },
        orderBy: [asc(users.createdAt)],
    });
    return fallback?.id || null;
}

function extractNamespacedSettings(rawSettings: unknown): AppSettingsRecord {
    if (!isObjectRecord(rawSettings)) return {};
    return sanitizeSettings(rawSettings[SETTINGS_NAMESPACE]);
}

export const settingsRepository = {
    async get(userRef?: string) {
        const userId = await resolveUserId(userRef);
        if (!userId) return null;

        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: {
                id: true,
                settings: true,
                updatedAt: true,
            },
        });
        if (!user) return null;

        return {
            userId: user.id,
            settings: extractNamespacedSettings(user.settings),
            updatedAt: user.updatedAt,
        };
    },

    async update(input: { settings: AppSettingsRecord; userId?: string }) {
        const userId = await resolveUserId(input.userId);
        if (!userId) return null;

        const existing = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: {
                id: true,
                settings: true,
            },
        });
        if (!existing) return null;

        const currentSettings = isObjectRecord(existing.settings) ? existing.settings : {};
        const nextSettings = {
            ...currentSettings,
            [SETTINGS_NAMESPACE]: sanitizeSettings(input.settings),
        };

        const [updated] = await db
            .update(users)
            .set({
                settings: nextSettings,
                updatedAt: new Date(),
            })
            .where(eq(users.id, userId))
            .returning({
                id: users.id,
                settings: users.settings,
                updatedAt: users.updatedAt,
            });

        if (!updated) return null;

        return {
            userId: updated.id,
            settings: extractNamespacedSettings(updated.settings),
            updatedAt: updated.updatedAt,
        };
    },
};
