// @ts-nocheck
const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      '.git/**',
      'stt/models-stt/vosk/vosk-model-small-pt-0.3/**',
      'docs/**',
      'coverage/**',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js
        global: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'writable', // Permitir exports
        // Browser/Audio APIs
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        AudioContext: 'readonly',
        WebAudioContext: 'readonly',
        AudioWorkletNode: 'readonly',
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        MediaRecorder: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        WebSocket: 'readonly',
        Event: 'readonly',
        Option: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        // Playwright
        page: 'readonly',
        browser: 'readonly',
        context: 'readonly',
        // Jest
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      // Logs: Permitir em desenvolvimento
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',

      // Variáveis: Aceitar _param para ignorar intencionalmente
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Recomendações gerais
      'no-var': 'warn',
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'prefer-top-level-await': 'off', // Não suportado em CommonJS
    },
  },
];
