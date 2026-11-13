# 部署到 Ubuntu

本机和服务器使用同一套 PostgreSQL 表结构。项目本机的 Docker Compose 固定使用 PostgreSQL 17.10。如果 VPS 已有 PostgreSQL 17，可以直接使用该实例，并为此应用创建独立数据库和账号。

## 构建和启动

使用 Node.js 22.21 或更高的受支持 LTS 版本。把源码或 Windows 打包脚本生成的 release ZIP 放到服务器。源码部署先构建前端，ZIP 已包含 `client/dist`。

```bash
npm --prefix client ci
npm --prefix client run build
npm --prefix server ci --omit=dev
cp .env.example .env
chmod 600 .env
```

在 `.env` 设置 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`。连接 VPS 本机安装的 PostgreSQL 时，`DB_PORT` 通常为 `5432`。保留 `DB_TIMEZONE` 可以让本机和服务器按同一时区过滤日期、统计趋势。

使用有权限的 PostgreSQL 管理员创建数据库和应用角色。新安装时，在空库里以应用角色执行以下命令，创建应用所需表、索引和默认平台。如果要恢复完整备份，跳到下一节并在空库中恢复。

```bash
psql -h 127.0.0.1 -p 5432 -U social_media_monitor -d social_media_monitor -v ON_ERROR_STOP=1 -f database/postgres.sql
npm --prefix server start
curl --fail http://127.0.0.1:3000/health
```

健康检查成功时返回 `database: postgresql`。后端直接托管 `client/dist`。应用默认监听回环地址，可由 systemd 托管，并通过带访问控制的 HTTPS 反向代理访问。当前应用的 API 依赖部署侧的访问控制。

## 从本机迁移数据

先暂停源端写入，使用本机的 PostgreSQL 17 工具生成完整备份。Windows PowerShell 下可让容器直接写文件，再用 `docker cp` 复制到宿主机。

```powershell
docker compose exec -T postgres pg_dump -U social_media_monitor -d social_media_monitor -Fc --no-owner --no-privileges -f /tmp/social-media-monitor.dump
$container = docker compose ps -q postgres
docker cp "${container}:/tmp/social-media-monitor.dump" .
```

将备份通过私有渠道传输到 VPS。使用应用角色在空库中恢复，再核对账户、视频、统计和授权状态。备份含有采集授权 Cookie。

```bash
pg_restore -h 127.0.0.1 -p 5432 -U social_media_monitor -d social_media_monitor --no-owner --no-privileges --single-transaction --exit-on-error social-media-monitor.dump
```

## Ubuntu 上的采集功能

抖音和小红书的采集需要对应的 Chromium 浏览器及其 Linux 依赖。现有扫码流程会启动有界面的浏览器，部署时需要可用的图形会话并测试实际登录。视频号桌面微信、系统代理和 CA 安装调用 Windows 工具，Ubuntu 上需要独立适配。
