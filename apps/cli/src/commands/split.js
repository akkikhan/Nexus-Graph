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
export const splitCommand = new Command("split")
    .alias("sp")
    .description("AI-powered PR splitting suggestions")
    .action(async () => {
    const spinner = ora();
    try {
        const git = await getGit();
        const config = getConfig();
        const currentBranch = await getCurrentBranch(git);
        const trunk = config.get("trunk", "main");
        spinner.start("Analyzing changes for split opportunities...");
        // Get diff stats
        const diffSummary = await git.diffSummary([trunk, currentBranch]);
        const totalLines = (diffSummary.insertions || 0) + (diffSummary.deletions || 0);
        if (totalLines < 150) {
            spinner.info("PR is already small enough. No split needed.");
            console.log(chalk.gray(`\nTotal changes: ${totalLines} lines`));
            return;
        }
        // TODO: Integrate with @nexus/ai AutoSplitter
        // For now, use heuristic-based splitting
        // Group files by type/directory
        const groups = {
            migrations: [],
            backend: [],
            frontend: [],
            tests: [],
            config: [],
            other: [],
        };
        for (const file of diffSummary.files || []) {
            const path = file.file.toLowerCase();
            if (path.includes("migration") || path.endsWith(".sql")) {
                groups.migrations.push(file);
            }
            else if (path.includes("test") || path.includes("spec")) {
                groups.tests.push(file);
            }
            else if (path.includes("api/") ||
                path.includes("server/") ||
                path.includes("services/")) {
                groups.backend.push(file);
            }
            else if (path.includes("components/") ||
                path.includes("pages/") ||
                path.includes("app/")) {
                groups.frontend.push(file);
            }
            else if (path.includes("config") ||
                path.includes(".json") ||
                path.includes(".yaml")) {
                groups.config.push(file);
            }
            else {
                groups.other.push(file);
            }
        }
        spinner.succeed("Analysis complete");
        console.log("");
        // Create split suggestions
        const suggestions = [];
        if (groups.migrations.length > 0) {
            const lines = groups.migrations.reduce((sum, f) => sum + (f.insertions || 0) + (f.deletions || 0), 0);
            suggestions.push({
                name: "Database Changes",
                files: groups.migrations.length,
                lines,
                description: "Schema migrations and model updates",
            });
        }
        if (groups.backend.length > 0) {
            const lines = groups.backend.reduce((sum, f) => sum + (f.insertions || 0) + (f.deletions || 0), 0);
            suggestions.push({
                name: "Backend Implementation",
                files: groups.backend.length,
                lines,
                description: "API endpoints and services",
            });
        }
        if (groups.frontend.length > 0) {
            const lines = groups.frontend.reduce((sum, f) => sum + (f.insertions || 0) + (f.deletions || 0), 0);
            suggestions.push({
                name: "Frontend Implementation",
                files: groups.frontend.length,
                lines,
                description: "UI components and pages",
            });
        }
        if (groups.tests.length > 0) {
            const lines = groups.tests.reduce((sum, f) => sum + (f.insertions || 0) + (f.deletions || 0), 0);
            suggestions.push({
                name: "Tests",
                files: groups.tests.length,
                lines,
                description: "Test coverage for new functionality",
            });
        }
        if (groups.config.length > 0) {
            const lines = groups.config.reduce((sum, f) => sum + (f.insertions || 0) + (f.deletions || 0), 0);
            suggestions.push({
                name: "Configuration",
                files: groups.config.length,
                lines,
                description: "Config files and environment setup",
            });
        }
        if (groups.other.length > 0) {
            const lines = groups.other.reduce((sum, f) => sum + (f.insertions || 0) + (f.deletions || 0), 0);
            suggestions.push({
                name: "Other Changes",
                files: groups.other.length,
                lines,
                description: "Miscellaneous files",
            });
        }
        if (suggestions.length <= 1) {
            console.log(chalk.yellow("All changes appear to be related. Consider manual splitting."));
            return;
        }
        // Display suggestions table
        console.log(chalk.bold("🤖 AI Split Suggestions\n"));
        console.log(chalk.gray(`Your PR has ${totalLines} lines across ${diffSummary.files?.length || 0} files.`));
        console.log(chalk.gray("I suggest splitting into the following stacked PRs:\n"));
        const table = new Table({
            head: [chalk.cyan("#"), chalk.cyan("Name"), chalk.cyan("Files"), chalk.cyan("Lines"), chalk.cyan("Description")],
            style: { border: ["gray"] },
        });
        suggestions.forEach((s, i) => {
            table.push([
                String(i + 1),
                s.name,
                String(s.files),
                String(s.lines),
                s.description,
            ]);
        });
        console.log(table.toString());
        console.log("");
        // Ask to proceed
        const { action } = await inquirer.prompt([
            {
                type: "list",
                name: "action",
                message: "What would you like to do?",
                choices: [
                    { name: "Auto-split into these PRs", value: "auto" },
                    { name: "View files in each group", value: "view" },
                    { name: "Cancel", value: "cancel" },
                ],
            },
        ]);
        if (action === "cancel") {
            console.log(chalk.gray("Split cancelled."));
            return;
        }
        if (action === "view") {
            console.log("");
            for (const suggestion of suggestions) {
                console.log(chalk.bold(`\n${suggestion.name}:`));
                const groupKey = Object.keys(groups).find((k) => {
                    if (suggestion.name === "Database Changes")
                        return k === "migrations";
                    if (suggestion.name === "Backend Implementation")
                        return k === "backend";
                    if (suggestion.name === "Frontend Implementation")
                        return k === "frontend";
                    if (suggestion.name === "Tests")
                        return k === "tests";
                    if (suggestion.name === "Configuration")
                        return k === "config";
                    return k === "other";
                });
                const files = groups[groupKey] || [];
                for (const file of files) {
                    console.log(chalk.gray(`  ${file.file} (+${file.insertions || 0}/-${file.deletions || 0})`));
                }
            }
            console.log("");
            console.log(chalk.gray("Run 'nx split' again to auto-split."));
            return;
        }
        // Auto-split would create the branches
        console.log(chalk.yellow("\n⚠️  Auto-split feature coming soon!"));
        console.log(chalk.gray("For now, manually create branches with 'nx create <name>'"));
    }
    catch (error) {
        spinner.fail("Split analysis failed");
        console.error(chalk.red(String(error)));
        process.exit(1);
    }
});
//# sourceMappingURL=split.js.map