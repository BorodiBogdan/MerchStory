// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const simpleImportSort = require('eslint-plugin-simple-import-sort');

module.exports = defineConfig([
  expoConfig,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // Import ordering
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // TypeScript strictness
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // General quality
      'no-console': 'warn',
    },
  },
  {
    ignores: ['dist/*'],
  },
]);
