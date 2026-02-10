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
export const riskCommand = new Command("risk")
    .description("Get risk assessment for current changes")
    .action(async () => {
    const spinner = ora();
    try {
        const git = await getGit();
        const config = getConfig();
        const currentBranch = await getCurrentBranch(git);
        const trunk = config.get("trunk", "main");
        spinner.start("Analyzing risk factors...");
        // Get diff stats
        const diffSummary = await git.diffSummary([trunk, currentBranch]);
        // TODO: Integrate with @nexus/ai RiskScorer
        // For now, calculate basic risk score
        const linesChanged = (diffSummary.insertions || 0) + (diffSummary.deletions || 0);
        const filesChanged = diffSummary.files?.length || 0;
        // Simple risk calculation
        let score = 0;
        const factors = [];
        // Size factor
        if (linesChanged > 500) {
            score += 30;
            factors.push(chalk.red("Very large PR (>500 lines)"));
        }
        else if (linesChanged > 200) {
            score += 15;
            factors.push(chalk.yellow("Large PR (>200 lines)"));
        }
        else if (linesChanged < 50) {
            factors.push(chalk.green("Small, focused PR"));
        }
        // Check for sensitive files
        const sensitivePatterns = ["auth", "password", "secret", "payment", "config"];
        const sensitiveFiles = diffSummary.files?.filter((f) => sensitivePatterns.some((p) => f.file.toLowerCase().includes(p)));
        if (sensitiveFiles && sensitiveFiles.length > 0) {
            score += sensitiveFiles.length * 15;
            factors.push(chalk.red(`Modifies ${sensitiveFiles.length} sensitive file(s)`));
        }
        // Check for infrastructure files
        const infraPatterns = ["dockerfile", "docker-compose", ".github", "terraform"];
        const infraFiles = diffSummary.files?.filter((f) => infraPatterns.some((p) => f.file.toLowerCase().includes(p)));
        if (infraFiles && infraFiles.length > 0) {
            score += 20;
            factors.push(chalk.yellow("Infrastructure changes detected"));
        }
        // Check for test files
        const testFiles = diffSummary.files?.filter((f) => f.file.includes("test") || f.file.includes("spec"));
        if (!testFiles || testFiles.length === 0) {
            if (linesChanged > 50) {
                score += 20;
                factors.push(chalk.yellow("No test changes"));
            }
        }
        else {
            factors.push(chalk.green("Includes tests"));
        }
        spinner.succeed("Risk assessment complete");
        console.log("");
        // Determine level
        let level;
        let levelColor;
        if (score < 25) {
            level = "LOW";
            levelColor = chalk.green;
        }
        else if (score < 50) {
            level = "MEDIUM";
            levelColor = chalk.yellow;
        }
        else if (score < 75) {
            level = "HIGH";
            levelColor = chalk.red;
        }
        else {
            level = "CRITICAL";
            levelColor = chalk.bgRed.white;
        }
        // Create visual score bar
        const barLength = 30;
        const filledLength = Math.round((score / 100) * barLength);
        const bar = levelColor("█".repeat(filledLength)) +
            chalk.gray("░".repeat(barLength - filledLength));
        // Display in box
        const content = `
${chalk.bold("Risk Score:")} ${levelColor.bold(`${score}/100 ${level}`)}
${bar}

${chalk.bold("Changes:")}
  ${chalk.green(`+${diffSummary.insertions || 0}`)} ${chalk.red(`-${diffSummary.deletions || 0}`)} in ${filesChanged} files

${chalk.bold("Factors:")}
${factors.map((f) => `  • ${f}`).join("\n")}
`;
        console.log(boxen(content, {
            padding: 1,
            margin: 0,
            borderStyle: "round",
            borderColor: score < 50 ? "green" : score < 75 ? "yellow" : "red",
            title: "Risk Assessment",
            titleAlignment: "center",
        }));
        // Suggestions
        if (score >= 50) {
            console.log("");
            console.log(chalk.bold("Suggestions:"));
            if (linesChanged > 200) {
                console.log(chalk.gray("  • Consider splitting this into smaller PRs (nx split)"));
            }
            if (sensitiveFiles && sensitiveFiles.length > 0) {
                console.log(chalk.gray("  • Request review from security team"));
            }
            if (!testFiles || testFiles.length === 0) {
                console.log(chalk.gray("  • Add tests to cover new functionality"));
            }
        }
        console.log("");
    }
    catch (error) {
        spinner.fail("Risk assessment failed");
        console.error(chalk.red(String(error)));
        process.exit(1);
    }
});
//# sourceMappingURL=risk.js.map