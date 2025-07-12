import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  BaseRepositoryImpl,
  RepositoryError,
  NotFoundError,
  ConflictError,
  ValidationError,
  DatabaseError,
  TransactionError,
} from './repositories';
import {
  User,
  UserRole,
  PaginationOptions,
  PaginatedResponse,
  CreateUserInput,
  UpdateUserInput,
} from './shared-types';

// ============================
// MOCK IMPLEMENTATIONS
// ============================

class MockUserRepository extends BaseRepositoryImpl<User> {
  private users: User[] = [];
  private nextId = 1;

  async findById(id: string): Promise<User | null> {
    return this.users.find(user => user.id === id) || null;
  }

  async findAll(options?: PaginationOptions): Promise<PaginatedResponse<User>> {
    const validatedOptions = this.validatePaginationOptions(options);
    const offset = this.calculateOffset(validatedOptions.page, validatedOptions.limit);
    
    const sortedUsers = [...this.users].sort((a, b) => {
      const aValue = a[validatedOptions.sortBy as keyof User];
      const bValue = b[validatedOptions.sortBy as keyof User];
      
      if (validatedOptions.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      }
      return aValue < bValue ? 1 : -1;
    });
    
    const paginatedUsers = sortedUsers.slice(offset, offset + validatedOptions.limit);
    
    return this.buildPaginationResponse(
      paginatedUsers,
      this.users.length,
      validatedOptions.page,
      validatedOptions.limit
    );
  }

  async create(userData: CreateUserInput): Promise<User> {
    // Check for email conflict
    const existingUser = this.users.find(user => user.email === userData.email);
    if (existingUser) {
      throw new ConflictError('User', 'email', userData.email);
    }

    const user: User = {
      id: this.nextId.toString(),
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.nextId++;
    this.users.push(user);
    return user;
  }

  async update(id: string, updates: UpdateUserInput): Promise<User | null> {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      return null;
    }

    // Check for email conflict if email is being updated
    if (updates.email) {
      const existingUser = this.users.find(user => user.email === updates.email && user.id !== id);
      if (existingUser) {
        throw new ConflictError('User', 'email', updates.email);
      }
    }

    const updatedUser = {
      ...this.users[userIndex],
      ...updates,
      updatedAt: new Date(),
    };

    this.users[userIndex] = updatedUser;
    return updatedUser;
  }

  async delete(id: string): Promise<boolean> {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      return false;
    }

    this.users.splice(userIndex, 1);
    return true;
  }

  async exists(id: string): Promise<boolean> {
    return this.users.some(user => user.id === id);
  }

  async count(filters?: Record<string, unknown>): Promise<number> {
    if (!filters) {
      return this.users.length;
    }

    return this.users.filter(user => {
      return Object.entries(filters).every(([key, value]) => {
        return user[key as keyof User] === value;
      });
    }).length;
  }

  // Test helper methods
  addUser(user: User): void {
    this.users.push(user);
  }

  clearUsers(): void {
    this.users = [];
    this.nextId = 1;
  }

  getUsers(): User[] {
    return [...this.users];
  }
}

// ============================
// TEST DATA
// ============================

const mockUserData: CreateUserInput = {
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  role: UserRole.CUSTOMER,
  isActive: true,
  emailVerified: false,
  phoneVerified: false,
};

