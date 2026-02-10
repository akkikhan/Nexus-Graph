import { defineConfig } from 'tsup';
export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: [
        '@anthropic-ai/sdk',
        'openai',
        '@google/generative-ai',
        'langchain',
        '@langchain/anthropic',
        '@langchain/openai',
        'zod'
    ]
});
//# sourceMappingURL=tsup.config.js.map