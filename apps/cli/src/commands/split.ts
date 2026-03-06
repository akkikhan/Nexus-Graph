/**
 * NEXUS CLI - Split Command
 * AI-powered PR splitting suggestions
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import Table from "cli-table3";
import { getGit, getCurrentBranch } from "../utils/git";
import { getConfig } from "../utils/config";
import { collectDiffContexts, createCliAI } from "../utils/ai";

export const splitCommand = new Command("split")
    .alias("sp")
    .description("AI-powered PR splitting suggestions")
    .action(async () => {
        const spinner = ora();

        try {
            const git = await getGit();
            const config = getConfig();

            const currentBranch = await getCurrentBranch(git);
            const trunk = config.get("trunk", "main") as string;

            spinner.start("Analyzing changes for split opportunities...");

            const diffContexts = await collectDiffContexts(git, trunk, currentBranch);
            const totalLines = diffContexts.reduce(
                (sum, diff) => sum + diff.additions + diff.deletions,
                0
            );

            if (totalLines < 150) {
                spinner.info("PR is already small enough. No split needed.");
                console.log(chalk.gray(`\nTotal changes: ${totalLines} lines`));
                return;
            }

            const client = createCliAI();
            const suggestions = await client.ai.autoSplitter.suggestSplits(diffContexts);

            spinner.succeed(
                `Analysis complete (${client.hasProvider ? `${client.provider} assisted` : "heuristic fallback"})`
            );
            console.log("");

            if (suggestions.length <= 1) {
                console.log(chalk.yellow("All changes appear tightly related. Consider manual splitting."));
                console.log("");
                return;
            }

            console.log(chalk.bold("Nexus Split Suggestions\n"));
            console.log(
                chalk.gray(`Your PR has ${totalLines} lines across ${diffContexts.length} files.`)
            );
            console.log(chalk.gray("Suggested stacked PR breakdown:\n"));

            const table = new Table({
                head: [chalk.cyan("#"), chalk.cyan("Name"), chalk.cyan("Files"), chalk.cyan("Lines"), chalk.cyan("Description")],
                style: { border: ["gray"] },
            });

            suggestions.forEach((suggestion, index) => {
                table.push([
                    String(index + 1),
                    suggestion.name,
                    String(suggestion.files.length),
                    String(suggestion.estimatedLines),
                    suggestion.description,
                ]);
            });

            console.log(table.toString());
            console.log("");

            const { action } = await inquirer.prompt([
                {
                    type: "list",
                    name: "action",
                    message: "What would you like to do?",
                    choices: [
                        { name: "Show grouped files", value: "view" },
                        { name: "Cancel", value: "cancel" },
                    ],
                },
            ]);

            if (action === "cancel") {
                console.log(chalk.gray("Split cancelled."));
                return;
            }

            console.log("");
            for (const suggestion of suggestions) {
                console.log(chalk.bold(`${suggestion.position}. ${suggestion.name}`));
                console.log(chalk.gray(`  ${suggestion.description}`));
                for (const file of suggestion.files) {
                    console.log(chalk.gray(`  - ${file}`));
                }
                if (suggestion.dependencies.length > 0) {
                    console.log(chalk.gray(`  Depends on: ${suggestion.dependencies.join(", ")}`));
                }
                console.log("");
            }

            console.log(chalk.gray("Auto-creating split branches is not implemented yet."));
        } catch (error) {
            spinner.fail("Split analysis failed");
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });
