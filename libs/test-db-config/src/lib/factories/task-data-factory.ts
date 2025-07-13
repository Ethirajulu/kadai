import { faker } from '@faker-js/faker';
import { TaskTestData, TestDataFactoryConfig } from '../../types';
import { TaskStatus } from '@kadai/shared-types';

export class TaskDataFactory {
  constructor(private config?: TestDataFactoryConfig) {}

  generateTask(overrides?: Partial<TaskTestData>): TaskTestData {
    if (this.config?.seed) {
      faker.seed(this.config.seed);
    }

    return {
      userId: faker.string.uuid(),
      title: faker.lorem.sentence(),
      description: faker.lorem.paragraph(),
      status: faker.helpers.arrayElement(Object.values(TaskStatus)),
      priority: faker.helpers.arrayElement(['low', 'medium', 'high']),
      dueDate: faker.date.future(),
      ...overrides,
    };
  }

  generateTasks(
    count: number,
    overrides?: Partial<TaskTestData>
  ): TaskTestData[] {
    return Array.from({ length: count }, () => this.generateTask(overrides));
  }

  generatePendingTask(overrides?: Partial<TaskTestData>): TaskTestData {
    return this.generateTask({
      status: TaskStatus.PENDING,
      ...overrides,
    });
  }

  generateInProgressTask(overrides?: Partial<TaskTestData>): TaskTestData {
    return this.generateTask({
      status: TaskStatus.IN_PROGRESS,
      ...overrides,
    });
  }

  generateCompletedTask(overrides?: Partial<TaskTestData>): TaskTestData {
    return this.generateTask({
      status: TaskStatus.COMPLETED,
      ...overrides,
    });
  }
}
