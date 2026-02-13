/**
 * NEXUS Database Connection & Client
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@nexus/db";
function resolveConnectionString() {
    return (process.env.SUPABASE_DATABASE_URL ||
        process.env.DATABASE_URL ||
        process.env.AZURE_POSTGRES_URL ||
        "postgresql://postgres:postgres@localhost:5432/nexus");
}
function shouldUseHostedSsl(connectionString) {
    if (connectionString.includes("sslmode=require"))
        return true;
    try {
        const url = new URL(connectionString);
        const host = (url.hostname || "").toLowerCase();
        if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
            return false;
        }
        if (host.endsWith(".supabase.co"))
            return true;
        if (host.endsWith(".postgres.database.azure.com"))
            return true;
        return true;
    }
    catch {
        return false;
    }
}
const connectionString = resolveConnectionString();
const useHostedSsl = shouldUseHostedSsl(connectionString);
// Create postgres connection
const client = postgres(connectionString, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
    ssl: useHostedSsl ? "require" : undefined,
});
// Create drizzle client with schema
export const db = drizzle(client, { schema });
// Export schema for convenience
export * from "@nexus/db";
// Health check
export async function checkDatabaseHealth() {
    const start = Date.now();
    try {
        await client `SELECT 1`;
        return {
            connected: true,
            latencyMs: Date.now() - start,
        };
    }
    catch (error) {
        return {
            connected: false,
            latencyMs: Date.now() - start,
            error: error.message,
        };
    }
}
// Graceful shutdown
export async function closeDatabaseConnection() {
    await client.end();
}
//# sourceMappingURL=index.js.map
