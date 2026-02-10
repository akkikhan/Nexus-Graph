/**
 * NEXUS CLI - Init Command
 * Initialize NEXUS in a repository
 */
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getGit } from "../utils/git";
import { getConfig } from "../utils/config";
export const initCommand = new Command("init")
    .description("Initialize NEXUS in this repository")
    .action(async () => {
    const spinner = ora();
    console.log(chalk.bold("\n🚀 NEXUS Initialization\n"));
    try {
        const git = await getGit();
        const config = getConfig();
        // Check if we're in a git repo
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
            console.error(chalk.red("Error: Not in a git repository"));
            console.log(chalk.gray("Run 'git init' first or navigate to an existing repo."));
            process.exit(1);
        }
        // Get remotes
        const remotes = await git.getRemotes(true);
        const origin = remotes.find((r) => r.name === "origin");
        if (!origin) {
            console.log(chalk.yellow("Warning: No 'origin' remote found."));
            console.log(chalk.gray("Add one with: git remote add origin <url>"));
        }
        // Parse repo info from remote URL
        let owner = "";
        let repo = "";
        if (origin?.refs.fetch) {
            const url = origin.refs.fetch;
            // Parse GitHub/GitLab URLs
            const match = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
            if (match) {
                owner = match[1];
                repo = match[2];
            }
        }
        // Get trunk branch
        const branches = await git.branchLocal();
        const defaultTrunk = branches.all.includes("main")
            ? "main"
            : branches.all.includes("master")
                ? "master"
                : branches.all[0];
        const answers = await inquirer.prompt([
            {
                type: "input",
                name: "repo",
                message: "Repository (owner/repo):",
                default: owner && repo ? `${owner}/${repo}` : undefined,
                validate: (input) => {
                    if (!input.includes("/"))
                        return "Format: owner/repo";
                    return true;
                },
            },
            {
                type: "list",
                name: "platform",
                message: "Git platform:",
                choices: [
                    { name: "GitHub", value: "github" },
                    { name: "GitLab", value: "gitlab" },
                    { name: "Bitbucket", value: "bitbucket" },
                ],
                default: "github",
            },
            {
                type: "input",
                name: "trunk",
                message: "Trunk branch:",
                default: defaultTrunk,
            },
            {
                type: "input",
                name: "prefix",
                message: "Branch prefix (optional):",
                default: "",
            },
        ]);
        // Save configuration
        spinner.start("Saving configuration...");
        config.set("repo", answers.repo);
        config.set("platform", answers.platform);
        config.set("trunk", answers.trunk);
        config.set("branchPrefix", answers.prefix);
        config.set("initialized", true);
        spinner.succeed("Configuration saved");
        // Check authentication
        const tokenKey = answers.platform === "gitlab" ? "gitlabToken" : "githubToken";
        const hasToken = config.has(tokenKey);
        console.log("");
        console.log(chalk.green("✓ NEXUS initialized successfully!"));
        console.log("");
        console.log(chalk.gray("Configuration:"));
        console.log(chalk.gray(`  Repository: ${answers.repo}`));
        console.log(chalk.gray(`  Platform:   ${answers.platform}`));
        console.log(chalk.gray(`  Trunk:      ${answers.trunk}`));
        if (answers.prefix) {
            console.log(chalk.gray(`  Prefix:     ${answers.prefix}`));
        }
        console.log("");
        if (!hasToken) {
            console.log(chalk.yellow("⚠️  Not authenticated yet."));
            console.log(chalk.gray(`   Run: nx auth --${answers.platform}`));
            console.log("");
        }
        console.log(chalk.bold("Next steps:"));
        console.log(chalk.gray("  1. Create your first branch:  nx create feature-name"));
        console.log(chalk.gray("  2. Make changes and commit"));
        console.log(chalk.gray("  3. Submit PRs:               nx submit"));
        console.log("");
    }
    catch (error) {
        spinner.fail("Initialization failed");
        console.error(chalk.red(String(error)));
        process.exit(1);
    }
});
//# sourceMappingURL=init.js.map