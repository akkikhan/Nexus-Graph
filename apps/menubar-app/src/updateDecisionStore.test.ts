import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UpdateDecisionStore } from "./updateDecisionStore.js";

const tempDirectories: string[] = [];

async function createStore() {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-menubar-update-store-"));
    tempDirectories.push(tempDir);
    const storePath = path.join(tempDir, "update-state.json");
    const store = new UpdateDecisionStore(storePath);
    await store.load();
    return { store, storePath };
}

afterEach(async () => {
    await Promise.all(
        tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))
    );
});

describe("UpdateDecisionStore", () => {
    it("loads missing state as empty defaults", async () => {
        const { store } = await createStore();
        expect(store.getState()).toEqual({
            skippedVersions: [],
            snoozedUntil: undefined,
        });
    });

    it("persists skipped versions", async () => {
        const { store, storePath } = await createStore();
        await store.skipVersion("0.2.0");
        expect(store.shouldSurfaceUpdate("0.2.0")).toBe(false);

        const reloaded = new UpdateDecisionStore(storePath);
        await reloaded.load();
        expect(reloaded.shouldSurfaceUpdate("0.2.0")).toBe(false);
    });

    it("snoozes updates for requested window", async () => {
        const { store } = await createStore();
        const now = new Date("2026-03-05T00:00:00.000Z");

        await store.snooze(12, now);
        expect(store.shouldSurfaceUpdate("0.2.0", new Date("2026-03-05T06:00:00.000Z"))).toBe(false);
        expect(store.shouldSurfaceUpdate("0.2.0", new Date("2026-03-05T13:00:00.000Z"))).toBe(true);

        await store.clearSnooze();
        expect(store.shouldSurfaceUpdate("0.2.0", new Date("2026-03-05T06:00:00.000Z"))).toBe(true);
    });
});
