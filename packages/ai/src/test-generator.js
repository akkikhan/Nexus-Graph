/**
 * NEXUS Smart Test Generator
 * AI generates missing tests with one click
 */
const TEST_GENERATION_PROMPT = `You are an expert test engineer. Generate comprehensive tests for the following code.

Requirements:
1. Use the specified testing framework
2. Cover happy paths, edge cases, and error conditions
3. Use descriptive test names
4. Include setup/teardown if needed
5. Mock external dependencies appropriately
6. Follow best practices for the language

Code to test:
{code}

Functions to cover: {functions}

Generate only the test code, no explanations. Use this format:
\`\`\`{language}
// Generated tests
{test_code}
\`\`\``;
const EDGE_CASE_PROMPT = `Analyze this function and identify all possible edge cases that should be tested:

{code}

For each edge case, provide:
1. Input description
2. Expected behavior
3. Why it matters
4. Test priority (critical/high/medium/low)

Respond as JSON: { "edgeCases": [{ "input": "...", "expected": "...", "reason": "...", "priority": "..." }] }`;
export class SmartTestGenerator {
    orchestrator;
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
     * Generate tests for new or modified code
     */
    async generateTests(code, options) {
        const framework = options.framework || this.detectFramework();
        const language = options.language || this.detectLanguage(options.targetFile);
        const prompt = TEST_GENERATION_PROMPT
            .replace("{code}", code)
            .replace("{functions}", options.functions.join(", "))
            .replace("{language}", language);
        const response = await this.orchestrator.chat([{ role: "user", content: prompt }], {
            systemPrompt: `You are a test generation AI. Generate production-quality ${framework} tests.`,
            maxTokens: 4096,
            temperature: 0.2,
        });
        const testCode = this.extractCode(response, language);
        const testFile = this.generateTestFilePath(options.targetFile, framework);
        return {
            framework,
            targetFile: options.targetFile,
            testFile,
            testCode,
            coverage: {
                functions: options.functions,
                branches: this.estimateBranches(code),
                estimatedCoverage: this.estimateCoverage(testCode, code),
            },
        };
    }
    /**
     * Analyze code and suggest what tests are needed
     */
    async suggestTests(diffs) {
        const suggestions = [];
        for (const diff of diffs) {
            // Extract function names from the diff
            const addedFunctions = this.extractFunctions(diff.diff);
            if (addedFunctions.length === 0)
                continue;
            // For each function, suggest test types
            for (const func of addedFunctions) {
                const testTypes = [];
                // Basic unit test is always needed
                testTypes.push({
                    type: "unit",
                    description: `Test ${func} basic functionality`,
                    priority: "high",
                    reason: "Every function should have basic unit tests",
                });
                // Check for patterns that suggest specific test types
                const funcContent = this.extractFunctionContent(diff.diff, func);
                if (funcContent) {
                    // Error handling
                    if (/try\s*{|catch|throw|error/i.test(funcContent)) {
                        testTypes.push({
                            type: "error_handling",
                            description: `Test ${func} error handling paths`,
                            priority: "high",
                            reason: "Function has error handling logic that needs testing",
                        });
                    }
                    // Edge cases for numeric operations
                    if (/[+\-*/]|Math\.|parseInt|parseFloat/i.test(funcContent)) {
                        testTypes.push({
                            type: "edge_case",
                            description: `Test ${func} with boundary values (0, negative, max)`,
                            priority: "medium",
                            reason: "Numeric operations need boundary testing",
                        });
                    }
                    // Async operations
                    if (/async|await|promise|then/i.test(funcContent)) {
                        testTypes.push({
                            type: "integration",
                            description: `Test ${func} async behavior and timeout handling`,
                            priority: "high",
                            reason: "Async functions need integration tests",
                        });
                    }
                    // Array operations
                    if (/\[\]|\.map|\.filter|\.reduce|\.forEach/i.test(funcContent)) {
                        testTypes.push({
                            type: "edge_case",
                            description: `Test ${func} with empty array, single item, large array`,
                            priority: "medium",
                            reason: "Array operations have common edge cases",
                        });
                    }
                    // String operations
                    if (/\.split|\.replace|\.trim|\.toLowerCase/i.test(funcContent)) {
                        testTypes.push({
                            type: "edge_case",
                            description: `Test ${func} with empty string, special characters, unicode`,
                            priority: "medium",
                            reason: "String operations need edge case testing",
                        });
                    }
                    // External calls
                    if (/fetch|axios|http|request|api/i.test(funcContent)) {
                        testTypes.push({
                            type: "integration",
                            description: `Test ${func} with mocked API responses`,
                            priority: "high",
                            reason: "External API calls need mocked integration tests",
                        });
                    }
                    // Database operations
                    if (/query|insert|update|delete|prisma|drizzle/i.test(funcContent)) {
                        testTypes.push({
                            type: "integration",
                            description: `Test ${func} with database mocks/fixtures`,
                            priority: "high",
                            reason: "Database operations need isolated testing",
                        });
                    }
                }
                suggestions.push({
                    functionName: func,
                    filePath: diff.file,
                    testTypes,
                });
            }
        }
        return suggestions;
    }
    /**
     * Generate edge case tests using AI analysis
     */
    async generateEdgeCaseTests(code, functionName, framework = "vitest") {
        // First, analyze for edge cases
        const analysisPrompt = EDGE_CASE_PROMPT.replace("{code}", code);
        const analysis = await this.orchestrator.chat([{ role: "user", content: analysisPrompt }], {
            maxTokens: 2048,
            temperature: 0.3,
        });
        const edgeCases = this.parseEdgeCases(analysis);
        // Then generate tests for the edge cases
        const testPrompt = `Generate ${framework} tests for these edge cases of function ${functionName}:

${edgeCases.map((ec, i) => `${i + 1}. ${ec.input} → ${ec.expected}`).join("\n")}

Original code:
${code}

Generate complete test code:`;
        const response = await this.orchestrator.chat([{ role: "user", content: testPrompt }], {
            maxTokens: 4096,
            temperature: 0.2,
        });
        return this.extractCode(response, "typescript");
    }
    detectFramework() {
        // In production, would check package.json
        return "vitest";
    }
    detectLanguage(filePath) {
        if (filePath.match(/\.(ts|tsx)$/))
            return "typescript";
        if (filePath.match(/\.(js|jsx)$/))
            return "javascript";
        if (filePath.match(/\.py$/))
            return "python";
        return "typescript";
    }
    generateTestFilePath(targetFile, framework) {
        const parts = targetFile.split(".");
        const ext = parts.pop();
        const baseName = parts.join(".");
        if (framework === "jest" || framework === "vitest") {
            return `${baseName}.test.${ext}`;
        }
        if (framework === "mocha") {
            return `${baseName}.spec.${ext}`;
        }
        return `${baseName}.test.${ext}`;
    }
    extractCode(response, language) {
        const codeBlockRegex = new RegExp(`\`\`\`(?:${language}|${language.toLowerCase()}|typescript|javascript)?\\n([\\s\\S]*?)\`\`\``, "i");
        const match = response.match(codeBlockRegex);
        return match ? match[1].trim() : response;
    }
    extractFunctions(diff) {
        const functions = [];
        // Match function declarations and arrow functions
        const patterns = [
            /^\+\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
            /^\+\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>/gm,
            /^\+\s*(?:export\s+)?(\w+)\s*(?:=\s*)?async?\s*\([^)]*\)\s*[:{]/gm,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(diff)) !== null) {
                if (match[1] && !functions.includes(match[1])) {
                    functions.push(match[1]);
                }
            }
        }
        return functions;
    }
    extractFunctionContent(diff, functionName) {
        // Simple extraction - find function and get content until closing brace
        const lines = diff.split("\n");
        let inFunction = false;
        let braceCount = 0;
        let content = "";
        for (const line of lines) {
            if (!inFunction && line.includes(functionName)) {
                inFunction = true;
            }
            if (inFunction) {
                content += line + "\n";
                braceCount += (line.match(/{/g) || []).length;
                braceCount -= (line.match(/}/g) || []).length;
                if (braceCount <= 0 && content.length > 0) {
                    return content;
                }
            }
        }
        return content || null;
    }
    estimateBranches(code) {
        const ifCount = (code.match(/\bif\s*\(/g) || []).length;
        const ternaryCount = (code.match(/\?.*:/g) || []).length;
        const switchCount = (code.match(/\bcase\s+/g) || []).length;
        return ifCount * 2 + ternaryCount * 2 + switchCount;
    }
    estimateCoverage(testCode, sourceCode) {
        const testCount = (testCode.match(/\bit\s*\(|test\s*\(/g) || []).length;
        const functionCount = (sourceCode.match(/function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\(/g) || []).length;
        // Rough estimate: each test covers ~20% of a function
        const estimatedCoverage = Math.min(100, (testCount / Math.max(1, functionCount)) * 60);
        return Math.round(estimatedCoverage);
    }
    parseEdgeCases(response) {
        try {
            const match = response.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                return parsed.edgeCases || [];
            }
        }
        catch {
            // Parsing failed
        }
        return [];
    }
}
//# sourceMappingURL=test-generator.js.map