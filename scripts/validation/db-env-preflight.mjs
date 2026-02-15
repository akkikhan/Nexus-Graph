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
    // Avoid leaking secrets in logs. We intentionally do not print full URLs.
    // URL parsing can also fail if passwords include reserved characters that aren't percent-encoded.
    try {
        const parsed = new URL(raw);
        const host = parsed.host || "<unknown-host>";
        const sslmode = (parsed.searchParams.get("sslmode") || "").toLowerCase();
        return `postgres://****@${host}/****${sslmode ? `?sslmode=${sslmode}` : ""}`;
    } catch {
        return "<redacted>";
    }
}

function isPostgresUrl(value) {
    return value.startsWith("postgres://") || value.startsWith("postgresql://");
}

function hasRequiredSsl(url) {
    // Prefer a string check; URL parsing may fail if the password isn't percent-encoded.
    return /(?:\?|&)sslmode=(require|verify-ca|verify-full)\b/i.test(url);
}

function looksLikeKnownHostedProvider(url) {
    return (
        /\\.supabase\\.co\\b/i.test(url) ||
        /\\.postgres\\.database\\.azure\\.com\\b/i.test(url)
    );
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
    // Allow missing sslmode for known providers because our runtime/CLI lanes enforce SSL separately.
    // For unknown hosted providers, remain strict.
    if (!looksLikeKnownHostedProvider(resolved.value)) {
        process.stderr.write(
            `[db-preflight] FAIL: hosted DB URL must include sslmode=require|verify-ca|verify-full\n`
        );
        process.exit(1);
    }
    process.stdout.write(
        `[db-preflight] WARN: hosted DB URL missing sslmode=...; continuing (known provider)\n`
    );
}

process.stdout.write(`[db-preflight] PASS target=${target}\n`);
process.stdout.write(`[db-preflight] source=${resolved.source}\n`);
process.stdout.write(`[db-preflight] url=${maskUrl(resolved.value)}\n`);
