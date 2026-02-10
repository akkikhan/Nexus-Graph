/**
 * NEXUS Database Connection & Client
 */
import postgres from "postgres";
import * as schema from "@nexus/db";
export declare const db: import("drizzle-orm/postgres-js").PostgresJsDatabase<typeof schema> & {
    $client: postgres.Sql<{}>;
};
export * from "@nexus/db";
export declare function checkDatabaseHealth(): Promise<{
    connected: boolean;
    latencyMs: number;
    error?: string;
}>;
export declare function closeDatabaseConnection(): Promise<void>;
//# sourceMappingURL=index.d.ts.map