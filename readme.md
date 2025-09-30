# Assimilate Docker Setup

This setup provides a complete dockerized environment for the Assimilate app with two containers:

## Containers

1. **assimilate-db**: PostgreSQL database container
2. **assimilate-app**: Application container running:
   - Python collector.py (cron job every hour)
   - Node.js API server
   - React frontend (served by API server)

## Quick Start

1. **Copy environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Edit .env file** with your configuration:
   - Update `POSTGRES_PASSWORD` with a secure password
   - Adjust `BORGMATIC_CONTAINER` to match your borgmatic container name
   - Set data directory paths as needed

3. **Start the application**:
   ```bash
   docker-compose up -d
   ```

4. **Access the application**:
   - Frontend: http://localhost:3001
   - API: http://localhost:3001/api/health

## Configuration

### Environment Variables

See `.env.example` for all available configuration options.

### Borgmatic Integration

The collector requires access to your borgmatic container. Ensure:
- The borgmatic container is running and named correctly (default: `borgmatic`)
- The application container has access to the Docker socket

### Data Persistence

- Database data is stored in `./data/postgres` by default
- Borgmatic config and data directories are mounted read-only

## Monitoring

- Container health checks are configured for both services
- Collector logs are available at `/var/log/collector.log` inside the app container
- API server logs are available via `docker-compose logs assimilate-app`

## Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f assimilate-app
docker-compose logs -f assimilate-db

# Stop services
docker-compose down

# Rebuild application container
docker-compose up -d --build assimilate-app

# Run collector manually
docker-compose exec assimilate-app python3 collector/collector.py
```