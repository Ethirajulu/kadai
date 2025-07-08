# Inter-Service Communication Guide

## Overview

This document outlines the communication protocols and patterns used between microservices in the Kadai platform. All services communicate through standardized interfaces and follow established patterns for reliability and scalability.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway    │    │  Microservices  │
│  (Dashboard)    │───▶│     (Port 4000)  │───▶│   (Port 3001+)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Message Queue  │
                       │   (RabbitMQ)     │
                       └──────────────────┘
```

## Communication Patterns

### 1. Synchronous Communication (REST API)

**Used for**: Direct service-to-service calls, real-time data requests

**Pattern**: Request-Response through API Gateway
- All external requests go through the API Gateway (port 4000)
- API Gateway routes requests to appropriate microservices
- Services communicate internally using HTTP REST APIs
- JWT authentication for secure inter-service communication

**Example**:
```typescript
// Client → API Gateway → User Service
GET /api/v1/users/profile
Authorization: Bearer <jwt-token>

// API Gateway → User Service
GET /users/profile
X-Gateway-Service: user-service
X-Request-ID: req_123456789
Authorization: Bearer <jwt-token>
```

### 2. Asynchronous Communication (Message Queue)

**Used for**: Event-driven operations, background processing, notifications

**Pattern**: Publish-Subscribe using RabbitMQ
- Services publish domain events to message queues
- Interested services subscribe to relevant events
- Ensures loose coupling and eventual consistency

**Example**:
```typescript
// Order Service publishes event
await messageQueue.publish('order.created', {
  orderId: 'order_123',
  sellerId: 'seller_456',
  amount: 999.99,
  timestamp: '2024-07-05T14:30:00Z'
});

// Notification Service subscribes and sends SMS
// Analytics Service subscribes and updates metrics
// Payment Service subscribes and processes payment
```

## Service Registry & Discovery

### Service Registration

Services automatically register with the API Gateway on startup:

```typescript
// Auto-registration in API Gateway
const services = [
  { name: 'user-service', port: 3001 },
  { name: 'product-service', port: 3002 },
  { name: 'order-service', port: 3003 },
  { name: 'payment-service', port: 3004 },
  { name: 'notification-service', port: 3005 },
  { name: 'broadcast-service', port: 3006 },
  { name: 'analytics-service', port: 3007 },
  { name: 'ai-service', port: 8000 },
];
```

### Health Monitoring

- API Gateway performs health checks every 30 seconds
- Health endpoint: `GET /health` on each service
- Unhealthy services are temporarily removed from routing
- Circuit breaker pattern prevents cascading failures

## Authentication & Security

### JWT-based Authentication

1. **User Authentication**: Users authenticate with User Service
2. **Token Generation**: User Service issues JWT tokens
3. **Token Validation**: API Gateway validates tokens for all requests
4. **Service-to-Service**: Internal services use service tokens

```typescript
// JWT Payload Structure
{
  sub: "user_id_123",
  email: "seller@example.com",
  role: "seller",
  iat: 1720186200,
  exp: 1720272600
}
```

### Rate Limiting

API Gateway implements multi-tier rate limiting:
- **Short-term**: 10 requests/second
- **Medium-term**: 100 requests/10 seconds  
- **Long-term**: 1000 requests/minute
- **Payment endpoints**: 10 requests/minute (stricter)

## API Standards

### Request/Response Format

All APIs follow consistent patterns:

```typescript
// Standard Response Format
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  statusCode?: number;
  timestamp?: string;
  requestId?: string;
}

