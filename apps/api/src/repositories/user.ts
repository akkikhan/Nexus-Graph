/**
 * Repository layer for users (upsert by GitHub id).
 */

import { eq } from "drizzle-orm";
import { db, users } from "../db/index.js";

export const userRepository = {
    async upsertGitHubUser(input: {
        githubId: number;
        login?: string | null;
        avatarUrl?: string | null;
        email?: string | null;
        name?: string | null;
    }): Promise<{ userId: string }> {
        const gh = String(input.githubId);
        const existing = await db.query.users.findFirst({
            where: eq(users.githubId, gh),
        });

        const displayName = input.name || input.login || "GitHub User";
        const email = input.email || `${input.login || "user"}@github.local`;

        if (existing) {
            const [updated] = await db
                .update(users)
                .set({
                    name: displayName,
                    avatar: input.avatarUrl || existing.avatar,
                    updatedAt: new Date(),
                })
                .where(eq(users.id, existing.id))
                .returning();
            return { userId: updated.id };
        }

        const [created] = await db
            .insert(users)
            .values({
                email,
                name: displayName,
                avatar: input.avatarUrl || null,
                githubId: gh,
            })
            .returning();

        return { userId: created.id };
    },
};

