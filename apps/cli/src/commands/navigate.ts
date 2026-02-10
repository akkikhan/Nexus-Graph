/**
 * NEXUS CLI - Navigation Commands
 * Navigate up and down your stack
 */

import { Command } from "commander";
import chalk from "chalk";
import { getGit, getCurrentBranch } from "../utils/git";
import { getStackManager } from "../utils/stack";

export const upCommand = new Command("up")
    .alias("u")
    .description("Move up in your stack (towards the top)")
    .argument("[steps]", "Number of branches to move up", "1")
    .action(async (steps: string) => {
        try {
            const git = await getGit();
            const stackManager = getStackManager();

            const currentBranch = await getCurrentBranch(git);
            const stack = await stackManager.getStack(currentBranch);

            const currentIndex = stack.findIndex((b) => b.name === currentBranch);

            if (currentIndex === -1) {
                console.log(chalk.yellow("Current branch is not part of a stack"));
                return;
            }

            const stepsNum = parseInt(steps, 10) || 1;
            const targetIndex = Math.min(currentIndex + stepsNum, stack.length - 1);

            if (targetIndex === currentIndex) {
                console.log(chalk.yellow("Already at the top of the stack"));
                return;
            }

            const targetBranch = stack[targetIndex].name;
            await git.checkout(targetBranch);

            console.log(chalk.green(`→ ${targetBranch}`));
        } catch (error) {
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });

export const downCommand = new Command("down")
    .alias("d")
    .description("Move down in your stack (towards the trunk)")
    .argument("[steps]", "Number of branches to move down", "1")
    .action(async (steps: string) => {
        try {
            const git = await getGit();
            const stackManager = getStackManager();

            const currentBranch = await getCurrentBranch(git);
            const stack = await stackManager.getStack(currentBranch);

            const currentIndex = stack.findIndex((b) => b.name === currentBranch);

            if (currentIndex === -1) {
                console.log(chalk.yellow("Current branch is not part of a stack"));
                return;
            }

            const stepsNum = parseInt(steps, 10) || 1;
            const targetIndex = Math.max(currentIndex - stepsNum, 0);

            if (targetIndex === currentIndex) {
                console.log(chalk.yellow("Already at the bottom of the stack"));
                return;
            }

            const targetBranch = stack[targetIndex].name;
            await git.checkout(targetBranch);

            console.log(chalk.green(`→ ${targetBranch}`));
        } catch (error) {
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });

export const topCommand = new Command("top")
    .alias("t")
    .description("Move to the top of your stack")
    .action(async () => {
        try {
            const git = await getGit();
            const stackManager = getStackManager();

            const currentBranch = await getCurrentBranch(git);
            const stack = await stackManager.getStack(currentBranch);

            if (stack.length === 0) {
                console.log(chalk.yellow("No stack found"));
                return;
            }

            const topBranch = stack[stack.length - 1].name;

            if (currentBranch === topBranch) {
                console.log(chalk.yellow("Already at the top of the stack"));
                return;
            }

            await git.checkout(topBranch);
            console.log(chalk.green(`→ ${topBranch}`));
        } catch (error) {
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });

export const bottomCommand = new Command("bottom")
    .alias("b")
    .description("Move to the bottom of your stack")
    .action(async () => {
        try {
            const git = await getGit();
            const stackManager = getStackManager();

            const currentBranch = await getCurrentBranch(git);
            const stack = await stackManager.getStack(currentBranch);

            if (stack.length === 0) {
                console.log(chalk.yellow("No stack found"));
                return;
            }

            const bottomBranch = stack[0].name;

            if (currentBranch === bottomBranch) {
                console.log(chalk.yellow("Already at the bottom of the stack"));
                return;
            }

            await git.checkout(bottomBranch);
            console.log(chalk.green(`→ ${bottomBranch}`));
        } catch (error) {
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });
