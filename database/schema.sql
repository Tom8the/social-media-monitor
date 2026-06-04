-- ================================================
-- 社交媒体监控系统 MySQL 数据库设计
-- Social Media Monitor Database Schema
-- ================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS social_media_monitor
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE social_media_monitor;

-- ================================================
-- 表1：平台配置表 (platforms)
-- ================================================
CREATE TABLE IF NOT EXISTS `platforms` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `code` VARCHAR(32) NOT NULL COMMENT '平台代码：douyin/xiaohongshu/videohao',
    `name` VARCHAR(64) NOT NULL COMMENT '平台名称',
    `icon_url` VARCHAR(512) DEFAULT NULL COMMENT '平台图标URL',
    `color` VARCHAR(8) DEFAULT '#1890FF' COMMENT '主题色',
    `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用：0-禁用 1-启用',
    `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序顺序',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code` (`code`),
    KEY `idx_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='平台配置表';

-- 初始化平台数据
INSERT INTO `platforms` (`code`, `name`, `color`, `sort_order`) VALUES
    ('douyin', '抖音', '#FE2C55', 1),
    ('xiaohongshu', '小红书', '#FF2442', 2),
    ('videohao', '微信视频号', '#07C160', 3);

-- ================================================
-- 表2：账号分组表 (account_groups)
-- ================================================
CREATE TABLE IF NOT EXISTS `account_groups` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键UUID',
    `name` VARCHAR(64) NOT NULL COMMENT '分组名称',
    `description` VARCHAR(256) DEFAULT NULL COMMENT '分组描述',
    `platform_code` VARCHAR(32) DEFAULT NULL COMMENT '所属平台代码',
    `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序顺序',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `idx_platform` (`platform_code`),
    KEY `idx_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账号分组表';

-- ================================================
-- 表3：社交账号表 (accounts)
-- ================================================
CREATE TABLE IF NOT EXISTS `accounts` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键UUID',
    `platform_code` VARCHAR(32) NOT NULL COMMENT '平台代码',
    `unique_id` VARCHAR(128) NOT NULL COMMENT '平台唯一标识（如抖音号/小红书ID）',
    `sec_uid` VARCHAR(256) DEFAULT NULL COMMENT '抖音安全UID',
    `nickname` VARCHAR(128) NOT NULL COMMENT '账号昵称',
    `avatar` VARCHAR(512) DEFAULT NULL COMMENT '头像URL',
    `signature` VARCHAR(512) DEFAULT NULL COMMENT '个人简介',
    `follower_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '粉丝数',
    `following_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '关注数',
    `like_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '获赞数',
    `video_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '作品数',
    `verified` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否认证：0-未认证 1-已认证',
    `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态：active-活跃 inactive-停用 error-异常',
    `remark` VARCHAR(256) DEFAULT NULL COMMENT '备注',
    `group_id` VARCHAR(36) DEFAULT NULL COMMENT '所属分组ID',
    `last_fetch_at` DATETIME DEFAULT NULL COMMENT '最后采集时间',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_platform_uniqueid` (`platform_code`, `unique_id`),
    UNIQUE KEY `uk_sec_uid` (`sec_uid`),
    KEY `idx_status` (`status`),
    KEY `idx_group` (`group_id`),
    KEY `idx_follower` (`follower_count`),
    KEY `idx_updated` (`updated_at`),
    CONSTRAINT `fk_accounts_platform` FOREIGN KEY (`platform_code`) REFERENCES `platforms` (`code`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_accounts_group` FOREIGN KEY (`group_id`) REFERENCES `account_groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社交账号表';

-- ================================================
-- 表4：视频表 (videos)
-- ================================================
CREATE TABLE IF NOT EXISTS `videos` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键UUID',
    `account_id` VARCHAR(36) NOT NULL COMMENT '所属账号ID',
    `platform_code` VARCHAR(32) NOT NULL COMMENT '平台代码',
    `video_id` VARCHAR(128) NOT NULL COMMENT '平台视频ID',
    `content_type` VARCHAR(16) NOT NULL DEFAULT 'video' COMMENT '内容类型: video视频, note图文',
    `title` VARCHAR(512) NOT NULL COMMENT '视频标题',
    `description` TEXT DEFAULT NULL COMMENT '视频描述',
    `cover_url` VARCHAR(512) DEFAULT NULL COMMENT '封面图URL',
    `video_url` VARCHAR(512) DEFAULT NULL COMMENT '视频URL',
    `duration` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '时长（秒）',
    `topic_tags` VARCHAR(256) DEFAULT NULL COMMENT '话题标签，逗号分隔',
    `play_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '播放量',
    `like_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '点赞数',
    `comment_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '评论数',
    `share_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '分享数',
    `collect_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '收藏数',
    `published_at` DATETIME DEFAULT NULL COMMENT '发布时间',
    `fetched_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '采集时间',
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否删除：0-正常 1-已删除',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_platform_videoid` (`platform_code`, `video_id`),
    KEY `idx_account` (`account_id`),
    KEY `idx_platform` (`platform_code`),
    KEY `idx_published` (`published_at`),
    KEY `idx_play` (`play_count`),
    KEY `idx_like` (`like_count`),
    KEY `idx_updated` (`updated_at`),
    CONSTRAINT `fk_videos_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_videos_platform` FOREIGN KEY (`platform_code`) REFERENCES `platforms` (`code`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='视频表';

-- ================================================
-- 表5：同步日志表 (sync_logs)
-- ================================================
CREATE TABLE IF NOT EXISTS `sync_logs` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键UUID',
    `account_id` VARCHAR(36) NOT NULL COMMENT '账号ID',
    `sync_type` VARCHAR(32) NOT NULL COMMENT '同步类型：fetch_account/fetch_videos/qr_login',
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/running/success/failed',
    `videos_added` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '新增视频数',
    `videos_updated` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '更新视频数',
    `error_message` TEXT DEFAULT NULL COMMENT '错误信息',
    `request_params` JSON DEFAULT NULL COMMENT '请求参数',
    `response_data` JSON DEFAULT NULL COMMENT '响应数据',
    `started_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
    `finished_at` DATETIME DEFAULT NULL COMMENT '完成时间',
    `duration_ms` INT UNSIGNED DEFAULT NULL COMMENT '耗时（毫秒）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_account` (`account_id`),
    KEY `idx_status` (`status`),
    KEY `idx_started` (`started_at`),
    KEY `idx_type` (`sync_type`),
    CONSTRAINT `fk_synclogs_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='同步日志表';

-- ================================================
-- 表6：告警表 (alerts)
-- ================================================
CREATE TABLE IF NOT EXISTS `alerts` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键UUID',
    `alert_type` VARCHAR(32) NOT NULL COMMENT '告警类型：cookie_expired/sync_failed/data_anomaly/threshold_exceeded',
    `level` VARCHAR(16) NOT NULL DEFAULT 'warning' COMMENT '级别：info/warning/critical',
    `title` VARCHAR(128) NOT NULL COMMENT '告警标题',
    `description` TEXT DEFAULT NULL COMMENT '告警描述',
    `account_id` VARCHAR(36) DEFAULT NULL COMMENT '关联账号ID',
    `video_id` VARCHAR(36) DEFAULT NULL COMMENT '关联视频ID',
    `status` VARCHAR(16) NOT NULL DEFAULT 'unresolved' COMMENT '状态：unresolved/resolved/ignored',
    `resolved_at` DATETIME DEFAULT NULL COMMENT '解决时间',
    `resolved_by` VARCHAR(64) DEFAULT NULL COMMENT '解决人',
    `resolve_note` TEXT DEFAULT NULL COMMENT '解决备注',
    `alert_data` JSON DEFAULT NULL COMMENT '告警附加数据',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `idx_type` (`alert_type`),
    KEY `idx_level` (`level`),
    KEY `idx_status` (`status`),
    KEY `idx_account` (`account_id`),
    KEY `idx_created` (`created_at`),
    CONSTRAINT `fk_alerts_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警表';

-- ================================================
-- 表7：每日统计数据表 (daily_stats) - 预计算表
-- ================================================
CREATE TABLE IF NOT EXISTS `daily_stats` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键UUID',
    `stat_date` DATE NOT NULL COMMENT '统计日期',
    `platform_code` VARCHAR(32) DEFAULT NULL COMMENT '平台代码（NULL表示总计）',
    `account_id` VARCHAR(36) DEFAULT NULL COMMENT '账号ID（NULL表示该平台总计）',
    `total_accounts` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '账号数',
    `total_videos` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '视频总数',
    `total_plays` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '总播放量',
    `total_likes` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '总点赞量',
    `total_comments` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '总评论量',
    `total_shares` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '总分享量',
    `total_collects` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '总收藏量',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_date_platform_account` (`stat_date`, `platform_code`, `account_id`),
    KEY `idx_date` (`stat_date`),
    KEY `idx_platform` (`platform_code`),
    CONSTRAINT `fk_dailystats_platform` FOREIGN KEY (`platform_code`) REFERENCES `platforms` (`code`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日统计数据表';

-- ================================================
-- 视图：账号视图（带平台信息）
-- ================================================
CREATE OR REPLACE VIEW `v_accounts_with_platform` AS
SELECT
    a.*,
    p.name AS platform_name,
    p.icon_url AS platform_icon,
    p.color AS platform_color,
    g.name AS group_name
FROM accounts a
LEFT JOIN platforms p ON a.platform_code = p.code
LEFT JOIN account_groups g ON a.group_id = g.id;

-- ================================================
-- 视图：视频视图（带账号信息）
-- ================================================
CREATE OR REPLACE VIEW `v_videos_with_account` AS
SELECT
    v.*,
    a.nickname AS account_nickname,
    a.avatar AS account_avatar,
    a.platform_code,
    p.name AS platform_name,
    p.color AS platform_color
FROM videos v
LEFT JOIN accounts a ON v.account_id = a.id
LEFT JOIN platforms p ON v.platform_code = p.code;

-- ================================================
-- 存储过程：每日统计更新
-- ================================================
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS `sp_update_daily_stats`(IN p_date DATE)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SELECT 'Error occurred' AS result;
    END;

    -- 删除指定日期的旧数据
    DELETE FROM daily_stats WHERE stat_date = p_date;

    -- 插入平台级统计
    INSERT INTO daily_stats (id, stat_date, platform_code, total_accounts, total_videos, total_plays, total_likes, total_comments, total_shares, total_collects)
    SELECT
        UUID(),
        p_date,
        p.code,
        COUNT(DISTINCT a.id),
        COUNT(DISTINCT v.id),
        COALESCE(SUM(v.play_count), 0),
        COALESCE(SUM(v.like_count), 0),
        COALESCE(SUM(v.comment_count), 0),
        COALESCE(SUM(v.share_count), 0),
        COALESCE(SUM(v.collect_count), 0)
    FROM platforms p
    LEFT JOIN accounts a ON a.platform_code = p.code AND DATE(a.created_at) <= p_date
    LEFT JOIN videos v ON v.account_id = a.id AND DATE(v.fetched_at) = p_date
    WHERE p.enabled = 1
    GROUP BY p.code;

    -- 插入总计统计
    INSERT INTO daily_stats (id, stat_date, platform_code, total_accounts, total_videos, total_plays, total_likes, total_comments, total_shares, total_collects)
    SELECT
        UUID(),
        p_date,
        NULL,
        COUNT(DISTINCT a.id),
        COUNT(DISTINCT v.id),
        COALESCE(SUM(v.play_count), 0),
        COALESCE(SUM(v.like_count), 0),
        COALESCE(SUM(v.comment_count), 0),
        COALESCE(SUM(v.share_count), 0),
        COALESCE(SUM(v.collect_count), 0)
    FROM accounts a
    LEFT JOIN videos v ON v.account_id = a.id AND DATE(v.fetched_at) = p_date
    WHERE DATE(a.created_at) <= p_date;
END //
DELIMITER ;

-- ================================================
-- 索引优化建议（可选）
-- ================================================
-- 对于大数据量场景，可考虑以下优化：
-- 1. 对 videos 表按 account_id + published_at 创建复合索引
-- 2. 对 sync_logs 表按 account_id + started_at 创建复合索引
-- 3. 定期清理 old_sync_logs 表（如只保留最近30天）
-- 4. 考虑使用分区表对 videos 表按时间进行分区
