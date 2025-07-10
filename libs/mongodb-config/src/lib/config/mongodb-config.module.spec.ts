import { MongodbConfigModule } from './mongodb-config.module';

describe('MongodbConfigModule', () => {
  it('should be defined', () => {
    expect(MongodbConfigModule).toBeDefined();
  });

  it('should be a class', () => {
    expect(typeof MongodbConfigModule).toBe('function');
  });

  it('should have the correct module metadata', () => {
    const metadata = Reflect.getMetadata('imports', MongodbConfigModule);
    expect(metadata).toBeDefined();
    expect(Array.isArray(metadata)).toBe(true);
  });
});