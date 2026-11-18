const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const XiaohongshuScraper = require('./xhs-scraper');
const { createInteractivePage, openLoginPage } = require('./login-preview');

const currentUserUrl = 'https://edith.xiaohongshu.com/api/sns/web/v2/user/me';

puppeteer.use(StealthPlugin());

class XhsQRLoginService {
  constructor() {
    this.sessions = new Map();
  }

  async createSession({ globalCookie = false } = {}) {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      platform: 'xiaohongshu',
      globalCookie,
      status: globalCookie ? 'opening' : 'pending',
      userData: null,
      cookieData: null,
      error: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      browser: null,
      page: null
    };

    this.sessions.set(sessionId, session);

    if (globalCookie) {
      this._startExpiryCheck(sessionId);
      void this._startInteractiveLogin(session).then(() => {
        if (session.status === 'pending') this._monitorLoginStatus(session);
      }).catch(async error => {
        if (!['opening', 'pending', 'scanned'].includes(session.status)) return;
        console.error('[XHSQRLogin] 无法打开授权页:', error.name);
        session.status = 'error';
        session.error = '无法打开小红书登录页，请重试';
        await this._closeSession(session);
      });
      return { sessionId, status: session.status, expiresAt: session.expiresAt };
    }

    for (const [oldId, oldSession] of this.sessions) {
      if (!globalCookie && !oldSession.globalCookie && oldId !== sessionId && oldSession.browser) {
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
      await this._closeSession(session);
    }

    this._startExpiryCheck(sessionId);

    return {
      sessionId,
      qrCode: null,
      status: session.status,
      error: session.error,
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
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=900,760'
      ]
    });

    if (session.status === 'expired') return browser.close();
    session.browser = browser;
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 860 });
    session.page = page;

    await page.goto('https://www.xiaohongshu.com/explore', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    }).catch(() => {});

    await this._wait(3000);
    await this._openLoginPanel(page);
  }

  async _startInteractiveLogin(session) {
    const page = await createInteractivePage(session);
    if (!page) return;
    page.on('response', async response => {
      if (response.url().split('?')[0] !== currentUserUrl) return;
      try {
        const result = await response.json();
        const user = result?.data;
        if (result?.success && (user?.user_id || user?.userid) && user.guest === false) session.verifiedLogin = true;
      } catch {}
    });
    await openLoginPage(session, page, 'https://www.xiaohongshu.com/login');
  }

  async _openLoginPanel(page) {
    for (let i = 0; i < 5; i++) {
      const clicked = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('button, a, div, span'));
        const loginEl = candidates.find(el => {
          const text = (el.textContent || '').trim();
          return text === '登录' || text === '登陆' || text.includes('登录/注册');
        });
        if (loginEl) {
          loginEl.click();
          return true;
        }
        return false;
      }).catch(() => false);

      await this._wait(1500);

      await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('button, div, span, a'));
        const qr = items.find(el => {
          const text = (el.textContent || '').trim();
          return text.includes('扫码') || text.includes('二维码');
        });
        if (qr) qr.click();
      }).catch(() => {});

      const hasLoginContent = await page.evaluate(() => {
        const text = document.body.innerText || '';
        return text.includes('扫码') || text.includes('验证码') || text.includes('小红书');
      }).catch(() => false);

      if (clicked || hasLoginContent) return;
      await this._wait(1500);
    }
  }

  _monitorLoginStatus(session) {
    let checking = false;
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

      if (checking) return;
      checking = true;
      try {
        const page = session.page;
        if (!page) return;

        const cookies = session.globalCookie ? await page.context().cookies('https://www.xiaohongshu.com') : await page.cookies('https://www.xiaohongshu.com');
        const hasLoginCookie = cookies.some(cookie => cookie.name === 'web_session');
        if (session.globalCookie) {
          if (!hasLoginCookie || !cookies.some(cookie => cookie.name === 'a1' && cookie.value)) return;
          if (!session.verifiedLogin && !await this._fetchCurrentUserFromApi(page, true)) return;
          const confirmedCookies = await page.context().cookies(['https://www.xiaohongshu.com', 'https://edith.xiaohongshu.com']);
          if (!session.page || Date.now() >= session.expiresAt) return;
          session.cookieData = JSON.stringify(confirmedCookies);
          session.status = 'confirmed';
          clearInterval(timer);
          await this._closeSession(session);
          return;
        }
        const currentUser = hasLoginCookie ? await this._fetchCurrentUserFromApi(page) : null;
        const loggedInByUi = await page.evaluate(() => {
          const text = document.body.innerText || '';
          const loginSignals = [
            '登录/注册',
            '验证码登录',
            '扫码登录',
            '手机号登录',
            '获取验证码',
            '新用户可直接登录',
            '我已阅读并同意',
            '小红书如何扫码',
            '登录后推荐更懂你的笔记',
            '登录即可查看'
          ];
          const hasLoginPrompt = loginSignals.some(signal => text.includes(signal));
          const selfProfileLink = Array.from(document.querySelectorAll('a[href*="/user/profile/"]'))
            .find(link => {
              const text = (link.textContent || '').trim();
              const cls = String(link.className || '');
              return text === '我' && (cls.includes('link-wrapper') || cls.includes('bottom-channel'));
            });
          const hasUserSignal = !!selfProfileLink;
          return hasUserSignal && !hasLoginPrompt;
        }).catch(() => false);

        if (hasLoginCookie && (currentUser?.unique_id || loggedInByUi)) {
          session.status = 'scanned';
          session.cookieData = JSON.stringify(cookies);
          const userData = await this._extractUserData(session, currentUser);
          if (!userData.unique_id || userData.unique_id.startsWith('xhs_qr_') || userData.nickname === '小红书用户' || userData.nickname === '我') {
            return;
          }
          session.userData = userData;
          session.status = 'confirmed';
          setTimeout(() => this._closeSession(session), 1500);
          clearInterval(timer);
        }
      } catch (error) {
        console.log('[XHSQRLogin] 监听登录状态失败:', error.message);
      } finally {
        checking = false;
      }
    }, 3000);
  }

  async _extractUserData(session, currentUser = null) {
    const page = session.page;
    try {
      await page.goto('https://www.xiaohongshu.com/explore', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      }).catch(() => {});
      await this._wait(2500);

      const pageData = await page.evaluate(() => {
        const result = {};
        const userLinks = Array.from(document.querySelectorAll('a[href*="/user/profile/"]'));
        const selfLink = userLinks.find(link => {
          const text = (link.textContent || '').trim();
          const cls = String(link.className || '');
          return text === '我' && (cls.includes('link-wrapper') || cls.includes('bottom-channel'));
        }) || null;

        if (selfLink) {
          const href = selfLink.href || selfLink.getAttribute('href') || '';
          const match = href.match(/\/user\/profile\/([A-Za-z0-9_-]+)/);
          if (match) result.unique_id = match[1];
          const text = (selfLink.textContent || '').trim();
          if (text && text.length < 40) result.nickname = text;
          const selfAvatar = selfLink.querySelector('img[src*="sns-avatar"], img[class*="avatar"], [class*="avatar"]');
          if (selfAvatar) result.avatar = selfAvatar.src || selfAvatar.getAttribute('src') || '';
        }

        const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '').join('\n');
        if (result.unique_id && !result.nickname) {
          const userIdMatch = scripts.match(/"user_id"\s*:\s*"([^"]+)"/) || scripts.match(/"userId"\s*:\s*"([^"]+)"/);
          const nicknameMatch = scripts.match(/"nickname"\s*:\s*"([^"]+)"/);
          if (userIdMatch && userIdMatch[1] === result.unique_id && nicknameMatch) result.nickname = nicknameMatch[1];
        }
        if (result.unique_id && !result.avatar) {
          const avatarMatch = scripts.match(/"avatar"\s*:\s*"([^"]+)"/);
          if (avatarMatch) result.avatar = avatarMatch[1].replace(/\\u002F/g, '/');
        }

        return result;
      });
      const apiData = currentUser || await this._fetchCurrentUserFromApi(page);
      const data = {
        ...pageData,
        ...(apiData || {})
      };

      if (data.unique_id && session.cookieData) {
        const scraper = new XiaohongshuScraper();
        try {
          const cookies = JSON.parse(session.cookieData);
          let profileResult = await scraper.fetchCreatorProfile(data.unique_id, cookies);
          if (!profileResult.success) {
            profileResult = await scraper.fetchFromLink(
              `https://www.xiaohongshu.com/user/profile/${data.unique_id}`,
              cookies
            );
          }
          await scraper.close();
          if (profileResult.success && profileResult.data) {
            return {
              ...profileResult.data,
              platform: 'xiaohongshu',
              sec_uid: data.sec_uid || profileResult.data.sec_uid || null,
              signature: profileResult.data.signature || '扫码登录导入',
              avatar: profileResult.data.avatar || data.avatar || '',
              cookie_data: session.cookieData || null
            };
          }
        } catch (e) {
          await scraper.close().catch(() => {});
        }
      }

      return {
        platform: 'xiaohongshu',
        unique_id: data.unique_id || `xhs_qr_${Date.now()}`,
        sec_uid: data.sec_uid || null,
        nickname: data.nickname && data.nickname !== '我' ? data.nickname : '小红书用户',
        avatar: data.avatar || '',
        signature: '扫码登录导入',
        follower_count: 0,
        following_count: 0,
        like_count: 0,
        verified: 0,
        cookie_data: session.cookieData || null
      };
    } catch (error) {
      return {
        platform: 'xiaohongshu',
        unique_id: `xhs_qr_${Date.now()}`,
        nickname: '小红书用户',
        avatar: '',
        signature: '扫码登录导入',
        follower_count: 0,
        following_count: 0,
        like_count: 0,
        verified: 0,
        cookie_data: session.cookieData || null
      };
    }
  }

  async _fetchCurrentUserFromApi(page, requireVerifiedUser = false) {
    try {
      const result = await page.evaluate(async (url) => {
        const response = await fetch(url, {
          credentials: 'include', signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) return null;
        return response.json();
      }, currentUserUrl);

      const user = result?.data;
      if (!result?.success || !(user?.user_id || user?.userid) || user.guest || (requireVerifiedUser && user.guest !== false)) return null;

      return {
        unique_id: user.user_id || user.userid,
        sec_uid: user.red_id || null,
        nickname: user.nickname || '',
        avatar: user.images || user.imageb || '',
        signature: user.desc || ''
      };
    } catch (e) {
      return null;
    }
  }

  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: '会话不存在' };

    return {
      sessionId: session.id,
      globalCookie: session.globalCookie,
      status: session.status,
      userData: session.status === 'confirmed' ? session.userData : null,
      cookieData: session.status === 'confirmed' ? session.cookieData : null,
      error: session.error
    };
  }

  _startExpiryCheck(sessionId) {
    const expiresAt = this.sessions.get(sessionId).expiresAt;
    setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (!session) return;

      if (['opening', 'pending', 'scanned'].includes(session.status)) session.status = 'expired';
      this._closeSession(session);
      setTimeout(() => this.sessions.delete(sessionId), 5000);
    }, Math.max(0, expiresAt - Date.now()));
  }

  async _closeSession(session) {
    const browser = session.browser;
    session.browser = null;
    session.page = null;
    if (browser) await browser.close().catch(() => {});
  }

  _findChromePath() {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    ];
    return paths.find(chromePath => chromePath && fs.existsSync(chromePath)) || null;
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new XhsQRLoginService();
