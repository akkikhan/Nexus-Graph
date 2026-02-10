/**
 * NEXUS Code Intent Detector
 * Understands WHY code was written, not just what it does
 */
// Pattern recognition for common code intents
const INTENT_PATTERNS = {
    authentication: [
        /login|logout|signin|signout|authenticate/i,
        /password|credential|token|jwt|oauth/i,
        /session|cookie.*auth/i,
    ],
    authorization: [
        /authorize|permission|access.*control/i,
        /role|rbac|acl|can[A-Z]/i,
        /isAdmin|hasRole|checkPermission/i,
    ],
    rate_limiting: [
        /rate.*limit|throttle|quota/i,
        /requests?.*per.*second|rps/i,
        /slidingWindow|tokenBucket|leakyBucket/i,
    ],
    caching: [
        /cache|memoize|redis|memcached/i,
        /ttl|expir|invalidate/i,
        /getOrSet|cacheKey/i,
    ],
    retry_logic: [
        /retry|backoff|exponential/i,
        /attempt|maxRetries|retryCount/i,
        /withRetry|retryable/i,
    ],
    error_handling: [
        /catch|throw|error|exception/i,
        /try\s*{|finally/i,
        /handleError|onError|errorBoundary/i,
    ],
    validation: [
        /validate|sanitize|schema/i,
        /isValid|check[A-Z]|assert/i,
        /zod|joi|yup|validator/i,
    ],
    data_transformation: [
        /transform|convert|map|reduce/i,
        /serialize|deserialize|parse/i,
        /toJSON|fromJSON|normalize/i,
    ],
    api_integration: [
        /fetch|axios|http|request/i,
        /endpoint|api.*call|webhook/i,
        /graphql|rest|grpc/i,
    ],
    logging: [
        /console\.|log\.|logger/i,
        /debug|info|warn|error.*log/i,
        /winston|pino|bunyan/i,
    ],
    monitoring: [
        /metric|trace|span|telemetry/i,
        /prometheus|datadog|newrelic/i,
        /observe|measure|instrument/i,
    ],
    testing: [
        /describe|it\(|test\(|expect/i,
        /mock|stub|spy|fake/i,
        /jest|vitest|mocha|cypress/i,
    ],
    configuration: [
        /config|settings|options|env/i,
        /process\.env|dotenv/i,
        /feature.*flag|toggle/i,
    ],
    database_operation: [
        /query|insert|update|delete|select/i,
        /prisma|drizzle|typeorm|sequelize/i,
        /transaction|commit|rollback/i,
    ],
    file_operation: [
        /readFile|writeFile|fs\./i,
        /path\.|dirname|filename/i,
        /stream|buffer|blob/i,
    ],
    encryption: [
        /encrypt|decrypt|hash|bcrypt/i,
        /crypto|cipher|aes|rsa/i,
        /salt|iv|key.*derivation/i,
    ],
    parsing: [
        /parse|tokenize|lex/i,
        /regex|match|split.*join/i,
        /ast|syntax|grammar/i,
    ],
    scheduling: [
        /cron|schedule|interval|timeout/i,
        /queue|job|worker|bull/i,
        /delay|debounce|throttle/i,
    ],
    notification: [
        /notify|alert|email|sms/i,
        /push.*notification|webhook.*send/i,
        /sendgrid|twilio|sns/i,
    ],
    workaround: [
        /hack|workaround|temporary|fixme/i,
        /todo.*remove|should.*refactor/i,
        /legacy.*compat/i,
    ],
    optimization: [
        /optimize|performance|speed/i,
        /lazy|defer|async.*load/i,
        /bundle|minify|compress/i,
    ],
    refactoring: [
        /refactor|cleanup|reorganize/i,
        /extract|inline|rename/i,
        /move.*to|split.*into/i,
    ],
    feature: [
        /feature|implement|add.*new/i,
        /support.*for|enable/i,
    ],
    bugfix: [
        /fix|bug|issue|patch/i,
        /resolve|correct|repair/i,
    ],
    unknown: [],
};
// Intent-specific review focus areas
const INTENT_REVIEW_FOCUS = {
    authentication: [
        "Check for timing attacks in comparison",
        "Verify secure password storage (bcrypt, argon2)",
        "Ensure tokens have proper expiration",
        "Check for session fixation vulnerabilities",
    ],
    authorization: [
        "Verify all endpoints are protected",
        "Check for privilege escalation paths",
        "Ensure deny-by-default policy",
        "Validate role hierarchy is correct",
    ],
    rate_limiting: [
        "Check for bypass via header manipulation",
        "Verify limits are per-user, not global",
        "Ensure graceful degradation under load",
        "Check distributed rate limiting consistency",
    ],
    caching: [
        "Verify cache invalidation logic",
        "Check for cache poisoning vulnerabilities",
        "Ensure sensitive data is not cached",
        "Validate TTL values are appropriate",
    ],
    retry_logic: [
        "Verify exponential backoff is implemented",
        "Check for infinite retry loops",
        "Ensure idempotency of retried operations",
        "Validate max retry limits",
    ],
    error_handling: [
        "Check for swallowed exceptions",
        "Verify error messages don't leak sensitive info",
        "Ensure proper error boundaries",
        "Validate cleanup in finally blocks",
    ],
    validation: [
        "Check for bypass via type coercion",
        "Verify server-side validation exists",
        "Ensure all user inputs are validated",
        "Check regex for ReDoS vulnerabilities",
    ],
    encryption: [
        "Verify using current encryption standards",
        "Check key management practices",
        "Ensure IVs are random and unique",
        "Validate secure random generation",
    ],
    database_operation: [
        "Check for SQL injection",
        "Verify proper transaction handling",
        "Ensure indexes exist for query patterns",
        "Validate N+1 query prevention",
    ],
    workaround: [
        "Flag for tech debt tracking",
        "Ensure workaround is documented",
        "Set reminder to revisit",
        "Verify workaround doesn't introduce bugs",
    ],
    // ... more mappings
    data_transformation: ["Verify data integrity after transformation"],
    api_integration: ["Check error handling for API failures"],
    logging: ["Ensure no sensitive data in logs"],
    monitoring: ["Verify metrics have proper labels"],
    testing: ["Check test coverage is adequate"],
    configuration: ["Validate all config is documented"],
    file_operation: ["Check for path traversal vulnerabilities"],
    parsing: ["Verify input size limits"],
    scheduling: ["Check for race conditions"],
    notification: ["Validate rate limits on notifications"],
    optimization: ["Verify optimization doesn't break functionality"],
    refactoring: ["Ensure behavior is unchanged"],
    feature: ["Verify feature flag coverage"],
    bugfix: ["Add regression test"],
    unknown: [],
};
export class CodeIntentDetector {
    orchestrator;
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
     * Analyze code diff to detect intent
     */
    async analyze(diffs) {
        const detectedPatterns = [];
        const intentCounts = {};
        const techDebtFlags = [];
        // Pattern-based detection
        for (const diff of diffs) {
            const lines = diff.diff.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!line.startsWith("+"))
                    continue; // Only analyze additions
                // Check for tech debt markers
                if (/TODO|FIXME|HACK|XXX|WORKAROUND/i.test(line)) {
                    techDebtFlags.push({
                        type: /HACK/i.test(line)
                            ? "hack"
                            : /WORKAROUND/i.test(line)
                                ? "temporary_workaround"
                                : "todo",
                        location: { file: diff.file, line: i + 1 },
                        description: line.replace(/^[+\-\s]*\/\/\s*/, "").trim(),
                    });
                }
                // Detect intents from patterns
                for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
                    for (const pattern of patterns) {
                        if (pattern.test(line)) {
                            intentCounts[intent] =
                                (intentCounts[intent] || 0) + 1;
                            // Create or update detected pattern
                            const existing = detectedPatterns.find((p) => p.intent === intent &&
                                p.location.file === diff.file &&
                                Math.abs(p.location.endLine - i) < 10);
                            if (existing) {
                                existing.location.endLine = i + 1;
                                existing.evidence.push(line.slice(1).trim());
                                existing.confidence = Math.min(0.99, existing.confidence + 0.1);
                            }
                            else {
                                detectedPatterns.push({
                                    intent: intent,
                                    confidence: 0.5,
                                    evidence: [line.slice(1).trim()],
                                    location: {
                                        file: diff.file,
                                        startLine: i + 1,
                                        endLine: i + 1,
                                    },
                                    implications: [],
                                    suggestedChecks: INTENT_REVIEW_FOCUS[intent] || [],
                                });
                            }
                        }
                    }
                }
            }
        }
        // Determine primary and secondary intents
        const sortedIntents = Object.entries(intentCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([intent]) => intent);
        const primaryIntent = sortedIntents[0] || "unknown";
        const secondaryIntents = sortedIntents.slice(1, 4);
        // Calculate architectural impact
        const architecturalImpact = {
            affectsAuth: ["authentication", "authorization", "encryption"].some((i) => sortedIntents.includes(i)),
            affectsData: ["database_operation", "data_transformation", "caching"].some((i) => sortedIntents.includes(i)),
            affectsPerformance: ["caching", "optimization", "rate_limiting"].some((i) => sortedIntents.includes(i)),
            affectsSecurity: [
                "authentication",
                "authorization",
                "encryption",
                "validation",
            ].some((i) => sortedIntents.includes(i)),
            affectsReliability: [
                "retry_logic",
                "error_handling",
                "monitoring",
            ].some((i) => sortedIntents.includes(i)),
        };
        // Add AI-enhanced intent analysis for complex cases
        if (detectedPatterns.length > 0 && primaryIntent !== "unknown") {
            await this.enhanceWithAI(detectedPatterns, diffs);
        }
        return {
            primaryIntent,
            secondaryIntents,
            detectedPatterns,
            technicalDebtFlags: techDebtFlags,
            architecturalImpact,
        };
    }
    /**
     * Enhance pattern detection with AI understanding
     */
    async enhanceWithAI(patterns, diffs) {
        const combinedDiff = diffs.map((d) => d.diff).join("\n---\n");
        try {
            const response = await this.orchestrator.chat([
                {
                    role: "user",
                    content: `Analyze the intent and implications of this code change:

${combinedDiff.slice(0, 15000)}

I've detected these patterns: ${patterns.map((p) => p.intent).join(", ")}

For each detected intent, provide:
1. Any additional implications I should know about
2. Potential risks specific to this implementation
3. Context-specific review suggestions

Respond as JSON: { "enhancements": [{ "intent": "...", "implications": [...], "risks": [...] }] }`,
                },
            ], {
                maxTokens: 2048,
                temperature: 0.2,
            });
            const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || "{}");
            // Merge AI insights back into patterns
            for (const enhancement of parsed.enhancements || []) {
                const pattern = patterns.find((p) => p.intent === enhancement.intent);
                if (pattern) {
                    pattern.implications = [
                        ...pattern.implications,
                        ...(enhancement.implications || []),
                    ];
                    pattern.suggestedChecks = [
                        ...pattern.suggestedChecks,
                        ...(enhancement.risks || []),
                    ];
                }
            }
        }
        catch {
            // AI enhancement failed, continue with pattern-based results
        }
    }
    /**
     * Get review guidance based on detected intent
     */
    getReviewGuidance(intent) {
        return INTENT_REVIEW_FOCUS[intent] || [];
    }
}
//# sourceMappingURL=intent-detector.js.map