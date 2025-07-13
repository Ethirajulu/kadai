import { PostgreSQLTestConfig } from '../types';
import {
  MessageDataFactory,
  MongoDBConnectionFactory,
  PostgreSQLConnectionFactory,
  QdrantConnectionFactory,
  RedisConnectionFactory,
  TaskDataFactory,
  UserDataFactory,
  VectorDataFactory,
} from './factories';
import { TestDatabaseManager } from './test-database-manager';

describe('test-db-config', () => {
  describe('TestDatabaseManager', () => {
    it('should be defined', () => {
      expect(TestDatabaseManager).toBeDefined();
    });

    it('should create instance with config', () => {
      const config = {
        postgresql: {
          database: 'test_db',
          username: 'test_user',
          password: 'test_pass',
        } as PostgreSQLTestConfig,
      };
      const manager = new TestDatabaseManager(config);
      expect(manager).toBeInstanceOf(TestDatabaseManager);
    });
  });

  describe('Connection Factories', () => {
    it('should export PostgreSQLConnectionFactory', () => {
      expect(PostgreSQLConnectionFactory).toBeDefined();
      const factory = new PostgreSQLConnectionFactory();
      expect(factory).toBeInstanceOf(PostgreSQLConnectionFactory);
    });

    it('should export MongoDBConnectionFactory', () => {
      expect(MongoDBConnectionFactory).toBeDefined();
      const factory = new MongoDBConnectionFactory();
      expect(factory).toBeInstanceOf(MongoDBConnectionFactory);
    });

    it('should export RedisConnectionFactory', () => {
      expect(RedisConnectionFactory).toBeDefined();
      const factory = new RedisConnectionFactory();
      expect(factory).toBeInstanceOf(RedisConnectionFactory);
    });

    it('should export QdrantConnectionFactory', () => {
      expect(QdrantConnectionFactory).toBeDefined();
      const factory = new QdrantConnectionFactory();
      expect(factory).toBeInstanceOf(QdrantConnectionFactory);
    });
  });

  describe('Data Factories', () => {
    it('should export UserDataFactory', () => {
      expect(UserDataFactory).toBeDefined();
      const factory = new UserDataFactory();
      expect(factory).toBeInstanceOf(UserDataFactory);
    });

    it('should export TaskDataFactory', () => {
      expect(TaskDataFactory).toBeDefined();
      const factory = new TaskDataFactory();
      expect(factory).toBeInstanceOf(TaskDataFactory);
    });

    it('should export MessageDataFactory', () => {
      expect(MessageDataFactory).toBeDefined();
      const factory = new MessageDataFactory();
      expect(factory).toBeInstanceOf(MessageDataFactory);
    });

    it('should export VectorDataFactory', () => {
      expect(VectorDataFactory).toBeDefined();
      const factory = new VectorDataFactory();
      expect(factory).toBeInstanceOf(VectorDataFactory);
    });
  });

  describe('Data Generation', () => {
    let userFactory: UserDataFactory;
    let taskFactory: TaskDataFactory;
    let messageFactory: MessageDataFactory;
    let vectorFactory: VectorDataFactory;

    beforeEach(() => {
      userFactory = new UserDataFactory();
      taskFactory = new TaskDataFactory();
      messageFactory = new MessageDataFactory();
      vectorFactory = new VectorDataFactory();
    });

    it('should generate test user data', () => {
      const user = userFactory.generateUser();
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('isActive');
    });

    it('should generate test task data', () => {
      const task = taskFactory.generateTask();
      expect(task).toHaveProperty('title');
      expect(task).toHaveProperty('status');
      expect(task).toHaveProperty('priority');
    });

    it('should generate test message data', () => {
      const message = messageFactory.generateMessage();
      expect(message).toHaveProperty('content');
      expect(message).toHaveProperty('platform');
      expect(message).toHaveProperty('messageType');
    });

    it('should generate test vector data', () => {
      const vector = vectorFactory.generateVector();
      expect(vector).toHaveProperty('id');
      expect(vector).toHaveProperty('vector');
      expect(vector).toHaveProperty('payload');
      expect(vector.vector).toHaveLength(1536); // Default embedding size
    });
  });

  describe('Factory Overrides', () => {
    it('should accept overrides for user data', () => {
      const factory = new UserDataFactory();
      const user = factory.generateUser({ email: 'test@example.com' });
      expect(user.email).toBe('test@example.com');
    });

    it('should accept overrides for task data', () => {
      const factory = new TaskDataFactory();
      const task = factory.generateTask({ title: 'Custom Task' });
      expect(task.title).toBe('Custom Task');
    });

    it('should accept overrides for message data', () => {
      const factory = new MessageDataFactory();
      const message = factory.generateMessage({ content: 'Hello World' });
      expect(message.content).toBe('Hello World');
    });

    it('should accept overrides for vector data', () => {
      const factory = new VectorDataFactory();
      const customVector = [1, 2, 3];
      const vector = factory.generateVector(3, { vector: customVector });
      expect(vector.vector).toEqual(customVector);
    });
  });
});