// Error Response Format
interface ErrorResponse {
  success: false;
  error: string;
  statusCode: number;
  timestamp: string;
  details?: any;
}
```

### HTTP Status Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `422`: Validation Error
- `500`: Internal Server Error
- `502`: Bad Gateway (service unavailable)
- `503`: Service Unavailable

### Request Headers

Standard headers for inter-service communication:
- `Authorization`: Bearer token for authentication
- `X-Request-ID`: Unique request identifier for tracing
- `X-Gateway-Service`: Source service name
- `X-Forwarded-For`: Original client IP
- `Content-Type`: Always `application/json`

## Service Endpoints

### API Gateway Routes

| Route Pattern | Target Service | Authentication | Description |
|---------------|----------------|----------------|-------------|
| `/api/v1/auth/*` | user-service | No | Authentication endpoints |
| `/api/v1/users/*` | user-service | Yes | User management |
| `/api/v1/products/*` | product-service | Yes | Product catalog |
| `/api/v1/orders/*` | order-service | Yes | Order management |
| `/api/v1/payments/*` | payment-service | Yes | Payment processing |
| `/api/v1/notifications/*` | notification-service | Yes | Notifications |
| `/api/v1/broadcasts/*` | broadcast-service | Yes | Broadcast campaigns |
| `/api/v1/analytics/*` | analytics-service | Yes | Analytics & reporting |
| `/api/v1/ai/*` | ai-service | Yes | AI services |

### Health & Monitoring

- `GET /api/v1/health` - Overall system health
- `GET /api/v1/health/detailed` - Detailed service health
- `GET /api/v1/gateway/status` - Gateway status
- `GET /api/v1/gateway/services` - Registered services

## Message Queue Events

### Event Types

```typescript
enum EventType {
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  PRODUCT_CREATED = 'product.created',
  PRODUCT_UPDATED = 'product.updated',
  PRODUCT_STOCK_UPDATED = 'product.stock.updated',
  ORDER_CREATED = 'order.created',
  ORDER_STATUS_UPDATED = 'order.status.updated',
  PAYMENT_PROCESSED = 'payment.processed',
  PAYMENT_FAILED = 'payment.failed',
  NOTIFICATION_SENT = 'notification.sent',
}
```

### Event Flow Examples

#### Order Creation Flow
1. Client creates order via API Gateway
2. Order Service validates and creates order
3. Order Service publishes `order.created` event
4. Payment Service processes payment
5. Notification Service sends confirmation SMS
6. Analytics Service updates metrics

#### Stock Update Flow
1. Product Service updates stock quantity
2. Product Service publishes `product.stock.updated` event
3. Analytics Service tracks inventory changes
4. Notification Service alerts on low stock

## Error Handling

### Retry Mechanisms

- **API Gateway**: 3 retries with exponential backoff
- **Message Queue**: Dead letter queue for failed messages
- **Circuit Breaker**: Fail fast when service is down

### Graceful Degradation

- Non-critical services can fail without affecting core functionality
- API Gateway returns cached responses when possible
- Fallback mechanisms for essential operations

## Monitoring & Observability

### Logging

All services log in structured JSON format:
```json
{
  "timestamp": "2024-07-05T14:30:00Z",
  "level": "info",
  "service": "user-service",
  "requestId": "req_123456789",
  "message": "User created successfully",
  "userId": "user_789",
  "duration": 45
}
```

### Metrics

Key metrics tracked:
- Request/response times
- Error rates
- Service availability
- Queue message counts
- Database connection pools

### Tracing

- Request ID propagation across services
- Distributed tracing for complex operations
- Performance bottleneck identification

## Development Guidelines

### Service Implementation

1. **Health Endpoint**: Every service must expose `/health`
2. **Graceful Shutdown**: Handle SIGTERM/SIGINT signals
3. **Environment Config**: Use environment variables for configuration
4. **Logging**: Structured logging with correlation IDs
5. **Error Handling**: Consistent error response format

### Testing

1. **Unit Tests**: Individual service logic
2. **Integration Tests**: Service-to-service communication
3. **Contract Tests**: API contract validation
4. **End-to-End Tests**: Full workflow testing

### Deployment

1. **Docker Containers**: All services containerized
2. **Health Checks**: Docker health check implementation
3. **Rolling Updates**: Zero-downtime deployments
4. **Environment Separation**: Dev/staging/production configs

## Security Considerations

### Network Security

- All inter-service communication over secure networks
- No direct database access from external services
- Rate limiting and DDoS protection

### Data Protection

- Sensitive data encryption in transit and at rest
- PII data handling compliance
- Audit logging for sensitive operations

### Authentication Security

- JWT token expiration and rotation
- Service-to-service authentication
- API key management for external integrations

## Performance Optimization

### Caching Strategy

- Redis for session and frequently accessed data
- API response caching where appropriate
- Database query result caching

### Load Balancing

- API Gateway distributes load across service instances
- Database connection pooling
- Message queue load distribution

### Resource Management

- CPU and memory limits for containers
- Database connection pool sizing
- Message queue capacity planning

---

## Quick Reference

### Key URLs
- **API Gateway**: http://localhost:4000
- **API Documentation**: http://localhost:4000/api/docs
- **RabbitMQ Management**: http://localhost:15672
- **Health Check**: http://localhost:4000/api/v1/health

### Default Credentials
- **RabbitMQ**: kadai/kadai123
- **Database**: kadai/kadai123
- **JWT Secret**: kadai-jwt-secret-dev-key-2024

### Service Ports
- API Gateway: 4000
- User Service: 3001
- Product Service: 3002
- Order Service: 3003
- Payment Service: 3004
- Notification Service: 3005
- Broadcast Service: 3006
- Analytics Service: 3007
- AI Service: 8000