import { EXTENSION_PACKAGE_JSON_PATH, loadExtensionManifest, validateVscodeManifest } from "./vscode-manifest-validation.mjs";

async function run() {
    const manifest = await loadExtensionManifest();
    const result = validateVscodeManifest(manifest);

    if (!result.ok) {
        process.stderr.write("[vscode:manifest] FAIL\n");
        for (const error of result.errors) {
            process.stderr.write(`- ${error}\n`);
        }
        process.exitCode = 1;
        return;
    }

    process.stdout.write(`[vscode:manifest] PASS (${EXTENSION_PACKAGE_JSON_PATH})\n`);
}

run().catch((error) => {
    process.stderr.write(`[vscode:manifest] FAIL: ${error.message}\n`);
    process.exitCode = 1;
});
