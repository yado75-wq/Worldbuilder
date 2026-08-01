// eslint.config.ts
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";
import globals from "globals";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  // 1. Global ignores
  globalIgnores([
    "**/node_modules/**",
    "main.js",
    "release/**",
    "dist/**",
    "eslint.config.*",
    "**/*.js.map",
    "check-plugin-id.mjs"
  ]),

  // 2. Obsidian recommended rules
  ...obsidianmd.configs.recommended,

  // 3. TypeScript files
  {
    files: ["**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  // 4. Test fakes – implement Obsidian DOM helpers, so prefer-create-el / no-global-this don't apply
  {
    files: ["tests/fakes/**"],
    rules: {
      "obsidianmd/prefer-create-el": "off",
      "obsidianmd/no-global-this": "off",
    },
  },

  // 5. Node scripts (esbuild, version-bump, etc.)
  {
    files: ["**/*.mjs", "esbuild.config.mjs", "version-bump.mjs", "check-plugin-id.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-undef": "off",
    },
  },
]);