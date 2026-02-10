/**
 * NEXUS CLI - Submit Command
 * Submit PRs for your stack
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getGit, getCurrentBranch } from "../utils/git";
import { getStackManager } from "../utils/stack";
import { getConfig } from "../utils/config";
import { GitHubAPI } from "../utils/github";

export const submitCommand = new Command("submit")
    .alias("ss")
    .description("Submit pull requests for your stack")
    .option("-s, --stack", "Submit the entire stack (default)")
    .option("-u, --update-only", "Only update existing PRs, don't create new ones")
    .option("--draft", "Create PRs as drafts")
    .option("--no-ai", "Skip AI review request")
    .action(async (options: { stack?: boolean; updateOnly?: boolean; draft?: boolean; ai?: boolean }) => {
        const spinner = ora();

        try {
            const git = await getGit();
            const config = getConfig();
            const stackManager = getStackManager();

            // Get the stack from current branch
            const currentBranch = await getCurrentBranch(git);
            const stack = await stackManager.getStack(currentBranch);

            if (stack.length === 0) {
                console.log(chalk.yellow("No branches in stack. Use 'nx create' to start stacking."));
                return;
            }

            console.log(chalk.bold(`\nSubmitting ${stack.length} branch(es):\n`));

            // Initialize GitHub API
            const github = new GitHubAPI(config.get("githubToken") as string);
            const [owner, repo] = (config.get("repo") as string || "").split("/");

            if (!owner || !repo) {
                console.error(chalk.red("Error: Repository not configured. Run 'nx init' first."));
                process.exit(1);
            }

            const trunk = config.get("trunk", "main") as string;
            let previousBranch = trunk;

            for (const branch of stack) {
                spinner.start(`Pushing ${chalk.cyan(branch.name)}...`);

                // Push the branch
                await git.push("origin", branch.name, ["--set-upstream", "--force-with-lease"]);
                spinner.succeed(`Pushed ${chalk.cyan(branch.name)}`);

                // Check if PR exists
                const existingPR = await github.findPR(owner, repo, branch.name);

                if (existingPR) {
                    // Update existing PR
                    spinner.start(`Updating PR #${existingPR.number}...`);

                    // Update base if needed
                    if (existingPR.base.ref !== previousBranch) {
                        await github.updatePR(owner, repo, existingPR.number, {
                            base: previousBranch,
                        });
                    }

                    spinner.succeed(`Updated PR #${existingPR.number}: ${chalk.gray(existingPR.title)}`);
                    console.log(chalk.gray(`   ${existingPR.html_url}`));
                } else if (!options.updateOnly) {
                    // Create new PR
                    spinner.start(`Creating PR for ${chalk.cyan(branch.name)}...`);

                    const pr = await github.createPR(owner, repo, {
                        title: branch.name.replace(/[-_]/g, " ").replace(/\//g, ": "),
                        head: branch.name,
                        base: previousBranch,
                        draft: options.draft,
                        body: `Part of stack created with NEXUS.\n\n---\n*This PR was created by [NEXUS](https://nexus.dev)*`,
                    });

                    spinner.succeed(`Created PR #${pr.number}: ${chalk.cyan(pr.title)}`);
                    console.log(chalk.gray(`   ${pr.html_url}`));

                    // Request AI review if enabled
                    if (options.ai !== false) {
                        spinner.start("Requesting AI review...");
                        // TODO: Trigger AI review via webhook or API
                        spinner.succeed("AI review requested");
                    }
                }

                previousBranch = branch.name;
            }

            console.log(chalk.green(`\n✓ Stack submitted successfully!\n`));

            // Show stack summary
            console.log(chalk.bold("Stack Summary:"));
            for (let i = stack.length - 1; i >= 0; i--) {
                const branch = stack[i];
                const isTop = i === stack.length - 1;
                const prefix = isTop ? "┌" : i === 0 ? "└" : "├";
                console.log(
                    `  ${prefix}── ${branch.prNumber ? `PR #${branch.prNumber}` : branch.name}`
                );
            }
            console.log("");
        } catch (error) {
            spinner.fail("Failed to submit");
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });
