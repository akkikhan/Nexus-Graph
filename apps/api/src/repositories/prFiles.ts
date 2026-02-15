/**
 * Repository layer for PR files.
 */

import { and, eq } from "drizzle-orm";
import { db, pullRequestFiles } from "../db/index.js";

export type UpsertPRFileInput = {
    prId: string;
    path: string;
    status?: string | null;
    additions?: number | null;
    deletions?: number | null;
    changes?: number | null;
    sha?: string | null;
    patch?: string | null;
};

export const prFilesRepository = {
    async upsertMany(prId: string, files: UpsertPRFileInput[]) {
        for (const f of files) {
            const existing = await db.query.pullRequestFiles.findFirst({
                where: and(eq(pullRequestFiles.prId, prId), eq(pullRequestFiles.path, f.path)),
            });

            if (existing) {
                await db
                    .update(pullRequestFiles)
                    .set({
                        status: f.status ?? existing.status,
                        additions: f.additions ?? existing.additions,
                        deletions: f.deletions ?? existing.deletions,
                        changes: f.changes ?? existing.changes,
                        sha: f.sha ?? existing.sha,
                        patch: f.patch ?? existing.patch,
                    })
                    .where(eq(pullRequestFiles.id, existing.id));
            } else {
                await db.insert(pullRequestFiles).values({
                    prId,
                    path: f.path,
                    status: f.status ?? null,
                    additions: f.additions ?? 0,
                    deletions: f.deletions ?? 0,
                    changes: f.changes ?? 0,
                    sha: f.sha ?? null,
                    patch: f.patch ?? null,
                });
            }
        }
    },
};

