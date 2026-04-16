import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(
	{
		ignores: [
			"coverage/**",
			"dist/**",
			"node_modules/**",
			".vite/**",
			"playwright-report/**",
			"test-results/**",
			"TASK_PROGRESS.md",
			"src/types/database.types.ts"
		]
	},
	eslint.configs.recommended,
	{
		rules: {
			eqeqeq: "off",
			"no-console": "off",
			"no-empty": "off",
			"no-useless-assignment": "off",
			"no-useless-escape": "off",
			"no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					varsIgnorePattern: "^_"
				}
			],
			"prefer-const": "error"
		}
	},
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,tsx,mts,cts}"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: rootDir
			}
		},
		rules: {
			curly: ["error", "all"],
			"no-console": "off",
			"@typescript-eslint/no-empty-object-type": "off",
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{
					prefer: "type-imports",
					fixStyle: "separate-type-imports"
				}
			],
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-misused-promises": [
				"error",
				{
					checksVoidReturn: {
						attributes: false
					}
				}
			],
			"@typescript-eslint/no-namespace": "off",
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					varsIgnorePattern: "^_"
				}
			]
		}
	},
	{
		files: ["src/**/*.{ts,tsx}"],
		languageOptions: {
			globals: {
				...globals.browser
			}
		}
	},
	{
		files: ["tests/**/*.{ts,tsx}", "playwright.config.ts", "vite.config.ts", "vitest.config.mts", "src/vite.d.ts"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			"@typescript-eslint/no-non-null-assertion": "off"
		}
	},
	{
		files: ["scripts/**/*.{js,mjs,cjs}", ".github/**/*.js", "*.{js,mjs,cjs}"],
		languageOptions: {
			globals: {
				...globals.node
			}
		}
	},
	eslintConfigPrettier
);
