-- 设置 root 密码
ALTER USER 'root'@'localhost' IDENTIFIED BY 'root123456';
FLUSH PRIVILEGES;

-- 创建数据库
CREATE DATABASE IF NOT EXISTS social_media_monitor
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE social_media_monitor;

-- 创建平台配置表
CREATE TABLE IF NOT EXISTS `platforms` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `code` VARCHAR(32) NOT NULL COMMENT '平台代码',
    `name` VARCHAR(64) NOT NULL COMMENT '平台名称',
    `icon_url` VARCHAR(512) DEFAULT NULL COMMENT '平台图标URL',
    `color` VARCHAR(8) DEFAULT '#1890FF' COMMENT '主题色',
    `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
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

-- 创建账号分组表
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

-- 创建社交账号表
CREATE TABLE IF NOT EXISTS `accounts` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键UUID',
    `platform_code` VARCHAR(32) NOT NULL COMMENT '平台代码',
    `unique_id` VARCHAR(128) NOT NULL COMMENT '平台唯一标识',
    `sec_uid` VARCHAR(256) DEFAULT NULL COMMENT '抖音安全UID',
    `nickname` VARCHAR(128) NOT NULL COMMENT '账号昵称',
    `avatar` VARCHAR(512) DEFAULT NULL COMMENT '头像URL',
    `signature` VARCHAR(512) DEFAULT NULL COMMENT '个人简介',
    `follower_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '粉丝数',
    `following_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '关注数',
    `like_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '获赞数',
    `video_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '作品数',
    `verified` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否认证',
    `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态',
    `remark` VARCHAR(256) DEFAULT NULL COMMENT '备注',
    `group_id` VARCHAR(36) DEFAULT NULL COMMENT '所属分组ID',
    `last_fetch_at` DATETIME DEFAULT NULL COMMENT '最后采集时间',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_platform_uniqueid` (`platform_code`, `unique_id`),
    KEY `idx_status` (`status`),
    KEY `idx_group` (`group_id`),
    KEY `idx_follower` (`follower_count`),
    KEY `idx_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社交账号表';

-- 创建视频表
CREATE TABLE IF NOT EXISTS `videos` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键UUID',
    `account_id` VARCHAR(36) NOT NULL COMMENT '所属账号ID',
    `platform_code` VARCHAR(32) NOT NULL COMMENT '平台代码',
    `video_id` VARCHAR(128) NOT NULL COMMENT '平台视频ID',
    `title` VARCHAR(512) NOT NULL COMMENT '视频标题',
    `description` TEXT DEFAULT NULL COMMENT '视频描述',
    `cover_url` VARCHAR(512) DEFAULT NULL COMMENT '封面图URL',
    `video_url` VARCHAR(512) DEFAULT NULL COMMENT '视频URL',
    `duration` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '时长（秒）',
    `topic_tags` VARCHAR(256) DEFAULT NULL COMMENT '话题标签',
    `play_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '播放量',
    `like_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '点赞数',
    `comment_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '评论数',
    `share_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '分享数',
    `collect_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '收藏数',
    `published_at` DATETIME DEFAULT NULL COMMENT '发布时间',
    `fetched_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '采集时间',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_platform_videoid` (`platform_code`, `video_id`),
    KEY `idx_account` (`account_id`),
    KEY `idx_platform` (`platform_code`),
    KEY `idx_published` (`published_at`),
    KEY `idx_play` (`play_count`),
    KEY `idx_like` (`like_count`),
    KEY `idx_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='视频表';

-- 创建同步日志表
CREATE TABLE IF NOT EXISTS `sync_logs` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键UUID',
    `account_id` VARCHAR(36) NOT NULL COMMENT '账号ID',
    `sync_type` VARCHAR(32) NOT NULL COMMENT '同步类型',
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态',
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
    KEY `idx_type` (`sync_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='同步日志表';

-- 创建告警表
CREATE TABLE IF NOT EXISTS `alerts` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键UUID',
    `alert_type` VARCHAR(32) NOT NULL COMMENT '告警类型',
    `level` VARCHAR(16) NOT NULL DEFAULT 'warning' COMMENT '级别',
    `title` VARCHAR(128) NOT NULL COMMENT '告警标题',
    `description` TEXT DEFAULT NULL COMMENT '告警描述',
    `account_id` VARCHAR(36) DEFAULT NULL COMMENT '关联账号ID',
    `video_id` VARCHAR(36) DEFAULT NULL COMMENT '关联视频ID',
    `status` VARCHAR(16) NOT NULL DEFAULT 'unresolved' COMMENT '状态',
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
    KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警表';

-- 创建每日统计表
CREATE TABLE IF NOT EXISTS `daily_stats` (
    `id` VARCHAR(36) NOT NULL COMMENT '主键UUID',
    `stat_date` DATE NOT NULL COMMENT '统计日期',
    `platform_code` VARCHAR(32) DEFAULT NULL COMMENT '平台代码',
    `account_id` VARCHAR(36) DEFAULT NULL COMMENT '账号ID',
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
    KEY `idx_platform` (`platform_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日统计数据表';

SELECT 'Database setup completed!' AS status;
