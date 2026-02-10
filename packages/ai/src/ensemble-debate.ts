/**
 * NEXUS AI Ensemble Debate Mode
 * Two or more AI models review and debate each other to reach consensus
 */

import { AIOrchestrator } from "./orchestrator";
import type { AIProvider, ReviewComment, DiffContext } from "./types";

interface DebateRound {
    model: string;
    position: "assertion" | "challenge" | "response" | "consensus";
    content: string;
    confidence: number;
}

interface DebateResult {
    rounds: DebateRound[];
    consensus: ReviewComment[];
    disagreements: Array<{
        topic: string;
        positions: Record<string, string>;
        resolution: string;
    }>;
    overallConfidence: number;
    debateDurationMs: number;
}

const DEBATE_PROMPT_ASSERTER = `You are the ASSERTER in an AI code review debate. Your role is to:
1. Identify potential issues in the code
2. Make clear assertions about bugs, security issues, or improvements
3. Provide evidence from the code to support your claims

Be thorough but avoid false positives. Only assert issues you are confident about.

Format your assertions as JSON:
{
  "assertions": [
    {
      "id": "A1",
      "severity": "critical|high|medium|low|info",
      "category": "bug|security|performance|style|logic",
      "location": { "file": "path", "line": 42 },
      "claim": "What you believe is wrong",
      "evidence": "Code snippet or reasoning",
      "confidence": 0.85
    }
  ]
}`;

const DEBATE_PROMPT_CHALLENGER = `You are the CHALLENGER in an AI code review debate. The ASSERTER made these claims:

{assertions}

Your role is to:
1. Critically examine each assertion
2. Challenge weak or incorrect claims with counter-evidence
3. Validate strong claims and add supporting evidence
4. Identify any issues the ASSERTER missed

Be rigorous. Don't agree just to agree. If you disagree, explain why with evidence.

Format your response as JSON:
{
  "challenges": [
    {
      "assertionId": "A1",
      "verdict": "agree|disagree|partially_agree",
      "reasoning": "Why you agree or disagree",
      "counterEvidence": "If disagreeing, what evidence refutes this",
      "additionalContext": "Any context that changes the assessment"
    }
  ],
  "missedIssues": [
    {
      "severity": "...",
      "category": "...",
      "location": { "file": "...", "line": ... },
      "claim": "...",
      "evidence": "..."
    }
  ]
}`;

const DEBATE_PROMPT_RESOLUTION = `You are the RESOLVER in an AI code review debate.

ASSERTER's claims:
{assertions}

CHALLENGER's responses:
{challenges}

Your role is to:
1. Synthesize both perspectives
2. Determine final verdict for each issue
3. Output only issues with high confidence consensus
4. Resolve disagreements with clear reasoning

Output final consensus as JSON:
{
  "consensus": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "...",
      "location": { "file": "...", "line": ... },
      "issue": "Final agreed issue description",
      "suggestion": "Recommended fix",
      "confidence": 0.92,
      "agreedBy": ["claude", "gpt-4"]
    }
  ],
  "resolvedDisagreements": [
    {
      "topic": "What was debated",
      "resolution": "How it was resolved",
      "finalVerdict": "agree|disagree"
    }
  ]
}`;

export class AIEnsembleDebate {
    private orchestrator: AIOrchestrator;

    constructor(orchestrator: AIOrchestrator) {
        this.orchestrator = orchestrator;
    }