const mockUser: User = {
  id: '1',
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  role: UserRole.CUSTOMER,
  isActive: true,
  emailVerified: false,
  phoneVerified: false,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

const createMultipleUsers = (count: number): User[] => {
  return Array.from({ length: count }, (_, index) => ({
    id: (index + 1).toString(),
    email: `user${index + 1}@example.com`,
    firstName: `User${index + 1}`,
    lastName: 'Test',
    role: UserRole.CUSTOMER,
    isActive: true,
    emailVerified: false,
    phoneVerified: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }));
};

// ============================
// REPOSITORY TESTS
// ============================

describe('BaseRepositoryImpl', () => {
  let repository: MockUserRepository;

  beforeEach(() => {
    repository = new MockUserRepository();
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      repository.addUser(mockUser);
      
      const result = await repository.findById('1');
      
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      const result = await repository.findById('999');
      
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated users with default options', async () => {
      const users = createMultipleUsers(5);
      users.forEach(user => repository.addUser(user));
      
      const result = await repository.findAll();
      
      expect(result.data).toHaveLength(5);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it('should return paginated users with custom pagination', async () => {
      const users = createMultipleUsers(15);
      users.forEach(user => repository.addUser(user));
      
      const result = await repository.findAll({ page: 2, limit: 5 });
      
      expect(result.data).toHaveLength(5);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(5);
      expect(result.pagination.total).toBe(15);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(true);
    });

    it('should handle sorting correctly', async () => {
      const users = createMultipleUsers(3);
      users.forEach(user => repository.addUser(user));
      
      const result = await repository.findAll({ sortBy: 'email', sortOrder: 'asc' });
      
      expect(result.data[0].email).toBe('user1@example.com');
      expect(result.data[1].email).toBe('user2@example.com');
      expect(result.data[2].email).toBe('user3@example.com');
    });

    it('should return empty result when no users exist', async () => {
      const result = await repository.findAll();
      
      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe('create', () => {
    it('should create a new user successfully', async () => {
      const result = await repository.create(mockUserData);
      
      expect(result.id).toBe('1');
      expect(result.email).toBe(mockUserData.email);
      expect(result.firstName).toBe(mockUserData.firstName);
      expect(result.lastName).toBe(mockUserData.lastName);
      expect(result.role).toBe(mockUserData.role);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw ConflictError for duplicate email', async () => {
      await repository.create(mockUserData);
      
      await expect(repository.create(mockUserData)).rejects.toThrow(ConflictError);
    });

    it('should increment ID for subsequent users', async () => {
      const user1 = await repository.create(mockUserData);
      const user2 = await repository.create({ ...mockUserData, email: 'test2@example.com' });
      
      expect(user1.id).toBe('1');
      expect(user2.id).toBe('2');
    });
  });

  describe('update', () => {
    it('should update user successfully', async () => {
      repository.addUser(mockUser);
      
      const updates = { firstName: 'Jane', lastName: 'Smith' };
      const result = await repository.update('1', updates);
      
      expect(result).not.toBeNull();
      expect(result?.firstName).toBe('Jane');
      expect(result?.lastName).toBe('Smith');
      expect(result?.email).toBe(mockUser.email); // Should remain unchanged
      expect(result?.updatedAt).not.toEqual(mockUser.updatedAt);
    });

    it('should return null when user not found', async () => {
      const result = await repository.update('999', { firstName: 'Jane' });
      
      expect(result).toBeNull();
    });

    it('should throw ConflictError when updating to existing email', async () => {
      const user1 = { ...mockUser, id: '1', email: 'user1@example.com' };
      const user2 = { ...mockUser, id: '2', email: 'user2@example.com' };
      
      repository.addUser(user1);
      repository.addUser(user2);
      
      await expect(repository.update('1', { email: 'user2@example.com' })).rejects.toThrow(ConflictError);
    });
  });

  describe('delete', () => {
    it('should delete user successfully', async () => {
      repository.addUser(mockUser);
      
      const result = await repository.delete('1');
      
      expect(result).toBe(true);
      expect(repository.getUsers()).toHaveLength(0);
    });

    it('should return false when user not found', async () => {
      const result = await repository.delete('999');
      
      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true when user exists', async () => {
      repository.addUser(mockUser);
      
      const result = await repository.exists('1');
      
      expect(result).toBe(true);
    });

    it('should return false when user does not exist', async () => {
      const result = await repository.exists('999');
      
      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('should return total count without filters', async () => {
      const users = createMultipleUsers(5);
      users.forEach(user => repository.addUser(user));
      
      const result = await repository.count();
      
      expect(result).toBe(5);
    });

    it('should return filtered count with filters', async () => {
      const users = createMultipleUsers(5);
      users[0].role = UserRole.ADMIN;
      users[1].role = UserRole.ADMIN;
      users.forEach(user => repository.addUser(user));
      
      const result = await repository.count({ role: UserRole.ADMIN });
      
      expect(result).toBe(2);
    });

    it('should return zero when no users match filters', async () => {
      const users = createMultipleUsers(3);
      users.forEach(user => repository.addUser(user));
      
      const result = await repository.count({ role: UserRole.ADMIN });
      
      expect(result).toBe(0);
    });
  });

  describe('pagination utilities', () => {
    it('should validate pagination options correctly', async () => {
      const result = await repository.findAll({ page: -1, limit: 200 });
      
      expect(result.pagination.page).toBe(1); // Should be clamped to minimum
      expect(result.pagination.limit).toBe(100); // Should be clamped to maximum
    });

    it('should handle undefined pagination options', async () => {
      const result = await repository.findAll();
      
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });
  });
});

// ============================
// ERROR HANDLING TESTS
// ============================

describe('Repository Error Classes', () => {
  describe('RepositoryError', () => {
    it('should create error with code and details', () => {
      const error = new RepositoryError('Test error', 'TEST_CODE', { key: 'value' });
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ key: 'value' });
      expect(error.name).toBe('RepositoryError');
    });
  });

  describe('NotFoundError', () => {
    it('should create error with entity and id', () => {
      const error = new NotFoundError('User', '123');
      
      expect(error.message).toBe('User with id 123 not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.details).toEqual({ entity: 'User', id: '123' });
      expect(error.name).toBe('NotFoundError');
    });
  });

  describe('ConflictError', () => {
    it('should create error with entity, field, and value', () => {
      const error = new ConflictError('User', 'email', 'test@example.com');
      
      expect(error.message).toBe('User with email \'test@example.com\' already exists');
      expect(error.code).toBe('CONFLICT');
      expect(error.details).toEqual({ entity: 'User', field: 'email', value: 'test@example.com' });
      expect(error.name).toBe('ConflictError');
    });
  });

  describe('ValidationError', () => {
    it('should create error with message and field', () => {
      const error = new ValidationError('Invalid email format', 'email');
      
      expect(error.message).toBe('Invalid email format');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual({ field: 'email' });
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('DatabaseError', () => {
    it('should create error with message and original error', () => {
      const originalError = new Error('Connection failed');
      const error = new DatabaseError('Database connection failed', originalError);
      
      expect(error.message).toBe('Database connection failed');
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.details).toEqual({ originalError: 'Connection failed' });
      expect(error.name).toBe('DatabaseError');
    });
  });

  describe('TransactionError', () => {
    it('should create error with message and operation', () => {
      const error = new TransactionError('Transaction failed during commit', 'commit');
      
      expect(error.message).toBe('Transaction failed during commit');
      expect(error.code).toBe('TRANSACTION_ERROR');
      expect(error.details).toEqual({ operation: 'commit' });
      expect(error.name).toBe('TransactionError');
    });
  });
});

// ============================
// PERFORMANCE TESTS
// ============================

describe('Repository Performance', () => {
  let repository: MockUserRepository;

  beforeEach(() => {
    repository = new MockUserRepository();
  });

  it('should handle large dataset efficiently', async () => {
    const users = createMultipleUsers(1000);
    users.forEach(user => repository.addUser(user));
    
    const startTime = Date.now();
    const result = await repository.findAll({ page: 1, limit: 50 });
    const endTime = Date.now();
    
    expect(result.data).toHaveLength(50);
    expect(result.pagination.total).toBe(1000);
    expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
  });

  it('should handle multiple concurrent operations', async () => {
    const promises = Array.from({ length: 10 }, (_, index) => 
      repository.create({
        email: `concurrent${index}@example.com`,
        firstName: `User${index}`,
        lastName: 'Test',
        role: UserRole.CUSTOMER,
        isActive: true,
        emailVerified: false,
        phoneVerified: false,
      })
    );
    
    const results = await Promise.all(promises);
    
    expect(results).toHaveLength(10);
    expect(repository.getUsers()).toHaveLength(10);
    
    // All users should have unique IDs
    const ids = results.map(user => user.id);
    const uniqueIds = [...new Set(ids)];
    expect(uniqueIds).toHaveLength(10);
  });
});

// ============================
// INTEGRATION TESTS
// ============================

describe('Repository Integration', () => {
  let repository: MockUserRepository;

  beforeEach(() => {
    repository = new MockUserRepository();
  });

  it('should support complete CRUD lifecycle', async () => {
    // Create
    const created = await repository.create(mockUserData);
    expect(created.id).toBeDefined();
    
    // Read
    const found = await repository.findById(created.id);
    expect(found).toEqual(created);
    
    // Update
    const updated = await repository.update(created.id, { firstName: 'Updated' });
    expect(updated?.firstName).toBe('Updated');
    
    // Delete
    const deleted = await repository.delete(created.id);
    expect(deleted).toBe(true);
    
    // Verify deletion
    const notFound = await repository.findById(created.id);
    expect(notFound).toBeNull();
  });

  it('should maintain data consistency across operations', async () => {
    // Create multiple users
    const users = await Promise.all([
      repository.create({ ...mockUserData, email: 'user1@example.com' }),
      repository.create({ ...mockUserData, email: 'user2@example.com' }),
      repository.create({ ...mockUserData, email: 'user3@example.com' }),
    ]);
    
    // Verify count
    expect(await repository.count()).toBe(3);
    
    // Update one user
    await repository.update(users[0].id, { firstName: 'Updated' });
    
    // Verify count remains the same
    expect(await repository.count()).toBe(3);
    
    // Delete one user
    await repository.delete(users[1].id);
    
    // Verify count is reduced
    expect(await repository.count()).toBe(2);
    
    // Verify remaining users are correct
    const remaining = await repository.findAll();
    expect(remaining.data).toHaveLength(2);
    expect(remaining.data.find(u => u.id === users[0].id)?.firstName).toBe('Updated');
    expect(remaining.data.find(u => u.id === users[1].id)).toBeUndefined();
  });
});