module.exports = {
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022 },
  extends: ['eslint:recommended'],
  ignorePatterns: ['node_modules/', 'Config/'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-case-declarations': 'off',
    'no-control-regex': 'off',
    'no-duplicate-case': 'warn',
  },
};
