/**
 * Repository layer for GitHub installation + repo mapping.
 */

import { and, eq, inArray } from "drizzle-orm";
import {
    db,
    organizations,
    repositories,
    githubInstallations,
    githubInstallationRepositories,
} from "../db/index.js";

function slugify(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

export const githubRepository = {
    async upsertOrgFromGitHubAccount(input: {
        login: string;
        avatarUrl?: string | null;
    }): Promise<{ orgId: string }> {
        const slug = slugify(input.login);

        const existing = await db.query.organizations.findFirst({
            where: eq(organizations.slug, slug),
        });

        if (existing) return { orgId: existing.id };

        const [created] = await db
            .insert(organizations)
            .values({
                name: input.login,
                slug,
                avatar: input.avatarUrl || null,
                plan: "hobby",
            })
            .returning();

        return { orgId: created.id };
    },

    async upsertInstallation(input: {
        orgId: string;
        installationId: number;
        accountLogin: string;
        accountId?: number | null;
        accountType?: string | null;
        suspended?: boolean;
    }): Promise<{ githubInstallationId: string }> {
        const ext = String(input.installationId);
        const existing = await db.query.githubInstallations.findFirst({
            where: eq(githubInstallations.externalId, ext),
        });

        if (existing) {
            const [updated] = await db
                .update(githubInstallations)
                .set({
                    orgId: input.orgId,
                    accountLogin: input.accountLogin,
                    accountId: input.accountId != null ? String(input.accountId) : null,
                    accountType: input.accountType || null,
                    suspended: input.suspended ?? false,
                    updatedAt: new Date(),
                })
                .where(eq(githubInstallations.id, existing.id))
                .returning();
            return { githubInstallationId: updated.id };
        }

        const [created] = await db
            .insert(githubInstallations)
            .values({
                orgId: input.orgId,
                externalId: ext,
                accountLogin: input.accountLogin,
                accountId: input.accountId != null ? String(input.accountId) : null,
                accountType: input.accountType || null,
                suspended: input.suspended ?? false,
            })
            .returning();

        return { githubInstallationId: created.id };
    },

    async upsertRepository(input: {
        orgId: string;
        externalRepoId: number;
        name: string;
        fullName: string;
        defaultBranch?: string | null;
        private?: boolean | null;
    }): Promise<{ repoId: string }> {
        const externalId = String(input.externalRepoId);
        const existing = await db.query.repositories.findFirst({
            where: and(eq(repositories.platform, "github"), eq(repositories.externalId, externalId)),
        });

        if (existing) {
            const [updated] = await db
                .update(repositories)
                .set({
                    orgId: input.orgId,
                    name: input.name,
                    fullName: input.fullName,
                    defaultBranch: input.defaultBranch || existing.defaultBranch,
                    private: input.private ?? existing.private,
                    updatedAt: new Date(),
                })
                .where(eq(repositories.id, existing.id))
                .returning();
            return { repoId: updated.id };
        }

        const [created] = await db
            .insert(repositories)
            .values({
                orgId: input.orgId,
                platform: "github",
                externalId,
                name: input.name,
                fullName: input.fullName,
                defaultBranch: input.defaultBranch || "main",
                private: input.private ?? false,
            })
            .returning();
        return { repoId: created.id };
    },

    async replaceInstallationRepos(input: {
        githubInstallationId: string;
        repoIds: string[];
    }): Promise<void> {
        // Simple approach: delete all then insert (safe because unique on install+repo).
        await db
            .delete(githubInstallationRepositories)
            .where(eq(githubInstallationRepositories.githubInstallationId, input.githubInstallationId));

        if (input.repoIds.length === 0) return;

        await db.insert(githubInstallationRepositories).values(
            input.repoIds.map((repoId) => ({
                githubInstallationId: input.githubInstallationId,
                repoId,
            }))
        );
    },

    async addInstallationRepos(input: { githubInstallationId: string; repoIds: string[] }) {
        if (input.repoIds.length === 0) return;
        // Insert individually; unique index prevents duplicates.
        for (const repoId of input.repoIds) {
            const existing = await db.query.githubInstallationRepositories.findFirst({
                where: and(
                    eq(githubInstallationRepositories.githubInstallationId, input.githubInstallationId),
                    eq(githubInstallationRepositories.repoId, repoId)
                ),
            });
            if (existing) continue;
            await db.insert(githubInstallationRepositories).values({
                githubInstallationId: input.githubInstallationId,
                repoId,
            });
        }
    },

    async removeInstallationRepos(input: { githubInstallationId: string; repoIds: string[] }) {
        if (input.repoIds.length === 0) return;
        await db
            .delete(githubInstallationRepositories)
            .where(
                and(
                    eq(githubInstallationRepositories.githubInstallationId, input.githubInstallationId),
                    inArray(githubInstallationRepositories.repoId, input.repoIds)
                )
            );
    },

    async getInstallationByExternalId(installationId: number) {
        return db.query.githubInstallations.findFirst({
            where: eq(githubInstallations.externalId, String(installationId)),
        });
    },

    async listRepositoriesForInstallation(installationId: number) {
        const installation = await this.getInstallationByExternalId(installationId);
        if (!installation) return [];

        const links = await db.query.githubInstallationRepositories.findMany({
            where: eq(githubInstallationRepositories.githubInstallationId, installation.id),
        });
        const repoIds = links.map((l: { repoId: string }) => l.repoId);
        if (repoIds.length === 0) return [];

        const repos = await db.query.repositories.findMany({
            where: inArray(repositories.id, repoIds),
        });
        return repos;
    },
};
