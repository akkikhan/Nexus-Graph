/**
 * Deterministic risk scoring heuristic.
 *
 * This is intentionally simple and fast; it can be replaced later with AI analysis.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type AiRuleSeverity = "info" | "warning" | "high" | "critical";

export interface AiRuleForRisk {
    id: string;
    name: string;
    prompt: string;
    regexPattern?: string | null;
    filePatterns?: string[] | null;
    severity?: AiRuleSeverity | string | null;
    enabled?: boolean | null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function severityWeight(sev: string | null | undefined): number {
    const s = String(sev || "warning").toLowerCase();
    if (s === "critical") return 28;
    if (s === "high") return 18;
    if (s === "info") return 5;
    return 10; // warning/default
}

function globToRegExp(glob: string): RegExp | null {
    const raw = String(glob || "").trim();
    if (!raw) return null;
    // Very small glob subset: '*' and '?' are supported. Everything else is treated literally.
    // This is enough for patterns like "auth/*", "**/*.sql", "migrations/*".
    const escaped = raw.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const rxSource = "^" +
        escaped
            .replace(/\\\*\\\*/g, ".*")
            .replace(/\\\*/g, ".*")
            .replace(/\\\?/g, ".") +
        "$";
    try {
        return new RegExp(rxSource);
    } catch {
        return null;
    }
}

export function computeRisk(input: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    title?: string;
    repoFullName?: string;
    filePaths?: string[];
    aiRules?: AiRuleForRisk[];
}): { riskScore: number; riskLevel: RiskLevel; aiSummary: string; riskFactors: any[] } {
    const files = Math.max(0, input.filesChanged || 0);
    const added = Math.max(0, input.linesAdded || 0);
    const removed = Math.max(0, input.linesRemoved || 0);
    const churn = added + removed;

    let score = 10;
    const factors: { key: string; weight: number; detail: string }[] = [];

    if (files >= 20) {
        score += 35;
        factors.push({ key: "many_files", weight: 35, detail: `${files} files changed` });
    } else if (files >= 10) {
        score += 22;
        factors.push({ key: "files", weight: 22, detail: `${files} files changed` });
    } else if (files >= 5) {
        score += 12;
        factors.push({ key: "files", weight: 12, detail: `${files} files changed` });
    }

    if (churn >= 2000) {
        score += 40;
        factors.push({ key: "huge_diff", weight: 40, detail: `${churn} lines changed` });
    } else if (churn >= 800) {
        score += 28;
        factors.push({ key: "large_diff", weight: 28, detail: `${churn} lines changed` });
    } else if (churn >= 250) {
        score += 16;
        factors.push({ key: "diff", weight: 16, detail: `${churn} lines changed` });
    }

    const lowerTitle = (input.title || "").toLowerCase();
    const suspiciousWords = ["auth", "payment", "billing", "security", "token", "encrypt", "permission"];
    for (const w of suspiciousWords) {
        if (lowerTitle.includes(w)) {
            score += 10;
            factors.push({ key: "sensitive_area", weight: 10, detail: `Title mentions ${w}` });
            break;
        }
    }

    const paths = input.filePaths || [];
    const pathSignals = [
        { key: "migrations", rx: /migrations?\//i, weight: 12, detail: "Touches migrations" },
        { key: "infra", rx: /(docker|k8s|terraform|pulumi|helm)\b/i, weight: 10, detail: "Touches infra/deploy" },
        { key: "auth", rx: /(auth|oauth|jwt|session)\b/i, weight: 10, detail: "Touches auth" },
        { key: "payments", rx: /(billing|payment|stripe)\b/i, weight: 12, detail: "Touches billing/payments" },
    ];
    for (const sig of pathSignals) {
        if (paths.some((p) => sig.rx.test(p))) {
            score += sig.weight;
            factors.push({ key: sig.key, weight: sig.weight, detail: sig.detail });
        }
    }

    // Apply org/repo-defined AI rules as an additional deterministic signal.
    const rules = Array.isArray(input.aiRules) ? input.aiRules : [];
    const matchedRuleNames: string[] = [];

    for (const rule of rules) {
        if (rule && rule.enabled === false) continue;
        const regexRaw = rule?.regexPattern || "";
        const fileGlobs = Array.isArray(rule?.filePatterns) ? rule.filePatterns : [];
        let matched = false;

        if (regexRaw) {
            try {
                const rx = new RegExp(regexRaw);
                if (rx.test(input.title || "") || paths.some((p) => rx.test(p))) matched = true;
            } catch {
                // Ignore invalid user regex patterns.
            }
        }

        if (!matched && fileGlobs.length > 0) {
            const globs = fileGlobs
                .map((g) => globToRegExp(g))
                .filter((x): x is RegExp => Boolean(x));
            if (globs.length > 0) {
                matched = paths.some((p) => globs.some((rx) => rx.test(p)));
            }
        }

        // Small heuristic: match on name keywords too (useful for simple rules without regex/globs).
        if (!matched) {
            const name = String(rule?.name || "").toLowerCase();
            if (name && lowerTitle.includes(name)) matched = true;
        }

        if (matched) {
            const w = severityWeight(rule?.severity);
            score += w;
            matchedRuleNames.push(String(rule?.name || rule?.id || "rule"));
            factors.push({
                key: "ai_rule",
                weight: w,
                detail: `Rule matched: ${rule?.name || rule?.id}`,
            });
        }
    }

    score = clamp(score, 0, 100);

    let level: RiskLevel = "low";
    if (score >= 85) level = "critical";
    else if (score >= 65) level = "high";
    else if (score >= 35) level = "medium";

    const summaryParts = [
        `${level.toUpperCase()} risk change`,
        `${files} files`,
        `${added} additions`,
        `${removed} deletions`,
    ];

    const suffix =
        matchedRuleNames.length > 0
            ? ` Matched rules: ${matchedRuleNames.slice(0, 3).join(", ")}.`
            : "";
    const aiSummary = summaryParts.join(". ") + "." + suffix;

    return {
        riskScore: score,
        riskLevel: level,
        aiSummary,
        riskFactors: factors,
    };
}
