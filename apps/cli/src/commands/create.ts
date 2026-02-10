/**
 * NEXUS CLI - Create Command
 * Create a new branch in your stack
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getGit, ensureCleanWorkingTree, getCurrentBranch } from "../utils/git";
import { getStackManager } from "../utils/stack";
import { getConfig } from "../utils/config";

export const createCommand = new Command("create")
    .alias("c")
    .description("Create a new branch in your stack")
    .argument("[name]", "Branch name (optional, will prompt if not provided)")
    .option("-a, --all", "Stage all changes before creating")
    .option("-m, --message <message>", "Commit message for staged changes")
    .action(async (name: string | undefined, options: { all?: boolean; message?: string }) => {
        const spinner = ora();

        try {
            const git = await getGit();
            const config = getConfig();

            // Ensure we're in a git repo
            const isRepo = await git.checkIsRepo();
            if (!isRepo) {
                console.error(chalk.red("Error: Not in a git repository"));
                process.exit(1);
            }

            // Check for staged/unstaged changes
            const status = await git.status();
            const hasChanges = status.modified.length > 0 || status.staged.length > 0 || status.not_added.length > 0;

            if (hasChanges) {
                if (options.all) {
                    spinner.start("Staging all changes...");
                    await git.add(".");
                    spinner.succeed("Changes staged");
                } else if (status.staged.length === 0) {
                    console.log(chalk.yellow("Warning: You have unstaged changes."));
                    const { shouldStage } = await inquirer.prompt([
                        {
                            type: "confirm",
                            name: "shouldStage",
                            message: "Stage all changes?",
                            default: true,
                        },
                    ]);

                    if (shouldStage) {
                        await git.add(".");
                    }
                }
            }

            // Get branch name if not provided
            let branchName = name;
            if (!branchName) {
                const { branchName: promptedName } = await inquirer.prompt([
                    {
                        type: "input",
                        name: "branchName",
                        message: "Branch name:",
                        validate: (input: string) => {
                            if (!input.trim()) return "Branch name is required";
                            if (!/^[a-zA-Z0-9\-_\/]+$/.test(input)) {
                                return "Branch name can only contain letters, numbers, hyphens, underscores, and slashes";
                            }
                            return true;
                        },
                    },
                ]);
                branchName = promptedName;
            }
            if (!branchName) {
                throw new Error("Branch name is required");
            }

            // Get current branch (will be the parent)
            const currentBranch = await getCurrentBranch(git);
            const trunk = config.get("trunk", "main") as string;

            // Format branch name with prefix
            const prefix = config.get("branchPrefix", "") as string;
            const fullBranchName = prefix ? `${prefix}/${branchName}` : branchName;

            spinner.start(`Creating branch ${chalk.cyan(fullBranchName)}...`);

            // Create and checkout the new branch
            await git.checkoutLocalBranch(fullBranchName as string);

            // If we have a commit message, commit the staged changes
            if (options.message) {
                const status = await git.status();
                if (status.staged.length > 0) {
                    await git.commit(options.message);
                    spinner.succeed(`Created ${chalk.cyan(fullBranchName)} with commit: "${options.message}"`);
                } else {
                    spinner.succeed(`Created ${chalk.cyan(fullBranchName)} (no changes to commit)`);
                }
            } else {
                spinner.succeed(`Created ${chalk.cyan(fullBranchName)}`);
            }

            // Track in stack
            const stackManager = getStackManager();
            await stackManager.addBranch(fullBranchName, currentBranch);

            // Show stack status
            console.log("");
            console.log(chalk.gray("Your stack:"));
            const stack = await stackManager.getStack();
            for (const branch of stack) {
                const isCurrent = branch.name === fullBranchName;
                const marker = isCurrent ? chalk.green("→") : " ";
                console.log(`  ${marker} ${isCurrent ? chalk.bold(branch.name) : branch.name}`);
            }
            console.log("");
            console.log(chalk.gray(`Parent: ${currentBranch}`));
            console.log(chalk.gray(`Trunk: ${trunk}`));
        } catch (error) {
            spinner.fail("Failed to create branch");
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });
