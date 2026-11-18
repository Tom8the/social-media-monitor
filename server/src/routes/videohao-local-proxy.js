const express = require('express');
const fs = require('fs');
const localProxy = require('../videohao-local-proxy');
const collector = require('../videohao-collector');
const { database } = require('../postgres-db');

const router = express.Router();

router.use((req, res, next) => {
  const compatible = ['/desktop-sync', '/background-sync', '/desktop-status'];
  if (collector.mode !== 'desktop-wechat' && !compatible.includes(req.path)) {
    return res.status(409).json({ code: 409, message: '此功能仅用于 Windows 本地代理，请使用视频号采集接口' });
  }
  next();
});

router.post('/start', async (req, res) => {
  try {
    const { accountId, port } = req.body || {};
    if (!accountId) {
      return res.status(400).json({ code: 400, message: 'accountId不能为空' });
    }
    const result = await collector.withDesktopCapture(() => localProxy.start(accountId, port));
    if (!result.success) {
      return res.status(400).json({ code: 400, message: result.error || '启动失败' });
    }
    res.json({ code: 0, message: '视频号本地微信采集已启动', data: result.data });
  } catch (error) {
    res.status(error.status || 500).json({ code: error.status || 500, message: error.message });
  }
});

router.post('/configure', async (req, res) => {
  try {
    const { accountId, port } = req.body || {};
    if (!accountId) {
      return res.status(400).json({ code: 400, message: 'accountId不能为空' });
    }
    const result = await collector.withDesktopCapture(() => localProxy.configureSystem(accountId, port));
    if (!result.success) {
      return res.status(500).json({ code: 500, message: result.error || '本机采集环境配置失败', data: result.data || null });
    }
    res.json({ code: 0, message: '本机采集环境已配置', data: result.data });
  } catch (error) {
    res.status(error.status || 500).json({ code: error.status || 500, message: error.message });
  }
});

async function handleDesktopSync(req, res) {
  try {
    const { accountId, timeout } = req.body || {};
    if (!accountId) {
      return res.status(400).json({ code: 400, message: 'accountId不能为空' });
    }
    const accounts = await database.getAllAccounts({ platform: 'videohao' });
    const account = accounts.find(item => item.id === accountId);
    if (!account) {
      return res.status(404).json({ code: 404, message: '视频号账号不存在' });
    }
    const result = await collector.sync(account, { timeout: Math.min(45000, Math.max(1000, Number(timeout) || 30000)) });
    res.json({ code: 0, message: '视频号采集完成', data: { ...result, success: true } });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ code: status, message: error.message });
  }
}

router.post('/desktop-sync', handleDesktopSync);
router.post('/background-sync', handleDesktopSync);

router.post('/stop', async (req, res) => {
  try {
    await collector.withDesktopCapture(() => localProxy.stop());
    res.json({ code: 0, message: '视频号本地微信采集已停止' });
  } catch (error) {
    res.status(error.status || 500).json({ code: error.status || 500, message: error.message });
  }
});

router.post('/disable-system-proxy', async (req, res) => {
  try {
    const result = await collector.withDesktopCapture(() => localProxy.disableSystemProxy());
    if (!result.success) {
      return res.status(500).json({ code: 500, message: result.error || '关闭系统代理失败' });
    }
    res.json({ code: 0, message: '系统代理已关闭' });
  } catch (error) {
    res.status(error.status || 500).json({ code: error.status || 500, message: error.message });
  }
});

router.get('/status', (req, res) => {
  res.json({ code: 0, data: localProxy.getStatus() });
});

router.get('/desktop-status', async (req, res) => {
  res.json({ code: 0, data: await collector.status() });
});

router.get('/ca', (req, res) => {
  const caPath = localProxy.getCaPath();
  if (!fs.existsSync(caPath)) {
    return res.status(404).json({ code: 404, message: 'CA证书尚未生成，请先启动本地采集代理' });
  }
  res.download(caPath, 'videohao-local-proxy-ca.pem');
});

router.post('/parse-link', async (req, res) => {
  try {
    const { url, accountId } = req.body || {};
    if (!url) return res.status(400).json({ code: 400, message: '缺少链接参数' });

    await collector.withDesktopCapture(async () => {
      const status = localProxy.getStatus();
      if (!status.running) {
        return res.status(503).json({ code: 503, message: '本地代理未启动，请先在账号管理页面启动视频号采集' });
      }
      if (accountId) {
        const result = await localProxy.start(accountId);
        if (!result.success) return res.status(404).json({ code: 404, message: result.error });
      }
      const post = localProxy._extractPostFromUrl(String(url).trim());
      if (!post) {
        return res.json({ code: 400, message: '无法识别该链接中的视频信息，请确认是视频号分享链接' });
      }
      const saved = await localProxy._savePosts([post], String(url).trim());
      res.json({ code: 0, message: `成功导入 ${saved} 条视频`, data: { saved, post } });
    });
  } catch (err) {
    console.error('[VH-API] parse-link error:', err.message);
    res.status(err.status || 500).json({ code: err.status || 500, message: err.message });
  }
});

module.exports = router;
