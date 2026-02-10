/**
 * NEXUS AI Engine - Multi-LLM Orchestrator
 * Intelligently routes requests to the best AI provider
 */
import type { AIConfig, AIProvider } from "./types";
export declare class AIOrchestrator {
    private anthropic?;
    private openai?;
    private google?;
    private config;
    constructor(config: AIConfig);
    private initializeProviders;
    /**
     * Send a message to the configured AI provider
     */
    chat(messages: Array<{
        role: "user" | "assistant";
        content: string;
    }>, options?: {
        provider?: AIProvider;
        systemPrompt?: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<string>;
    private chatAnthropic;
    private chatOpenAI;
    private chatGoogle;
    /**
     * Get the provider for a specific task
     */
    getProviderForTask(task: "codeReview" | "summarization" | "suggestions" | "riskAssessment"): AIProvider;
    /**
     * Check if a provider is available
     */
    isProviderAvailable(provider: AIProvider): boolean;
    /**
     * Get available providers
     */
    getAvailableProviders(): AIProvider[];
}
//# sourceMappingURL=orchestrator.d.ts.map