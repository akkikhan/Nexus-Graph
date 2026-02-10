/**
 * NEXUS CLI - Checkout Command
 * Interactive branch picker
 */
import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { getGit, getCurrentBranch } from "../utils/git";
import { getStackManager } from "../utils/stack";
export const checkoutCommand = new Command("checkout")
    .alias("co")
    .description("Interactive branch checkout")
    .argument("[branch]", "Branch name (optional, shows picker if not provided)")
    .action(async (branch) => {
    try {
        const git = await getGit();
        if (branch) {
            // Direct checkout
            await git.checkout(branch);
            console.log(chalk.green(`→ ${branch}`));
            return;
        }
        // Interactive picker
        const stackManager = getStackManager();
        const currentBranch = await getCurrentBranch(git);
        const stack = await stackManager.getStack(currentBranch);
        if (stack.length === 0) {
            // No stack, show regular branch picker
            const branches = await git.branchLocal();
            const { selected } = await inquirer.prompt([
                {
                    type: "list",
                    name: "selected",
                    message: "Select a branch:",
                    choices: branches.all.map((b) => ({
                        name: b === currentBranch ? chalk.green(`→ ${b}`) : `  ${b}`,
                        value: b,
                    })),
                },
            ]);
            await git.checkout(selected);
            console.log(chalk.green(`→ ${selected}`));
        }
        else {
            // Show stack picker
            const choices = stack.map((b) => {
                const isCurrent = b.name === currentBranch;
                const status = b.prNumber ? chalk.gray(` (PR #${b.prNumber})`) : "";
                return {
                    name: isCurrent ? chalk.green(`→ ${b.name}${status}`) : `  ${b.name}${status}`,
                    value: b.name,
                };
            });
            const { selected } = await inquirer.prompt([
                {
                    type: "list",
                    name: "selected",
                    message: "Select a branch:",
                    choices,
                    default: currentBranch,
                },
            ]);
            if (selected !== currentBranch) {
                await git.checkout(selected);
                console.log(chalk.green(`→ ${selected}`));
            }
        }
    }
    catch (error) {
        console.error(chalk.red(String(error)));
        process.exit(1);
    }
});
//# sourceMappingURL=checkout.js.map