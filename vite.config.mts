import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: './', // Use relative paths for electron
    build: {
        outDir: 'dist/renderer',
        emptyOutDir: true,
        chunkSizeWarningLimit: 10000,
        rolldownOptions: {
            checks: {
                bundlerTimings: false,
            },
            output: {
                codeSplitting: {
                    groups: [
                        {
                            name: 'vendor',
                            test: /node_modules[/\\](?:react|react-dom)[/\\]/,
                            priority: 30,
                        },
                        {
                            name: 'wokwi',
                            test: /node_modules[/\\]@wokwi[/\\]elements[/\\]/,
                            priority: 20,
                        },
                        {
                            name: 'lucide',
                            test: /node_modules[/\\]lucide-react[/\\]/,
                            priority: 20,
                        },
                    ],
                },
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, './src/renderer'),
        },
    },
    worker: {
        rolldownOptions: {
            checks: {
                bundlerTimings: false,
            },
        },
    },
    test: {
        globals: true,
        environment: 'node',
        exclude: ['dist/**', 'node_modules/**'],
    },
});
