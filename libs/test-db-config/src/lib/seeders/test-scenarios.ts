import { DatabaseConnections, SeedOptions, TestScenario } from '../../types';
import { MultiDatabaseOrchestrator } from './multi-database-orchestrator';

// Define ScenarioResult locally since it's not in types
export interface ScenarioResult {
  success: boolean;
  scenario: string;
  scenarioDescription?: string;
  result?: unknown;
  message?: string;
  duration: number;
  error?: Error;
}

export class TestScenarioRunner {
  private orchestrator: MultiDatabaseOrchestrator;
  // private relationshipFactory: RelationshipAwareFactory;

  constructor(connections: DatabaseConnections) {
    this.orchestrator = new MultiDatabaseOrchestrator(connections);
    // this.relationshipFactory = new RelationshipAwareFactory();
  }

  async runScenario(
    scenarioName: string,
    customOptions?: Partial<SeedOptions>
  ): Promise<ScenarioResult> {
    const scenario = this.getScenario(scenarioName);
    if (!scenario) {
      return {
        success: false,
        scenario: scenarioName,
        error: new Error(`Scenario ${scenarioName} not found`),
        message: 'Scenario not found',
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      const seedOptions = { ...scenario.config, ...customOptions };
      const result = await this.orchestrator.execute(seedOptions);

      const duration = Date.now() - startTime;

      return {
        success: (result as any)?.success ?? true,
        scenario: scenarioName,
        scenarioDescription: scenario.description,
        result,
        message: `Scenario ${scenarioName} executed successfully`,
        duration,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      return {
        success: false,
        scenario: scenarioName,
        scenarioDescription: scenario.description,
        error: err,
        message: `Scenario ${scenarioName} failed`,
        duration,
      };
    }
  }

  async runMultipleScenarios(
    scenarioNames: string[]
  ): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (const scenarioName of scenarioNames) {
      const result = await this.runScenario(scenarioName);
      results.push(result);

      // If a scenario fails and it's critical, we might want to stop
      if (!result.success && this.isScenarioCritical(scenarioName)) {
        break;
      }
    }

    return results;
  }

  getScenario(name: string): TestScenario | null {
    const scenarios = this.getAllScenarios();
    return scenarios[name] || null;
  }

  getAllScenarios(): Record<string, TestScenario> {
    return {
      ecommerce: this.createEcommerceScenario(),
      marketplace: this.createMarketplaceScenario(),
      conversation: this.createConversationScenario(),
      'small-dataset': this.createSmallDatasetScenario(),
      'large-dataset': this.createLargeDatasetScenario(),
      'performance-test': this.createPerformanceTestScenario(),
      minimal: this.createMinimalScenario(),
      comprehensive: this.createComprehensiveScenario(),
    };
  }

  private createEcommerceScenario(): TestScenario {
    return {
      id: 'ecommerce',
      name: 'ecommerce',
      description:
        'Standard e-commerce scenario with users, sellers, products, and orders',
      category: 'business',
      config: {
        userCount: 50,
        productCount: 200,
        orderCount: 150,
        taskCount: 75,
        messageCount: 300,
        vectorCount: 200,
        createRelationships: true,
        scenario: 'ecommerce',
        cleanup: false,
        validateData: true,
      },
      expectedOutcome: {
        totalRecords: 975, // Approximate total across all databases
        databases: ['postgresql', 'mongodb', 'redis', 'qdrant'],
        relationships: [
          'users -> seller_profiles',
          'seller_profiles -> products',
          'users -> orders',
          'products -> order_items',
          'users -> tasks',
          'users -> messages',
          'products -> product_vectors',
        ],
      },
      metadata: {
        complexity: 'medium',
        duration: '30-60 seconds',
        memoryUsage: 'moderate',
        useCase: 'E-commerce platform testing',
      },
      validationRules: [],
    };
  }

  private createMarketplaceScenario(): TestScenario {
    return {
      id: 'marketplace',
      name: 'marketplace',
      description:
        'Multi-vendor marketplace with emphasis on seller diversity and product variety',
      category: 'business',
      config: {
        userCount: 100,
        productCount: 500,
        orderCount: 300,
        taskCount: 150,
        messageCount: 600,
        vectorCount: 500,
        createRelationships: true,
        scenario: 'marketplace',
        cleanup: false,
        validateData: true,
      },
      expectedOutcome: {
        totalRecords: 2150,
        databases: ['postgresql', 'mongodb', 'redis', 'qdrant'],
        relationships: [
          'users -> seller_profiles (40% sellers)',
          'seller_profiles -> products (high variety)',
          'cross-seller orders',
          'multilingual messages',
          'diverse product vectors',
        ],
      },
      metadata: {
        complexity: 'high',
        duration: '60-120 seconds',
        memoryUsage: 'high',
        useCase: 'Marketplace platform testing',
      },
      validationRules: [],
    };
  }

  private createConversationScenario(): TestScenario {
    return {
      id: 'conversation',
      name: 'conversation',
      description:
        'Conversational AI scenario focusing on messages, chat sessions, and user interactions',
      category: 'ai',
      config: {
        userCount: 30,
        productCount: 100,
        orderCount: 50,
        taskCount: 40,
        messageCount: 1000,
        vectorCount: 1000,
        createRelationships: true,
        scenario: 'conversation',
        cleanup: false,
        validateData: true,
      },
      expectedOutcome: {
        totalRecords: 2220,
        databases: ['postgresql', 'mongodb', 'redis', 'qdrant'],
        relationships: [
          'users -> chat_sessions',
          'chat_sessions -> messages',
          'messages -> conversation_vectors',
          'users -> conversation_history',
          'multilingual content',
        ],
      },
      metadata: {
        complexity: 'medium',
        duration: '45-90 seconds',
        memoryUsage: 'moderate',
        useCase: 'Conversational AI testing',
      },
      validationRules: [],
    };
  }

  private createSmallDatasetScenario(): TestScenario {
    return {
      id: 'small-dataset',
      name: 'small-dataset',
      description: 'Small dataset for quick testing and development',
      category: 'development',
      config: {
        userCount: 5,
        productCount: 20,
        orderCount: 10,
        taskCount: 8,
        messageCount: 25,
        vectorCount: 20,
        createRelationships: true,
        scenario: 'ecommerce',
        cleanup: false,
        validateData: true,
      },
      expectedOutcome: {
        totalRecords: 88,
        databases: ['postgresql', 'mongodb', 'redis', 'qdrant'],
        relationships: ['basic relationships maintained'],
      },
      metadata: {
        complexity: 'low',
        duration: '5-15 seconds',
        memoryUsage: 'low',
        useCase: 'Development and quick testing',
      },
      validationRules: [],
    };
  }

  private createLargeDatasetScenario(): TestScenario {
    return {
      id: 'large-dataset',
      name: 'large-dataset',
      description: 'Large dataset for performance and stress testing',
      category: 'performance',
      config: {
        userCount: 500,
        productCount: 2000,
        orderCount: 1500,
        taskCount: 750,
        messageCount: 5000,
        vectorCount: 2000,
        createRelationships: true,
        scenario: 'marketplace',
        cleanup: false,
        validateData: true,
      },
      expectedOutcome: {
        totalRecords: 11750,
        databases: ['postgresql', 'mongodb', 'redis', 'qdrant'],
        relationships: ['complex relationship network'],
      },
      metadata: {
        complexity: 'very high',
        duration: '300-600 seconds',
        memoryUsage: 'very high',
        useCase: 'Performance and stress testing',
      },
      validationRules: [],
    };
  }

  private createPerformanceTestScenario(): TestScenario {
    return {
      id: 'performance-test',
      name: 'performance-test',
      description: 'Optimized for performance testing with parallel execution',
      category: 'performance',
      config: {
        userCount: 200,
        productCount: 800,
        orderCount: 600,
        taskCount: 300,
        messageCount: 1500,
        vectorCount: 800,
        createRelationships: false, // Disable for parallel execution
        scenario: 'ecommerce',
        cleanup: false,
        validateData: false, // Skip validation for speed
      },
      expectedOutcome: {
        totalRecords: 4200,
        databases: ['postgresql', 'mongodb', 'redis', 'qdrant'],
        relationships: ['minimal relationships for speed'],
      },
      metadata: {
        complexity: 'medium',
        duration: '30-60 seconds',
        memoryUsage: 'high',
        useCase: 'Performance benchmarking',
      },
      validationRules: [],
    };
  }

  private createMinimalScenario(): TestScenario {
    return {
      id: 'minimal',
      name: 'minimal',
      description: 'Minimal dataset for basic functionality testing',
      category: 'testing',
      config: {
        userCount: 2,
        productCount: 5,
        orderCount: 2,
        taskCount: 3,
        messageCount: 8,
        vectorCount: 5,
        createRelationships: true,
        scenario: 'ecommerce',
        cleanup: false,
        validateData: true,
      },
      expectedOutcome: {
        totalRecords: 25,
        databases: ['postgresql', 'mongodb', 'redis', 'qdrant'],
        relationships: ['minimal but complete relationships'],
      },
      metadata: {
        complexity: 'very low',
        duration: '2-5 seconds',
        memoryUsage: 'very low',
        useCase: 'Unit testing and CI/CD',
      },
      validationRules: [],
    };
  }

  private createComprehensiveScenario(): TestScenario {
    return {
      id: 'comprehensive',
      name: 'comprehensive',
      description: 'Comprehensive scenario testing all features and edge cases',
      category: 'testing',
      config: {
        userCount: 100,
        productCount: 400,
        orderCount: 300,
        taskCount: 200,
        messageCount: 800,
        vectorCount: 400,
        createRelationships: true,
        scenario: 'marketplace',
        cleanup: false,
        validateData: true,
      },
      expectedOutcome: {
        totalRecords: 2200,
        databases: ['postgresql', 'mongodb', 'redis', 'qdrant'],
        relationships: ['comprehensive relationship coverage'],
      },
      metadata: {
        complexity: 'high',
        duration: '90-180 seconds',
        memoryUsage: 'high',
        useCase: 'Integration testing and QA',
      },
      validationRules: [],
    };
  }

  private isScenarioCritical(scenarioName: string): boolean {
    const criticalScenarios = ['minimal', 'small-dataset'];
    return criticalScenarios.includes(scenarioName);
  }

  async cleanup(): Promise<void> {
    await this.orchestrator.cleanup();
  }

  getScenarioSummary(): Record<
    string,
    { description: string; complexity: string; useCase: string }
  > {
    const scenarios = this.getAllScenarios();
    const summary: Record<
      string,
      { description: string; complexity: string; useCase: string }
    > = {};

    for (const [name, scenario] of Object.entries(scenarios)) {
      summary[name] = {
        description: scenario.description,
        complexity: scenario.metadata.complexity,
        useCase: scenario.metadata.useCase,
      };
    }

    return summary;
  }
}
