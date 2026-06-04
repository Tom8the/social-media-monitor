# MySQL Database Setup Script
$mysqlBin = "C:\Program Files\MySQL\MySQL Server 8.4\bin"
$mysql = "$mysqlBin\mysql.exe"
$dbName = "social_media_monitor"

Write-Host "Starting MySQL database setup..."

# Test connection
Write-Host "Testing MySQL connection..."
& $mysql -u root --pipe --protocol=pipe -e "SELECT 'Connected' AS status;"

# Create database
Write-Host "Creating database..."
& $mysql -u root --pipe --protocol=pipe -e "CREATE DATABASE IF NOT EXISTS $dbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Create tables
Write-Host "Creating tables..."

# Platforms table
Write-Host "Creating platforms table..."
& $mysql -u root --pipe --protocol=pipe $dbName -e "
CREATE TABLE IF NOT EXISTS platforms (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    icon_url VARCHAR(512) DEFAULT NULL,
    color VARCHAR(8) DEFAULT '#1890FF',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"

# Insert platforms data
Write-Host "Inserting platforms data..."
& $mysql -u root --pipe --protocol=pipe $dbName -e "
INSERT IGNORE INTO platforms (code, name, color, sort_order) VALUES
    ('douyin', 'douyin', '#FE2C55', 1),
    ('xiaohongshu', 'xiaohongshu', '#FF2442', 2),
    ('videohao', 'videohao', '#07C160', 3);
"

# Account groups table
Write-Host "Creating account_groups table..."
& $mysql -u root --pipe --protocol=pipe $dbName -e "
CREATE TABLE IF NOT EXISTS account_groups (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    description VARCHAR(256) DEFAULT NULL,
    platform_code VARCHAR(32) DEFAULT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_platform (platform_code),
    KEY idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"

# Accounts table
Write-Host "Creating accounts table..."
& $mysql -u root --pipe --protocol=pipe $dbName -e "
CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    platform_code VARCHAR(32) NOT NULL,
    unique_id VARCHAR(128) NOT NULL,
    sec_uid VARCHAR(256) DEFAULT NULL,
    nickname VARCHAR(128) NOT NULL,
    avatar VARCHAR(512) DEFAULT NULL,
    signature VARCHAR(512) DEFAULT NULL,
    follower_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    following_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    like_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    video_count INT UNSIGNED NOT NULL DEFAULT 0,
    verified TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    remark VARCHAR(256) DEFAULT NULL,
    group_id VARCHAR(36) DEFAULT NULL,
    last_fetch_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_platform_uniqueid (platform_code, unique_id),
    KEY idx_status (status),
    KEY idx_group (group_id),
    KEY idx_follower (follower_count),
    KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"

# Videos table
Write-Host "Creating videos table..."
& $mysql -u root --pipe --protocol=pipe $dbName -e "
CREATE TABLE IF NOT EXISTS videos (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL,
    platform_code VARCHAR(32) NOT NULL,
    video_id VARCHAR(128) NOT NULL,
    title VARCHAR(512) NOT NULL,
    description TEXT DEFAULT NULL,
    cover_url VARCHAR(512) DEFAULT NULL,
    video_url VARCHAR(512) DEFAULT NULL,
    duration INT UNSIGNED NOT NULL DEFAULT 0,
    topic_tags VARCHAR(256) DEFAULT NULL,
    play_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    like_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    comment_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    share_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    collect_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    published_at DATETIME DEFAULT NULL,
    fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_platform_videoid (platform_code, video_id),
    KEY idx_account (account_id),
    KEY idx_platform (platform_code),
    KEY idx_published (published_at),
    KEY idx_play (play_count),
    KEY idx_like (like_count),
    KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"

# Sync logs table
Write-Host "Creating sync_logs table..."
& $mysql -u root --pipe --protocol=pipe $dbName -e "
CREATE TABLE IF NOT EXISTS sync_logs (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL,
    sync_type VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    videos_added INT UNSIGNED NOT NULL DEFAULT 0,
    videos_updated INT UNSIGNED NOT NULL DEFAULT 0,
    error_message TEXT DEFAULT NULL,
    request_params JSON DEFAULT NULL,
    response_data JSON DEFAULT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME DEFAULT NULL,
    duration_ms INT UNSIGNED DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_account (account_id),
    KEY idx_status (status),
    KEY idx_started (started_at),
    KEY idx_type (sync_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"

# Alerts table
Write-Host "Creating alerts table..."
& $mysql -u root --pipe --protocol=pipe $dbName -e "
CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    alert_type VARCHAR(32) NOT NULL,
    level VARCHAR(16) NOT NULL DEFAULT 'warning',
    title VARCHAR(128) NOT NULL,
    description TEXT DEFAULT NULL,
    account_id VARCHAR(36) DEFAULT NULL,
    video_id VARCHAR(36) DEFAULT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'unresolved',
    resolved_at DATETIME DEFAULT NULL,
    resolved_by VARCHAR(64) DEFAULT NULL,
    resolve_note TEXT DEFAULT NULL,
    alert_data JSON DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_type (alert_type),
    KEY idx_level (level),
    KEY idx_status (status),
    KEY idx_account (account_id),
    KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"

# Daily stats table
Write-Host "Creating daily_stats table..."
& $mysql -u root --pipe --protocol=pipe $dbName -e "
CREATE TABLE IF NOT EXISTS daily_stats (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    stat_date DATE NOT NULL,
    platform_code VARCHAR(32) DEFAULT NULL,
    account_id VARCHAR(36) DEFAULT NULL,
    total_accounts INT UNSIGNED NOT NULL DEFAULT 0,
    total_videos INT UNSIGNED NOT NULL DEFAULT 0,
    total_plays BIGINT UNSIGNED NOT NULL DEFAULT 0,
    total_likes BIGINT UNSIGNED NOT NULL DEFAULT 0,
    total_comments BIGINT UNSIGNED NOT NULL DEFAULT 0,
    total_shares BIGINT UNSIGNED NOT NULL DEFAULT 0,
    total_collects BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_date_platform_account (stat_date, platform_code, account_id),
    KEY idx_date (stat_date),
    KEY idx_platform (platform_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"

# Verify tables
Write-Host "Verifying database..."
& $mysql -u root --pipe --protocol=pipe $dbName -e "SHOW TABLES;"

Write-Host "`nDatabase setup completed successfully!"
Write-Host "Database: $dbName"
