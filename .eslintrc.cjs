require('@rushstack/eslint-patch/modern-module-resolution')

module.exports = {
  root: true,
  ignorePatterns: ['dist', 'out', 'node_modules'],
  overrides: [
    {
      files: ['src/**/*.vue', 'src/**/*.ts', 'src/**/*.tsx'],
      extends: ['plugin:vue/vue3-essential', '@vue/eslint-config-typescript'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        'vue/no-v-text-v-html-on-component': 'off',
      },
    },
    {
      files: ['electron.vite.config.ts', 'electron/**/*.ts', 'electron/**/*.tsx'],
      extends: ['@electron-toolkit/eslint-config-ts'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
      },
    },
    {
      files: ['scripts/**/*.js'],
      extends: ['eslint:recommended'],
      env: {
        node: true,
        es2022: true,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
      },
      rules: {
        'no-unused-vars': 'off',
        'no-empty': 'off',
      },
    },
  ],
}
