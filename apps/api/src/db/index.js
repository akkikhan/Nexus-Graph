/**
 * NEXUS Database Connection & Client
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@nexus/db";
// Connection string from environment
const connectionString = process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/nexus";
// Create postgres connection
const client = postgres(connectionString, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
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