module.exports = {
    testEnvironment: 'node',
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ['<rootDir>/tests/setupEnv.js'],
    collectCoverageFrom: [
        'bot.js', 'classes/**/*.js', 'lib/**/*.js', 'managers/**/*.js', 'events/**/*.js',
        'commands/**/*.js', 'buttons/**/*.js', 'select/**/*.js', 'modals/**/*.js',
        'analogCommands/**/*.js', 'cronJobs/**/*.js'
    ],
    coverageReporters: ['text', 'json', 'json-summary', 'lcov'],
    coverageThreshold: {
        global: { statements: 95, branches: 70, functions: 90, lines: 95 }
    }
};
