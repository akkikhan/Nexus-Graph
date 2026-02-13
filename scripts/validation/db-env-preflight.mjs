#!/usr/bin/env node

const args = process.argv.slice(2);
const targetArg = args.find((arg) => arg.startsWith("--target="));
const target = (targetArg ? targetArg.split("=")[1] : "supabase").toLowerCase();

const allowedTargets = new Set(["supabase", "azure", "local"]);
if (!allowedTargets.has(target)) {
    process.stderr.write(`[db-preflight] FAIL: unsupported target "${target}"\n`);
    process.exit(1);
}

function maskUrl(raw) {
    try {
        const parsed = new URL(raw);
        if (parsed.password) parsed.password = "****";
        return parsed.toString();
    } catch {
        return "<invalid-url>";
    }
}

function isPostgresUrl(value) {
    return value.startsWith("postgres://") || value.startsWith("postgresql://");
}

function hasRequiredSsl(url) {
    try {
        const parsed = new URL(url);
        const sslmode = (parsed.searchParams.get("sslmode") || "").toLowerCase();
        return sslmode === "require" || sslmode === "verify-ca" || sslmode === "verify-full";
    } catch {
        return false;
    }
}

function resolveTargetUrl() {
    if (target === "supabase") {
        return {
            value: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || "",
            source: process.env.SUPABASE_DATABASE_URL
                ? "SUPABASE_DATABASE_URL"
                : process.env.DATABASE_URL
                    ? "DATABASE_URL"
                    : "none",
            required: true,
            hosted: true,
        };
    }

    if (target === "azure") {
        return {
            value: process.env.AZURE_POSTGRES_URL || process.env.DATABASE_URL || "",
            source: process.env.AZURE_POSTGRES_URL
                ? "AZURE_POSTGRES_URL"
                : process.env.DATABASE_URL
                    ? "DATABASE_URL"
                    : "none",
            required: true,
            hosted: true,
        };
    }

    return {
        value: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/nexus",
        source: process.env.DATABASE_URL ? "DATABASE_URL" : "local-default",
        required: false,
        hosted: false,
    };
}

const resolved = resolveTargetUrl();

if (resolved.required && !resolved.value) {
    process.stderr.write(
        `[db-preflight] FAIL: missing DB URL for target=${target}. Set the required environment variable.\n`
    );
    process.exit(1);
}

if (!isPostgresUrl(resolved.value)) {
    process.stderr.write(
        `[db-preflight] FAIL: expected postgres URL for target=${target}, got source=${resolved.source}\n`
    );
    process.exit(1);
}

if (resolved.hosted && !hasRequiredSsl(resolved.value)) {
    process.stderr.write(
        `[db-preflight] FAIL: hosted DB URL must include sslmode=require|verify-ca|verify-full\n`
    );
    process.exit(1);
}

process.stdout.write(`[db-preflight] PASS target=${target}\n`);
process.stdout.write(`[db-preflight] source=${resolved.source}\n`);
process.stdout.write(`[db-preflight] url=${maskUrl(resolved.value)}\n`);
