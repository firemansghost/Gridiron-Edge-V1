module.exports = {
  projects: [
    {
      displayName: 'jobs',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/apps/jobs/**/__tests__/**/*.test.ts'],
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/apps/jobs/tsconfig.test.json',
            diagnostics: {
              exclude: ['**/apps/web/lib/shadow-model-capture-v1.ts'],
            },
          },
        ],
      },
      moduleFileExtensions: ['ts', 'js', 'json'],
    },
    {
      displayName: 'web',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/apps/web/**/__tests__/**/*.test.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/apps/web/tsconfig.test.json' }],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/apps/web/$1',
      },
      moduleFileExtensions: ['ts', 'js', 'json'],
    },
  ],
  collectCoverageFrom: [
    'apps/jobs/src/**/*.ts',
    '!apps/jobs/src/**/*.test.ts',
  ],
};

