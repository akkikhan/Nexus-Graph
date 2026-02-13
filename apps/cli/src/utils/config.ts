/**
 * NEXUS CLI - Configuration Management
 */

import Conf from "conf";

interface NexusConfig {
    // Auth
    githubToken?: string;
    githubUser?: string;
    gitlabToken?: string;
    gitlabUrl?: string;
    gitlabUser?: string;
    // Repo
    repo?: string;
    platform?: "github" | "gitlab" | "bitbucket";
    trunk?: string;
    branchPrefix?: string;
    initialized?: boolean;
    apiUrl?: string;
    // AI
    aiProvider?: string;
    aiApiKey?: string;
    // Preferences
    colorOutput?: boolean;
    autoStage?: boolean;
}

let configInstance: Conf<NexusConfig> | null = null;

export function getConfig(): Conf<NexusConfig> {
    if (!configInstance) {
        configInstance = new Conf<NexusConfig>({
            projectName: "nexus",
            defaults: {
                trunk: "main",
                colorOutput: true,
                autoStage: false,
                apiUrl: process.env.NEXUS_API_URL || "http://localhost:3001",
            },
        });
    }
    return configInstance;
}

export function getRepoConfig(): NexusConfig {
    const config = getConfig();
    return {
        repo: config.get("repo"),
        platform: config.get("platform"),
        trunk: config.get("trunk"),
        branchPrefix: config.get("branchPrefix"),
    };
}
