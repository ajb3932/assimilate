<div align="center">
<a href="https://github.com/ajb3932/assimilate"><img src="./public/images/assimilate-logo.png" title="Assimilate Logo" style="max-width:100%;" width="128" /></a>
</div>

# 📊 Assimilate

Assimilate is a comprehensive monitoring and visualization dashboard for Borgmatic backup statistics. It provides real-time insights into your Borg backup repositories with a modern, responsive interface featuring dark mode support.

## ✨ Features

- 📈 Real-time backup statistics and trends
- 📊 Interactive charts and visualizations
- 🏥 Repository health monitoring with status indicators
- 📁 Archive history with filtering capabilities
- ⚙️ Borgmatic configuration viewer
- 🌓 Dark mode support with Borg-inspired theme
- 🔄 Auto-refresh every 30 seconds
- 📱 Responsive design for mobile and desktop

## 🐳 Docker

**Docker Compose (Recommended):**

Copy and paste this text into your `docker-compose.yml` file, make your own edits, and run it with `docker-compose up -d`

```yaml
services:
  assimilate-db:
    image: postgres:15-alpine
    container_name: assimilate-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-borgmatic_stats}
      POSTGRES_USER: ${POSTGRES_USER:-borgmatic}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
      POSTGRES_INITDB_ARGS: --encoding=UTF-8
    volumes:
      - ${DB_DATA_DIR}/data:/var/lib/postgresql/data
      - ${DB_DATA_DIR}/schema.sql:/docker-entrypoint-initdb.d/init.sql:ro
    ports:
      - ${POSTGRES_PORT:-5432}:5432
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U ${POSTGRES_USER:-borgmatic} -d
          ${POSTGRES_DB:-borgmatic_stats}
      interval: 30s
      timeout: 10s
      retries: 5
  assimilate-app:
    image: ajb3932/assimilate:latest
    container_name: assimilate-app
    restart: unless-stopped
    environment:
      # Database connection
      DATABASE_URL: postgresql://${POSTGRES_USER:-borgmatic}:${POSTGRES_PASSWORD:-password}@assimilate-db:5432/${POSTGRES_DB:-borgmatic_stats}
      POSTGRES_HOST: assimilate-db
      POSTGRES_PORT: 5432
      POSTGRES_DB: ${POSTGRES_DB:-borgmatic_stats}
      POSTGRES_USER: ${POSTGRES_USER:-borgmatic}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
      # Application settings
      PORT: 3001
      NODE_ENV: production
      # Borgmatic container name (adjust as needed)
      BORGMATIC_CONTAINER: ${BORGMATIC_CONTAINER:-borgmatic}
    ports:
      - 3001:3001
    volumes:
      # Mount Docker socket to access borgmatic container
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on:
      assimilate-db:
        condition: service_healthy
    healthcheck:
      test:
        - CMD
        - wget
        - --no-verbose
        - --tries=1
        - --spider
        - http://localhost:3001/api/health
      interval: 30s
      timeout: 10s
      retries: 3
networks: {}
```

**Docker CLI:**

⚠️ Must have a PostgreSQL database and borgmatic container running.

```bash
docker run -d -p 3001:3001 \
  -e POSTGRES_HOST=your_db_host \
  -e POSTGRES_PASSWORD=your_password \
  -e BORGMATIC_CONTAINER=borgmatic \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  ajb3932/assimilate:latest
```

## 🌍 Environment Variables

The following Environment Variables are available:

| Variable Name           | Description                                  | Default Value       |
|------------------------|----------------------------------------------|---------------------|
| `POSTGRES_DB`          | PostgreSQL database name                     | `borgmatic_stats`   |
| `POSTGRES_USER`        | PostgreSQL username                          | `borgmatic`         |
| `POSTGRES_PASSWORD`    | PostgreSQL password                          | `password`          |
| `POSTGRES_HOST`        | PostgreSQL host address                      | `assimilate-db`     |
| `POSTGRES_PORT`        | PostgreSQL port                              | `5432`              |
| `APP_PORT`             | Application port                             | `3001`              |
| `NODE_ENV`             | Node environment                             | `production`        |
| `BORGMATIC_CONTAINER`  | Name of your borgmatic container             | `borgmatic`         |
| `DB_DATA_DIR`          | Local directory for database persistence     | `./data/postgres`   |

## 🚀 First Run

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

## 💻 Usage

**Dashboard Overview (`/`)**

The main dashboard provides:
- Total archives, repositories, and backup sizes
- Average backup duration statistics
- Repository health status indicators:
  - 🟢 **Healthy**: Backup completed within 24 hours
  - 🟡 **Warning**: Last backup 24-48 hours ago
  - 🔴 **Critical**: No backup for more than 48 hours
- Interactive charts showing backup trends and distribution
- Archive size visualization over time

**Archive History**

Filter and view detailed backup history:
- Filter by repository type (local/remote)
- Filter by time range (24h, 7d, 30d, all)
- View archive details including size, duration, and file count

**Borgmatic Configuration**

View your borgmatic configuration including:
- Retention policies
- Repository locations
- Source directories
- Encryption status

## 🔧 Requirements

- Docker and Docker Compose
- Running Borgmatic container with backup data
- Access to Docker socket for container introspection
- PostgreSQL 15+ for statistics storage

## 🙋 I want to run this myself

🐳 Docker Compose (Recommended)
```bash
git clone https://github.com/ajb3932/assimilate.git
cd assimilate
cp .env.example .env
# Edit .env with your settings
docker-compose up -d --build
```

💾 Manual Installation
```bash
git clone https://github.com/ajb3932/assimilate.git
cd assimilate

# Backend setup
cd backend
npm install
node server.js &

# Frontend setup
cd ../frontend
npm install
npm run build
npm run preview
```

## 📝 How It Works

1. **Collector**: Python script runs hourly (via cron) to gather statistics from your borgmatic container
2. **Database**: PostgreSQL stores all backup statistics and repository information
3. **API**: Node.js/Express server provides REST API endpoints for statistics
4. **Frontend**: React application with Recharts for visualization and Framer Motion for animations

## 🛠️ Technology Stack

- **Frontend**: React, Vite, TailwindCSS, Recharts, Framer Motion, Lucide Icons
- **Backend**: Node.js, Express, PostgreSQL
- **Collector**: Python 3
- **Database**: PostgreSQL 15
- **Deployment**: Docker, Docker Compose

## 📊 API Endpoints

- `GET /api/health` - Health check
- `GET /api/stats` - Overall statistics
- `GET /api/repositories` - Repository information with health status
- `GET /api/archives?limit=N` - Recent archives
- `GET /api/trends?days=N` - Backup trends over time
- `GET /api/borgmatic-config` - Borgmatic configuration

## ☕ Support

<div align="center">
<a href='https://ko-fi.com/ajb3932' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi4.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' />
</a>
</div>