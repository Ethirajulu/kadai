# Gemini CLI for Large Codebase Analysis

## When to Use Gemini CLI

**Use `gemini -p` for tasks requiring massive context or cross-service analysis:**

### Primary Use Cases

- **Frontend/UI Development**: React, Next.js, Tailwind CSS, UX compliance
- **Large-scale Analysis**: Entire directories, multiple services, cross-dependencies
- **Performance & Security**: Bottlenecks, security audits, architecture review
- **Implementation Verification**: Feature completeness, patterns, compliance

### Kadai Project Context

- **Nx monorepo**: 7 NestJS services + 1 Python FastAPI
- **Active Services**: User Service (3001), AI Service (8000), Dashboard (4200)
- **Database Stack**: PostgreSQL, MongoDB, Redis, Qdrant
- **TDD Requirement**: 80% coverage enforced

## File Inclusion Syntax

### Basic Patterns

```bash
# Single file
gemini -p "@src/main.py Explain this file's purpose"

# Multiple files
gemini -p "@package.json @src/index.js Analyze dependencies"

# Entire directory
gemini -p "@src/ Summarize architecture"

# Multiple directories
gemini -p "@src/ @tests/ Analyze test coverage"

# All files
gemini --all_files -p "Analyze project structure"
```

### Kadai-Specific Paths

```bash
# Services analysis
@apps/                  # All services
@apps/user-service/     # Specific service
@apps/ai-service/       # Python AI service
@apps/seller-dashboard/ # Next.js frontend

# Shared libraries
@libs/shared-types/     # TypeScript types
@libs/ui-components/    # React components
@libs/shared-utils/     # Common utilities

# Configuration
@nx.json               # Nx workspace config
@tsconfig.base.json    # TypeScript config
@.env.example          # Environment variables
@venv/                 # Python virtual environment
```

## Essential Analysis Commands

### Service Implementation Status

```bash
# Check what's implemented vs. generated
gemini -p "@apps/ What services are fully implemented vs. basic structure? Show implementation details."

# Verify specific service functionality
gemini -p "@apps/user-service/ Show User entity, validation, and API endpoints with implementation status."

# Check AI service features
gemini -p "@apps/ai-service/ What AI/ML features are working? Show language detection and translation."
```

### Database & Schema Analysis

```bash
# Complete entity review
gemini -p "@apps/user-service/ @libs/shared-types/ Show complete User entity with validation rules and relationships."

# Cross-service data flow
gemini -p "@apps/ @libs/shared-types/ How do services share data? Show entity relationships and DTOs."
```

### Test Coverage & TDD Compliance

```bash
# Coverage analysis
gemini -p "@apps/user-service/ @apps/ai-service/ What's the current test coverage? Show failing tests and TDD status."

# Test patterns
gemini -p "@apps/ @libs/ Show test patterns across services. Are we following TDD correctly?"
```

### Frontend Development

```bash
# React component architecture
gemini -p "@apps/seller-dashboard/ @libs/ui-components/ How are React components structured? Show hierarchy and patterns."

# Next.js implementation
gemini -p "@apps/seller-dashboard/ What Next.js App Router features are implemented? Show routing and layouts."

# UX compliance
gemini -p "@docs/ux/ @apps/seller-dashboard/ Does frontend follow UX guidelines? Show alignment with design specs."

# Tailwind CSS patterns
gemini -p "@apps/seller-dashboard/ @libs/ui-components/ How is Tailwind configured? Show themes and responsive patterns."
```

### Configuration & Environment

```bash
# Environment setup
gemini -p "@.env.example @apps/ What environment variables are used vs. configured? Show service-specific configs."

# Nx workspace analysis
gemini -p "@nx.json @apps/ @libs/ How is Nx configured? Show project dependencies and build targets."

# TypeScript path mappings
gemini -p "@tsconfig.base.json @apps/ @libs/ How are path mappings used? Show @kadai/* import patterns."
```

### Security & Performance

