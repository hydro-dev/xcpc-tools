module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  env: {
    browser: true,
    es2020: true,
    commonjs: true,
  },
  extends: [
    '@hydrooj/eslint-config',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 'latest',
    ecmaFeatures: {
      impliedStrict: true,
      experimentalObjectRestSpread: true,
      jsx: true,
      defaultParams: true,
      legacyDecorators: true,
      allowImportExportEverywhere: true,
    },
  },
  plugins: ['react-refresh'],
  rules: {
    // FIXME A bug with eslint-parser
    // 'template-curly-spacing': 'off',

    'react-refresh/only-export-components': 'warn',

    '@typescript-eslint/indent': [
      'warn',
      2,
      { SwitchCase: 1 },
    ],
    'function-paren-newline': 'off',
    'no-mixed-operators': 'off',
    'no-await-in-loop': 'off',
    'no-lonely-if': 'off',
    'no-script-url': 'off',

    'simple-import-sort/imports': [
      'warn',
    ],
  },
};
