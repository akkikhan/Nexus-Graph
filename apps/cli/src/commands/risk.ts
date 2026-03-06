/**
 * NEXUS CLI - Risk Command
 * Get risk assessment for current changes
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import boxen from "boxen";
import { getGit, getCurrentBranch } from "../utils/git";
import { getConfig } from "../utils/config";
import { collectDiffContexts, createCliAI } from "../utils/ai";

export const riskCommand = new Command("risk")
    .description("Get risk assessment for current changes")
    .action(async () => {
        const spinner = ora();

        try {
            const git = await getGit();
            const config = getConfig();

            const currentBranch = await getCurrentBranch(git);
            const trunk = config.get("trunk", "main") as string;

            spinner.start("Analyzing risk factors...");

            const diffContexts = await collectDiffContexts(git, trunk, currentBranch);
            if (diffContexts.length === 0) {
                spinner.warn("No changes to assess");
                return;
            }

            const diffSummary = await git.diffSummary([trunk, currentBranch]);
            const now = new Date();
            const client = createCliAI();
            const assessment = await client.ai.riskScorer.assessRisk(diffContexts, {
                linesAdded: diffSummary.insertions || 0,
                linesRemoved: diffSummary.deletions || 0,
                filesChanged: diffSummary.files?.length || 0,
                testFilesChanged:
                    diffSummary.files?.filter((file) => /test|spec/i.test(file.file)).length || 0,
                timeOfDay: now.getHours(),
                dayOfWeek: now.getDay(),
            });

            spinner.succeed(
                `Risk assessment complete (${client.hasProvider ? `${client.provider} assisted` : "heuristic"})`
            );
            console.log("");

            const levelColor =
                assessment.level === "low"
                    ? chalk.green
                    : assessment.level === "medium"
                        ? chalk.yellow
                        : assessment.level === "high"
                            ? chalk.red
                            : chalk.bgRed.white;

            const barLength = 30;
            const filledLength = Math.round((assessment.score / 100) * barLength);
            const bar = `${"#".repeat(filledLength)}${"-".repeat(barLength - filledLength)}`;
            const factors = assessment.factors.length > 0
                ? assessment.factors.map((factor) => `  - ${factor.name}: ${factor.description}`).join("\n")
                : "  - No elevated factors detected";

            const content = [
                `${chalk.bold("Risk Score:")} ${levelColor.bold(`${assessment.score}/100 ${assessment.level.toUpperCase()}`)}`,
                levelColor(bar),
                "",
                `${chalk.bold("Changes:")}`,
                `  ${chalk.green(`+${diffSummary.insertions || 0}`)} ${chalk.red(`-${diffSummary.deletions || 0}`)} in ${diffSummary.files?.length || 0} files`,
                "",
                `${chalk.bold("Factors:")}`,
                factors,
            ].join("\n");

            console.log(
                boxen(content, {
                    padding: 1,
                    margin: 0,
                    borderStyle: "round",
                    borderColor: assessment.score < 50 ? "green" : assessment.score < 75 ? "yellow" : "red",
                    title: "Risk Assessment",
                    titleAlignment: "center",
                })
            );

            if (assessment.suggestions.length > 0) {
                console.log("");
                console.log(chalk.bold("Suggestions:"));
                for (const suggestion of assessment.suggestions) {
                    console.log(chalk.gray(`  - ${suggestion}`));
                }
            }

            console.log("");
        } catch (error) {
            spinner.fail("Risk assessment failed");
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });
