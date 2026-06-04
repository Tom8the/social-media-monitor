-- 设置 root 密码
ALTER USER 'root'@'localhost' IDENTIFIED BY 'root123456';
FLUSH PRIVILEGES;

-- 创建数据库
CREATE DATABASE IF NOT EXISTS social_media_monitor
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
