import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'coverage',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		'vitest.config.ts',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// Signalstone's own name, plus the third-party service it integrates
			// with, are proper nouns the rule's default brand list doesn't know
			// about; ignoreWords is additive, so this doesn't affect any other
			// sentence-case checking.
			'obsidianmd/ui/sentence-case': ['warn', { ignoreWords: ['Signalstone', 'Webex', 'Cisco'] }],
		},
	},
	{
		files: ['test/**/*.ts', 'test/**/*.tsx'],
		rules: {
			'obsidianmd/no-console-log': 'off',
		},
	},
);
