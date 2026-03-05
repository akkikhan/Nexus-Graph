import fs from "node:fs/promises";
import path from "node:path";

export interface UpdateDecisionState {
    skippedVersions: string[];
    snoozedUntil?: string;
}

export class UpdateDecisionStore {
    private state: UpdateDecisionState = {
        skippedVersions: [],
    };

    constructor(private readonly filePath: string) {}

    async load(): Promise<UpdateDecisionState> {
        try {
            const raw = await fs.readFile(this.filePath, "utf8");
            const parsed = JSON.parse(raw) as Partial<UpdateDecisionState>;
            this.state = normalizeState(parsed);
        } catch (error) {
            const notFound =
                error &&
                typeof error === "object" &&
                "code" in error &&
                (error as NodeJS.ErrnoException).code === "ENOENT";
            if (!notFound) {
                throw error;
            }
            this.state = { skippedVersions: [] };
        }
        return this.getState();
    }

    getState(): UpdateDecisionState {
        return {
            skippedVersions: [...this.state.skippedVersions],
            snoozedUntil: this.state.snoozedUntil,
        };
    }

    shouldSurfaceUpdate(targetVersion: string, now = new Date()): boolean {
        if (this.state.skippedVersions.includes(targetVersion)) {
            return false;
        }
        if (!this.state.snoozedUntil) {
            return true;
        }
        const snoozedUntilMs = Date.parse(this.state.snoozedUntil);
        if (Number.isNaN(snoozedUntilMs)) {
            return true;
        }
        return now.getTime() >= snoozedUntilMs;
    }

    async skipVersion(targetVersion: string): Promise<void> {
        if (!this.state.skippedVersions.includes(targetVersion)) {
            this.state.skippedVersions.push(targetVersion);
        }
        await this.persist();
    }

    async snooze(hours: number, now = new Date()): Promise<void> {
        const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
        const snoozedUntil = new Date(now.getTime() + safeHours * 60 * 60 * 1000);
        this.state.snoozedUntil = snoozedUntil.toISOString();
        await this.persist();
    }

    async clearSnooze(): Promise<void> {
        delete this.state.snoozedUntil;
        await this.persist();
    }

    private async persist(): Promise<void> {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
    }
}

function normalizeState(input: Partial<UpdateDecisionState>): UpdateDecisionState {
    const skippedVersions = Array.isArray(input.skippedVersions)
        ? input.skippedVersions.filter((value): value is string => typeof value === "string")
        : [];
    const snoozedUntil = typeof input.snoozedUntil === "string" ? input.snoozedUntil : undefined;
    return {
        skippedVersions,
        snoozedUntil,
    };
}
