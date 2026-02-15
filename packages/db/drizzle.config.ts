import { defineConfig } from "drizzle-kit";

function ensureHostedSslmodeRequire(input: string): string {
    // drizzle-kit relies on connection-string params for SSL in some environments.
    if (input.includes("sslmode=")) return input;

    const looksSupabase = /(?:^|@)([^/?#]+)\.supabase\.co(?::\d+)?\//i.test(input);
    const looksAzure = /(?:^|@)([^/?#]+)\.postgres\.database\.azure\.com(?::\d+)?\//i.test(input);
    if (!looksSupabase && !looksAzure) return input;

    return input.includes("?") ? `${input}&sslmode=require` : `${input}?sslmode=require`;
}

const rawUrl =
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/nexus";

const url = ensureHostedSslmodeRequire(rawUrl);

export default defineConfig({
    schema: "./src/schema.ts",
    out: "./migrations",
    dialect: "postgresql",
    dbCredentials: {
        url,
    },
    verbose: true,
    strict: true,
});
