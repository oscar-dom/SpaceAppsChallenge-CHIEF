// Root ESLint config (flat config) shared by every TypeScript workspace, plus the Vue rules
// of the frontend.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'agent/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  ...vue.configs['flat/recommended'].map((config) => ({ ...config, files: ['frontend/**/*.vue'] })),
  {
    files: ['frontend/**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: {
      // Component names follow the design (Icon, Capsule, Workspace...).
      'vue/multi-word-component-names': 'off',
    },
  },
  prettier,
);
