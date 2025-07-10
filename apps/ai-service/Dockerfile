# =============================================================================
# AI Service Dockerfile (Python FastAPI)
# =============================================================================

FROM python:3.10.17-slim AS dependencies

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY apps/ai-service/requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# -----------------------------------------------------------------------------
# Production stage
# -----------------------------------------------------------------------------
FROM python:3.10.17-slim AS production

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy requirements and install dependencies
COPY apps/ai-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY apps/ai-service/src ./

# Create non-root user
RUN groupadd -r python && useradd -r -g python python

# Change ownership
RUN chown -R python:python /app
USER python

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Start the application
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]