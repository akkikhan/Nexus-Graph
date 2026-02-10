/**
 * NEXUS CLI - AI Review Command
 * Trigger AI code review locally
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getGit, getCurrentBranch, getDiff } from "../utils/git";
import { getConfig } from "../utils/config";

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

            // Get diff from trunk
            const diff = await getDiff(git, trunk, currentBranch, options.file);

            if (!diff.trim()) {
                spinner.warn("No changes to review");
                return;
            }

            spinner.text = "Requesting AI review...";

            // TODO: Integrate with @nexus/ai package
            // For now, show mock output
            const mockReview = [
                {
                    file: "src/utils/auth.ts",
                    line: 42,
                    severity: "error",
                    message: "Potential SQL injection vulnerability",
                    suggestion: "Use parameterized queries instead of string concatenation",
                },
                {
                    file: "src/api/users.ts",
                    line: 78,
                    severity: "warning",
                    message: "Missing null check for user object",
                    suggestion: "Add optional chaining: user?.email",
                },
                {
                    file: "src/components/Login.tsx",
                    line: 15,
                    severity: "info",
                    message: "Consider extracting this into a custom hook",
                    suggestion: "Create useAuth() hook for better reusability",
                },
            ];

            spinner.succeed("AI review complete");
            console.log("");

            // Display results
            let errors = 0;
            let warnings = 0;
            let infos = 0;

            for (const comment of mockReview) {
                let icon: string;
                let color: typeof chalk;

                switch (comment.severity) {
                    case "error":
                        icon = "✗";
                        color = chalk.red;
                        errors++;
                        break;
                    case "warning":
                        icon = "⚠";
                        color = chalk.yellow;
                        warnings++;
                        break;
                    default:
                        icon = "ℹ";
                        color = chalk.blue;
                        infos++;
                }

                console.log(color(`${icon} ${comment.file}:${comment.line}`));
                console.log(color(`  ${comment.message}`));
                if (comment.suggestion) {
                    console.log(chalk.gray(`  💡 ${comment.suggestion}`));
                }
                console.log("");
            }

            // Summary
            console.log(chalk.bold("Summary:"));
            console.log(
                `  ${chalk.red(`${errors} error(s)`)} | ${chalk.yellow(`${warnings} warning(s)`)} | ${chalk.blue(`${infos} info(s)`)}`
            );
            console.log("");
        } catch (error) {
            spinner.fail("Review failed");
            console.error(chalk.red(String(error)));
            process.exit(1);
        }
    });
