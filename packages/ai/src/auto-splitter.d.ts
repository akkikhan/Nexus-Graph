/**
 * NEXUS AI Auto-Split Engine
 * Intelligently suggests how to split large PRs into stacked changes
 */
import { AIOrchestrator } from "./orchestrator";
import type { SplitSuggestion, DiffContext } from "./types";
export declare class AutoSplitter {
    private orchestrator;
    constructor(orchestrator: AIOrchestrator);
    /**
     * Analyze a large PR and suggest how to split it
     */
    suggestSplits(diffs: DiffContext[]): Promise<SplitSuggestion[]>;
    /**
     * Parse AI response into structured split suggestions
     */
    private parseSplitResponse;
    /**
     * Fallback heuristic-based splitting when AI fails
     */
    private fallbackSplit;
    private estimateLines;
}
//# sourceMappingURL=auto-splitter.d.ts.map