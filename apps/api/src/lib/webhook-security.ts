import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type IntegrationWebhookProvider = "slack" | "linear" | "jira";

type VerificationFailureReason =
    | "missing_signature_headers"
    | "invalid_timestamp"
    | "timestamp_out_of_window"
    | "missing_secret"
    | "invalid_signature";

type VerificationMetadata = {
    signaturePresent: boolean;
    timestampPresent: boolean;
    parsedTimestampSeconds?: number;
    requestSkewSeconds?: number;
};

type VerificationResult =
    | {
          ok: true;
          timestampSeconds: number;
          secretSource: "env" | "dev-default";
      }
    | {
          ok: false;
          status: 401 | 503;
          reason: VerificationFailureReason;
          metadata: VerificationMetadata;
      };

const PROVIDER_SECRET_ENV: Record<IntegrationWebhookProvider, string> = {
    slack: "NEXUS_WEBHOOK_SIGNING_SECRET_SLACK",
    linear: "NEXUS_WEBHOOK_SIGNING_SECRET_LINEAR",
    jira: "NEXUS_WEBHOOK_SIGNING_SECRET_JIRA",
};

const RAW_SIGNATURE_TOLERANCE_SECONDS = Number(process.env.NEXUS_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS ?? 300);
const SIGNATURE_TOLERANCE_SECONDS =
    Number.isFinite(RAW_SIGNATURE_TOLERANCE_SECONDS) && RAW_SIGNATURE_TOLERANCE_SECONDS >= 30
        ? Math.min(Math.max(Math.round(RAW_SIGNATURE_TOLERANCE_SECONDS), 30), 86_400)
        : 300;
const SIGNATURES_REQUIRED = process.env.NEXUS_WEBHOOK_SIGNATURE_REQUIRED !== "false";

function stableStringify(value: unknown): string {
    if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
        const objectBody = entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",");
        return `{${objectBody}}`;
    }
    return JSON.stringify(String(value));
}

function resolveSigningSecret(provider: IntegrationWebhookProvider): { secret: string; source: "env" | "dev-default" } | null {
    const envName = PROVIDER_SECRET_ENV[provider];
    const configured = (process.env[envName] || "").trim();
    if (configured) return { secret: configured, source: "env" };

    if (process.env.NODE_ENV === "production") return null;
    return { secret: `nexus-dev-${provider}-webhook-secret`, source: "dev-default" };
}

function parseTimestampSeconds(timestampHeader?: string): number | null {
    if (!timestampHeader) return null;
    const parsed = Number(timestampHeader.trim());
    if (!Number.isFinite(parsed)) return null;
    const seconds = parsed > 1_000_000_000_000 ? parsed / 1000 : parsed;
    return Math.floor(seconds);
}

function verifySignature(expected: string, provided: string): boolean {
    const expectedBuffer = Buffer.from(expected, "utf8");
    const providedBuffer = Buffer.from(provided, "utf8");
    if (expectedBuffer.length !== providedBuffer.length) return false;
    try {
        return timingSafeEqual(expectedBuffer, providedBuffer);
    } catch {
        return false;
    }
}

function signatureHeader(headers: { signature?: string; timestamp?: string }) {
    return {
        signature: headers.signature?.trim() || "",
        timestamp: headers.timestamp?.trim() || "",
    };
}

export function verifyIntegrationWebhookSignature(input: {
    provider: IntegrationWebhookProvider;
    eventType: string;
    externalEventId: string;
    body: unknown;
    signatureHeader?: string;
    timestampHeader?: string;
}): VerificationResult {
    if (!SIGNATURES_REQUIRED) {
        return {
            ok: true,
            timestampSeconds: Math.floor(Date.now() / 1000),
            secretSource: "dev-default",
        };
    }

    const headers = signatureHeader({
        signature: input.signatureHeader,
        timestamp: input.timestampHeader,
    });
    const metadata: VerificationMetadata = {
        signaturePresent: Boolean(headers.signature),
        timestampPresent: Boolean(headers.timestamp),
    };
    if (!headers.signature || !headers.timestamp) {
        return { ok: false, status: 401, reason: "missing_signature_headers", metadata };
    }

    const timestampSeconds = parseTimestampSeconds(headers.timestamp);
    if (!timestampSeconds) return { ok: false, status: 401, reason: "invalid_timestamp", metadata };
    metadata.parsedTimestampSeconds = timestampSeconds;

    const nowSeconds = Math.floor(Date.now() / 1000);
    metadata.requestSkewSeconds = nowSeconds - timestampSeconds;
    if (Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) {
        return { ok: false, status: 401, reason: "timestamp_out_of_window", metadata };
    }

    const secretConfig = resolveSigningSecret(input.provider);
    if (!secretConfig) return { ok: false, status: 503, reason: "missing_secret", metadata };

    const payloadHash = createHash("sha256").update(stableStringify(input.body), "utf8").digest("hex");
    const canonical = [
        String(timestampSeconds),
        input.provider,
        input.eventType.trim(),
        input.externalEventId.trim(),
        payloadHash,
    ].join(".");
    const expectedSignature = `v1=${createHmac("sha256", secretConfig.secret).update(canonical, "utf8").digest("hex")}`;
    const valid = verifySignature(expectedSignature, headers.signature);

    if (!valid) return { ok: false, status: 401, reason: "invalid_signature", metadata };
    return {
        ok: true,
        timestampSeconds,
        secretSource: secretConfig.source,
    };
}
