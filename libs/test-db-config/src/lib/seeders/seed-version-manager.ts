import { EventEmitter } from 'events';
import {
  SeedVersion,
  SeedVersionHistory,
  SeedVersionManager as ISeedVersionManager,
  SeedVersionOptions,
  SeedVersionResult,
  SeedVersionState,
  SeedVersionValidation,
  SeedMigration,
  SeedDependency,
  SeedVersionDependency,
} from '../../types';

export class SeedVersionManager
  extends EventEmitter
  implements ISeedVersionManager
{
  private versionHistory: SeedVersionHistory[];
  private currentVersion: string | null;
  private versionStates: Map<string, SeedVersionState>;
  private registeredMigrations: Map<string, SeedMigration>;

  constructor() {
    super();
    this.versionHistory = [];
    this.currentVersion = null;
    this.versionStates = new Map();
    this.registeredMigrations = new Map();
  }

  async initializeVersioning(
    options: SeedVersionOptions
  ): Promise<SeedVersionResult> {
    try {
      this.emit('version_init_start', { options });

      // Create initial version if none exists
      if (this.versionHistory.length === 0) {
        const initialVersion = this.createInitialVersion(options);
        await this.createVersion(initialVersion);
      }

      // Load existing version history from storage if available
      if (options.persistenceAdapter) {
        const existingHistory =
          await options.persistenceAdapter.loadVersionHistory();
        if (existingHistory.length > 0) {
          this.versionHistory = existingHistory;
          this.currentVersion = this.findLatestVersion()?.version.id || null;
        }
      }

      this.emit('version_init_complete', {
        currentVersion: this.currentVersion,
        historyCount: this.versionHistory.length,
      });

      return {
        success: true,
        version: this.currentVersion || undefined,
        message: 'Version management initialized successfully',
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('version_init_error', { error: err });

      return {
        success: false,
        error: err,
        message: 'Failed to initialize version management',
      };
    }
  }

  async createVersion(version: SeedVersion): Promise<SeedVersionResult> {
    try {
      // Validate version data
      const validation = this.validateVersion(version);
      if (!validation.isValid) {
        return {
          success: false,
          error: new Error(validation.errors.join(', ')),
          message: 'Version validation failed',
        };
      }

      // Check for version conflicts
      const existingVersion = this.versionHistory.find(
        (v) => v.version.id === version.id
      );
      if (existingVersion) {
        return {
          success: false,
          error: new Error(`Version ${version.id} already exists`),
          message: 'Version conflict detected',
        };
      }

      // Validate dependencies
      const dependencyValidation = this.validateDependencies(
        version.dependencies || []
      );
      if (!dependencyValidation.isValid) {
        return {
          success: false,
          error: new Error(dependencyValidation.errors.join(', ')),
          message: 'Dependency validation failed',
        };
      }

      this.emit('version_create_start', { version });

      // Create version history entry
      const historyEntry: SeedVersionHistory = {
        version,
        createdAt: new Date(),
        appliedAt: null,
        rollbackAt: null,
        status: 'created',
        metadata: {
          environment: process.env.NODE_ENV || 'development',
          createdBy: process.env.USER || 'unknown',
        },
      };

      this.versionHistory.push(historyEntry);
      this.versionStates.set(version.id, 'created');

      // Persist if adapter is available
      if (version.persistenceAdapter) {
        await version.persistenceAdapter.saveVersionHistory(
          this.versionHistory
        );
      }

      this.emit('version_create_complete', { version, historyEntry });

      return {
        success: true,
        version: version.id,
        message: `Version ${version.id} created successfully`,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('version_create_error', { version, error: err });

      return {
        success: false,
        error: err,
        message: 'Failed to create version',
      };
    }
  }

  async applyVersion(
    versionId: string,
    options?: SeedVersionOptions
  ): Promise<SeedVersionResult> {
    try {
      const versionEntry = this.versionHistory.find(
        (v) => v.version.id === versionId
      );
      if (!versionEntry) {
        return {
          success: false,
          error: new Error(`Version ${versionId} not found`),
          message: 'Version not found',
        };
      }

      this.emit('version_apply_start', {
        versionId,
        version: versionEntry.version,
      });

      // Check if version is already applied
      if (versionEntry.status === 'applied') {
        return {
          success: true,
          version: versionId,
          message: `Version ${versionId} is already applied`,
        };
      }

      // Apply dependencies first
      if (versionEntry.version.dependencies) {
        for (const dependency of versionEntry.version.dependencies) {
          const depResult = await this.applyVersion(
            dependency.versionId,
            options
          );
          if (!depResult.success) {
            return {
              success: false,
              error: new Error(
                `Failed to apply dependency ${dependency.versionId}: ${depResult.error?.message}`
              ),
              message: 'Dependency application failed',
            };
          }
        }
      }

      // Apply migrations if any
      if (versionEntry.version.migrations) {
        for (const migration of versionEntry.version.migrations) {
          await this.applyMigration(migration);
        }
      }

      // Update version status
      versionEntry.status = 'applied';
      versionEntry.appliedAt = new Date();
      this.versionStates.set(versionId, 'applied');
      this.currentVersion = versionId;

      // Persist changes
      if (options?.persistenceAdapter) {
        await options.persistenceAdapter.saveVersionHistory(
          this.versionHistory
        );
      }

      this.emit('version_apply_complete', {
        versionId,
        version: versionEntry.version,
      });

      return {
        success: true,
        version: versionId,
        message: `Version ${versionId} applied successfully`,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('version_apply_error', { versionId, error: err });

      return {
        success: false,
        error: err,
        message: 'Failed to apply version',
      };
    }
  }

  async rollbackVersion(
    versionId: string,
    options?: SeedVersionOptions
  ): Promise<SeedVersionResult> {
    try {
      const versionEntry = this.versionHistory.find(
        (v) => v.version.id === versionId
      );
      if (!versionEntry) {
        return {
          success: false,
          error: new Error(`Version ${versionId} not found`),
          message: 'Version not found',
        };
      }

      this.emit('version_rollback_start', {
        versionId,
        version: versionEntry.version,
      });

      // Check if version can be rolled back
      if (versionEntry.status !== 'applied') {
        return {
          success: false,
          error: new Error(
            `Version ${versionId} is not applied, cannot rollback`
          ),
          message: 'Invalid rollback state',
        };
      }

      // Check for dependents
      const dependents = this.findDependentVersions(versionId);
      if (dependents.length > 0 && !options?.forceDependentRollback) {
        return {
          success: false,
          error: new Error(
            `Version ${versionId} has dependents: ${dependents
              .map((d) => d.id)
              .join(', ')}`
          ),
          message: 'Cannot rollback version with dependents',
        };
      }

      // Rollback dependents first if forced
      if (dependents.length > 0 && options?.forceDependentRollback) {
        for (const dependent of dependents) {
          const rollbackResult = await this.rollbackVersion(
            dependent.id,
            options
          );
          if (!rollbackResult.success) {
            return rollbackResult;
          }
        }
      }

      // Execute rollback migrations
      if (versionEntry.version.migrations) {
        for (const migration of versionEntry.version.migrations.reverse()) {
          await this.rollbackMigration(migration);
        }
      }

      // Update version status
      versionEntry.status = 'rolled_back';
      versionEntry.rollbackAt = new Date();
      this.versionStates.set(versionId, 'rolled_back');

      // Update current version to previous
      const previousVersion = this.findPreviousAppliedVersion(versionId);
      this.currentVersion = previousVersion?.version.id || null;

      // Persist changes
      if (options?.persistenceAdapter) {
        await options.persistenceAdapter.saveVersionHistory(
          this.versionHistory
        );
      }

      this.emit('version_rollback_complete', {
        versionId,
        version: versionEntry.version,
      });

      return {
        success: true,
        version: versionId,
        message: `Version ${versionId} rolled back successfully`,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('version_rollback_error', { versionId, error: err });

      return {
        success: false,
        error: err,
        message: 'Failed to rollback version',
      };
    }
  }

  getCurrentVersion(): string | null {
    return this.currentVersion;
  }

  getVersionHistory(): SeedVersionHistory[] {
    return [...this.versionHistory];
  }

  getVersionState(versionId: string): SeedVersionState | undefined {
    return this.versionStates.get(versionId);
  }

  validateVersion(version: SeedVersion): SeedVersionValidation {
    const errors: string[] = [];

    // Check required fields
    if (!version.id) {
      errors.push('Version ID is required');
    }
    if (!version.name) {
      errors.push('Version name is required');
    }
    if (!version.description) {
      errors.push('Version description is required');
    }

    // Validate version ID format (semantic versioning)
    const versionRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)*$/;
    if (version.id && !versionRegex.test(version.id)) {
      errors.push(
        'Version ID must follow semantic versioning format (e.g., 1.0.0)'
      );
    }

    // Validate dependencies exist
    if (version.dependencies) {
      for (const dep of version.dependencies) {
        const depExists = this.versionHistory.some(
          (v) => v.version.id === dep.versionId
        );
        if (!depExists) {
          errors.push(`Dependency version ${dep.versionId} does not exist`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  validateDependencies(
    dependencies: SeedVersionDependency[]
  ): SeedVersionValidation {
    const errors: string[] = [];

    // Check for circular dependencies
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (versionId: string): boolean => {
      if (recursionStack.has(versionId)) {
        return true;
      }
      if (visited.has(versionId)) {
        return false;
      }

      visited.add(versionId);
      recursionStack.add(versionId);

      const version = this.versionHistory.find(
        (v) => v.version.id === versionId
      );
      if (version?.version.dependencies) {
        for (const dep of version.version.dependencies) {
          if (hasCycle(dep.versionId)) {
            return true;
          }
        }
      }

      recursionStack.delete(versionId);
      return false;
    };

    for (const dep of dependencies) {
      if (hasCycle(dep.versionId)) {
        errors.push(`Circular dependency detected involving ${dep.versionId}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private createInitialVersion(options: SeedVersionOptions): SeedVersion {
    return {
      id: '1.0.0',
      version: '1.0.0',
      createdAt: new Date(),
      schema: { version: '1.0', type: 'initial' },
      name: 'Initial Version',
      description: 'Initial seed data version',
      seedOptions: options.defaultSeedOptions || {},
      migrations: [],
      dependencies: [],
      metadata: {
        created: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
      },
    };
  }

  private findLatestVersion(): SeedVersionHistory | undefined {
    return this.versionHistory
      .filter((v) => v.status === 'applied')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  private findDependentVersions(versionId: string): SeedVersion[] {
    return this.versionHistory
      .filter((v) =>
        v.version.dependencies?.some((dep) => dep.versionId === versionId)
      )
      .map((v) => v.version);
  }

  private findPreviousAppliedVersion(
    versionId: string
  ): SeedVersionHistory | undefined {
    const currentIndex = this.versionHistory.findIndex(
      (v) => v.version.id === versionId
    );
    if (currentIndex <= 0) return undefined;

    for (let i = currentIndex - 1; i >= 0; i--) {
      if (this.versionHistory[i].status === 'applied') {
        return this.versionHistory[i];
      }
    }
    return undefined;
  }

  private async applyMigration(migration: SeedMigration): Promise<void> {
    if (migration.up) {
      await migration.up();
    }
  }

  private async rollbackMigration(migration: SeedMigration): Promise<void> {
    if (migration.down) {
      await migration.down();
    }
  }
}
