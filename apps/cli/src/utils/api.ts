/**
 * NEXUS CLI - API Utilities
 */

import type { StackSnapshot } from "./stack";
import { getConfig } from "./config";

interface SyncStackPayload {
    stackName: string;
    snapshot: StackSnapshot;
    repo?: string;
    user?: string;
}

export async function syncStackToServer(payload: SyncStackPayload): Promise<void> {
    const config = getConfig();
    const apiUrl = (config.get("apiUrl") as string) || "http://localhost:3001";

    const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/v1/stacks/sync-local`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(
            `Stack sync failed (${response.status}): ${errorBody || response.statusText}`
        );
    }
}
