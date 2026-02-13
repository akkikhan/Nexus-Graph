import { defineConfig } from "drizzle-kit";

const url =
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/nexus";

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
