# Multi-stage build for assimilate-app
FROM node:18-alpine AS frontend-builder

# Build frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Main application image
FROM node:18-alpine

# Install Python, cron, and other dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    postgresql-dev \
    gcc \
    musl-dev \
    dcron \
    docker-cli

# Create app directory
WORKDIR /app

# Copy and install Python requirements
COPY backend/collector/requirements.txt ./collector/
RUN pip3 install --no-cache-dir --break-system-packages -r ./collector/requirements.txt

# Copy and install Node.js dependencies
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy application files
COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist ./public

# Create cron job for collector
RUN echo "0 * * * * cd /app && python3 collector/collector.py >> /var/log/collector.log 2>&1" > /etc/crontabs/root

# Create startup script
RUN printf '#!/bin/sh\nset -e\n\necho "Starting cron daemon..."\ncrond -l 2 -f &\n\necho "Running initial data collection..."\npython3 /app/collector/collector.py >> /var/log/collector.log 2>&1 &\n\necho "Starting API server..."\nexec node server.js\n' > /app/start.sh

RUN chmod +x /app/start.sh

# Create log file and set permissions
RUN touch /var/log/collector.log && chmod 666 /var/log/collector.log

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start application
CMD ["/app/start.sh"]