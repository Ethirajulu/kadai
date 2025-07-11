import { config } from 'dotenv';

// Load test environment variables (silent mode to avoid console logs)
config({ path: '.env.test', debug: false });