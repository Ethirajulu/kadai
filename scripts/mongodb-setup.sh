#!/bin/bash

# MongoDB Setup and Management Script for Kadai

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="kadai-mongodb"
ROOT_USER="admin"
ROOT_PASS="admin123"
APP_USER="kadai"
APP_PASS="kadai123"
DATABASE="kadai"

echo -e "${YELLOW}🔧 Kadai MongoDB Setup Script${NC}"

# Function to check if container is running
check_container() {
    if ! docker ps | grep -q $CONTAINER_NAME; then
        echo -e "${RED}❌ MongoDB container is not running${NC}"
        echo "Start it with: docker-compose -f docker-compose.infra.yml up -d mongodb"
        exit 1
    fi
    echo -e "${GREEN}✅ MongoDB container is running${NC}"
}

# Function to wait for MongoDB to be ready
wait_for_mongodb() {
    echo "⏳ Waiting for MongoDB to be ready..."
    local retries=30
    while [ $retries -gt 0 ]; do
        if docker exec $CONTAINER_NAME mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ MongoDB is ready${NC}"
            return 0
        fi
        retries=$((retries-1))
        sleep 2
    done
    echo -e "${RED}❌ MongoDB failed to start within timeout${NC}"
    exit 1
}

# Function to test root connection
test_root_connection() {
    echo "🔐 Testing root user connection..."
    if docker exec $CONTAINER_NAME mongosh -u $ROOT_USER -p $ROOT_PASS --authenticationDatabase admin --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Root connection successful${NC}"
    else
        echo -e "${RED}❌ Root connection failed${NC}"
        exit 1
    fi
}

# Function to test app user connection
test_app_connection() {
    echo "🔐 Testing application user connection..."
    if docker exec $CONTAINER_NAME mongosh -u $APP_USER -p $APP_PASS $DATABASE --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Application user connection successful${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Application user not found or connection failed${NC}"
        return 1
    fi
}

# Function to show database info
show_database_info() {
    echo "📊 Database Information:"
    docker exec $CONTAINER_NAME mongosh -u $APP_USER -p $APP_PASS $DATABASE --eval "
        print('📁 Database: $DATABASE');
        print('📋 Collections:');
        db.getCollectionNames().forEach(name => print('  - ' + name));
        print('👤 Current user:', db.runCommand({connectionStatus: 1}).authInfo.authenticatedUsers[0]);
    " 2>/dev/null
}

# Function to run a fresh setup
fresh_setup() {
    echo -e "${YELLOW}🔄 Setting up MongoDB with fresh initialization...${NC}"
    
    # Stop and remove existing container and volume
    docker-compose -f docker-compose.infra.yml stop mongodb
    docker-compose -f docker-compose.infra.yml rm -f mongodb
    docker volume rm kadai-mongodb-data 2>/dev/null || true
    
    # Start fresh
    docker-compose -f docker-compose.infra.yml up -d mongodb
    wait_for_mongodb
    
    echo -e "${GREEN}✅ Fresh MongoDB setup completed${NC}"
}

# Main execution
case "${1:-test}" in
    "fresh")
        fresh_setup
        test_root_connection
        sleep 2  # Give initialization script time to run
        test_app_connection && show_database_info
        ;;
    "test")
        check_container
        test_root_connection
        if test_app_connection; then
            show_database_info
        else
            echo -e "${YELLOW}💡 Run '$0 fresh' to set up application user${NC}"
        fi
        ;;
    "info")
        check_container
        show_database_info
        ;;
    "logs")
        docker logs $CONTAINER_NAME | tail -20
        ;;
    *)
        echo "Usage: $0 {fresh|test|info|logs}"
        echo "  fresh - Complete fresh setup (destroys existing data)"
        echo "  test  - Test connections and show status"
        echo "  info  - Show database information"
        echo "  logs  - Show recent MongoDB logs"
        ;;
esac 