// Test setup file for Jest

// Clean up after each test
afterEach(() => {
  // Clear all timers
  jest.clearAllTimers();
  
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset any modules that might have been required
  jest.resetModules();
});

// Clean up after all tests
afterAll(() => {
  // Force cleanup of any hanging promises or timers
  jest.useRealTimers();
});