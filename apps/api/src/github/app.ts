/**
 * Minimal GitHub App auth helpers.
 *
 * Notes:
 * - Requires `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` to fetch installation tokens.
 * - Private key can be provided as a PEM string or base64 (recommended for env vars).
 */

import { createPrivateKey, createSign } from "crypto";

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function base64UrlEncode(input: Buffer | string): string {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
    return buf
        .toString("base64")
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}

function readPrivateKeyPem(): string {
    const raw = process.env.GITHUB_APP_PRIVATE_KEY;
    if (!raw) {
        throw new Error("Missing GITHUB_APP_PRIVATE_KEY");
    }
    // Accept either a PEM string or base64-encoded PEM.
    if (raw.includes("BEGIN")) return raw;
    try {
        return Buffer.from(raw, "base64").toString("utf8");
    } catch {
        return raw;
    }
}

export function createGitHubAppJwt(appId: string, privateKeyPem: string): string {
    const header = { alg: "RS256", typ: "JWT" };
    const iat = nowSeconds() - 5;
    const exp = iat + 9 * 60; // GitHub allows max 10 minutes; keep below that.
    const payload = { iat, exp, iss: appId };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const key = createPrivateKey(privateKeyPem);
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(key);

    return `${signingInput}.${base64UrlEncode(signature)}`;
}

export async function createInstallationAccessToken(installationId: number): Promise<string> {
    const appId = process.env.GITHUB_APP_ID;
    if (!appId) throw new Error("Missing GITHUB_APP_ID");

    const pem = readPrivateKeyPem();
    const jwt = createGitHubAppJwt(appId, pem);

    const resp = await fetch(
        `https://api.github.com/app/installations/${installationId}/access_tokens`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "nexus-api",
            },
        }
    );

    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`GitHub token exchange failed (${resp.status}): ${text}`);
    }

    const json = (await resp.json()) as { token?: string };
    if (!json.token) throw new Error("GitHub token exchange returned no token");
    return json.token;
}

