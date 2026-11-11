import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  { ignores: ["node_modules/**", ".venv/**", ".direnv/**", "postcss.config.js", "out/**", ".vite/**", "test-results/**", "playwright-report/**", "src/main/migrations/**"] },
  js.configs.recommended, ...ts.configs.recommended,
  { files: ["scripts/*.mjs"], languageOptions: { globals: { URL: "readonly", process: "readonly", console: "readonly", setTimeout: "readonly", clearTimeout: "readonly" } } },
  { files: ["**/*.ts", "**/*.tsx"], rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }]
  }},
);
