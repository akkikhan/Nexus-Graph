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
export declare class AIEnsembleDebate {
    private orchestrator;
    constructor(orchestrator: AIOrchestrator);
    /**
     * Run a full debate between multiple AI models
     */
    debate(diff: DiffContext, models: {
        asserter: AIProvider;
        challenger: AIProvider;
        resolver?: AIProvider;
    }): Promise<DebateResult>;
    /**
     * Quick debate for simpler PRs (2 rounds instead of 3)
     */
    quickDebate(diff: DiffContext, models: [AIProvider, AIProvider]): Promise<ReviewComment[]>;
    private parseJSON;
    private mapSeverity;
    private calculateOverallConfidence;
}
export {};
//# sourceMappingURL=ensemble-debate.d.ts.map