```bash
# Security audit
gemini -p "@apps/ @libs/ What security measures are implemented? Show authentication, validation, and protection."

# Performance analysis
gemini -p "@apps/ @libs/ What bottlenecks exist? Show database queries, API calls, and rendering patterns."

# API consistency
gemini -p "@apps/ What REST patterns are used? Show endpoint structure and error handling consistency."
```

## Advanced Analysis Patterns

### Full-Stack Feature Analysis

```bash
# End-to-end authentication
gemini -p "@apps/user-service/ @apps/seller-dashboard/ @libs/shared-types/ How is user auth implemented end-to-end?"

# Cross-service communication
gemini -p "@apps/ How do services communicate? Show REST calls, message queues, and shared types."
```

### Migration & Refactoring

```bash
# Impact analysis
gemini -p "@apps/ @libs/ If we upgrade Next.js to v15, what needs changes? Show compatibility issues."

# Dependency analysis
gemini -p "@apps/ @libs/ @tsconfig.base.json Show dependency structure and potential circular dependencies."
```

### Code Quality

```bash
# Coding standards
gemini -p "@apps/ @libs/ What coding patterns are followed? Show TypeScript usage and architectural consistency."

# Error handling
gemini -p "@apps/ @libs/ Is proper error handling implemented? Show try-catch blocks and error responses."
```

## Quick Reference Commands

### Implementation Verification

```bash
# Feature completeness
gemini -p "@src/ Has [feature] been implemented? Show relevant files and functions"

# Pattern checking
gemini -p "@src/ Are there React hooks for WebSocket connections? List with file paths"

# Security measures
gemini -p "@src/ @api/ Are SQL injection protections implemented? Show input sanitization"
```

### Service-Specific Analysis

```bash
# User Service
gemini -p "@apps/user-service/ Show authentication, user management, and database integration"

# AI Service
gemini -p "@apps/ai-service/ Show language processing, translation, and ML model integration"

# Frontend
gemini -p "@apps/seller-dashboard/ Show React components, routing, and state management"
```

## Gemini vs Claude Decision Matrix

### Use Gemini CLI When:

- **Frontend/UI Tasks**: React, Next.js, CSS, UX analysis
- **Large Codebase**: Entire directories, multiple services
- **Cross-Dependencies**: Understanding service interactions
- **Performance Audit**: Application-wide bottleneck analysis
- **Security Review**: Comprehensive security across all services
- **Migration Planning**: Understanding upgrade impact
- **Architecture Review**: Project-wide patterns and decisions

### Use Claude When:

- **Single File**: Modifications or small-scale changes
- **Specific Implementation**: Individual service tasks
- **Test Writing**: Individual components or functions
- **Quick Debugging**: Specific code blocks
- **Task Management**: Planning and project management

## Project-Specific Notes

### Working Directory

**Always run from**: `/Users/us/Documents/projects/active/kadai/`

### Service Status

- **User Service**: Fully implemented (port 3001)
- **AI Service**: Core features working (port 8000)
- **Dashboard**: Frontend development active (port 4200)
- **Other Services**: Basic structure generated

### Expected Patterns

- **TDD**: Some failing tests during development (normal)
- **Database**: PostgreSQL entities with TypeORM
- **Types**: Shared via `@kadai/shared-types`
- **Testing**: Jest with 80% coverage requirement
- **Python**: Shared venv at project root

### Common Analysis Targets

```bash
# Most useful for current development
@apps/user-service/     # Working backend service
@apps/ai-service/       # Working AI service
@apps/seller-dashboard/ # Active frontend development
@libs/shared-types/     # Type definitions
@docs/ux/              # Design guidelines
```

## Best Practices

1. **Be Specific**: Ask for exact features, not general overviews
2. **Focus on Implementation**: Look for working code vs. boilerplate
3. **Check Cross-Service**: Always verify how services interact
4. **Verify Tests**: Ensure TDD compliance and coverage
5. **Review Security**: Check for vulnerabilities and best practices
6. **Frontend Excellence**: Leverage Gemini's superior frontend analysis
