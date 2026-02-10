/**
 * NEXUS CLI - Configuration Management
 */
import Conf from "conf";
let configInstance = null;
export function getConfig() {
    if (!configInstance) {
        configInstance = new Conf({
            projectName: "nexus",
            defaults: {
                trunk: "main",
                colorOutput: true,
                autoStage: false,
            },
        });
    }
    return configInstance;
}
export function getRepoConfig() {
    const config = getConfig();
    return {
        repo: config.get("repo"),
        platform: config.get("platform"),
        trunk: config.get("trunk"),
        branchPrefix: config.get("branchPrefix"),
    };
}
//# sourceMappingURL=config.js.map