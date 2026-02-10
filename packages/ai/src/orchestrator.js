/**
 * NEXUS AI Engine - Multi-LLM Orchestrator
 * Intelligently routes requests to the best AI provider
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
export class AIOrchestrator {
    anthropic;
    openai;
    google;
    config;
    constructor(config) {
        this.config = config;
        this.initializeProviders();
    }
    initializeProviders() {
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
            this.google = new GoogleGenerativeAI(this.config.providers.google.apiKey);
        }
    }
    /**
     * Send a message to the configured AI provider
     */
    async chat(messages, options = {}) {
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
    async chatAnthropic(messages, options) {
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
    async chatOpenAI(messages, options) {
        if (!this.openai || !this.config.providers.openai) {
            throw new Error("OpenAI provider not configured");
        }
        const systemMessages = options.systemPrompt
            ? [{ role: "system", content: options.systemPrompt }]
            : [];
        const response = await this.openai.chat.completions.create({
            model: this.config.providers.openai.model,
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            messages: [
                ...systemMessages,
                ...messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            ],
        });
        return response.choices[0]?.message?.content || "";
    }
    async chatGoogle(messages, options) {
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
    getProviderForTask(task) {
        return this.config.routing[task];
    }
    /**
     * Check if a provider is available
     */
    isProviderAvailable(provider) {
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
    getAvailableProviders() {
        const providers = [];
        if (this.anthropic)
            providers.push("anthropic");
        if (this.openai)
            providers.push("openai");
        if (this.google)
            providers.push("google");
        return providers;
    }
}
//# sourceMappingURL=orchestrator.js.map