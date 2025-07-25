import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': 'off', // Disabled - dependencies managed at workspace level
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
