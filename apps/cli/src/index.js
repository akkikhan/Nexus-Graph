#!/usr/bin/env node
/**
 * NEXUS CLI - Code Review, Reimagined
 * The next-generation stacked PR management tool
 */
import { Command } from "commander";
import chalk from "chalk";
import { createCommand } from "./commands/create";
import { submitCommand } from "./commands/submit";
import { syncCommand } from "./commands/sync";
import { logCommand } from "./commands/log";
import { upCommand, downCommand, topCommand, bottomCommand } from "./commands/navigate";
import { checkoutCommand } from "./commands/checkout";
import { reviewCommand } from "./commands/review";
import { riskCommand } from "./commands/risk";
import { splitCommand } from "./commands/split";
import { authCommand } from "./commands/auth";
import { initCommand } from "./commands/init";
const program = new Command();
// ASCII Art Banner
const banner = `
${chalk.cyan("╔═══════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.white("NEXUS")} ${chalk.gray("- Code Review, Reimagined")}    ${chalk.cyan("║")}
${chalk.cyan("╚═══════════════════════════════════════╝")}
`;
program
    .name("nx")
    .description("NEXUS CLI - Stack, review, and merge PRs faster")
    .version("0.1.0")
    .addHelpText("before", banner);
// Stack Management Commands
program
    .addCommand(createCommand)
    .addCommand(submitCommand)
    .addCommand(syncCommand)
    .addCommand(logCommand);
// Navigation Commands
program
    .addCommand(upCommand)
    .addCommand(downCommand)
    .addCommand(topCommand)
    .addCommand(bottomCommand)
    .addCommand(checkoutCommand);
// AI Commands
program
    .addCommand(reviewCommand)
    .addCommand(riskCommand)
    .addCommand(splitCommand);
// Setup Commands
program
    .addCommand(authCommand)
    .addCommand(initCommand);
// Parse and execute
program.parse();
//# sourceMappingURL=index.js.map