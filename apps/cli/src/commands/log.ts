/**
 * NEXUS CLI - Log Command
 * Visualize your stack
 */

import { Command } from "commander";
import chalk from "chalk";
import { getGit, getCurrentBranch } from "../utils/git";
import { getStackManager } from "../utils/stack";
import { getConfig } from "../utils/config";

export const logCommand = new Command("log")
    .alias("ls")
    .description("Visualize your stack")
    .option("-s, --short", "Short format (branch names only)")
    .action(async (options: { short?: boolean }) => {
        try {
            const git = await getGit();
            const config = getConfig();
            const stackManager = getStackManager();

            const currentBranch = await getCurrentBranch(git);
            const trunk = config.get("trunk", "main") as string;
            const stack = await stackManager.getStack(currentBranch);

            console.log("");

            if (stack.length === 0) {
                console.log(chalk.gray("No stack found. You're on the trunk."));
                console.log(chalk.gray(`Current branch: ${currentBranch}`));
                console.log("");
                return;
            }

            if (options.short) {
                // Short format
                for (let i = stack.length - 1; i >= 0; i--) {
                    const branch = stack[i];
                    const isCurrent = branch.name === currentBranch;
                    console.log(isCurrent ? chalk.green(`→ ${branch.name}`) : `  ${branch.name}`);
                }
                console.log(chalk.gray(`  ${trunk}`));
            } else {
                // Full visual format
                console.log(chalk.bold.white("  Your Stack\n"));

                for (let i = stack.length - 1; i >= 0; i--) {
                    const branch = stack[i];
                    const isCurrent = branch.name === currentBranch;
                    const isTop = i === stack.length - 1;
                    const isBottom = i === 0;

                    // Status indicator
                    let status = "";
                    let statusColor = chalk.gray;

                    if (branch.prStatus === "merged") {
                        status = "✓ merged";
                        statusColor = chalk.green;
                    } else if (branch.prStatus === "approved") {
                        status = "✓ approved";
                        statusColor = chalk.green;
                    } else if (branch.prStatus === "changes_requested") {
                        status = "✗ changes requested";
                        statusColor = chalk.red;
                    } else if (branch.prNumber) {
                        status = `PR #${branch.prNumber}`;
                        statusColor = chalk.blue;
                    }

                    // Branch line
                    const prefix = isTop ? "┌" : isBottom ? "└" : "├";
                    const arrow = isCurrent ? chalk.green("→") : " ";
                    const branchName = isCurrent ? chalk.bold.white(branch.name) : branch.name;

                    console.log(`${arrow} ${prefix}── ${branchName} ${statusColor(status)}`);

                    // Show diff stats if available
                    if (branch.linesAdded || branch.linesRemoved) {
                        const stats = `     ${chalk.green(`+${branch.linesAdded || 0}`)} ${chalk.red(`-${branch.linesRemoved || 0}`)}`;
                        console.log(chalk.gray(stats));
                    }
                }

                // Trunk
                console.log(chalk.gray(`  │`));
                console.log(chalk.gray(`  ◯ ${trunk}`));
            }

            console.log("");
        } catch (error) {
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });
