# 社交媒体监控系统 - MySQL 数据库配置

## 数据库连接信息

| 配置项 | 值 |
|--------|-----|
| 数据库类型 | MySQL 8.4.9 |
| 主机地址 | 127.0.0.1 |
| 端口 | 3306 |
| 用户名 | root |
| 密码 | root123456 |
| 数据库名 | social_media_monitor |

## 连接命令

```bash
# 使用命令行连接
mysql -u root -proot123456 -h 127.0.0.1 social_media_monitor

# 或使用命名管道（Windows）
mysql -u root --pipe --protocol=pipe social_media_monitor
```

## 数据库表结构

### 1. platforms（平台配置表）
存储支持的社交媒体平台信息（抖音、小红书、视频号）。

### 2. accounts（社交账号表）
存储监控的账号信息，包括平台、昵称、粉丝数等。

### 3. videos（视频表）
存储采集的视频数据，包括播放量、点赞数、评论数等。

### 4. account_groups（账号分组表）
用于对账号进行分组管理。

### 5. sync_logs（同步日志表）
记录数据同步操作日志。

### 6. alerts（告警表）
存储系统告警信息。

### 7. daily_stats（每日统计表）
预计算的每日统计数据。

## MySQL 服务管理

```bash
# 启动 MySQL
net start MySQL

# 停止 MySQL
net stop MySQL

# 重启 MySQL
net stop MySQL && net start MySQL
```

## 配置文件位置

- MySQL 配置文件：`D:\Coding\social-media-monitor\mysql_data\my.ini`
- MySQL 数据目录：`D:\Coding\social-media-monitor\mysql_data`
- MySQL 安装目录：`C:\Program Files\MySQL\MySQL Server 8.4`

## 注意事项

1. MySQL 服务正在后台运行
2. 后端已配置为使用 MySQL 数据库
3. 数据将持久化存储，不会因服务重启而丢失
