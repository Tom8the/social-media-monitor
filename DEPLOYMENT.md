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

抖音和小红书的采集需要 Chrome 或 Chromium 及其 Linux 依赖。网页中的全局 Cookie 授权使用每次会话独立的 Xvfb 桌面，通过 FFmpeg 显示画面，通过 xdotool 转发用户输入。Ubuntu 上可用 `sudo apt-get install xvfb ffmpeg xdotool` 安装这些依赖。原有桌面扫码入口需要可用的图形会话。

### 微信视频号

Ubuntu 使用已登录的 Linux 微信和 [wx_channels_download v261106](https://github.com/ltaoo/wx_channels_download/releases/tag/v261106)。在 x86_64 上可运行 [linuxserver/weixin](https://github.com/linuxserver/docker-weixin) 的 amd64 镜像，配合下载器的 `linux_x86_64` 发行包。保留已验证的微信数据卷、证书和 TUN 配置，并在微信中打开视频号页面。

后端默认访问 `http://127.0.0.1:2022`。如果下载器在独立容器内、后端在 VPS 宿主机运行，请让下载器在容器内监听 `0.0.0.0:2022`，并将端口映射到宿主机回环地址（例如 `127.0.0.1:2022:2022`）。如果两个服务都在 Docker 中，可以使用私有 Docker 网络和下载器服务名作为地址。

```dotenv
VIDEOHAO_BRIDGE_URL=http://127.0.0.1:2022
VIDEOHAO_BRIDGE_MAX_PAGES=5
```

环境变量保存到项目根目录的 `.env` 后，重启后端。分页上限为每个账号每次 5 页，可设为 1–50 页。到达上限时，界面会提示仍有作品未采集。

```bash
curl -fsS http://127.0.0.1:2022/api/channels/status
curl -fsS http://127.0.0.1:3000/api/accounts/videohao/status
```

确认两个状态接口都返回 `data.available: true` 后，在账号管理中按名称搜索或输入 Finder ID，在账号卡片运行「数据同步」，或在视频列表按账号、按平台发起采集。已保存的 Finder ID 可以直接使用。客户端下载器断开时，重新打开微信里的视频号页面后再检测。

Windows 默认使用原有桌面微信和代理，也可以通过设置 `VIDEOHAO_BRIDGE_URL` 选择下载器。桌面微信采集读取当前加载的作品，下载器模式支持分页和日期筛选。
