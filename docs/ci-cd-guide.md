# CI/CD Pipeline Guide

## Overview

The Kadai project uses a comprehensive CI/CD pipeline built with GitHub Actions to ensure code quality, security, and reliable deployments across all microservices.

## Workflow Architecture

### 1. Main CI/CD Pipeline (`ci-main.yml`)

**Trigger**: Push to `main`/`develop`, Pull Requests
**Purpose**: Comprehensive build, test, and validation pipeline

**Key Features**:
- **Path-based Change Detection**: Only builds services that have changed
- **Parallel Execution**: Runs builds, tests, and linting in parallel for performance
- **Nx Integration**: Leverages Nx for efficient monorepo management
- **Caching**: Aggressive caching of dependencies and build artifacts
- **Multi-service Support**: Handles all 10+ microservices

**Workflow Steps**:
1. **Detect Changes**: Identifies which services/libraries have changed
2. **Setup & Cache**: Installs dependencies with PNPM and caches node_modules
3. **Lint**: Runs ESLint across all changed projects
4. **Test**: Executes unit tests with coverage
5. **Build**: Compiles all projects
6. **Docker Build**: Builds container images for changed services
7. **E2E Tests**: Runs end-to-end tests with real services
8. **Security Scan**: Vulnerability scanning with Trivy
9. **Notification**: Reports pipeline status

### 2. Docker Build Pipeline (`docker-build.yml`)

**Trigger**: Push to `main`/`develop`, Tags
**Purpose**: Advanced Docker image building and registry management

**Key Features**:
- **Multi-platform Builds**: AMD64 and ARM64 support
- **Layer Caching**: GitHub Actions cache for faster builds
- **Image Scanning**: Security vulnerability scanning
- **SBOM Generation**: Software Bill of Materials for compliance
- **Registry Integration**: GitHub Container Registry (GHCR)

**Build Matrix**:
```yaml
services: [api-gateway, user-service, product-service, order-service, 
          payment-service, notification-service, broadcast-service, 
          analytics-service, seller-dashboard, ai-service]
```

### 3. Code Quality Pipeline (`code-quality.yml`)

**Trigger**: Push, Pull Requests, Daily schedule
**Purpose**: Comprehensive code quality and security analysis

**Quality Checks**:
- **ESLint**: TypeScript/JavaScript linting
- **Prettier**: Code formatting validation
- **SonarQube**: Code quality metrics and technical debt
- **CodeQL**: Security vulnerability analysis
- **Dependency Scanning**: npm audit and Snyk integration
- **License Compliance**: Ensures approved licenses only
- **Docker Security**: Container image vulnerability scanning
- **IaC Security**: Infrastructure as Code security with Checkov

### 4. Staging Deployment (`deploy-staging.yml`)

**Trigger**: Push to `develop`, Manual dispatch
**Purpose**: Automated deployment to staging environment

**Deployment Features**:
- **Service Selection**: Deploy specific services or all
- **Blue-Green Strategy**: Zero-downtime deployments
- **Health Checks**: Automated service validation
- **Database Migrations**: Automated schema updates
- **Smoke Tests**: Post-deployment validation
- **Performance Tests**: K6 load testing
- **Security Tests**: OWASP ZAP scanning
- **Auto-rollback**: Failure recovery

### 5. Production Deployment (`deploy-production.yml`)

**Trigger**: Release tags (`v*.*.*`), Manual dispatch
**Purpose**: Production deployment with comprehensive safety checks

**Production Safety**:
- **Tag Validation**: Ensures proper semantic versioning
- **Image Verification**: Confirms Docker images exist
- **Pre-deployment Tests**: Full test suite execution
- **Blue-Green Deployment**: Zero-downtime strategy
- **Traffic Switching**: Gradual traffic migration
- **Monitoring**: Enhanced post-deployment monitoring
- **Emergency Rollback**: Automatic failure recovery

### 6. Release Management (`release.yml`)

**Trigger**: Push to `main`, Manual dispatch
**Purpose**: Automated release creation and artifact generation

**Release Process**:
- **Version Calculation**: Semantic versioning based on commits
- **Changelog Generation**: Automated from commit messages
- **Docker Tagging**: Release-tagged container images
- **Artifact Creation**: Deployment packages
- **GitHub Release**: Automated release notes
- **Milestone Management**: Next version planning

## Environment Configuration

### Required Secrets

```bash
# AWS Credentials (Production)
AWS_ACCESS_KEY_ID_PROD
AWS_SECRET_ACCESS_KEY_PROD
AWS_REGION_PROD

# AWS Credentials (Staging)
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION

# Container Registry
GITHUB_TOKEN  # Automatically provided

# Code Quality
SONAR_TOKEN
SONAR_HOST_URL
SNYK_TOKEN

# Backup and Storage
BACKUP_BUCKET
```

### Environment Variables

```bash
# Container Registry
REGISTRY=ghcr.io
IMAGE_NAME=${{ github.repository }}

# Node.js Configuration
NODE_VERSION=22.16.0
PYTHON_VERSION=3.11
PNPM_VERSION=8
```

## Service Architecture

### Microservices Matrix

