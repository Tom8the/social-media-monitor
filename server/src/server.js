require('./load-env');
require('./browser-temp');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase, checkDatabase, closeDatabase } = require('./postgres-db');
const videohaoLocalProxy = require('./videohao-local-proxy');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const clientDistDir = process.env.CLIENT_DIST_DIR || path.join(__dirname, '..', '..', 'client', 'dist');
const hasClientDist = fs.existsSync(path.join(clientDistDir, 'index.html'));

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
if (hasClientDist) {
  app.use(express.static(clientDistDir));
}

// 路由
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/proxy', require('./routes/proxy'));
app.use('/api/videohao-local-proxy', require('./routes/videohao-local-proxy'));

// 健康检查
app.get('/health', async (req, res) => {
  try {
    await checkDatabase();
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'postgresql' });
  } catch {
    res.status(503).json({ status: 'unavailable', database: 'postgresql' });
  }
});

if (hasClientDist) {
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ code: 500, message: '服务器内部错误' });
});

// 启动服务器
async function startServer() {
  // 初始化数据库
  await initDatabase();

  const server = app.listen(Number(PORT), HOST, () => {
    console.log(`========================================`);
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`API地址: http://localhost:${PORT}/api`);
    console.log('数据库: PostgreSQL');
    console.log(`========================================`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Close the existing backend or run start-local.bat to restart this project safely.`);
      process.exit(1);
    }
    throw error;
  });

  let shuttingDown = false;
  const shutdown = async (reason, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Shutdown] cleaning videohao local proxy: ${reason}`);
    await videohaoLocalProxy.stop().catch(error => {
      console.error('[Shutdown] videohao proxy cleanup failed:', error.message);
    });
    server.close(async () => {
      await closeDatabase().catch(error => console.error('[Shutdown] PostgreSQL:', error.message));
      process.exit(exitCode);
    });
    setTimeout(() => process.exit(exitCode), 3000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT', 0));
  process.once('SIGTERM', () => shutdown('SIGTERM', 0));
  process.once('uncaughtException', (error) => {
    console.error(error);
    shutdown('uncaughtException', 1);
  });
  process.once('unhandledRejection', (reason) => {
    console.error(reason);
    shutdown('unhandledRejection', 1);
  });
}

startServer().catch(async error => {
  console.error('Startup failed:', error.message);
  await closeDatabase();
  process.exitCode = 1;
});

module.exports = app;
