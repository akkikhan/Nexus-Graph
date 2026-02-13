import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: process.env.NEXUS_BUILD_DTS !== 'false',
    splitting: false,
    sourcemap: process.env.NEXUS_BUILD_SOURCEMAP !== 'false',
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
