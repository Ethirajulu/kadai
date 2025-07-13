import { faker } from '@faker-js/faker';
import { UserTestData, TestDataFactoryConfig } from '../../types';
import { UserRole } from '@kadai/shared-types';

export class UserDataFactory {
  constructor(private config?: TestDataFactoryConfig) {}

  generateUser(overrides?: Partial<UserTestData>): UserTestData {
    if (this.config?.seed) {
      faker.seed(this.config.seed);
    }

    return {
      email: faker.internet.email(),
      phoneNumber: faker.phone.number(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      role: faker.helpers.arrayElement(Object.values(UserRole)),
      isActive: faker.datatype.boolean(),
      emailVerified: faker.datatype.boolean(),
      phoneVerified: faker.datatype.boolean(),
      ...overrides,
    };
  }

  generateUsers(count: number, overrides?: Partial<UserTestData>): UserTestData[] {
    return Array.from({ length: count }, () => this.generateUser(overrides));
  }

  generateCustomer(overrides?: Partial<UserTestData>): UserTestData {
    return this.generateUser({
      role: UserRole.CUSTOMER,
      ...overrides,
    });
  }

  generateSeller(overrides?: Partial<UserTestData>): UserTestData {
    return this.generateUser({
      role: UserRole.SELLER,
      ...overrides,
    });
  }

  generateAdmin(overrides?: Partial<UserTestData>): UserTestData {
    return this.generateUser({
      role: UserRole.ADMIN,
      ...overrides,
    });
  }
}