# Port Configuration Guide

## Service Port Assignments

Each microservice has been assigned a unique port to avoid conflicts when running multiple services simultaneously.

### Port Mapping

| Service | App Port | Debug Port | Environment Variables | Purpose |
|---------|----------|------------|-----------------------|---------|
| API Gateway | 3000 | 9229 | `API_GATEWAY_PORT`, `API_GATEWAY_DEBUG_PORT` | Main entry point |
| User Service | 3001 | 9230 | `USER_SERVICE_PORT`, `USER_SERVICE_DEBUG_PORT` | Authentication & user management |
| Product Service | 3002 | 9231 | `PRODUCT_SERVICE_PORT`, `PRODUCT_SERVICE_DEBUG_PORT` | Product catalog |
| Order Service | 3003 | 9232 | `ORDER_SERVICE_PORT`, `ORDER_SERVICE_DEBUG_PORT` | Order processing |
| Payment Service | 3004 | 9233 | `PAYMENT_SERVICE_PORT`, `PAYMENT_SERVICE_DEBUG_PORT` | Payment processing |
| Notification Service | 3005 | 9234 | `NOTIFICATION_SERVICE_PORT`, `NOTIFICATION_SERVICE_DEBUG_PORT` | Messaging & notifications |
| Broadcast Service | 3006 | 9235 | `BROADCAST_SERVICE_PORT`, `BROADCAST_SERVICE_DEBUG_PORT` | Broadcast messaging |
| Analytics Service | 3007 | 9236 | `ANALYTICS_SERVICE_PORT`, `ANALYTICS_SERVICE_DEBUG_PORT` | Analytics & reporting |
| AI Service | 8000 | N/A | `AI_SERVICE_PORT` | AI/ML processing (Python) |
| Seller Dashboard | 4200 | N/A | `SELLER_DASHBOARD_PORT` | Frontend (Next.js) |

### Debug Port Information

Each Node.js service is configured with a unique debug port to enable simultaneous debugging:
- Debug ports start from **9229** (API Gateway) and increment by 1 for each service
- Python services (AI Service) and frontend (Seller Dashboard) don't use Node.js debugging
- In production, debug ports are disabled for security (`inspect: false`)
- Configuration uses separate `"inspect": "inspect"`, `"host": "0.0.0.0"`, and `"port": <debug_port>` properties

### Running Services

#### Single Service
```bash
# Run individual services
npx nx serve notification-service    # Port 3005
npx nx serve user-service           # Port 3001
npx nx serve ai-service             # Port 8000
npx nx serve seller-dashboard       # Port 4200
```

#### Multiple Services
```bash
# Run multiple services in parallel
npx nx run-many -t serve --projects=api-gateway,user-service,notification-service --parallel=3

# Run all backend services
npx nx run-many -t serve --projects=api-gateway,user-service,product-service,order-service,payment-service,notification-service,broadcast-service,analytics-service --parallel=8

# Run with AI service
npx nx run-many -t serve --projects=ai-service,notification-service --parallel=2
```

### Environment Configuration

Ports are configured in `.env` file:

```bash
# Service Ports (Each microservice gets its own port)
API_GATEWAY_PORT=3000
USER_SERVICE_PORT=3001
PRODUCT_SERVICE_PORT=3002
ORDER_SERVICE_PORT=3003
PAYMENT_SERVICE_PORT=3004
NOTIFICATION_SERVICE_PORT=3005
BROADCAST_SERVICE_PORT=3006
ANALYTICS_SERVICE_PORT=3007
AI_SERVICE_PORT=8000
SELLER_DASHBOARD_PORT=4200
```

### Service URLs (Development)

When running locally, services will be available at:

- **API Gateway**: http://localhost:3000/api
- **User Service**: http://localhost:3001/api
- **Product Service**: http://localhost:3002/api
- **Order Service**: http://localhost:3003/api
- **Payment Service**: http://localhost:3004/api
- **Notification Service**: http://localhost:3005/api
- **Broadcast Service**: http://localhost:3006/api
- **Analytics Service**: http://localhost:3007/api
- **AI Service**: http://localhost:8000/api/v1
- **Seller Dashboard**: http://localhost:4200

### API Documentation

When running in development mode, Swagger docs are available at:
- **API Gateway**: http://localhost:3000/api/docs
- **User Service**: http://localhost:3001/api/docs
- **AI Service**: http://localhost:8000/docs

### Inter-Service Communication

Services communicate with each other using the configured ports. Update your service URLs in:
- API Gateway proxy configuration
- Service discovery configuration
- Load balancer configuration

### Docker Compose

When using Docker Compose, the same port mapping is used:

```yaml
services:
  api-gateway:
    ports:
      - "3000:3000"
  user-service:
    ports:
      - "3001:3001"
  notification-service:
    ports:
      - "3005:3005"
  # ... etc
```

### Production Considerations

In production:
1. Use a load balancer (nginx/HAProxy) as the main entry point
2. Services can run on internal ports and not be exposed externally
3. Only the API Gateway and frontend should be publicly accessible
4. Consider using service mesh for inter-service communication

### Troubleshooting

#### Port Already in Use
If you get "port already in use" errors:
```bash
# Check what's using a port
lsof -i :3005

# Kill a process using a port
kill -9 $(lsof -t -i:3005)
```

#### Service Not Starting
1. Check if the environment variable is correctly set
2. Verify the port is not already in use
3. Check if the service is trying to bind to the correct interface (0.0.0.0 vs localhost)