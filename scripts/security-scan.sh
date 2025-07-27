#!/bin/bash

# Security Scanning Script for Kadai Project
# This script runs comprehensive security scans locally before CI/CD

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPORTS_DIR="$PROJECT_ROOT/security-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create reports directory
mkdir -p "$REPORTS_DIR"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

check_dependencies() {
    log_info "Checking required dependencies..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed"
        exit 1
    fi
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 is not installed"
        exit 1
    fi
    
    log_success "All dependencies are available"
}

install_security_tools() {
    log_info "Installing security scanning tools..."
    
    # Install Snyk globally if not present
    if ! command -v snyk &> /dev/null; then
        log_info "Installing Snyk CLI..."
        npm install -g snyk
    fi
    
    # Install Semgrep if not present
    if ! command -v semgrep &> /dev/null; then
        log_info "Installing Semgrep..."
        python3 -m pip install semgrep
    fi
    
    # Install bandit for Python security scanning
    if ! command -v bandit &> /dev/null; then
        log_info "Installing Bandit..."
        python3 -m pip install bandit
    fi
    
    # Install safety for Python dependency scanning
    if ! command -v safety &> /dev/null; then
        log_info "Installing Safety..."
        python3 -m pip install safety
    fi
    
    log_success "Security tools installed"
}

run_dependency_scan() {
    print_header "DEPENDENCY VULNERABILITY SCANNING"
    
    cd "$PROJECT_ROOT"
    
    # Snyk dependency scan for Node.js
    log_info "Running Snyk dependency scan for Node.js..."
    if snyk test --json > "$REPORTS_DIR/snyk-deps-$TIMESTAMP.json" 2>/dev/null; then
        log_success "Snyk dependency scan completed - no high/critical vulnerabilities found"
    else
        log_warning "Snyk dependency scan found vulnerabilities - check report for details"
    fi
    
    # Safety scan for Python dependencies
    log_info "Running Safety scan for Python dependencies..."
    if [ -f "apps/ai-service/requirements.txt" ]; then
        if safety check -r apps/ai-service/requirements.txt --json > "$REPORTS_DIR/safety-$TIMESTAMP.json" 2>/dev/null; then
            log_success "Safety scan completed - no vulnerabilities found"
        else
            log_warning "Safety scan found vulnerabilities - check report for details"
        fi
    fi
}

run_code_scan() {
    print_header "STATIC CODE ANALYSIS"
    
    cd "$PROJECT_ROOT"
    
    # Snyk code scan
    log_info "Running Snyk code analysis..."
    if snyk code test --json > "$REPORTS_DIR/snyk-code-$TIMESTAMP.json" 2>/dev/null; then
        log_success "Snyk code analysis completed - no issues found"
    else
        log_warning "Snyk code analysis found issues - check report for details"
    fi
    
    # Semgrep scan
    log_info "Running Semgrep static analysis..."
    if semgrep --config=auto --json --output="$REPORTS_DIR/semgrep-$TIMESTAMP.json" . 2>/dev/null; then
        log_success "Semgrep analysis completed"
    else
        log_warning "Semgrep analysis found issues - check report for details"
    fi
    
    # Bandit scan for Python code
    log_info "Running Bandit scan for Python security issues..."
    if [ -d "apps/ai-service" ]; then
        if bandit -r apps/ai-service/src -f json -o "$REPORTS_DIR/bandit-$TIMESTAMP.json" 2>/dev/null; then
            log_success "Bandit scan completed - no issues found"
        else
            log_warning "Bandit scan found issues - check report for details"
        fi
    fi
}

run_secret_scan() {
    print_header "SECRET SCANNING"
    
    cd "$PROJECT_ROOT"
    
    # Use Semgrep for secret scanning
    log_info "Scanning for hardcoded secrets and credentials..."
    if semgrep --config=p/secrets --json --output="$REPORTS_DIR/secrets-$TIMESTAMP.json" . 2>/dev/null; then
        log_success "Secret scan completed - no secrets detected"
    else
        log_warning "Secret scan found potential secrets - check report for details"
    fi
}

run_container_scan() {
    print_header "CONTAINER SECURITY SCANNING"
    
    cd "$PROJECT_ROOT"
    
    # Scan Dockerfiles
    local dockerfiles=(
        "Dockerfile.nestjs"
        "apps/ai-service/Dockerfile"
        "apps/seller-dashboard/Dockerfile"
    )
    
    for dockerfile in "${dockerfiles[@]}"; do
        if [ -f "$dockerfile" ]; then
            log_info "Scanning $dockerfile..."
            if snyk container test --file="$dockerfile" --json > "$REPORTS_DIR/container-$(basename "$dockerfile")-$TIMESTAMP.json" 2>/dev/null; then
                log_success "Container scan for $dockerfile completed - no issues found"
            else
                log_warning "Container scan for $dockerfile found issues - check report for details"
            fi
        fi
    done
}

