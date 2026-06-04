const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

puppeteer.use(StealthPlugin());

class VideohaoQRLoginService {
  constructor() {
    this.sessions = new Map();
  }

  async createSession() {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      platform: 'videohao',
      status: 'pending',
      userData: null,
      cookieData: null,
      error: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      browser: null,
      page: null,
      platformVisited: false,
      profileData: null
    };

    this.sessions.set(sessionId, session);

    for (const [oldId, oldSession] of this.sessions) {
      if (oldId !== sessionId && oldSession.browser) {
        try { await oldSession.browser.close(); } catch (e) {}
        oldSession.browser = null;
        oldSession.page = null;
      }
    }

    try {
      await this._startLogin(session);
      this._monitorLoginStatus(session);
    } catch (error) {
      session.status = 'error';
      session.error = error.message;
    }

    this._startExpiryCheck(sessionId);

    return {
      sessionId,
      qrCode: null,
      status: session.status,
      expiresAt: session.expiresAt
    };
  }

  async _startLogin(session) {
    const chromePath = this._findChromePath();
    if (!chromePath) {
      throw new Error('未找到 Chrome 浏览器，请先安装 Chrome');
    }

    const browser = await puppeteer.launch({
      headless: false,
      executablePath: chromePath,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=900,760',
        '--window-position=80,60',
        '--disable-gpu',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 860 });
    session.browser = browser;
    session.page = page;

    page.on('response', async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        if (!url.includes('/auth/auth_data') || !contentType.includes('application/json')) return;
        const data = await response.json();
        const profile = this._extractProfileFromAuthData(data);
        if (profile) session.profileData = { ...(session.profileData || {}), ...profile };
      } catch (e) {}
    });

    await page.bringToFront().catch(() => {});
    await page.goto('https://channels.weixin.qq.com/platform', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await this._wait(3000);
    await page.bringToFront().catch(() => {});

    const hasLoginEntry = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      return text.includes('扫码') || text.includes('微信') || !!document.querySelector('canvas, img[src*="qrcode"], iframe');
    }).catch(() => false);

    if (!hasLoginEntry) {
      await page.goto('https://channels.weixin.qq.com/platform/login-for-iframe?dark_mode=true&host_type=1', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      }).catch(() => {});
      await this._wait(2000);
      await page.bringToFront().catch(() => {});
    }

    session.status = 'pending';
  }

  _monitorLoginStatus(session) {
    const timer = setInterval(async () => {
      if (!this.sessions.has(session.id)) {
        clearInterval(timer);
        return;
      }

      if (Date.now() > session.expiresAt) {
        if (session.status !== 'confirmed') session.status = 'expired';
        clearInterval(timer);
        return;
      }

      if (session.status === 'confirmed' || session.status === 'error') {
        clearInterval(timer);
        return;
      }

      try {
        const page = session.page;
        if (!page) return;

        const scanState = await this._readScanState(page);
        if (scanState === 'scanned' && session.status === 'pending') {
          session.status = 'scanned';
        }

        const readyForAccountRead = await this._isReadyForAccountRead(page);
        if (!readyForAccountRead) {
          return;
        }

        if (!session.platformVisited && !page.url().includes('/platform') && !page.url().includes('/login')) {
          await page.goto('https://channels.weixin.qq.com/platform', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          }).catch(() => {});
          await this._wait(2000);
          session.platformVisited = true;
        }

        const accountInfo = {
          ...(session.profileData || {}),
          ...this._dropEmpty(await this._extractAccountInfo(page))
        };
        if (!accountInfo || !accountInfo.unique_id || !accountInfo.nickname) {
          return;
        }

        const authState = await this._collectAuthState(page);
        session.cookieData = JSON.stringify(authState);
        session.userData = {
          ...accountInfo,
          platform: 'videohao',
          signature: accountInfo.signature || '扫码登录导入',
          follower_count: accountInfo.follower_count || 0,
          following_count: accountInfo.following_count || 0,
          like_count: accountInfo.like_count || 0,
          verified: accountInfo.verified || 0,
          cookie_data: session.cookieData
        };
        session.status = 'confirmed';
        setTimeout(() => this._closeSession(session), 1500);
        clearInterval(timer);
      } catch (error) {
        console.log('[VideohaoQRLogin] monitor failed:', error.message);
      }
    }, 3000);
  }

  async _readScanState(page) {
    return await page.evaluate(() => {
      const text = document.body?.innerText || '';
      if (text.includes('已扫码') || text.includes('已扫描') || text.includes('请在手机上确认')) return 'scanned';
      return 'pending';
    }).catch(() => 'pending');
  }

  async _isReadyForAccountRead(page) {
    return await page.evaluate(() => {
      const url = location.href;
      const text = document.body?.innerText || '';
      if (url.includes('/login')) return false;
      if (text.includes('微信扫码') || text.includes('扫码登录') || text.includes('请在手机上确认')) return false;
      if (document.querySelector('span.finder-uniq-id, h2.finder-nickname, img.avatar')) return true;
      return url.includes('/platform') && !url.includes('/login');
    }).catch(() => false);
  }

  async _extractAccountInfo(page) {
    return await page.evaluate(() => {
      const clean = (value) => String(value || '').replace(/^@/, '').trim();
      const parseCount = (value) => {
        if (typeof value === 'number') return value;
        if (!value) return 0;
        const raw = String(value).replace(/,/g, '').replace(/[+\s]/g, '').trim();
        const match = raw.match(/(\d+(?:\.\d+)?)/);
        if (!match) return 0;
        const num = parseFloat(match[1]);
        if (raw.includes('亿')) return Math.round(num * 100000000);
        if (raw.includes('万') || /w$/i.test(raw)) return Math.round(num * 10000);
        if (raw.includes('千') || /k$/i.test(raw)) return Math.round(num * 1000);
        return Math.round(num);
      };
      const textOf = (selector) => clean(document.querySelector(selector)?.textContent);
      const attrOf = (selector, attr) => document.querySelector(selector)?.getAttribute(attr) || '';
      const bodyText = document.body?.innerText || '';

      const result = {
        unique_id: textOf('span.finder-uniq-id'),
        nickname: textOf('h2.finder-nickname'),
        avatar: attrOf('img.avatar', 'src'),
        signature: ''
      };

      const idMatch = bodyText.match(/视频号ID:\s*([A-Za-z0-9_-]+)/);
      if (!result.unique_id && idMatch) result.unique_id = idMatch[1];
      const fansMatch = bodyText.match(/(?:关注者|粉丝)\s*([\d.,万亿千wWkK]+)/);
      if (fansMatch) result.follower_count = parseCount(fansMatch[1]);
      const videoCountMatch = bodyText.match(/视频\s*([\d.,万亿千wWkK]+)/);
      if (videoCountMatch) result.video_count = parseCount(videoCountMatch[1]);

      if (!result.unique_id) {
        const idEl = Array.from(document.querySelectorAll('span, div'))
          .find(el => /^@?[A-Za-z0-9_-]{5,}$/.test((el.textContent || '').trim()));
        if (idEl) result.unique_id = clean(idEl.textContent);
      }

      if (!result.nickname) {
        const titleEl = document.querySelector('h1, h2, [class*="nickname"], [class*="name"]');
        if (titleEl) result.nickname = clean(titleEl.textContent);
      }

      if (!result.avatar) {
        const img = document.querySelector('img[src*="wx.qlogo.cn"], img[src*="qpic.cn"], img[src*="mmbiz"]');
        if (img) result.avatar = img.src || img.getAttribute('src') || '';
      }

      const scripts = Array.from(document.scripts).map(s => s.textContent || '').join('\n');
      if (!result.unique_id) {
        const match = scripts.match(/"finder(?:Uin|Username|Id|UserName|uniqId)"\s*:\s*"([^"]+)"/i) ||
          scripts.match(/"uniqId"\s*:\s*"([^"]+)"/i);
        if (match) result.unique_id = clean(match[1]);
      }
      if (!result.nickname) {
        const match = scripts.match(/"nickname"\s*:\s*"([^"]+)"/i) ||
          scripts.match(/"nickName"\s*:\s*"([^"]+)"/i);
        if (match) result.nickname = clean(match[1]);
      }
      if (!result.avatar) {
        const match = scripts.match(/"avatar(?:Url)?"\s*:\s*"([^"]+)"/i);
        if (match) result.avatar = match[1].replace(/\\u002F/g, '/');
      }

      if (!result.unique_id || !result.nickname) return null;
      return result;
    }).catch(() => null);
  }

  _extractProfileFromAuthData(data) {
    const finderUser = data?.data?.finderUser || data?.finderUser || {};
    const nestedUser = finderUser.finderUser || {};
    const source = { ...finderUser, ...nestedUser };
    const uniqueId = source.username || source.uniqId || source.finderUsername || source.finder_uniq_id || '';
    const nickname = source.nickname || source.nickName || source.finderNickname || '';
    if (!uniqueId && !nickname) return null;

    return {
      unique_id: String(uniqueId || '').replace(/^@/, '').trim(),
      sec_uid: source.finderUsername || null,
      nickname,
      avatar: source.avatar || source.avatarUrl || source.headImgUrl || source.headimgurl || '',
      follower_count: this._parseCount(source.fansCount || source.fans_count || source.followerCount || source.followers),
      following_count: this._parseCount(source.followCount || source.follow_count || source.followingCount),
      like_count: this._parseCount(source.likeCount || source.like_count || source.likedCount),
      video_count: this._parseCount(source.feedsCount || source.feedCount || source.videoCount)
    };
  }

  _parseCount(value) {
    if (typeof value === 'number') return Math.max(0, Math.round(value));
    if (!value) return 0;
    const raw = String(value).replace(/,/g, '').replace(/[+\s]/g, '').trim();
    const match = raw.match(/(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    if (raw.includes('亿')) return Math.round(num * 100000000);
    if (raw.includes('万') || /w$/i.test(raw)) return Math.round(num * 10000);
    if (raw.includes('千') || /k$/i.test(raw)) return Math.round(num * 1000);
    return Math.round(num);
  }

  _dropEmpty(value) {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
  }

  async _collectAuthState(page) {
    const cookies = await page.cookies('https://channels.weixin.qq.com');
    const storage = await page.evaluate(() => {
      const dump = (source) => {
        const data = {};
        for (let i = 0; i < source.length; i++) {
          const key = source.key(i);
          data[key] = source.getItem(key);
        }
        return data;
      };
      return {
        localStorage: dump(window.localStorage),
        sessionStorage: dump(window.sessionStorage)
      };
    }).catch(() => ({ localStorage: {}, sessionStorage: {} }));

    return {
      type: 'videohao-auth-state',
      cookies,
      ...storage
    };
  }

  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: '会话不存在' };

    return {
      sessionId: session.id,
      status: session.status,
      userData: session.status === 'confirmed' ? session.userData : null,
      cookieData: session.status === 'confirmed' ? session.cookieData : null,
      error: session.error
    };
  }

  getQRImagePath() {
    return null;
  }

  _startExpiryCheck(sessionId) {
    setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (!session) return;

      if (session.status !== 'confirmed') {
        session.status = 'expired';
        this._closeSession(session);
      }
    }, 5 * 60 * 1000);
  }

  async _closeSession(session) {
    if (session.browser) {
      try { await session.browser.close(); } catch (e) {}
      session.browser = null;
      session.page = null;
    }
  }

  _findChromePath() {
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    ];

    for (const chromePath of possiblePaths) {
      if (chromePath && fs.existsSync(chromePath)) return chromePath;
    }
    return null;
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new VideohaoQRLoginService();
