#!/usr/bin/env python3
"""
Borgmatic Statistics Collector
Collects backup statistics from Borgmatic running in Docker and stores them in PostgreSQL
"""

import json
import subprocess
import re
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
import logging
import sys
import os
import yaml
from typing import Dict, List, Optional, Tuple

# Configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': os.getenv('POSTGRES_PORT', 5432),
    'database': os.getenv('POSTGRES_DB', 'borgmatic_stats'),
    'user': os.getenv('POSTGRES_USER', 'borgmatic'),
    'password': os.getenv('POSTGRES_PASSWORD', 'password')
}

# Docker container name
DOCKER_CONTAINER = os.getenv('BORGMATIC_CONTAINER', 'borgmatic')

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class BorgmaticStatsCollector:
    def __init__(self):
        self.conn = None
        self.cursor = None
        
    def connect_db(self):
        """Establish database connection"""
        try:
            self.conn = psycopg2.connect(**DB_CONFIG)
            self.cursor = self.conn.cursor(cursor_factory=RealDictCursor)
            logger.info("Connected to PostgreSQL database")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            sys.exit(1)
    
    def close_db(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        logger.info("Database connection closed")
    
    def run_docker_command(self, command: str) -> str:
        """Execute command in Docker container"""
        full_command = f"docker exec {DOCKER_CONTAINER} {command}"
        try:
            result = subprocess.run(
                full_command,
                shell=True,
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout
        except subprocess.CalledProcessError as e:
            logger.error(f"Command failed: {full_command}")
            logger.error(f"Error: {e.stderr}")
            return None
    
    def get_borgmatic_info(self) -> Optional[List[Dict]]:
        """Get detailed repository and archive information"""
        output = self.run_docker_command("borgmatic info --json")
        if output:
            try:
                return json.loads(output)
            except json.JSONDecodeError:
                logger.error("Failed to parse borgmatic info JSON")
        return None
    
    def get_borgmatic_list(self) -> Optional[List[Dict]]:
        """Get list of archives"""
        output = self.run_docker_command("borgmatic list --json")
        if output:
            try:
                return json.loads(output)
            except json.JSONDecodeError:
                logger.error("Failed to parse borgmatic list JSON")
        return None
    
    def get_borgmatic_config(self) -> Optional[Dict]:
        """Get borgmatic configuration"""
        output = self.run_docker_command("cat /etc/borgmatic.d/config.yaml")
        if output:
            try:
                return yaml.safe_load(output)
            except yaml.YAMLError:
                logger.error("Failed to parse borgmatic config YAML")
        return None
    
    def parse_database_listing(self, path: str) -> List[Dict]:
        """Parse database backup information from archive listing"""
        command = f"borgmatic list --archive latest --find *borgmatic/*_databases"
        output = self.run_docker_command(command)
        
        databases = []
        if output:
            for line in output.split('\n'):
                # Parse database backup entries
                if 'borgmatic/mariadb_databases/' in line or 'borgmatic/postgresql_databases/' in line:
                    parts = line.split()
                    if len(parts) >= 7:
                        path_parts = parts[-1].split('/')
                        if len(path_parts) >= 3:
                            db_type = path_parts[1].replace('_databases', '')
                            if db_type == 'mariadb':
                                db_type = 'mariadb'
                            elif db_type == 'postgresql':
                                db_type = 'postgresql'
                            
                            # Check if it's a file (database dump)
                            if parts[0].startswith('-'):
                                databases.append({
                                    'type': db_type,
                                    'name': path_parts[-1],
                                    'container': path_parts[-2] if len(path_parts) > 3 else None,
                                    'size': int(parts[4]) if parts[4].isdigit() else 0,
                                    'path': parts[-1]
                                })
        
        return databases
    
    def upsert_repository(self, repo_data: Dict) -> int:
        """Insert or update repository and return its ID"""
        self.cursor.execute("""
            INSERT INTO repositories (name, path, location_type, repository_id, encryption_mode, last_modified)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (repository_id) 
            DO UPDATE SET 
                last_modified = EXCLUDED.last_modified,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        """, (
            repo_data['label'],
            repo_data['location'],
            repo_data['location_type'],
            repo_data['id'],
            repo_data.get('encryption_mode'),
            repo_data.get('last_modified')
        ))
        return self.cursor.fetchone()['id']
    
    def insert_repository_stats(self, repo_id: int, stats: Dict):
        """Insert repository statistics"""
        self.cursor.execute("""
            INSERT INTO repository_stats (
                repository_id, total_archives, total_size_bytes,
                total_compressed_size_bytes, total_deduplicated_size_bytes,
                unique_chunks, total_chunks, unique_csize, total_csize,
                compression_ratio, deduplication_ratio
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            repo_id,
            stats['total_archives'],
            stats['total_size'],
            stats['total_compressed'],
            stats['total_deduplicated'],
            stats.get('unique_chunks'),
            stats.get('total_chunks'),
            stats.get('unique_csize'),
            stats.get('total_csize'),
            stats.get('compression_ratio'),
            stats.get('deduplication_ratio')
        ))
    
    def insert_archive(self, repo_id: int, archive: Dict) -> int:
        """Insert archive and return its ID"""
        self.cursor.execute("""
            INSERT INTO backup_archives (
                repository_id, archive_name, archive_hash, hostname,
                username, comment, created_at, end_time, duration_seconds,
                original_size_bytes, compressed_size_bytes, deduplicated_size_bytes,
                number_of_files
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (repository_id, archive_hash) 
            DO UPDATE SET recorded_at = CURRENT_TIMESTAMP
            RETURNING id
        """, (
            repo_id,
            archive['name'],
            archive['id'],
            archive.get('hostname'),
            archive.get('username'),
            archive.get('comment', ''),
            archive['start'],
            archive.get('end'),
            archive.get('duration'),
            archive['stats']['original_size'],
            archive['stats']['compressed_size'],
            archive['stats']['deduplicated_size'],
            archive['stats']['nfiles']
        ))
        return self.cursor.fetchone()['id']
    
    def insert_backup_sources(self, repo_id: int, sources: List[str]):
        """Insert backup source directories"""
        for source in sources:
            self.cursor.execute("""
                INSERT INTO backup_sources (repository_id, source_path)
                VALUES (%s, %s)
                ON CONFLICT (repository_id, source_path) DO NOTHING
            """, (repo_id, source))
    
    def insert_pruning_config(self, repo_id: int, config: Dict):
        """Insert pruning configuration"""
        self.cursor.execute("""
            INSERT INTO pruning_config (
                repository_id, keep_daily, keep_weekly,
                keep_monthly, keep_yearly, keep_within
            ) VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (repository_id) 
            DO UPDATE SET 
                keep_daily = EXCLUDED.keep_daily,
                keep_weekly = EXCLUDED.keep_weekly,
                keep_monthly = EXCLUDED.keep_monthly,
                keep_yearly = EXCLUDED.keep_yearly,
                keep_within = EXCLUDED.keep_within,
                updated_at = CURRENT_TIMESTAMP
        """, (
            repo_id,
            config.get('keep_daily'),
            config.get('keep_weekly'),
            config.get('keep_monthly'),
            config.get('keep_yearly'),
            config.get('keep_within')
        ))
    
    def insert_database_backups(self, archive_id: int, databases: List[Dict]):
        """Insert database backup information"""
        for db in databases:
            self.cursor.execute("""
                INSERT INTO database_backups (
                    archive_id, database_type, database_name,
                    hostname, size_bytes, backup_path
                ) VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                archive_id,
                db['type'],
                db['name'],
                db.get('container'),
                db.get('size', 0),
                db.get('path')
            ))
    
    def collect_and_store_stats(self):
        """Main collection and storage process"""
        try:
            # Get borgmatic info
            info_data = self.get_borgmatic_info()
            if not info_data:
                logger.error("Failed to get borgmatic info")
                return
            
            # Get borgmatic config
            config = self.get_borgmatic_config()
            if not config:
                logger.warning("Failed to get borgmatic config")
            
            # Get database backups info
            databases = self.parse_database_listing("/mnt/borg-repository")
            
            # Process each repository
            for repo_info in info_data:
                repo_data = repo_info['repository']
                repo_data['label'] = repo_data.get('label', 'unknown')
                
                # Determine if remote
                is_remote = repo_data['location'].startswith('ssh://')
                repo_data['location_type'] = 'remote' if is_remote else 'local'
                
                # Get encryption info
                repo_data['encryption_mode'] = repo_info.get('encryption', {}).get('mode')
                
                # Upsert repository
                repo_id = self.upsert_repository(repo_data)
                logger.info(f"Processing repository: {repo_data['label']} (ID: {repo_id})")
                
                # Calculate statistics
                total_original = 0
                total_compressed = 0
                total_deduplicated = 0
                
                # Process archives
                archives = repo_info.get('archives', [])
                for archive in archives:
                    archive_id = self.insert_archive(repo_id, archive)
                    
                    # Add database backups for latest archive
                    if archive['name'] == archives[-1]['name'] and databases:
                        self.insert_database_backups(archive_id, databases)
                    
                    # Accumulate totals
                    total_original += archive['stats']['original_size']
                    total_compressed += archive['stats']['compressed_size']
                    total_deduplicated += archive['stats']['deduplicated_size']
                
                # Calculate ratios
                compression_ratio = None
                deduplication_ratio = None
                if total_original > 0:
                    compression_ratio = round((1 - total_compressed / total_original) * 100, 2)
                    deduplication_ratio = round((1 - total_deduplicated / total_original) * 100, 2)
                
                # Get cache stats
                cache_stats = repo_info.get('cache', {}).get('stats', {})
                
                # Insert repository stats
                stats = {
                    'total_archives': len(archives),
                    'total_size': total_original,
                    'total_compressed': total_compressed,
                    'total_deduplicated': total_deduplicated,
                    'unique_chunks': cache_stats.get('total_unique_chunks'),
                    'total_chunks': cache_stats.get('total_chunks'),
                    'unique_csize': cache_stats.get('unique_csize'),
                    'total_csize': cache_stats.get('total_csize'),
                    'compression_ratio': compression_ratio,
                    'deduplication_ratio': deduplication_ratio
                }
                self.insert_repository_stats(repo_id, stats)
                
                # Insert config data if available
                if config:
                    # Insert source directories
                    if 'source_directories' in config:
                        self.insert_backup_sources(repo_id, config['source_directories'])
                    
                    # Insert pruning config
                    pruning = {
                        'keep_daily': config.get('keep_daily'),
                        'keep_weekly': config.get('keep_weekly'),
                        'keep_monthly': config.get('keep_monthly'),
                        'keep_yearly': config.get('keep_yearly'),
                        'keep_within': config.get('keep_within')
                    }
                    self.insert_pruning_config(repo_id, pruning)
            
            # Commit all changes
            self.conn.commit()
            logger.info("All statistics successfully stored in database")
            
            # Log summary
            self.cursor.execute("SELECT * FROM backup_summary")
            summary = self.cursor.fetchall()
            for row in summary:
                logger.info(f"Repository: {row['repository_name']} ({row['location_type']})")
                logger.info(f"  - Total backups: {row['total_backups']}")
                logger.info(f"  - Last backup: {row['last_backup_time']}")
                logger.info(f"  - Hours since last: {row['hours_since_last_backup']:.1f}")
                
        except Exception as e:
            logger.error(f"Error collecting stats: {e}")
            if self.conn:
                self.conn.rollback()
            raise


def main():
    """Main entry point"""
    collector = BorgmaticStatsCollector()
    
    try:
        collector.connect_db()
        collector.collect_and_store_stats()
    except KeyboardInterrupt:
        logger.info("Collection interrupted by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)
    finally:
        collector.close_db()


if __name__ == "__main__":
    main()