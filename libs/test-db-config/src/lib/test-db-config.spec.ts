import { testDbConfig } from './test-db-config.js';

describe('testDbConfig', () => {
  it('should work', () => {
    expect(testDbConfig()).toEqual('test-db-config');
  });
});
