import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["netlify/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        process: "readonly",
        exports: "readonly",
        module: "readonly",
        require: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        JSON: "readonly",
        String: "readonly",
        parseInt: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        describe: "readonly",
        it: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["error", "warn"] }],
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    ignores: ["node_modules/", ".netlify/", "dist/"],
  },
];
