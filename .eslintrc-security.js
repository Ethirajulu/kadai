module.exports = {
  root: true,
  ignorePatterns: ['**/*'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:security/recommended'
  ],
  plugins: [
    '@nx',
    '@typescript-eslint',
    'security',
    'no-secrets'
  ],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      rules: {
        '@nx/enforce-module-boundaries': [
          'error',
          {
            enforceBuildableLibDependency: true,
            allow: [],
            depConstraints: [
              {
                sourceTag: '*',
                onlyDependOnLibsWithTags: ['*'],
              },
            ],
          },
        ],
        
        // Security-focused rules
        'security/detect-object-injection': 'error',
        'security/detect-non-literal-fs-filename': 'error',
        'security/detect-non-literal-regexp': 'error',
        'security/detect-non-literal-require': 'error',
        'security/detect-possible-timing-attacks': 'error',
        'security/detect-pseudoRandomBytes': 'error',
        'security/detect-unsafe-regex': 'error',
        'security/detect-buffer-noassert': 'error',
        'security/detect-child-process': 'error',
        'security/detect-disable-mustache-escape': 'error',
        'security/detect-eval-with-expression': 'error',
        'security/detect-new-buffer': 'error',
        'security/detect-no-csrf-before-method-override': 'error',
        
        // No secrets rules
        'no-secrets/no-secrets': ['error', {
          'tolerance': 4.2,
          'additionalRegexes': {
            'JWT Secret': 'jwt[_-]?secret',
            'Database URL': 'DATABASE_URL',
            'API Key': 'api[_-]?key',
            'Access Token': 'access[_-]?token',
            'Refresh Token': 'refresh[_-]?token',
          }
        }],
        
        // Additional security rules
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',
        'no-script-url': 'error',
        'no-proto': 'error',
        'no-iterator': 'error',
        'no-restricted-properties': [
          'error',
          {
            object: 'document',
            property: 'write',
            message: 'document.write is unsafe'
          },
          {
            object: 'document',
            property: 'writeln',
            message: 'document.writeln is unsafe'
          }
        ],
        
        // TypeScript security rules
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unsafe-assignment': 'error',
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-member-access': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
        
        // Prevent prototype pollution
        'no-prototype-builtins': 'error',
        
        // SQL injection prevention
        'security/detect-sql-injection': 'warn',
        
        // XSS prevention
        'no-inner-declarations': 'error',
        
        // Path traversal prevention
        'security/detect-non-literal-fs-filename': 'error',
        
        // Command injection prevention
        'security/detect-child-process': 'error',
      },
    },
    {
      files: ['*.ts', '*.tsx'],
      extends: ['plugin:@nx/typescript'],
      rules: {
        // TypeScript-specific security rules
        '@typescript-eslint/no-dynamic-delete': 'error',
        '@typescript-eslint/no-implied-eval': 'error',
        '@typescript-eslint/prefer-includes': 'error',
        '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      },
    },
    {
      files: ['*.js', '*.jsx'],
      extends: ['plugin:@nx/javascript'],
      rules: {},
    },
    {
      files: ['*.spec.ts', '*.spec.tsx', '*.spec.js', '*.spec.jsx'],
      extends: ['plugin:@nx/typescript'],
      rules: {
        // Relaxed rules for test files
        'security/detect-non-literal-require': 'off',
        'no-secrets/no-secrets': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
  env: {
    node: true,
    jest: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
};