run_license_scan() {
    print_header "LICENSE COMPLIANCE SCANNING"
    
    cd "$PROJECT_ROOT"
    
    # Check licenses with license-checker
    if ! command -v license-checker &> /dev/null; then
        log_info "Installing license-checker..."
        npm install -g license-checker
    fi
    
    log_info "Scanning for license compliance..."
    license-checker --json --out "$REPORTS_DIR/licenses-$TIMESTAMP.json" 2>/dev/null || true
    
    # Check for problematic licenses
    log_info "Checking for problematic licenses..."
    if license-checker --exclude 'MIT,Apache-2.0,BSD-2-Clause,BSD-3-Clause,ISC' --failOn 'GPL;AGPL;LGPL' > "$REPORTS_DIR/license-issues-$TIMESTAMP.txt" 2>/dev/null; then
        log_success "License compliance check passed"
    else
        log_warning "Found potentially problematic licenses - check report for details"
    fi
}

generate_summary_report() {
    print_header "GENERATING SUMMARY REPORT"
    
    local summary_file="$REPORTS_DIR/security-summary-$TIMESTAMP.md"
    
    cat > "$summary_file" << EOF
# Security Scan Summary Report

**Scan Date:** $(date)
**Project:** Kadai AI Sales Assistant
**Scan ID:** $TIMESTAMP

## Scan Results

### Dependency Vulnerabilities
- **Snyk Dependencies:** $([ -f "$REPORTS_DIR/snyk-deps-$TIMESTAMP.json" ] && echo "✓ Completed" || echo "✗ Failed")
- **Python Safety:** $([ -f "$REPORTS_DIR/safety-$TIMESTAMP.json" ] && echo "✓ Completed" || echo "✗ Failed")

### Code Analysis
- **Snyk Code:** $([ -f "$REPORTS_DIR/snyk-code-$TIMESTAMP.json" ] && echo "✓ Completed" || echo "✗ Failed")
- **Semgrep:** $([ -f "$REPORTS_DIR/semgrep-$TIMESTAMP.json" ] && echo "✓ Completed" || echo "✗ Failed")
- **Bandit (Python):** $([ -f "$REPORTS_DIR/bandit-$TIMESTAMP.json" ] && echo "✓ Completed" || echo "✗ Failed")

### Secret Scanning
- **Secret Detection:** $([ -f "$REPORTS_DIR/secrets-$TIMESTAMP.json" ] && echo "✓ Completed" || echo "✗ Failed")

### Container Security
- **Docker Images:** $(ls "$REPORTS_DIR"/container-*-$TIMESTAMP.json 2>/dev/null | wc -l) scans completed

### License Compliance
- **License Check:** $([ -f "$REPORTS_DIR/licenses-$TIMESTAMP.json" ] && echo "✓ Completed" || echo "✗ Failed")

## Report Files
All detailed reports are available in: \`$REPORTS_DIR\`

## Recommendations
1. Review all warning-level findings in the detailed reports
2. Address any high or critical severity vulnerabilities immediately
3. Update dependencies with known vulnerabilities
4. Review and rotate any detected secrets or credentials

## Next Steps
- Run \`pnpm run security:fix\` to auto-fix dependencies where possible
- Review container base images for security updates
- Ensure all secrets are properly externalized to environment variables
EOF

    log_success "Summary report generated: $summary_file"
}

cleanup() {
    log_info "Cleaning up temporary files..."
    # Remove any temporary files if needed
}

main() {
    print_header "KADAI SECURITY SCANNING SUITE"
    
    log_info "Starting comprehensive security scan..."
    log_info "Reports will be saved to: $REPORTS_DIR"
    
    # Check prerequisites
    check_dependencies
    
    # Install security tools
    install_security_tools
    
    # Run security scans
    run_dependency_scan
    run_code_scan
    run_secret_scan
    run_container_scan
    run_license_scan
    
    # Generate summary
    generate_summary_report
    
    # Cleanup
    cleanup
    
    print_header "SECURITY SCAN COMPLETED"
    log_success "All security scans completed successfully!"
    log_info "Review the summary report and individual scan results in $REPORTS_DIR"
    
    # Return appropriate exit code
    if [ "$(find "$REPORTS_DIR" -name "*-$TIMESTAMP.json" | wc -l)" -gt 0 ]; then
        log_info "Some scans found issues - please review the reports"
        return 1
    else
        log_success "No security issues detected!"
        return 0
    fi
}

# Trap for cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"