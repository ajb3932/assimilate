const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const { Pool } = require('pg');
const fs = require('fs').promises;
const yaml = require('js-yaml');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/borgmatic_stats',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Middleware - Minimal security for HTTP home use
app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());

// Simple headers middleware for HTTP
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// Serve static files from the React app build
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'healthy',
      timestamp: result.rows[0].now,
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Get overall statistics
app.get('/api/stats', async (req, res) => {
  try {
    const query = `
      SELECT
        COUNT(DISTINCT r.id) as total_repositories,
        COUNT(ba.id) as total_archives,
        COALESCE(SUM(ba.original_size_bytes), 0) as total_size,
        COALESCE(AVG(ba.duration_seconds), 0) as avg_duration,
        MAX(ba.created_at) as latest_backup,
        COUNT(DISTINCT CASE WHEN ba.created_at > NOW() - INTERVAL '24 hours' THEN r.id END) as healthy_repos,
        COUNT(DISTINCT CASE WHEN ba.created_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours' THEN r.id END) as warning_repos,
        COUNT(DISTINCT CASE WHEN ba.created_at < NOW() - INTERVAL '48 hours' OR ba.created_at IS NULL THEN r.id END) as critical_repos
      FROM repositories r
      LEFT JOIN backup_archives ba ON r.id = ba.repository_id
    `;

    const result = await pool.query(query);
    const stats = result.rows[0];

    // Convert bigint values to numbers for JSON serialization
    stats.total_size = Number(stats.total_size);
    stats.avg_duration = Number(stats.avg_duration);
    stats.total_archives = Number(stats.total_archives);
    stats.total_repositories = Number(stats.total_repositories);
    stats.healthy_repos = Number(stats.healthy_repos);
    stats.warning_repos = Number(stats.warning_repos);
    stats.critical_repos = Number(stats.critical_repos);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get repository information
app.get('/api/repositories', async (req, res) => {
  try {
    const query = `
      SELECT
        r.id,
        r.name,
        r.path,
        r.location_type,
        r.size_on_disk_bytes,
        COUNT(ba.id) as archive_count,
        COALESCE(SUM(ba.original_size_bytes), 0) as total_size,
        MAX(ba.created_at) as last_backup,
        EXTRACT(EPOCH FROM (NOW() - MAX(ba.created_at)))/3600 as hours_since_backup,
        CASE
          WHEN MAX(ba.created_at) > NOW() - INTERVAL '24 hours' THEN 'healthy'
          WHEN MAX(ba.created_at) > NOW() - INTERVAL '48 hours' THEN 'warning'
          ELSE 'critical'
        END as health_status
      FROM repositories r
      LEFT JOIN backup_archives ba ON r.id = ba.repository_id
      GROUP BY r.id, r.name, r.path, r.location_type, r.size_on_disk_bytes
      ORDER BY r.name
    `;

    const result = await pool.query(query);
    const repositories = result.rows.map(repo => ({
      ...repo,
      archive_count: Number(repo.archive_count),
      total_size: Number(repo.total_size),
      size_on_disk_bytes: repo.size_on_disk_bytes ? Number(repo.size_on_disk_bytes) : null,
      hours_since_backup: repo.hours_since_backup ? Number(repo.hours_since_backup) : null
    }));

    res.json(repositories);
  } catch (error) {
    console.error('Error fetching repositories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent backup archives
app.get('/api/archives', async (req, res) => {
  try {
    const limit = req.query.limit || 50;
    const query = `
      SELECT
        ba.id,
        ba.archive_name,
        ba.created_at,
        ba.duration_seconds,
        ba.original_size_bytes,
        ba.compressed_size_bytes,
        ba.deduplicated_size_bytes,
        ba.number_of_files,
        r.name as repository_name,
        r.location_type
      FROM backup_archives ba
      JOIN repositories r ON ba.repository_id = r.id
      ORDER BY ba.created_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    const archives = result.rows.map(archive => ({
      ...archive,
      duration_seconds: Number(archive.duration_seconds),
      original_size_bytes: Number(archive.original_size_bytes),
      compressed_size_bytes: Number(archive.compressed_size_bytes),
      deduplicated_size_bytes: Number(archive.deduplicated_size_bytes),
      number_of_files: Number(archive.number_of_files)
    }));

    res.json(archives);
  } catch (error) {
    console.error('Error fetching archives:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get historical data for trends
app.get('/api/trends', async (req, res) => {
  try {
    const days = req.query.days || 30;
    const query = `
      WITH daily_stats AS (
        SELECT
          DATE(ba.created_at) as date,
          r.location_type,
          AVG(ba.original_size_bytes) as avg_size,
          AVG(ba.duration_seconds) as avg_duration,
          COUNT(*) as backup_count
        FROM backup_archives ba
        JOIN repositories r ON ba.repository_id = r.id
        WHERE ba.created_at > NOW() - INTERVAL '${days} days'
        GROUP BY DATE(ba.created_at), r.location_type
        ORDER BY date
      )
      SELECT
        date,
        COALESCE(SUM(CASE WHEN location_type = 'local' THEN avg_size END) / 1024 / 1024, 0) as local_size_mb,
        COALESCE(SUM(CASE WHEN location_type = 'remote' THEN avg_size END) / 1024 / 1024, 0) as remote_size_mb,
        COALESCE(AVG(avg_duration), 0) as avg_duration,
        COALESCE(SUM(backup_count), 0) as total_backups
      FROM daily_stats
      GROUP BY date
      ORDER BY date
    `;

    const result = await pool.query(query);
    const trends = result.rows.map(row => ({
      date: row.date,
      localSize: Number(row.local_size_mb),
      remoteSize: Number(row.remote_size_mb),
      avgDuration: Number(row.avg_duration),
      totalBackups: Number(row.total_backups)
    }));

    res.json(trends);
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get backup health status
app.get('/api/health-status', async (req, res) => {
  try {
    const query = `
      SELECT
        repository_name,
        location_type,
        last_backup,
        hours_since_backup,
        health_status
      FROM get_backup_health_status()
      ORDER BY repository_name
    `;

    const result = await pool.query(query);
    const healthStatus = result.rows.map(row => ({
      ...row,
      hours_since_backup: row.hours_since_backup ? Number(row.hours_since_backup) : null
    }));

    res.json(healthStatus);
  } catch (error) {
    console.error('Error fetching health status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get borgmatic configuration
app.get('/api/borgmatic-config', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const containerName = process.env.BORGMATIC_CONTAINER || 'borgmatic';
    const configDir = '/etc/borgmatic.d';

    // List files in the borgmatic container
    let listOutput;
    try {
      const { stdout } = await execAsync(`docker exec ${containerName} ls ${configDir}`);
      listOutput = stdout;
    } catch (err) {
      console.error('Error listing borgmatic config files:', err);
      return res.json({ configs: [], error: 'Unable to access borgmatic container or config directory' });
    }

    const files = listOutput.split('\n').filter(f => f.trim());
    const yamlFiles = files.filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));

    if (yamlFiles.length === 0) {
      return res.json({ configs: [], error: 'No configuration files found' });
    }

    // Read and parse each config file from the borgmatic container
    const configs = [];
    for (const file of yamlFiles) {
      try {
        const { stdout: content } = await execAsync(`docker exec ${containerName} cat ${configDir}/${file}`);
        const parsed = yaml.load(content);

        configs.push({
          filename: file,
          config: parsed
        });
      } catch (err) {
        console.error(`Error reading config file ${file}:`, err);
        configs.push({
          filename: file,
          error: `Failed to parse: ${err.message}`
        });
      }
    }

    res.json({ configs });
  } catch (error) {
    console.error('Error fetching borgmatic config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Catch all handler for non-API routes - serve React app
app.use((req, res, next) => {
  // Only handle non-API routes
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`🤖 Assimilate backend server running on port ${port}`);
  console.log(`📊 API endpoints available at http://localhost:${port}/api`);
});

module.exports = app;