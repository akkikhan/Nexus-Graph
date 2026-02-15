/**
 * Deterministic risk scoring heuristic.
 *
 * This is intentionally simple and fast; it can be replaced later with AI analysis.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export function computeRisk(input: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    title?: string;
    repoFullName?: string;
    filePaths?: string[];
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

    score = Math.max(0, Math.min(100, score));

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

    const aiSummary = summaryParts.join(". ") + ".";

    return {
        riskScore: score,
        riskLevel: level,
        aiSummary,
        riskFactors: factors,
    };
}

