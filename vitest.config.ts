import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./test/setup.ts'],
		include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
		coverage: {
			reporter: ['text', 'html'],
			include: ['src/**/*.ts', 'src/**/*.tsx'],
			exclude: ['src/main.ts', 'src/**/*.d.ts'],
		},
	},
});
