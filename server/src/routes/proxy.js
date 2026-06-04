const express = require('express');
const http = require('http');
const https = require('https');

const router = express.Router();

const ALLOWED_IMAGE_HOSTS = [
  'xhscdn.com',
  'xhscdn.net',
  'xiaohongshu.com',
  'finder.video.qq.com',
  'video.qq.com',
  'wx.qlogo.cn',
  'qpic.cn'
];

function isAllowedImageUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return ALLOWED_IMAGE_HOSTS.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch (error) {
    return false;
  }
}

function getImageReferer(rawUrl) {
  try {
    const { hostname } = new URL(rawUrl);
    if (hostname === 'finder.video.qq.com' || hostname.endsWith('.video.qq.com') || hostname === 'wx.qlogo.cn' || hostname.endsWith('.qpic.cn')) {
      return 'https://channels.weixin.qq.com/';
    }
  } catch (error) {
    // Fall back to the most restrictive known referer below.
  }
  return 'https://www.xiaohongshu.com/';
}

function requestImage(rawUrl, redirects = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Referer: getImageReferer(rawUrl),
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      timeout: 20000
    }, (upstream) => {
      if ([301, 302, 303, 307, 308].includes(upstream.statusCode) && upstream.headers.location && redirects < 3) {
        upstream.resume();
        resolve(requestImage(new URL(upstream.headers.location, rawUrl).toString(), redirects + 1));
        return;
      }
      resolve(upstream);
    });

    req.on('timeout', () => req.destroy(new Error('image proxy timeout')));
    req.on('error', reject);
  });
}

router.get('/image', async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl || !isAllowedImageUrl(rawUrl)) {
    res.status(400).json({ code: 400, message: 'invalid image url' });
    return;
  }

  try {
    const upstream = await requestImage(rawUrl);
    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      upstream.resume();
      res.status(upstream.statusCode).json({ code: upstream.statusCode, message: 'image fetch failed' });
      return;
    }

    const contentType = upstream.headers['content-type'] || 'image/webp';
    if (!String(contentType).startsWith('image/')) {
      upstream.resume();
      res.status(415).json({ code: 415, message: 'not an image' });
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (upstream.headers['content-length']) {
      res.setHeader('Content-Length', upstream.headers['content-length']);
    }
    upstream.pipe(res);
  } catch (error) {
    res.status(502).json({ code: 502, message: error.message || 'image proxy error' });
  }
});

module.exports = router;
