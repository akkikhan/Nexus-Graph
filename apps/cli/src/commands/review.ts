/**
 * NEXUS CLI - AI Review Command
 * Trigger AI code review locally
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getGit, getCurrentBranch } from "../utils/git";
import { getConfig } from "../utils/config";
import {
    collectDiffContexts,
    formatReviewSummary,
    runReviewAnalysis,
} from "../utils/ai";

export const reviewCommand = new Command("review")
    .description("Trigger AI code review locally")
    .option("-f, --file <file>", "Review specific file only")
    .action(async (options: { file?: string }) => {
        const spinner = ora();

        try {
            const git = await getGit();
            const config = getConfig();

            const currentBranch = await getCurrentBranch(git);
            const trunk = config.get("trunk", "main") as string;

            spinner.start("Analyzing changes...");

            const diffContexts = await collectDiffContexts(git, trunk, currentBranch, options.file);

            if (diffContexts.length === 0) {
                spinner.warn("No changes to review");
                return;
            }

            spinner.text = "Running Nexus review...";
            const result = await runReviewAnalysis(
                diffContexts,
                (config.get("repo") as string | undefined) || "local"
            );

            spinner.succeed(`Review complete (${result.modeLabel})`);
            console.log("");

            if (result.comments.length === 0) {
                console.log(chalk.green("No material issues found."));
                console.log("");
                return;
            }

            for (const comment of result.comments) {
                const severityLabel = comment.severity.toUpperCase().padEnd(8, " ");
                const severityColor =
                    comment.severity === "critical"
                        ? chalk.bgRed.white
                        : comment.severity === "error"
                            ? chalk.red
                            : comment.severity === "warning"
                                ? chalk.yellow
                                : chalk.blue;

                console.log(severityColor(`[${severityLabel}] ${comment.filePath}:${comment.lineNumber}`));
                console.log(severityColor(`  ${comment.body}`));
                if (comment.suggestionCode) {
                    console.log(chalk.gray(`  Suggestion: ${comment.suggestionCode}`));
                }
                console.log("");
            }

            const summary = formatReviewSummary(result.comments);
            console.log(chalk.bold("Summary:"));
            console.log(
                `  ${chalk.red(`${summary.critical + summary.errors} high-severity`)} | ${chalk.yellow(`${summary.warnings} warning(s)`)} | ${chalk.blue(`${summary.infos} info(s)`)}`
            );
            console.log(chalk.gray(`  Source: ${result.modeLabel}`));
            console.log("");
        } catch (error) {
            spinner.fail("Review failed");
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });
