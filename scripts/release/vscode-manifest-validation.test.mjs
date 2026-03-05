import test from "node:test";
import assert from "node:assert/strict";
import { validateVscodeManifest } from "./vscode-manifest-validation.mjs";

function makeValidManifest() {
    return {
        name: "nexus-vscode-extension",
        publisher: "nexusdev",
        displayName: "Nexus VS Code Extension",
        description: "Nexus VS Code extension MVP",
        version: "0.1.0",
        engines: {
            vscode: "^1.90.0",
        },
        main: "./dist/extension.js",
        activationEvents: ["onCommand:nexus.refreshInbox"],
        contributes: {
            commands: [
                {
                    command: "nexus.refreshInbox",
                    title: "Nexus: Refresh Inbox",
                },
            ],
        },
    };
}

test("validateVscodeManifest accepts valid manifest", () => {
    const result = validateVscodeManifest(makeValidManifest());
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
});

test("validateVscodeManifest rejects scoped package names", () => {
    const manifest = makeValidManifest();
    manifest.name = "@nexus/vscode-extension";

    const result = validateVscodeManifest(manifest);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("must not be scoped")));
});

test("validateVscodeManifest rejects missing command contributions", () => {
    const manifest = makeValidManifest();
    manifest.contributes = {
        commands: [],
    };

    const result = validateVscodeManifest(manifest);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("contributes.commands")));
});
