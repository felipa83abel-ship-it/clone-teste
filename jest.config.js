module.exports = {
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.js'],
	coverageDirectory: './coverage',
	collectCoverageFrom: [
		'state/**/*.js',
		'events/**/*.js',
		'llm/**/*.js',
		'strategies/**/*.js',
		'utils/**/*.js',
		'controllers/**/*.js',
		'handlers/**/*.js',
		'!**/*.test.js',
		'!**/node_modules/**',
	],
	coverageThreshold: {
		global: {
			branches: 50,
			functions: 50,
			lines: 50,
			statements: 50,
		},
	},
	testTimeout: 10000,
	verbose: true,
	setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
};
