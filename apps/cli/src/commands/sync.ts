/**
 * NEXUS CLI - Sync Command
 * Sync your stack with the remote
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getGit, getCurrentBranch } from "../utils/git";
import { getStackManager } from "../utils/stack";
import { getConfig } from "../utils/config";

export const syncCommand = new Command("sync")
    .description("Sync your stack with remote changes")
    .option("--restack", "Rebase entire stack on trunk")
    .action(async (options: { restack?: boolean }) => {
        const spinner = ora();

        try {
            const git = await getGit();
            const config = getConfig();
            const stackManager = getStackManager();

            const currentBranch = await getCurrentBranch(git);
            const trunk = config.get("trunk", "main") as string;

            spinner.start(`Fetching from origin...`);
            await git.fetch("origin");
            spinner.succeed("Fetched latest changes");

            // Get the stack
            const stack = await stackManager.getStack(currentBranch);

            if (options.restack) {
                spinner.start(`Rebasing stack onto ${trunk}...`);

                // Start from the bottom of the stack
                let previousBranch = trunk;

                for (const branch of stack) {
                    spinner.text = `Rebasing ${chalk.cyan(branch.name)} onto ${previousBranch}...`;

                    await git.checkout(branch.name);

                    try {
                        await git.rebase([previousBranch]);
                        spinner.succeed(`Rebased ${chalk.cyan(branch.name)}`);
                    } catch {
                        spinner.fail(`Conflict in ${chalk.cyan(branch.name)}`);
                        console.log(chalk.yellow("\nResolve conflicts, then run:"));
                        console.log(chalk.white("  git rebase --continue"));
                        console.log(chalk.white("  nx sync"));
                        process.exit(1);
                    }

                    previousBranch = branch.name;
                }

                // Return to original branch
                await git.checkout(currentBranch);
                spinner.succeed("Stack rebased successfully");
            } else {
                // Just pull the current branch
                spinner.start(`Pulling ${chalk.cyan(currentBranch)}...`);
                try {
                    await git.pull("origin", currentBranch, ["--rebase"]);
                    spinner.succeed(`Synced ${chalk.cyan(currentBranch)}`);
                } catch {
                    spinner.fail("Conflicts detected");
                    console.log(chalk.yellow("\nResolve conflicts, then run:"));
                    console.log(chalk.white("  git rebase --continue"));
                    process.exit(1);
                }
            }

            // Check for merged branches
            spinner.start("Checking for merged PRs...");
            const mergedBranches = await stackManager.checkMerged();

            if (mergedBranches.length > 0) {
                spinner.succeed(`Found ${mergedBranches.length} merged branch(es)`);
                console.log(chalk.gray("\nMerged branches:"));
                for (const branch of mergedBranches) {
                    console.log(chalk.gray(`  ✓ ${branch}`));
                }

                // Clean up merged branches
                for (const branch of mergedBranches) {
                    await stackManager.removeBranch(branch);
                    try {
                        await git.deleteLocalBranch(branch);
                    } catch {
                        // Branch might not exist locally
                    }
                }
            } else {
                spinner.succeed("No merged branches to clean up");
            }

            console.log(chalk.green("\n✓ Sync complete!\n"));
        } catch (error) {
            spinner.fail("Sync failed");
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });
