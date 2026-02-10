/**
 * NEXUS AI Engine - Multi-LLM Orchestrator
 * Intelligently routes requests to the best AI provider
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIConfig, AIProvider } from "./types";

export class AIOrchestrator {
    private anthropic?: Anthropic;
    private openai?: OpenAI;
    private google?: GoogleGenerativeAI;
    private config: AIConfig;

    constructor(config: AIConfig) {
        this.config = config;
        this.initializeProviders();
    }

    private initializeProviders() {
        if (this.config.providers.anthropic) {
            this.anthropic = new Anthropic({
                apiKey: this.config.providers.anthropic.apiKey,
            });
        }

        if (this.config.providers.openai) {
            this.openai = new OpenAI({
                apiKey: this.config.providers.openai.apiKey,
            });
        }

        if (this.config.providers.google) {
            this.google = new GoogleGenerativeAI(
                this.config.providers.google.apiKey
            );
        }
    }

    /**
     * Send a message to the configured AI provider
     */
    async chat(
        messages: Array<{ role: "user" | "assistant"; content: string }>,
        options: {
            provider?: AIProvider;
            systemPrompt?: string;
            maxTokens?: number;
            temperature?: number;
        } = {}
    ): Promise<string> {
        const provider = options.provider || this.config.defaultProvider;
        const maxTokens = options.maxTokens || 4096;
        const temperature = options.temperature || 0.3;

        switch (provider) {
            case "anthropic":
                return this.chatAnthropic(messages, {
                    systemPrompt: options.systemPrompt,
                    maxTokens,
                    temperature,
                });

            case "openai":
                return this.chatOpenAI(messages, {
                    systemPrompt: options.systemPrompt,
                    maxTokens,
                    temperature,
                });

            case "google":
                return this.chatGoogle(messages, {
                    systemPrompt: options.systemPrompt,
                    maxTokens,
                    temperature,
                });

            default:
                throw new Error(`Unknown AI provider: ${provider}`);
        }
    }

    private async chatAnthropic(
        messages: Array<{ role: "user" | "assistant"; content: string }>,
        options: { systemPrompt?: string; maxTokens: number; temperature: number }
    ): Promise<string> {
        if (!this.anthropic || !this.config.providers.anthropic) {
            throw new Error("Anthropic provider not configured");
        }

        const response = await this.anthropic.messages.create({
            model: this.config.providers.anthropic.model,
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            system: options.systemPrompt,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
        });

        const textContent = response.content.find((c) => c.type === "text");
        return textContent?.text || "";
    }

    private async chatOpenAI(
        messages: Array<{ role: "user" | "assistant"; content: string }>,
        options: { systemPrompt?: string; maxTokens: number; temperature: number }
    ): Promise<string> {
        if (!this.openai || !this.config.providers.openai) {
            throw new Error("OpenAI provider not configured");
        }

        const systemMessages: Array<OpenAI.ChatCompletionMessageParam> = options.systemPrompt
            ? [{ role: "system" as const, content: options.systemPrompt }]
            : [];

        const response = await this.openai.chat.completions.create({
            model: this.config.providers.openai.model,
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            messages: [
                ...systemMessages,
                ...messages.map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                })),
            ],
        });

        return response.choices[0]?.message?.content || "";
    }

    private async chatGoogle(
        messages: Array<{ role: "user" | "assistant"; content: string }>,
        options: { systemPrompt?: string; maxTokens: number; temperature: number }
    ): Promise<string> {
        if (!this.google || !this.config.providers.google) {
            throw new Error("Google provider not configured");
        }

        const model = this.google.getGenerativeModel({
            model: this.config.providers.google.model,
            systemInstruction: options.systemPrompt,
            generationConfig: {
                maxOutputTokens: options.maxTokens,
                temperature: options.temperature,
            },
        });

        const chat = model.startChat({
            history: messages.slice(0, -1).map((m) => ({
                role: m.role === "user" ? "user" : "model",
                parts: [{ text: m.content }],
            })),
        });

        const lastMessage = messages[messages.length - 1];
        const result = await chat.sendMessage(lastMessage.content);
        return result.response.text();
    }

    /**
     * Get the provider for a specific task
     */
    getProviderForTask(
        task: "codeReview" | "summarization" | "suggestions" | "riskAssessment"
    ): AIProvider {
        return this.config.routing[task];
    }

    /**
     * Check if a provider is available
     */
    isProviderAvailable(provider: AIProvider): boolean {
        switch (provider) {
            case "anthropic":
                return !!this.anthropic;
            case "openai":
                return !!this.openai;
            case "google":
                return !!this.google;
            default:
                return false;
        }
    }

    /**
     * Get available providers
     */
    getAvailableProviders(): AIProvider[] {
        const providers: AIProvider[] = [];
        if (this.anthropic) providers.push("anthropic");
        if (this.openai) providers.push("openai");
        if (this.google) providers.push("google");
        return providers;
    }
}
