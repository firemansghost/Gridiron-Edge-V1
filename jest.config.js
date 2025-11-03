module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/jobs'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.js'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/apps/jobs/tsconfig.test.json',
    }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'apps/jobs/src/**/*.ts',
    '!apps/jobs/src/**/*.test.ts',
  ],
};

