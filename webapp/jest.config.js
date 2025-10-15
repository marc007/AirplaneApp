module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy'
  },
  transform: {
    '^.+\\.[tj]sx?$': 'babel-jest'
  },
  testMatch: ['<rootDir>/src/**/*.test.[tj]s?(x)'],
  moduleDirectories: ['node_modules', '<rootDir>/src']
};
