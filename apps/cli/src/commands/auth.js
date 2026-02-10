/**
 * NEXUS CLI - Auth Command
 * Authenticate with Git platforms
 */
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getConfig } from "../utils/config";
export const authCommand = new Command("auth")
    .description("Authenticate with Git platforms")
    .option("--github", "Authenticate with GitHub")
    .option("--gitlab", "Authenticate with GitLab")
    .option("--logout", "Clear saved credentials")
    .action(async (options) => {
    const spinner = ora();
    const config = getConfig();
    if (options.logout) {
        config.delete("githubToken");
        config.delete("gitlabToken");
        console.log(chalk.green("✓ Logged out successfully"));
        return;
    }
    // Default to GitHub if no platform specified
    const platform = options.gitlab ? "gitlab" : "github";
    console.log(chalk.bold(`\n🔐 NEXUS Authentication - ${platform.toUpperCase()}\n`));
    if (platform === "github") {
        console.log(chalk.gray("To authenticate, you need a GitHub Personal Access Token."));
        console.log(chalk.gray("Create one at: https://github.com/settings/tokens"));
        console.log(chalk.gray("\nRequired scopes: repo, read:org, read:user\n"));
        const { token } = await inquirer.prompt([
            {
                type: "password",
                name: "token",
                message: "Enter your GitHub token:",
                mask: "*",
                validate: (input) => {
                    if (!input.trim())
                        return "Token is required";
                    if (input.length < 20)
                        return "Token seems too short";
                    return true;
                },
            },
        ]);
        spinner.start("Validating token...");
        // Validate token by making a test API call
        try {
            const response = await fetch("https://api.github.com/user", {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json",
                },
            });
            if (!response.ok) {
                spinner.fail("Invalid token");
                console.error(chalk.red("The token was rejected by GitHub. Please check and try again."));
                process.exit(1);
            }
            const user = await response.json();
            // Save token
            config.set("githubToken", token);
            config.set("githubUser", user.login);
            spinner.succeed(`Authenticated as ${chalk.cyan(user.login)}`);
            console.log(chalk.gray(`\nToken saved to ${config.path}`));
        }
        catch (error) {
            spinner.fail("Connection failed");
            console.error(chalk.red("Could not connect to GitHub. Check your network."));
            process.exit(1);
        }
    }
    else if (platform === "gitlab") {
        console.log(chalk.gray("To authenticate, you need a GitLab Personal Access Token."));
        console.log(chalk.gray("Create one at: https://gitlab.com/-/profile/personal_access_tokens"));
        console.log(chalk.gray("\nRequired scopes: api, read_user\n"));
        const { token, url } = await inquirer.prompt([
            {
                type: "input",
                name: "url",
                message: "GitLab URL:",
                default: "https://gitlab.com",
            },
            {
                type: "password",
                name: "token",
                message: "Enter your GitLab token:",
                mask: "*",
                validate: (input) => {
                    if (!input.trim())
                        return "Token is required";
                    return true;
                },
            },
        ]);
        spinner.start("Validating token...");
        try {
            const response = await fetch(`${url}/api/v4/user`, {
                headers: {
                    "PRIVATE-TOKEN": token,
                },
            });
            if (!response.ok) {
                spinner.fail("Invalid token");
                console.error(chalk.red("The token was rejected. Please check and try again."));
                process.exit(1);
            }
            const user = await response.json();
            config.set("gitlabToken", token);
            config.set("gitlabUrl", url);
            config.set("gitlabUser", user.username);
            spinner.succeed(`Authenticated as ${chalk.cyan(user.username)}`);
        }
        catch (error) {
            spinner.fail("Connection failed");
            console.error(chalk.red("Could not connect to GitLab. Check your network."));
            process.exit(1);
        }
    }
    console.log("");
});
//# sourceMappingURL=auth.js.map