#!/bin/bash

# Kadai Development Environment Setup Script
# This script sets up the complete development environment including infrastructure and databases

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}🚀 Kadai Development Environment Setup${NC}"
echo -e "${BLUE}======================================${NC}"

# Function to show usage
show_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  setup     - Complete fresh setup (infrastructure + databases)"
    echo "  infra     - Setup infrastructure only (PostgreSQL, Redis, MongoDB containers)"
    echo "  mongo     - Setup MongoDB only (fresh setup)"
    echo "  test      - Test all connections"
    echo "  status    - Show status of all services"
    echo "  down      - Stop all services"
    echo "  cleanup   - Stop and remove all services and volumes"
    echo "  logs      - Show logs for all services"
    echo ""
    echo "Examples:"
    echo "  $0 setup    # Fresh complete setup"
    echo "  $0 test     # Test all connections"
    echo "  $0 status   # Check service status"
}

# Function to setup infrastructure
setup_infrastructure() {
    echo -e "${YELLOW}🏗️  Setting up infrastructure services...${NC}"
    $SCRIPT_DIR/start-infra.sh up
    
    # Wait a moment for services to start
    echo "⏳ Waiting for services to initialize..."
    sleep 5
    
    echo -e "${GREEN}✅ Infrastructure setup completed${NC}"
}

# Function to setup MongoDB
setup_mongodb() {
    echo -e "${YELLOW}🍃 Setting up MongoDB...${NC}"
    $SCRIPT_DIR/mongodb-setup.sh fresh
    echo -e "${GREEN}✅ MongoDB setup completed${NC}"
}

# Function to test all connections
test_connections() {
    echo -e "${YELLOW}🔍 Testing all connections...${NC}"
    
    # Test MongoDB
    echo -e "${BLUE}Testing MongoDB...${NC}"
    $SCRIPT_DIR/mongodb-setup.sh test
    
    # Test PostgreSQL (basic connection test)
    echo -e "${BLUE}Testing PostgreSQL...${NC}"
    if docker exec kadai-postgres psql -U kadai -d kadai -c "SELECT 1;" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL connection successful${NC}"
    else
        echo -e "${RED}❌ PostgreSQL connection failed${NC}"
    fi
    
    # Test Redis
    echo -e "${BLUE}Testing Redis...${NC}"
    if docker exec kadai-redis redis-cli ping >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Redis connection successful${NC}"
    else
        echo -e "${RED}❌ Redis connection failed${NC}"
    fi
    
    echo -e "${GREEN}✅ Connection tests completed${NC}"
}

# Function to show service status
show_status() {
    echo -e "${YELLOW}📊 Service Status${NC}"
    echo -e "${BLUE}==================${NC}"
    
    # Check Docker containers
    echo -e "${BLUE}Docker Containers:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(kadai|NAMES)"
    
    echo ""
    echo -e "${BLUE}MongoDB Status:${NC}"
    $SCRIPT_DIR/mongodb-setup.sh info
}

# Function to show logs
show_logs() {
    echo -e "${YELLOW}📋 Recent Service Logs${NC}"
    echo -e "${BLUE}=======================${NC}"
    
    echo -e "${BLUE}MongoDB Logs:${NC}"
    docker logs kadai-mongodb --tail 10
    
    echo -e "${BLUE}PostgreSQL Logs:${NC}"
    docker logs kadai-postgres --tail 10
    
    echo -e "${BLUE}Redis Logs:${NC}"
    docker logs kadai-redis --tail 10
}

# Function to stop services
stop_services() {
    echo -e "${YELLOW}🛑 Stopping all services...${NC}"
    $SCRIPT_DIR/start-infra.sh down
    echo -e "${GREEN}✅ All services stopped${NC}"
}

# Function to cleanup
cleanup_services() {
    echo -e "${YELLOW}🧹 Cleaning up all services and volumes...${NC}"
    $SCRIPT_DIR/start-infra.sh cleanup
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Main execution
case "${1:-setup}" in
    "setup")
        echo -e "${BLUE}🔄 Running complete fresh setup...${NC}"
        setup_infrastructure
        setup_mongodb
        test_connections
        echo -e "${GREEN}🎉 Complete setup finished!${NC}"
        echo -e "${BLUE}💡 Next steps:${NC}"
        echo "  - Run 'pnpm install' to install dependencies"
        echo "  - Run 'pnpm run db:migrate' to setup PostgreSQL schema"
        echo "  - Start development with 'nx serve <service-name>'"
        ;;
    "infra")
        setup_infrastructure
        ;;
    "mongo")
        setup_mongodb
        ;;
    "test")
        test_connections
        ;;
    "status")
        show_status
        ;;
    "down")
        stop_services
        ;;
    "cleanup")
        cleanup_services
        ;;
    "logs")
        show_logs
        ;;
    "help"|"-h"|"--help")
        show_usage
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo ""
        show_usage
        exit 1
        ;;
esac 