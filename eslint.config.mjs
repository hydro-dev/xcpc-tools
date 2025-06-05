/* eslint-disable max-len */
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import react from '@hydrooj/eslint-config';

export default defineConfig([globalIgnores([
    '**/dist',
    '**/*.d.ts',
    '**/node_modules',
    '**/.*.js',
]), {
    extends: [react],

    languageOptions: {
        ecmaVersion: 5,
        sourceType: 'module',
    },

    settings: {
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts', '.js', '.jsx', '.tsx'],
        },
    },

    rules: {
        '@typescript-eslint/no-invalid-this': 1,

        'simple-import-sort/imports': ['warn', {
            groups: [
                ['^\\u0000'],
                [
                    '^(node:)?(assert|buffer|child_process|cluster|console|constants|crypto|dgram|dns|domain|events|fs|http|https|module|net|os|path|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|tty|url|util|vm|zlib|freelist|v8|process|async_hooks|http2|perf_hooks)(/.*|$)',
                    '^(?!@?hydrooj)(@?\\w.+)',
                    '^@?hydrooj',
                    '^',
                    '^\\.',
                ]],
        }],
    },
}, {
    files: [
        '**/packages/ui/**/*.{cjs,ts,tsx}',
    ],

    languageOptions: {
        globals: {
            ...globals.browser,
        },
        parserOptions: {
            sourceType: 'module',
            ecmaVersion: 2020,
            ecmaFeatures: {
                impliedStrict: true,
                experimentalObjectRestSpread: true,
                jsx: true,
                defaultParams: true,
                legacyDecorators: true,
                allowImportExportEverywhere: true,
            },
        },
    },

    settings: {
        'react-x': {
            version: '18.3.1',
        },
    },

    rules: {
        'github/array-foreach': 0,
        '@typescript-eslint/no-invalid-this': 0,

        // FIXME A bug with eslint-parser
        // 'template-curly-spacing': 'off',

        '@stylistic/indent': [
            'warn',
            2,
            { SwitchCase: 1 },
        ],
        'function-paren-newline': 'off',
        'no-mixed-operators': 'off',
        'no-await-in-loop': 'off',
        'no-lonely-if': 'off',
        'no-script-url': 'off',
    },
}]);