| Service | Port | Language | Framework | Purpose |
|---------|------|----------|-----------|---------|
| api-gateway | 4000 | TypeScript | NestJS | API Gateway & Authentication |
| user-service | 3001 | TypeScript | NestJS | User Management |
| product-service | 3002 | TypeScript | NestJS | Product Catalog |
| order-service | 3003 | TypeScript | NestJS | Order Processing |
| payment-service | 3004 | TypeScript | NestJS | Payment Handling |
| notification-service | 3005 | TypeScript | NestJS | Notifications |
| broadcast-service | 3006 | TypeScript | NestJS | Marketing Campaigns |
| analytics-service | 3007 | TypeScript | NestJS | Analytics & Reporting |
| seller-dashboard | 3000 | TypeScript | Next.js | Frontend Application |
| ai-service | 8000 | Python | FastAPI | AI/ML Services |

## Deployment Strategies

### Blue-Green Deployment

1. **Blue Environment**: Current production version
2. **Green Environment**: New version deployment
3. **Traffic Switch**: Gradual migration from blue to green
4. **Cleanup**: Remove old blue environment

### Database Migrations

```bash
# Automated migration process
1. Backup current database
2. Deploy new application version
3. Run database migrations
4. Verify data integrity
5. Switch traffic to new version
```

### Rollback Strategy

```bash
# Emergency rollback procedure
1. Detect failure (automated or manual)
2. Restore previous deployment
3. Rollback database if needed
4. Verify service health
5. Investigate root cause
```

## Monitoring and Observability

### Health Checks

All services expose health endpoints:
- `GET /health` - Basic health status
- `GET /health/detailed` - Detailed system status
- Database connectivity
- External service dependencies

### Metrics and Alerts

- **Response Time**: API response time monitoring
- **Error Rate**: Service error rate tracking
- **Throughput**: Request volume metrics
- **Resource Usage**: CPU, memory, disk usage
- **Database Performance**: Query performance metrics

## Security Measures

### Vulnerability Scanning

1. **Dependency Scanning**: npm audit, Snyk
2. **Container Scanning**: Trivy security scanner
3. **Code Analysis**: CodeQL for security vulnerabilities
4. **Infrastructure Scanning**: Checkov for IaC security

### Compliance

- **License Compliance**: Automated license checking
- **SBOM Generation**: Software Bill of Materials
- **Security Reports**: SARIF format for GitHub Security tab
- **Audit Logs**: Deployment and access logging

## Performance Optimization

### Build Optimization

- **Nx Affected**: Only build changed projects
- **Parallel Execution**: Multiple concurrent jobs
- **Layer Caching**: Docker layer and GitHub Actions cache
- **Incremental Builds**: Nx incremental compilation

### Test Optimization

- **Parallel Testing**: Concurrent test execution
- **Test Sharding**: Distribute tests across runners
- **Smart Testing**: Only test affected projects
- **Coverage Caching**: Reuse coverage data

## Troubleshooting Guide

### Common Issues

1. **Build Failures**
   ```bash
   # Check build logs
   npx nx run-many -t build --parallel=1 --verbose
   
   # Clear cache
   npx nx reset
   ```

2. **Test Failures**
   ```bash
   # Run specific test
   npx nx test <service-name>
   
   # Debug test
   npx nx test <service-name> --watch
   ```

3. **Docker Build Issues**
   ```bash
   # Build locally
   docker build -f apps/<service>/Dockerfile .
   
   # Check multi-platform
   docker buildx build --platform linux/amd64,linux/arm64 .
   ```

4. **Deployment Failures**
   ```bash
   # Check Kubernetes status
   kubectl get pods -n kadai-production
   kubectl logs <pod-name> -n kadai-production
   
   # Check service health
   kubectl describe service <service-name> -n kadai-production
   ```

### Debug Commands

```bash
# Check Nx project graph
npx nx graph

# Lint specific project
npx nx lint <project-name>

# Test with coverage
npx nx test <project-name> --coverage

# Build specific project
npx nx build <project-name>

# Check affected projects
npx nx affected:build

# Reset Nx cache
npx nx reset
```

## Best Practices

### Commit Messages

Use conventional commits for automated changelog generation:

```bash
feat: add new payment method
fix: resolve user authentication issue
perf: optimize database queries
refactor: improve code structure
docs: update API documentation
test: add unit tests for user service
```

### Branch Strategy

```bash
main      # Production releases (protected)
develop   # Staging deployments
feature/* # Feature development
hotfix/*  # Production hotfixes
release/* # Release preparation
```

### Pull Request Process

1. **Create feature branch** from `develop`
2. **Implement changes** with tests
3. **Open pull request** to `develop`
4. **Code review** and approval
5. **Merge to develop** triggers staging deployment
6. **Merge to main** triggers production release

### Security Guidelines

1. **Never commit secrets** to repository
2. **Use environment variables** for configuration
3. **Scan dependencies** regularly
4. **Update base images** frequently
5. **Review security reports** in GitHub Security tab

## Maintenance

### Regular Tasks

- **Weekly**: Review security scan results
- **Monthly**: Update dependencies and base images
- **Quarterly**: Review and optimize pipeline performance
- **Annually**: Update CI/CD tools and workflows

### Monitoring

- **Pipeline Success Rate**: Target >95%
- **Build Time**: Target <10 minutes
- **Test Coverage**: Target >80%
- **Security Issues**: Zero high/critical issues

---

This CI/CD pipeline provides enterprise-grade automation for the Kadai platform, ensuring reliable, secure, and efficient software delivery across all microservices.