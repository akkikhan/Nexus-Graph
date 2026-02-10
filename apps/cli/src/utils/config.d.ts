/**
 * NEXUS CLI - Configuration Management
 */
import Conf from "conf";
interface NexusConfig {
    githubToken?: string;
    githubUser?: string;
    gitlabToken?: string;
    gitlabUrl?: string;
    gitlabUser?: string;
    repo?: string;
    platform?: "github" | "gitlab" | "bitbucket";
    trunk?: string;
    branchPrefix?: string;
    initialized?: boolean;
    aiProvider?: string;
    aiApiKey?: string;
    colorOutput?: boolean;
    autoStage?: boolean;
}
export declare function getConfig(): Conf<NexusConfig>;
export declare function getRepoConfig(): NexusConfig;
export {};
//# sourceMappingURL=config.d.ts.map