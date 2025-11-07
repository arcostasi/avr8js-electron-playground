/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    base: './', // Use relative paths for electron
    build: {
        outDir: 'dist/renderer',
        emptyOutDir: true,
        chunkSizeWarningLimit: 10000,
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom'],
                    wokwi: ['@wokwi/elements'],
                    lucide: ['lucide-react']
                }
            }
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src/renderer'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        exclude: ['dist/**', 'node_modules/**'],
    }
} as any);
