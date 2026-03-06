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
import { syncStackToServer } from "../utils/api";
import {
    collectDiffContexts,
    formatReviewCommentBody,
    runReviewAnalysis,
} from "../utils/ai";

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

            const currentBranch = await getCurrentBranch(git);
            const stack = await stackManager.getStack(currentBranch);

            if (stack.length === 0) {
                console.log(chalk.yellow("No branches in stack. Use 'nx create' to start stacking."));
                return;
            }

            console.log(chalk.bold(`\nSubmitting ${stack.length} branch(es):\n`));

            const github = new GitHubAPI(config.get("githubToken") as string);
            const [owner, repo] = ((config.get("repo") as string) || "").split("/");

            if (!owner || !repo) {
                console.error(chalk.red("Error: Repository not configured. Run 'nx init' first."));
                process.exit(1);
            }

            const trunk = config.get("trunk", "main") as string;
            const repoName = (config.get("repo") as string | undefined) || "local";
            let previousBranch = trunk;

            for (const branch of stack) {
                spinner.start(`Pushing ${chalk.cyan(branch.name)}...`);
                await git.push("origin", branch.name, ["--set-upstream", "--force-with-lease"]);
                spinner.succeed(`Pushed ${chalk.cyan(branch.name)}`);

                let activePr = await github.findPR(owner, repo, branch.name);

                if (activePr) {
                    spinner.start(`Updating PR #${activePr.number}...`);

                    if (activePr.base.ref !== previousBranch) {
                        activePr = await github.updatePR(owner, repo, activePr.number, {
                            base: previousBranch,
                        });
                    }

                    spinner.succeed(`Updated PR #${activePr.number}: ${chalk.gray(activePr.title)}`);
                    console.log(chalk.gray(`   ${activePr.html_url}`));
                    await stackManager.updatePRInfo(
                        branch.name,
                        activePr.number,
                        activePr.draft ? "draft" : activePr.state
                    );
                } else if (!options.updateOnly) {
                    spinner.start(`Creating PR for ${chalk.cyan(branch.name)}...`);

                    activePr = await github.createPR(owner, repo, {
                        title: branch.name.replace(/[-_]/g, " ").replace(/\//g, ": "),
                        head: branch.name,
                        base: previousBranch,
                        draft: options.draft,
                        body: "Part of stack created with NEXUS.\n\n---\nThis PR was created by Nexus CLI.",
                    });

                    spinner.succeed(`Created PR #${activePr.number}: ${chalk.cyan(activePr.title)}`);
                    console.log(chalk.gray(`   ${activePr.html_url}`));
                    await stackManager.updatePRInfo(
                        branch.name,
                        activePr.number,
                        options.draft ? "draft" : "open"
                    );
                }

                if (activePr && options.ai !== false) {
                    try {
                        spinner.start(`Running Nexus review for PR #${activePr.number}...`);
                        const diffContexts = await collectDiffContexts(git, previousBranch, branch.name);
                        const reviewResult = await runReviewAnalysis(diffContexts, repoName);
                        const commentBody = formatReviewCommentBody(
                            reviewResult,
                            previousBranch,
                            branch.name
                        );
                        await github.createComment(owner, repo, activePr.number, commentBody);
                        spinner.succeed(`Posted Nexus review on PR #${activePr.number}`);
                    } catch (reviewError) {
                        spinner.warn(`Skipped Nexus review: ${String(reviewError)}`);
                    }
                }

                previousBranch = branch.name;
            }

            try {
                await syncStackToServer({
                    stackName: "local-stack",
                    snapshot: await stackManager.getSnapshot(),
                    repo: config.get("repo") as string | undefined,
                    user:
                        (config.get("githubUser") as string | undefined) ||
                        (config.get("gitlabUser") as string | undefined),
                });
            } catch {
                // Best effort only.
            }

            console.log(chalk.green("\nStack submitted successfully.\n"));

            console.log(chalk.bold("Stack Summary:"));
            for (let index = stack.length - 1; index >= 0; index -= 1) {
                const branch = stack[index];
                const prefix = index === stack.length - 1 ? "+" : index === 0 ? "\\" : "|";
                console.log(`  ${prefix}-- ${branch.prNumber ? `PR #${branch.prNumber}` : branch.name}`);
            }
            console.log("");
        } catch (error) {
            spinner.fail("Failed to submit");
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });
