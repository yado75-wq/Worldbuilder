import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'jsdom',
	},
	resolve: {
		alias: {
			// Runtime-only substitution. The real `obsidian` npm package ships
			// types only (no implementation — Obsidian itself provides that
			// inside the actual app), so `tsc` keeps checking every import of
			// 'obsidian' against the real, verified type definitions
			// unaffected by this — this alias only affects what actually runs
			// under vitest.
			obsidian: path.resolve(__dirname, 'tests/fakes/obsidian.ts'),
		},
	},
});
