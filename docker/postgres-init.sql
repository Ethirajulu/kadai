-- =============================================================================
-- PostgreSQL Database Initialization Script
-- =============================================================================

-- Create additional databases for different environments
CREATE DATABASE kadai_test;
CREATE DATABASE kadai_staging;

-- Create read-only user for reporting/analytics
CREATE USER kadai_readonly WITH PASSWORD 'readonly123';
GRANT CONNECT ON DATABASE kadai TO kadai_readonly;
GRANT CONNECT ON DATABASE kadai_test TO kadai_readonly;
GRANT CONNECT ON DATABASE kadai_staging TO kadai_readonly;

-- Extensions for the main database
\c kadai;

-- UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PostGIS extension for geospatial features (if needed)
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- Full text search extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Create schemas for different modules
CREATE SCHEMA IF NOT EXISTS users;
CREATE SCHEMA IF NOT EXISTS products;
CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS analytics;

-- Grant permissions to main user
GRANT ALL PRIVILEGES ON SCHEMA users TO kadai;
GRANT ALL PRIVILEGES ON SCHEMA products TO kadai;
GRANT ALL PRIVILEGES ON SCHEMA orders TO kadai;
GRANT ALL PRIVILEGES ON SCHEMA payments TO kadai;
GRANT ALL PRIVILEGES ON SCHEMA analytics TO kadai;

-- Grant read-only access to readonly user
GRANT USAGE ON SCHEMA users TO kadai_readonly;
GRANT USAGE ON SCHEMA products TO kadai_readonly;
GRANT USAGE ON SCHEMA orders TO kadai_readonly;
GRANT USAGE ON SCHEMA payments TO kadai_readonly;
GRANT USAGE ON SCHEMA analytics TO kadai_readonly;

-- Log the initialization
\echo 'PostgreSQL initialization completed successfully'