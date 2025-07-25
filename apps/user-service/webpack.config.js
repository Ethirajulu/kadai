const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
  },
  resolve: {
    alias: {
      '@kadai/database-config': join(__dirname, '../../libs/database-config/dist'),
      '@kadai/auth-service': join(__dirname, '../../dist/libs/auth-service/src'),
      '@kadai/shared-types': join(__dirname, '../../dist/libs/shared-types'),
    },
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
    }),
  ],
};
