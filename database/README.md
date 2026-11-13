# 数据库

生产和本地使用 PostgreSQL。表结构在 [postgres.sql](postgres.sql)。本地 `docker compose up -d --wait` 会在空数据卷中初始化 PostgreSQL 17.10。

`scripts/migrate-mysql-to-postgres.js` 用于一次性迁移旧 MySQL 数据。先准备一个只有默认平台数据的 PostgreSQL 库，暂停源端写入，通过环境变量设置 `MYSQL_SOURCE_PASSWORD`，需要时可设置 `MYSQL_SOURCE_HOST`、`MYSQL_SOURCE_PORT`、`MYSQL_SOURCE_USER` 和 `MYSQL_SOURCE_DB`。目标连接读取项目根目录的 `.env`。将 `DB_TIMEZONE` 设为旧库的会话时区，以正确解释旧库的日期和时间。

```powershell
node scripts/migrate-mysql-to-postgres.js
```

迁移从 MySQL 读取一致性快照，在 PostgreSQL 的单个事务内写入并比较各表数据。目标表有业务数据时会拒绝导入。旧 MySQL 建表脚本供历史数据库参考。后续服务器部署和 PostgreSQL 备份恢复见 [DEPLOYMENT.md](../DEPLOYMENT.md)。
