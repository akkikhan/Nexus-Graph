#!/usr/bin/env node

const failures = [];
const warnings = [];

function hasValue(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function isPlaceholder(value) {
    if (!hasValue(value)) return true;
    const v = value.toLowerCase();
    return (
        v.includes("your_") ||
        v.includes("changeme") ||
        v.includes("<") ||
        v.includes("example") ||
        v.includes("password") ||
        v.endsWith("_here")
    );
}

function requireEnv(name, { allowPlaceholder = false } = {}) {
    const value = process.env[name];
    if (!hasValue(value)) {
        failures.push(`${name} is missing`);
        return;
    }
    if (!allowPlaceholder && isPlaceholder(value)) {
        failures.push(`${name} looks like a placeholder`);
    }
}

function optionalEnv(name, message) {
    const value = process.env[name];
    if (!hasValue(value)) {
        warnings.push(`${name} missing (${message})`);
    }
}

function resolveDbUrl() {
    if (hasValue(process.env.SUPABASE_DATABASE_URL)) return "SUPABASE_DATABASE_URL";
    if (hasValue(process.env.DATABASE_URL)) return "DATABASE_URL";
    if (hasValue(process.env.AZURE_POSTGRES_URL)) return "AZURE_POSTGRES_URL";
    return "";
}

const dbSource = resolveDbUrl();
if (!dbSource) {
    failures.push("No DB URL configured (set SUPABASE_DATABASE_URL or DATABASE_URL or AZURE_POSTGRES_URL)");
}

const authSecret = process.env.AUTH_SECRET;
if (!hasValue(authSecret)) {
    failures.push("AUTH_SECRET is missing");
} else if (authSecret.trim().length < 24 || isPlaceholder(authSecret)) {
    failures.push("AUTH_SECRET is weak or placeholder (use 24+ random chars)");
}

const hasAiKey =
    hasValue(process.env.OPENAI_API_KEY) ||
    hasValue(process.env.GOOGLE_AI_API_KEY) ||
    hasValue(process.env.ANTHROPIC_API_KEY);
if (!hasAiKey) {
    failures.push("No AI provider key set (OPENAI_API_KEY, GOOGLE_AI_API_KEY, or ANTHROPIC_API_KEY)");
}

requireEnv("GITHUB_APP_ID");
requireEnv("GITHUB_APP_PRIVATE_KEY");
// API webhook router expects `GITHUB_WEBHOOK_SECRET` (GitHub signing secret).
if (hasValue(process.env.GITHUB_WEBHOOK_SECRET)) {
    requireEnv("GITHUB_WEBHOOK_SECRET");
} else if (hasValue(process.env.GITHUB_APP_WEBHOOK_SECRET)) {
    warnings.push("GITHUB_APP_WEBHOOK_SECRET is set but GITHUB_WEBHOOK_SECRET is missing (prefer GITHUB_WEBHOOK_SECRET)");
} else {
    failures.push("GITHUB_WEBHOOK_SECRET is missing");
}

optionalEnv("SENTRY_DSN", "error tracking is not configured");
optionalEnv("ALERT_WEBHOOK_URL", "no alert destination configured");
optionalEnv("BACKUP_ENCRYPTION_KEY", "backup encryption is not configured");

if (dbSource) {
    process.stdout.write(`[ops:preflight] DB source: ${dbSource}\n`);
}

if (warnings.length > 0) {
    process.stdout.write("[ops:preflight] WARNINGS:\n");
    for (const warning of warnings) {
        process.stdout.write(` - ${warning}\n`);
    }
}

if (failures.length > 0) {
    process.stderr.write("[ops:preflight] FAIL:\n");
    for (const failure of failures) {
        process.stderr.write(` - ${failure}\n`);
    }
    process.exit(1);
}

process.stdout.write("[ops:preflight] PASS\n");