    /**
     * Run a full debate between multiple AI models
     */
    async debate(
        diff: DiffContext,
        models: { asserter: AIProvider; challenger: AIProvider; resolver?: AIProvider }
    ): Promise<DebateResult> {
        const startTime = Date.now();
        const rounds: DebateRound[] = [];

        // Round 1: Asserter makes initial claims
        const asserterResponse = await this.orchestrator.chat(
            [{ role: "user", content: `Review this code diff and identify issues:\n\n${diff.diff}` }],
            {
                provider: models.asserter,
                systemPrompt: DEBATE_PROMPT_ASSERTER,
                maxTokens: 4096,
                temperature: 0.2,
            }
        );

        rounds.push({
            model: models.asserter,
            position: "assertion",
            content: asserterResponse,
            confidence: 0.8,
        });

        const assertions = this.parseJSON(asserterResponse);

        // Round 2: Challenger examines and challenges
        const challengerPrompt = DEBATE_PROMPT_CHALLENGER.replace(
            "{assertions}",
            JSON.stringify(assertions, null, 2)
        );

        const challengerResponse = await this.orchestrator.chat(
            [
                { role: "user", content: `Code diff:\n\n${diff.diff}` },
                { role: "assistant", content: asserterResponse },
                { role: "user", content: "Now examine these assertions critically." },
            ],
            {
                provider: models.challenger,
                systemPrompt: challengerPrompt,
                maxTokens: 4096,
                temperature: 0.3,
            }
        );

        rounds.push({
            model: models.challenger,
            position: "challenge",
            content: challengerResponse,
            confidence: 0.8,
        });

        const challenges = this.parseJSON(challengerResponse);

        // Round 3: Resolution (use resolver or asserter if not specified)
        const resolverProvider = models.resolver || models.asserter;
        const resolutionPrompt = DEBATE_PROMPT_RESOLUTION
            .replace("{assertions}", JSON.stringify(assertions, null, 2))
            .replace("{challenges}", JSON.stringify(challenges, null, 2));

        const resolutionResponse = await this.orchestrator.chat(
            [{ role: "user", content: "Resolve this debate and provide final consensus." }],
            {
                provider: resolverProvider,
                systemPrompt: resolutionPrompt,
                maxTokens: 4096,
                temperature: 0.1,
            }
        );

        rounds.push({
            model: resolverProvider,
            position: "consensus",
            content: resolutionResponse,
            confidence: 0.9,
        });

        const resolution = this.parseJSON(resolutionResponse);

        // Convert consensus to ReviewComments
        const consensusComments: ReviewComment[] = (resolution.consensus || []).map(
            (item: any, index: number) => ({
                id: `debate-${Date.now()}-${index}`,
                filePath: item.location?.file || diff.file,
                lineNumber: item.location?.line || 1,
                side: "RIGHT" as const,
                body: `**${item.severity?.toUpperCase()}**: ${item.issue}\n\n${item.suggestion || ""}`,
                suggestionCode: undefined,
                category: item.category || "best_practice",
                severity: this.mapSeverity(item.severity),
                confidence: item.confidence || 0.85,
            })
        );

        return {
            rounds,
            consensus: consensusComments,
            disagreements: resolution.resolvedDisagreements || [],
            overallConfidence: this.calculateOverallConfidence(resolution.consensus || []),
            debateDurationMs: Date.now() - startTime,
        };
    }

    /**
     * Quick debate for simpler PRs (2 rounds instead of 3)
     */
    async quickDebate(
        diff: DiffContext,
        models: [AIProvider, AIProvider]
    ): Promise<ReviewComment[]> {
        // Both models review independently
        const [response1, response2] = await Promise.all([
            this.orchestrator.chat(
                [{ role: "user", content: `Review:\n${diff.diff}` }],
                { provider: models[0], systemPrompt: DEBATE_PROMPT_ASSERTER, maxTokens: 2048 }
            ),
            this.orchestrator.chat(
                [{ role: "user", content: `Review:\n${diff.diff}` }],
                { provider: models[1], systemPrompt: DEBATE_PROMPT_ASSERTER, maxTokens: 2048 }
            ),
        ]);

        const issues1 = this.parseJSON(response1).assertions || [];
        const issues2 = this.parseJSON(response2).assertions || [];

        // Find consensus (issues mentioned by both)
        const consensus = issues1.filter((i1: any) =>
            issues2.some(
                (i2: any) =>
                    i2.location?.line === i1.location?.line &&
                    i2.category === i1.category
            )
        );

        return consensus.map((item: any, index: number) => ({
            id: `quick-debate-${Date.now()}-${index}`,
            filePath: item.location?.file || diff.file,
            lineNumber: item.location?.line || 1,
            side: "RIGHT" as const,
            body: `**${item.severity?.toUpperCase()}** (Confirmed by 2 models): ${item.claim}`,
            category: item.category || "best_practice",
            severity: this.mapSeverity(item.severity),
            confidence: 0.95, // High confidence since both agreed
        }));
    }

    private parseJSON(response: string): any {
        try {
            const match = response.match(/\{[\s\S]*\}/);
            return match ? JSON.parse(match[0]) : {};
        } catch {
            return {};
        }
    }

    private mapSeverity(severity: string): "info" | "warning" | "error" | "critical" {
        const map: Record<string, "info" | "warning" | "error" | "critical"> = {
            critical: "critical",
            high: "error",
            medium: "warning",
            low: "info",
            info: "info",
        };
        return map[severity?.toLowerCase()] || "warning";
    }

    private calculateOverallConfidence(consensus: any[]): number {
        if (consensus.length === 0) return 1; // No issues = confident
        const avgConfidence =
            consensus.reduce((sum, c) => sum + (c.confidence || 0.5), 0) / consensus.length;
        return avgConfidence;
    }
}
