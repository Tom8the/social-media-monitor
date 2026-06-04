const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase, isConnected } = require('./mysql-db');

// Playwright 在 Windows 上会先向系统临时目录写 artifacts。
// 固定到项目目录，避免系统 Temp 权限或安全软件拦截导致 mkdtemp EPERM。
const playwrightTmpDir = path.join(__dirname, '..', 'tmp', 'playwright');
fs.mkdirSync(playwrightTmpDir, { recursive: true });
process.env.TEMP = playwrightTmpDir;
process.env.TMP = playwrightTmpDir;
process.env.TMPDIR = playwrightTmpDir;

const app = express();
const PORT = process.env.PORT || 3000;
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
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: isConnected() ? 'mysql' : 'memory'
  });
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

  const server = app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`API地址: http://localhost:${PORT}/api`);
    console.log(`数据库: ${isConnected() ? 'MySQL (持久化)' : '内存 (测试模式)'}`);
    console.log(`========================================`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Close the existing backend or run start-local.bat to restart this project safely.`);
      process.exit(1);
    }
    throw error;
  });
}

startServer();

module.exports = app;
