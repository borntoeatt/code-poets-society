import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
    js.configs.recommended,
    {
        files: ['src/**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.browser,
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
            // Catches reading a const before its declaration (a TDZ crash at
            // render time that neither the build nor the tests notice).
            // Functions are hoisted, so only variables are checked.
            'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
        },
    },
];
