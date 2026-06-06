// 抖音数据采集服务 - 使用浏览器自动化
const { chromium } = require('playwright');
const path = require('path');

class DouyinScraper {
  constructor() {
    this.browser = null;
  }

  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        channel: 'chrome',
        headless: true, // 使用无头模式，隐藏浏览器窗口
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--allow-running-insecure-content',
          '--disable-extensions',
          '--mute-audio'
        ]
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // 获取浏览器实例（确保已初始化）
  async getBrowser() {
    if (!this.browser) {
      await this.init();
    }
    return this.browser;
  }

  // 使用保存的 Cookie 获取数据（深度授权账号同步用）
  // 返回值: { success, data, cookieExpired }
  async fetchWithCookies(userPath, cookies) {
    let context = null;
    try {
      await this.init();
      
      // 创建带 Cookie 的上下文
      context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'zh-CN',
        extraHTTPHeaders: {
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      });
      
      // 添加保存的 Cookie
      if (cookies && Array.isArray(cookies)) {
        await context.addCookies(cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          expires: c.expires
        })));
      }
      
      const page = await context.newPage();

      let userApiData = null;
      page.on('response', async (response) => {
        const respUrl = response.url();
        if (respUrl.includes('/user/') ||
            respUrl.includes('aweme/v1/web/user') ||
            respUrl.includes('aweme/v1/user') ||
            respUrl.includes('account/info') ||
            respUrl.includes('user/profile') ||
            (respUrl.includes('/api/') && respUrl.includes('user'))) {
          try {
            const apiData = await response.json();
            const hasUserData = apiData?.user || apiData?.user_info || apiData?.author ||
              apiData?.data?.user || apiData?.data?.author ||
              apiData?.user_list?.[0]?.user;
            if (hasUserData && !userApiData) {
              userApiData = apiData;
              console.log('[Scraper] Cookie模式捕获到用户资料API:', respUrl.substring(0, 100));
            }
          } catch (e) {}
        }
      });
      
      // 反检测脚本
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
      });
      
      const url = `https://www.douyin.com/user/${userPath}`;
      console.log('[Scraper] 使用 Cookie 访问:', url);
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      
      // 检测Cookie是否失效：检查是否跳转到登录页或显示登录提示
      const cookieExpired = await this._checkCookieExpired(page);
      if (cookieExpired) {
        console.log('[Scraper] Cookie已失效，需要重新登录');
        await context.close();
        return { success: false, error: 'Cookie已失效，请重新扫码登录', cookieExpired: true };
      }
      
      // 提取数据
      const data = await this._getDataFromDOM(page);
      if (userApiData) {
        const apiProfile = this._extractFromApiResponse(userApiData);
        if (apiProfile) {
          data.avatar = apiProfile.avatar || data.avatar;
          data.follower_count = apiProfile.follower_count || data.follower_count || 0;
          data.following_count = apiProfile.following_count || data.following_count || 0;
          data.like_count = apiProfile.like_count || data.like_count || 0;
          data.signature = apiProfile.signature || data.signature || '';
          data.verified = apiProfile.verified || data.verified || 0;
          data.nickname = apiProfile.nickname || data.nickname;
        }
      }
      
      await context.close();
      return { success: true, data, cookieExpired: false };
    } catch (error) {
      console.error('[Scraper] fetchWithCookies 失败:', error.message);
      if (context) { try { await context.close(); } catch(e) {} }
      return { success: false, error: error.message, cookieExpired: false };
    }
  }
  
  // 检测Cookie是否失效
  async _checkCookieExpired(page) {
    try {
      const currentUrl = page.url();
      
      // 1. 检查URL是否被强制跳转到登录页
      if (currentUrl.includes('/passport')) {
        return true;
      }
      
      // 2. 检查页面是否被登录弹窗完全遮挡（而不是页面本身有登录按钮）
      const isBlocked = await page.evaluate(() => {
        // 检查是否有全屏登录遮罩层
        const overlays = document.querySelectorAll('[class*="login"], [class*="Login"]');
        let hasFullScreenOverlay = false;
        for (const el of overlays) {
          const style = window.getComputedStyle(el);
          const zIndex = parseInt(style.zIndex) || 0;
          if (zIndex > 1000 && style.position === 'fixed' && 
              (style.width === '100%' || style.width === '100vw') &&
              (style.height === '100%' || style.height === '100vh')) {
            hasFullScreenOverlay = true;
            break;
          }
        }
        
        // 检查页面是否有实际内容（用户主页应该有视频列表）
        const bodyText = document.body.innerText || '';
        const hasVideoContent = bodyText.includes('作品') || bodyText.includes('获赞') || bodyText.includes('关注') || bodyText.includes('粉丝');
        const hasLoginOnly = bodyText.includes('扫码登录') && !hasVideoContent;
        
        return { hasFullScreenOverlay, hasLoginOnly };
      });
      
      if (isBlocked.hasFullScreenOverlay || isBlocked.hasLoginOnly) {
        return true;
      }
      
      return false;
    } catch (e) {
      console.log('[Scraper] Cookie检测异常:', e.message);
      return false;
    }
  }

  // 创建带反检测的页面上下文
  async createContext() {
    await this.init();
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'zh-CN',
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
    
    // 反检测脚本
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
      delete navigator.__proto__.webdriver;
      Object.defineProperty(navigator.__proto__, 'webdriver', {
        get: () => false,
        configurable: true
      });
    });
    
    return context;
  }

  // ========== 核心方法：从任意链接获取用户信息 ==========
  async fetchFromKeyword(keyword, cookies = null) {
    const query = String(keyword || '').trim();
    if (!query) {
      return { success: false, error: '请输入抖音账号名称' };
    }

    let searchBrowser = null;
    const searchSession = await this.createVisibleSearchContext();
    searchBrowser = searchSession.browser;
    const context = searchSession.context;
    if (cookies && Array.isArray(cookies)) {
      await context.addCookies(cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expires
      })));
    }
    const page = await context.newPage();

    try {
      let apiCandidate = null;
      let verifyDetected = false;
      page.on('response', async (response) => {
        const responseUrl = response.url();
        if (!responseUrl.includes('/aweme/v1/web/discover/search/')) return;
        if (!responseUrl.includes('aweme_user') && !responseUrl.includes('search_channel=aweme_user_web')) return;

        try {
          const data = await response.json();
          if (this._isDouyinSearchVerifyResponse(data)) {
            verifyDetected = true;
            console.log('[Scraper] 抖音搜索触发滑动验证，等待用户在弹出的 Chrome 窗口完成验证...');
          }
          const candidate = this._parseDouyinSearchApiCandidate(data, query);
          if (candidate && !apiCandidate) {
            apiCandidate = candidate;
            console.log('[Scraper] 捕获到抖音搜索账号接口结果:', {
              nickname: candidate.nickname,
              user_path: candidate.user_path,
              follower_count: candidate.follower_count
            });
          }
        } catch (e) {}
      });

      const searchUrl = `https://www.douyin.com/search/${encodeURIComponent(query)}?type=user`;
      console.log(`[Scraper] 正在搜索抖音账号: ${query}`);
      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});

      const startedAt = Date.now();
      let maxWaitMs = 30000;
      let lastVerifyLogAt = 0;
      let reloadAfterVerifyAt = 0;
      let domCandidate = null;
      while (Date.now() - startedAt < maxWaitMs) {
        domCandidate = await this._findUserLinkFromSearchPage(page, query);
        if (domCandidate?.url) break;
        if (apiCandidate?.url) break;
        const pageVerifyDetected = await this._detectDouyinSearchVerification(page);
        if (verifyDetected || pageVerifyDetected) {
          verifyDetected = true;
          maxWaitMs = 240000;
          const now = Date.now();
          if (now - lastVerifyLogAt > 15000) {
            console.log('[Scraper] 请在弹出的抖音 Chrome 窗口完成滑动验证，验证完成后程序会继续搜索...');
            lastVerifyLogAt = now;
          }

          if (!pageVerifyDetected && now - reloadAfterVerifyAt > 12000) {
            reloadAfterVerifyAt = now;
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          }
        }
        await page.waitForTimeout(1000);
      }

      const candidate = domCandidate?.url ? { ...apiCandidate, ...domCandidate } : apiCandidate;
      if (!candidate?.url) {
        await searchBrowser.close();
        if (verifyDetected) {
          return { success: false, error: `抖音要求滑动验证，请在弹出的 Chrome 窗口完成验证后重试：${query}` };
        }
        return { success: false, error: `未搜索到匹配的抖音账号：${query}` };
      }

      await searchBrowser.close();
      const profileResult = await this.fetchFromLink(candidate.url, cookies);
      if (!profileResult.success) {
        if (candidate.nickname && candidate.user_path) {
          return {
            success: true,
            data: this._buildDouyinDataFromSearchCandidate(candidate, query)
          };
        }
        return profileResult;
      }
      if (!profileResult.data?.nickname || profileResult.data.nickname === '未登录' || profileResult.data.unique_id === 'self') {
        if (candidate.nickname && candidate.user_path) {
          return {
            success: true,
            data: this._buildDouyinDataFromSearchCandidate(candidate, query)
          };
        }
        return { success: false, error: `未搜索到可采集的抖音账号：${query}` };
      }

      return {
        success: true,
        data: {
          ...profileResult.data,
          nickname: profileResult.data.nickname || candidate.nickname || query,
          avatar: profileResult.data.avatar || candidate.avatar || '',
          unique_id: profileResult.data.unique_id || candidate.user_path || ('dy_' + Date.now()),
          user_path: profileResult.data.user_path || candidate.user_path || null,
          follower_count: profileResult.data.follower_count || candidate.follower_count || 0,
          following_count: profileResult.data.following_count || candidate.following_count || 0,
          like_count: profileResult.data.like_count || candidate.like_count || 0,
          signature: profileResult.data.signature || candidate.signature || '',
          verified: profileResult.data.verified || candidate.verified || 0,
          search_keyword: query
        }
      };
    } catch (error) {
      console.error('[Scraper] 抖音账号搜索失败:', error.message);
      if (searchBrowser) await searchBrowser.close().catch(() => {});
      return { success: false, error: error.message };
    }
  }

  async createVisibleSearchContext() {
    const userDataDir = path.join(__dirname, '..', 'tmp', 'douyin-search-profile');
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: process.env.DOUYIN_SEARCH_HEADLESS === 'true',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'zh-CN',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-first-run',
        '--disable-dev-shm-usage',
        '--window-size=1280,900',
        '--mute-audio'
      ]
    });

    await context.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
      delete navigator.__proto__.webdriver;
      Object.defineProperty(navigator.__proto__, 'webdriver', {
        get: () => false,
        configurable: true
      });
    });

    return { browser: { close: () => context.close() }, context };
  }

  async _findUserLinkFromSearchPage(page, keyword) {
    try {
      return await page.evaluate((kw) => {
        const normalize = value => String(value || '').replace(/\s+/g, '').trim().toLowerCase();
        const expected = normalize(kw);
        const absUrl = href => {
          try { return new URL(href, location.origin).toString(); } catch { return ''; }
        };
        const userPathFromUrl = href => {
          const match = String(href || '').match(/\/user\/([A-Za-z0-9_-]+)/);
          return match ? match[1] : '';
        };
        const scoreCandidate = item => {
          const text = normalize(`${item.nickname || ''} ${item.text || ''}`);
          if (!text) return 0;
          if (expected && text === expected) return 100;
          if (expected && text.includes(expected)) return 80;
          if (expected && expected.includes(text)) return 60;
          return 10;
        };

        const candidates = [];
        for (const link of Array.from(document.querySelectorAll('a[href*="/user/"]'))) {
          const href = link.getAttribute('href') || link.href || '';
          const userPath = userPathFromUrl(href);
          if (!userPath) continue;
          if (userPath === 'self' || href.includes('/user/self')) continue;
          const card = link.closest('[class*="user"], [class*="card"], [class*="result"], li, div') || link;
          const text = (card.innerText || link.innerText || '').trim();
          const avatar = card.querySelector('img[src]')?.src || link.querySelector('img[src]')?.src || '';
          const nickname = (link.innerText || text.split('\n')[0] || '').trim();
          const url = absUrl(href);
          if (url) {
            candidates.push({ url, user_path: userPath, nickname, text, avatar });
          }
        }

        const seen = new Set();
        const unique = candidates.filter(item => {
          if (seen.has(item.user_path)) return false;
          seen.add(item.user_path);
          return true;
        });
        unique.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
        return unique[0] || null;
      }, keyword);
    } catch (error) {
      console.log('[Scraper] 搜索页提取账号链接失败:', error.message);
      return null;
    }
  }

  _isDouyinSearchVerifyResponse(response) {
    const nilInfo = response?.search_nil_info || response?.data?.search_nil_info;
    const nilType = String(nilInfo?.search_nil_type || nilInfo?.search_nil_item || '').toLowerCase();
    if (nilType.includes('verify')) return true;
    const message = String(response?.status_msg || response?.message || response?.data?.message || '').toLowerCase();
    return message.includes('verify') || message.includes('captcha') || message.includes('验证');
  }

  async _detectDouyinSearchVerification(page) {
    try {
      return await page.evaluate(() => {
        const text = document.body?.innerText || '';
        if (/滑动|拖动|验证码|安全验证|验证通过|verify|captcha/i.test(text)) return true;
        const selectors = [
          'iframe[src*="captcha"]',
          'iframe[src*="verify"]',
          '[class*="captcha"]',
          '[class*="Captcha"]',
          '[class*="verify"]',
          '[class*="Verify"]',
          '[id*="captcha"]',
          '[id*="verify"]'
        ];
        return selectors.some(selector => document.querySelector(selector));
      });
    } catch (error) {
      return false;
    }
  }

  _parseDouyinSearchApiCandidate(response, keyword) {
    if (!response) return null;

    const normalize = value => String(value || '').replace(/\s+/g, '').trim().toLowerCase();
    const expected = normalize(keyword);
    const parseCount = value => {
      if (value === null || value === undefined || value === '') return 0;
      if (typeof value === 'number') return Math.floor(value);
      const text = String(value).replace(/,/g, '').trim();
      const match = text.match(/(\d+\.?\d*)/);
      if (!match) return 0;
      const num = parseFloat(match[1]);
      if (text.includes('亿')) return Math.floor(num * 100000000);
      if (text.includes('万') || /\d+w$/i.test(text)) return Math.floor(num * 10000);
      if (text.includes('千') || /\d+k$/i.test(text)) return Math.floor(num * 1000);
      return Math.floor(num);
    };
    const imageUrl = image => image?.url_list?.[0] || image?.uri || '';
    const pickUser = item => item?.user_info || item?.user || item?.userInfo || item?.author || item;
    const scoreUser = user => {
      const nickname = normalize(user.nickname || user.userName || user.name);
      const uniqueId = normalize(user.unique_id || user.uniqueId || user.short_id || user.shortId);
      const signature = normalize(user.signature || user.desc);
      let score = 0;
      if (nickname === expected) score += 100;
      else if (nickname.includes(expected)) score += 80;
      else if (expected.includes(nickname)) score += 60;
      if (uniqueId === expected) score += 70;
      else if (uniqueId.includes(expected)) score += 35;
      if (signature.includes(expected)) score += 5;
      score += Math.min(20, Math.floor(parseCount(user.follower_count || user.followerCount) / 1000000));
      return score;
    };

    const list = [
      ...(Array.isArray(response.user_list) ? response.user_list : []),
      ...(Array.isArray(response.data?.user_list) ? response.data.user_list : []),
      ...(Array.isArray(response.users) ? response.users : []),
      ...(Array.isArray(response.data?.users) ? response.data.users : [])
    ].map(pickUser).filter(Boolean);

    const candidates = list.map(user => {
      const userPath = user.sec_uid || user.secUid || user.sec_uid_str || user.secUidStr || user.sec_id || '';
      const fallbackPath = userPath || user.uid || user.unique_id || user.short_id || '';
      return {
        url: fallbackPath ? `https://www.douyin.com/user/${fallbackPath}` : '',
        user_path: fallbackPath,
        nickname: user.nickname || user.userName || user.name || '',
        avatar: imageUrl(user.avatar_thumb) || imageUrl(user.avatar_medium) || imageUrl(user.avatar_larger) || user.avatar_url || user.avatar || '',
        follower_count: parseCount(user.follower_count || user.followerCount),
        following_count: parseCount(user.following_count || user.followingCount),
        like_count: parseCount(user.total_favorited || user.liked_count || user.favorited_count || user.like_count),
        signature: user.signature || user.desc || '',
        verified: user.verified || user.is_star || user.custom_verify || user.enterprise_verify_reason ? 1 : 0,
        score: scoreUser(user)
      };
    }).filter(item => item.url && item.nickname);

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  _buildDouyinDataFromSearchCandidate(candidate, keyword) {
    return {
      unique_id: candidate.user_path || ('dy_' + Date.now()),
      user_path: candidate.user_path || null,
      nickname: candidate.nickname || keyword,
      avatar: candidate.avatar || '',
      follower_count: candidate.follower_count || 0,
      following_count: candidate.following_count || 0,
      like_count: candidate.like_count || 0,
      signature: candidate.signature || '',
      verified: candidate.verified || 0,
      search_keyword: keyword
    };
  }

  async fetchFromLink(url, cookies = null) {
    const context = await this.createContext();
    if (cookies && Array.isArray(cookies)) {
      await context.addCookies(cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expires
      })));
    }
    const page = await context.newPage();
    
    try {
      console.log(`[Scraper] 正在打开链接: ${url}`);
      
      // 设置响应拦截器，等待用户数据 API 响应
      let userApiData = null;
      
      page.on('response', async (response) => {
        const url = response.url();
        // 匹配用户相关的 API（扩大匹配范围）
        if (url.includes('/user/') || url.includes('aweme/v1/web/user') || 
            url.includes('aweme/v1/user') || url.includes('account/info') || 
            url.includes('user/profile') || url.includes('/api/') && url.includes('user')) {
          try {
            const data = await response.json();
            console.log(`[Scraper] 捕获到API: ${url.substring(0, 80)}...`);
            
            if (data && !userApiData) {
              // 检查是否包含用户数据
              const hasUserData = data.user || data.user_info || data.author || 
                                 data.data?.user || data.data?.author ||
                                 data.user_list?.[0]?.user;
              
              if (hasUserData) {
                userApiData = data;
                console.log('[Scraper] 捕获到用户数据API，包含字段:', Object.keys(data).join(', '));
              }
            }
          } catch (e) {}
        }
      });
      
      // 1. 打开链接
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      
      // 2. 等待页面导航完成
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      console.log('[Scraper] 页面加载完成，等待数据...');
      
      // 3. 等待数据加载（最多等待20秒）
      // 优先从 DOM 获取，因为 DOM 显示的是网页上的实际数据（API 数据可能有延迟）
      console.log('[Scraper] 等待页面数据加载...');
      const startTime = Date.now();
      let domData = null;
      
      while (Date.now() - startTime < 20000) {
        await page.waitForTimeout(2000);
        
        // 尝试从 DOM 获取数据
        domData = await this._getDataFromDOM(page);
        if (domData && domData.nickname && domData.follower_count > 0) {
          console.log('[Scraper] 从DOM获取到数据:', domData);
          
          // 获取 user_path
          const finalUrl = page.url();
          const userMatch = finalUrl.match(/\/user\/([a-zA-Z0-9_-]+)/);
          
          const data = {
            ...domData,
            user_path: userMatch ? userMatch[1] : null,
            unique_id: userMatch ? userMatch[1] : ('dy_' + Date.now())
          };
          
          console.log('[Scraper] DOM 数据验证通过:', {
            nickname: data.nickname,
            follower_count: data.follower_count,
            like_count: data.like_count,
            avatar: data.avatar
          });
          
          // 用 API 数据补充/修正主页统计，避免 DOM 结构变化导致粉丝数不准
          if (userApiData) {
            const apiData = this._extractFromApiResponse(userApiData);
            if (apiData) {
              data.avatar = apiData.avatar || data.avatar;
              data.follower_count = apiData.follower_count || data.follower_count || 0;
              data.following_count = apiData.following_count || data.following_count || 0;
              data.like_count = apiData.like_count || data.like_count || 0;
              data.signature = apiData.signature || data.signature || '';
              data.verified = apiData.verified || data.verified || 0;
            }
          }
          
          await context.close();
          return { success: true, data };
        }
        
        // 如果 DOM 没拿到，但有 API 数据，使用 API 数据作为备用
        if (!domData?.follower_count && userApiData) {
          console.log('[Scraper] DOM 数据不完整，尝试使用 API 数据');
          break;
        }
      }
      
      // 4. 如果从 API 捕获到了数据，作为备用
      if (userApiData) {
        const userData = this._extractFromApiResponse(userApiData);
        const finalUrl = page.url();
        const userMatch = finalUrl.match(/\/user\/([a-zA-Z0-9_-]+)/);
        
        if (userData && userData.nickname) {
          const data = {
            ...userData,
            user_path: userMatch ? userMatch[1] : null,
            unique_id: userMatch ? userMatch[1] : ('dy_' + Date.now())
          };
          
          console.log('[Scraper] 使用 API 数据（备用）:', {
            nickname: data.nickname,
            follower_count: data.follower_count,
            like_count: data.like_count
          });
          
          await context.close();
          return { success: true, data };
        }
      }
      
      // 5. 最后尝试从 DOM 获取（使用之前获取的 domData 或重新获取）
      if (!domData) {
        domData = await this._getDataFromDOM(page);
      }
      const finalUrl = page.url();
      const userMatch = finalUrl.match(/\/user\/([a-zA-Z0-9_-]+)/);
      
      const data = {
        ...domData,
        user_path: userMatch ? userMatch[1] : null,
        unique_id: userMatch ? userMatch[1] : ('dy_' + Date.now()),
        follower_count: domData?.follower_count || 0,
        following_count: domData?.following_count || 0,
        like_count: domData?.like_count || 0
      };
      
      await context.close();
      
      if (!data || !data.nickname) {
        return { success: false, error: '无法提取用户信息' };
      }
      
      console.log('[Scraper] 最终提取数据:', {
        nickname: data.nickname,
        follower_count: data.follower_count,
        following_count: data.following_count,
        like_count: data.like_count
      });
      
      return { success: true, data };
      
    } catch (error) {
      console.error('[Scraper] 采集失败:', error.message);
      await context.close();
      return { success: false, error: error.message };
    }
  }
  
  // 从 DOM 提取数据
  async _getDataFromDOM(page) {
    try {
      console.log('[Scraper] _getDataFromDOM 开始执行');
      const result = await page.evaluate(() => {
        const result = {};
        
        function parseCount(text) {
          if (!text) return undefined;
          text = text.toString().replace(/,/g, '').trim();
          const numMatch = text.match(/(\d+\.?\d*)/);
          if (!numMatch) return undefined;
          const num = parseFloat(numMatch[1]);
          if (text.includes('亿')) return Math.floor(num * 100000000);
          if (text.includes('万') || /\d+w$/i.test(text)) return Math.floor(num * 10000);
          if (text.includes('千') || /\d+k$/i.test(text)) return Math.floor(num * 1000);
          return Math.floor(num);
        }
        
        // 找包含"粉丝"、"获赞"的元素（去掉关注）
        const labels = ['粉丝', '获赞'];
        const mapping = { '粉丝': 'follower_count', '获赞': 'like_count' };
        
        console.log('[Scraper Debug] 开始提取粉丝/获赞数据...');
        
        for (const label of labels) {
          // 用 XPath 找包含该文本的所有元素
          const xpath = `//*[contains(text(), "${label}")]`;
          const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
          
          let labelEl;
          let foundCount = 0;
          while ((labelEl = iterator.iterateNext())) {
            foundCount++;
            // 只处理纯文本匹配的元素（避免包含其他文本的元素）
            const text = labelEl.textContent?.trim();
            console.log(`[Scraper Debug] 找到 "${label}" 元素 #${foundCount}: "${text}"`);
            if (!text || text.length > label.length + 5) continue; // 跳过包含额外文本的元素
            
            // 获取下一个兄弟元素（数字）
            let next = labelEl.nextElementSibling;
            if (next) {
              const nextText = next.textContent?.trim();
              console.log(`[Scraper Debug] 下一个兄弟: "${nextText}"`);
              const val = parseCount(nextText);
              if (val !== undefined && val > 0 && val < 10000000000) {
                result[mapping[label]] = val;
                console.log(`[Scraper Debug] 从下一个兄弟获取 ${mapping[label]}: ${val}`);
                break;
              }
            }
            
            // 获取上一个兄弟元素
            let prev = labelEl.previousElementSibling;
            if (prev) {
              const prevText = prev.textContent?.trim();
              console.log(`[Scraper Debug] 上一个兄弟: "${prevText}"`);
              const val = parseCount(prevText);
                if (val !== undefined && val > 0 && val < 10000000000) {
                result[mapping[label]] = val;
                console.log(`[Scraper Debug] 从上一个兄弟获取 ${mapping[label]}: ${val}`);
                break;
              }
            }
            
            // 获取父元素的子元素（数字可能在同一父元素内）
            const parent = labelEl.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children);
              const idx = siblings.indexOf(labelEl);
              console.log(`[Scraper Debug] 父元素有 ${siblings.length} 个子元素，当前索引 ${idx}`);
              
              // 检查相邻元素
              for (let offset of [-1, 1]) {
                const adj = siblings[idx + offset];
                if (adj && adj !== labelEl) {
                  const adjText = adj.textContent?.trim();
                  const val = parseCount(adjText);
                  console.log(`[Scraper Debug] 相邻元素 [${idx + offset}]: "${adjText}" -> ${val}`);
                  if (val !== undefined && val > 0 && val < 10000000000) {
                    result[mapping[label]] = val;
                    console.log(`[Scraper Debug] 从相邻元素获取 ${mapping[label]}: ${val}`);
                    break;
                  }
                }
              }
              if (result[mapping[label]]) break;
            }
          }
          console.log(`[Scraper Debug] "${label}" 找到 ${foundCount} 个元素，结果: ${result[mapping[label]] || '未获取'}`);
        }
        
        // 从 meta og:description 提取
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) {
          const content = ogDesc.getAttribute('content') || '';
          const fm = content.match(/粉丝[:：\s]+(\d+\.?\d*[万千]?)/);
          const gim = content.match(/关注[:：\s]+(\d+\.?\d*[万千]?)/);
          const lim = content.match(/点赞[:：\s]+(\d+\.?\d*[万千]?)/) || content.match(/获赞[:：\s]+(\d+\.?\d*[万千]?)/);
          if (fm) result.follower_count = parseCount(fm[1]);
          if (gim) result.following_count = parseCount(gim[1]);
          if (lim) result.like_count = parseCount(lim[1]);
        }
        
        // 从 title 提取昵称
        const title = document.querySelector('title');
        if (title) {
          const m = title.textContent.match(/(.+?)的抖音/);
          if (m) result.nickname = m[1].trim();
        }
        
        // 从 h1 提取昵称
        const h1 = document.querySelector('h1');
        if (h1 && !result.nickname) {
          result.nickname = h1.textContent.trim();
        }
        
        // 提取头像 - 优先从用户主页头像区域获取（非右上角登录用户头像）
        const avatarSelectors = [
          // 用户主页头像区域（最优先）
          '[class*="user-info"] img[src*="douyinpic.com"]',
          '[class*="userInfo"] img[src*="douyinpic.com"]',
          '[class*="userAvatar"] img[src*="douyinpic.com"]',
          '[class*="user-avatar"] img[src*="douyinpic.com"]',
          // 用户页面大头像（通常在个人信息区域）
          '[class*="avatar-container"] img',
          '[class*="avatarContainer"] img',
          // 侧边栏用户头像
          '[class*="side"] img[src*="douyinpic.com"]',
          '[class*="menu"] img[src*="douyinpic.com"]',
          // 用户页面头像区域
          'img[src*="douyinpic.com"][class*="avatar"]',
          // 通用 avatar 类
          '.avatar img',
          '[class*="avatar"] img',
          'img[class*="avatar"]',
          // 特定数据属性
          '[data-e2e="user-avatar"] img',
          '[data-e2e="avatar"] img',
          // alt 属性
          'img[alt*="头像"]',
          'img[alt*="avatar"]'
        ];
        
        // 排除 header/topbar 区域的头像（那是登录用户的头像，不是被监控用户的）
        const excludeSelectors = ['header', '[class*="topbar"]', '[class*="header"]', '[class*="TopBar"]'];
        
        for (const sel of avatarSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            // 检查是否在 header/topbar 区域内（排除登录用户头像）
            const inHeader = excludeSelectors.some(ex => el.closest(ex));
            if (inHeader) continue;
            
            const src = el.src || el.getAttribute('src');
            if (src && !src.includes('data:image') && !src.includes('svg')) {
              result.avatar = src;
              console.log('[Scraper Debug] 找到用户主页头像:', sel, src.substring(0, 100));
              break;
            }
          }
        }
        
        // 如果上面的选择器都没找到，再尝试不排除 header 的方式
        if (!result.avatar) {
          const fallbackSelectors = [
            'img[src*="aweme-avatar"]',
            'img[src*="douyinpic.com"]',
          ];
          for (const sel of fallbackSelectors) {
            const imgs = document.querySelectorAll(sel);
            for (const img of imgs) {
              const inHeader = excludeSelectors.some(ex => img.closest(ex));
              if (inHeader) continue;
              const src = img.src || img.getAttribute('src');
              if (src && !src.includes('data:image') && !src.includes('svg')) {
                result.avatar = src;
                console.log('[Scraper Debug] 找到头像(fallback):', sel, src.substring(0, 100));
                break;
              }
            }
            if (result.avatar) break;
          }
        }
        
        console.log('[Scraper Debug] _getDataFromDOM 结果:', JSON.stringify(result));
        return result;
      });
      console.log('[Scraper] _getDataFromDOM 完成:', JSON.stringify(result));
      return result;
    } catch (e) {
      console.log('[Scraper] DOM提取失败:', e.message);
      return {};
    }
  }
  
  // 从API响应中提取用户数据
  _extractFromApiResponse(response) {
    if (!response) return null;
    
    const result = {};
    
    function parseCount(text) {
      if (!text) return 0;
      text = text.toString().replace(/,/g, '').trim();
      const numMatch = text.match(/(\d+\.?\d*)/);
      if (!numMatch) return 0;
      const num = parseFloat(numMatch[1]);
      if (text.includes('亿')) return Math.floor(num * 100000000);
      if (text.includes('万') || /\d+w$/i.test(text)) return Math.floor(num * 10000);
      if (text.includes('千') || /\d+k$/i.test(text)) return Math.floor(num * 1000);
      return Math.floor(num);
    }
    
    // 调试：打印完整的响应对象
    console.log('[Scraper Debug] Response keys:', Object.keys(response));
    if (response?.user) {
      console.log('[Scraper Debug] user keys:', Object.keys(response.user));
      console.log('[Scraper Debug] avatar_thumb:', JSON.stringify(response.user.avatar_thumb)?.substring(0, 200));
      console.log('[Scraper Debug] avatar_larger:', JSON.stringify(response.user.avatar_larger)?.substring(0, 200));
      console.log('[Scraper Debug] avatar_medium:', JSON.stringify(response.user.avatar_medium)?.substring(0, 200));
    }
    
    // 尝试各种可能的响应结构
    const userInfo = response?.user || 
                    response?.user_info ||
                    response?.author ||
                    response?.aweme_author ||
                    response?.userDetails ||
                    response?.data?.user ||
                    response?.data?.author ||
                    (Array.isArray(response?.user_list) ? response.user_list[0]?.user : null) ||
                    (Array.isArray(response?.item_list) ? response.item_list[0]?.author : null);
    
    if (userInfo) {
      result.nickname = userInfo.nickname || userInfo.userName || userInfo.unique_id || userInfo.short_id;
      result.avatar = userInfo.avatar_thumb?.url_list?.[0] || 
                    userInfo.avatar_url || 
                    userInfo.avatar ||
                    userInfo.download_addr?.url_list?.[0];
      result.signature = userInfo.signature || userInfo.desc;
      result.follower_count = userInfo.follower_count || userInfo.followerCount || 0;
      result.following_count = userInfo.following_count || userInfo.followingCount || 0;
      result.like_count = userInfo.total_favorited || 
                         userInfo.liked_count || 
                         userInfo.favorited_count ||
                         userInfo.like_count ||
                         userInfo.aweme_count * 100 || // 估算
                         0;
      result.verified = userInfo.verified ? 1 : 0;
      
      // 确保数字是整数
      result.follower_count = parseCount(String(result.follower_count));
      result.following_count = parseCount(String(result.following_count));
      result.like_count = parseCount(String(result.like_count));
    }
    
    return Object.keys(result).length > 0 ? result : null;
  }

  // 从视频详情页提取作者信息
  async _extractAuthorFromContentPage(page) {
    try {
      const data = await page.evaluate(() => {
        const result = {};
        
        // 尝试多种选择器提取作者名
        const authorSelectors = [
          '[data-e2e="video-author-name"]',
          '.author-name',
          '.author-card .name',
          '[class*="author"] [class*="name"]',
          '.user-info .nickname'
        ];
        
        for (const sel of authorSelectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim()) {
            result.nickname = el.textContent.trim();
            break;
          }
        }
        
        // 尝试提取作者头像
        const avatarSelectors = [
          '[data-e2e="video-author-avatar"] img',
          '.author-avatar img',
          '.author-card img',
          '[class*="author"] img'
        ];
        
        for (const sel of avatarSelectors) {
          const el = document.querySelector(sel);
          if (el && el.src) {
            result.avatar = el.src;
            break;
          }
        }
        
        // 尝试提取作者主页链接
        const authorLinkSelectors = [
          '[data-e2e="video-author-name"] a',
          '.author-name a',
          '.author-card a'
        ];
        
        for (const sel of authorLinkSelectors) {
          const el = document.querySelector(sel);
          if (el && el.href) {
            result.author_link = el.href;
            break;
          }
        }
        
        // 尝试提取粉丝数
        const fanSelectors = [
          '[data-e2e="video-author-fans"]',
          '.author-fans',
          '.fans-count'
        ];
        
        for (const sel of fanSelectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim()) {
            result.follower_count = parseCount(el.textContent);
            break;
          }
        }
        
        // 提取页面标题作为备用
        if (!result.nickname) {
          const title = document.querySelector('title');
          if (title) {
            const titleText = title.textContent;
            // 抖音视频页标题格式通常是 "视频标题 - 用户名 的抖音"
            const dashIndex = titleText.lastIndexOf(' - ');
            if (dashIndex > 0) {
              const afterDash = titleText.substring(dashIndex + 3);
              const dyIndex = afterDash.lastIndexOf('的抖音');
              if (dyIndex > 0) {
                result.nickname = afterDash.substring(0, dyIndex).trim();
              }
            }
          }
        }
        
        function parseCount(text) {
          if (!text) return 0;
          text = text.replace(/,/g, '');
          if (text.includes('w') || text.includes('W')) return parseFloat(text) * 10000;
          if (text.includes('k') || text.includes('K')) return parseFloat(text) * 1000;
          return parseInt(text) || 0;
        }
        
        return result;
      });
      
      // 如果有作者主页链接，提取 user_path
      if (data.author_link) {
        const userMatch = data.author_link.match(/\/user\/([a-zA-Z0-9]+)/);
        if (userMatch) {
          data.user_path = userMatch[1];
          data.unique_id = userMatch[1];
        }
      }
      
      // 如果没有 unique_id，用昵称生成一个
      if (!data.unique_id) {
        data.unique_id = 'dy_' + Date.now();
      }
      
      return data;
      
    } catch (error) {
      console.error('[Scraper] 提取作者信息失败:', error.message);
      return null;
    }
  }

  // 从用户主页提取完整用户数据
  async _extractUserData(page, url) {
    // 提取 user_path
    const userMatch = url.match(/\/user\/([a-zA-Z0-9_-]+)/);
    const userPath = userMatch ? userMatch[1] : null;
    
    console.log('[Scraper] 等待页面加载...');
    await page.waitForTimeout(5000);
    
    // 保存页面截图用于调试
    try {
      const path = require('path');
      const screenshotPath = path.join(__dirname, '..', 'debug_screenshot.png');
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log('[Scraper] 已保存调试截图:', screenshotPath);
    } catch (e) {
      console.log('[Scraper] 截图保存失败:', e.message);
    }
    
    // 保存页面 HTML 用于调试
    try {
      const path = require('path');
      const fs = require('fs');
      const htmlPath = path.join(__dirname, '..', 'debug_page.html');
      const html = await page.content();
      fs.writeFileSync(htmlPath, html);
      console.log('[Scraper] 已保存调试 HTML:', htmlPath);
    } catch (e) {
      console.log('[Scraper] HTML 保存失败:', e.message);
    }
    
    // 多次滚动确保数据加载
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1500);
    }
    
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2000);
    
    // 先尝试从页面的 SSR 数据中提取
    const ssrData = await page.evaluate(() => {
      // 抖音页面通常会把用户数据放在 window._SSR_HYDRATED_DATA 或类似的地方
      const anyWindow = window;
      if (anyWindow._SSR_HYDRATED_DATA) {
        return anyWindow._SSR_HYDRATED_DATA;
      }
      if (anyWindow.__INITIAL_STATE__) {
        return anyWindow.__INITIAL_STATE__;
      }
      if (anyWindow.__data) {
        return anyWindow.__data;
      }
      return null;
    });
    
    if (ssrData) {
      console.log('[Scraper] 找到 SSR 数据');
    }
    
    const data = await page.evaluate((ssrData) => {
      const result = {};
      
      // 辅助函数：解析数字
      function parseCount(text) {
        if (!text) return 0;
        text = text.toString().replace(/,/g, '').trim();
        const numMatch = text.match(/(\d+\.?\d*)/);
        if (!numMatch) return 0;
        const num = parseFloat(numMatch[1]);
        if (text.includes('亿')) return Math.floor(num * 100000000);
        if (text.includes('万') || /\d+w$/i.test(text)) return Math.floor(num * 10000);
        if (text.includes('千') || /\d+k$/i.test(text)) return Math.floor(num * 1000);
        return Math.floor(num);
      }
      
      // ========== 从 SSR 数据提取 ==========
      if (ssrData) {
        // 尝试各种可能的路径
        const userInfo = ssrData?.user?.userInfo || 
                        ssrData?.userInfo || 
                        ssrData?.user?.info ||
                        ssrData?.app?.user?.info ||
                        ssrData?.state?.user?.userInfo;
        
        if (userInfo) {
          result.nickname = userInfo.nickname || userInfo.userName || userInfo.name;
          result.avatar = userInfo.avatarUrl || userInfo.avatar;
          result.follower_count = parseCount(userInfo.followerCount || userInfo.fans);
          result.following_count = parseCount(userInfo.followingCount || userInfo.follow);
          result.like_count = parseCount(userInfo.totalFavorited || userInfo.likeCount || userInfo.likes);
          result.signature = userInfo.signature || userInfo.desc;
        }
      }
      
      // ========== 提取昵称 ==========
      if (!result.nickname) {
        const h1 = document.querySelector('h1');
        if (h1?.textContent?.trim()) {
          result.nickname = h1.textContent.trim();
        }
      }
      if (!result.nickname) {
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle) {
          const match = metaTitle.getAttribute('content')?.match(/(.+?)的主页/);
          if (match) result.nickname = match[1].trim();
        }
      }
      
      // ========== 提取头像 ==========
      if (!result.avatar) {
        const avatarImg = document.querySelector('img[src*="douyinpic.com"]') ||
                         document.querySelector('img[src*="p3-pc-sign"]') ||
                         document.querySelector('img[class*="avatar"]');
        if (avatarImg?.src && !avatarImg.src.includes('data:image')) {
          result.avatar = avatarImg.src;
        }
      }
      
      // ========== 核心：提取统计数据 ==========
      // 策略1：精确匹配 - 找包含"关注"、"粉丝"、"获赞"文本的元素，且紧邻数字
      const statsLabels = ['关注', '粉丝', '获赞'];
      const statMapping = {
        '关注': 'following_count',
        '粉丝': 'follower_count',
        '获赞': 'like_count'
      };
      
      // 遍历所有元素，找到标签和数字的精确组合
      const allElements = document.querySelectorAll('div, span, p, a, strong');
      
      for (const label of statsLabels) {
        if (result[statMapping[label]]) continue;
        
        for (const el of allElements) {
          const text = el.textContent?.trim();
          if (!text) continue;
          
          // 检查是否是纯标签文本
          if (text === label) {
            // 获取父元素
            const parent = el.parentElement;
            if (!parent) continue;
            
            // 获取父元素的所有子节点
            const siblings = Array.from(parent.children);
            const idx = siblings.indexOf(el);
            
            // 检查相邻元素
            const candidates = [];
            if (idx > 0) candidates.push(siblings[idx - 1]);
            if (idx < siblings.length - 1) candidates.push(siblings[idx + 1]);
            
            // 检查父元素的相邻元素
            const grandParent = parent.parentElement;
            if (grandParent) {
              const parentSiblings = Array.from(grandParent.children);
              const parentIdx = parentSiblings.indexOf(parent);
              if (parentIdx > 0) candidates.push(parentSiblings[parentIdx - 1]);
              if (parentIdx < parentSiblings.length - 1) candidates.push(parentSiblings[parentIdx + 1]);
            }
            
            for (const candidate of candidates) {
              const candidateText = candidate.textContent?.trim();
              if (candidateText && /^\d/.test(candidateText)) {
                const val = parseCount(candidateText);
                if (val > 0 && val < 100000000) {
                  result[statMapping[label]] = val;
                  break;
                }
              }
            }
            
            if (result[statMapping[label]]) break;
          }
        }
      }
      
      // 策略2：使用 XPath 查找包含特定文本的元素
      if (!result.following_count || !result.follower_count || !result.like_count) {
        const getElementByXPath = (xpath) => {
          const result = document.evaluate(
            xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
          );
          return result.singleNodeValue;
        };
        
        // 尝试找到包含"关注"、"粉丝"、"获赞"的元素，然后获取其兄弟或父元素中的数字
        for (const label of statsLabels) {
          if (result[statMapping[label]]) continue;
          
          // 找包含该文本的元素
          const xpath = `//*[contains(text(), "${label}")]`;
          const labelEl = getElementByXPath(xpath);
          
          if (labelEl) {
            // 获取父元素的所有子元素
            const parent = labelEl.parentElement;
            if (parent) {
              const allSiblings = Array.from(parent.querySelectorAll('*'));
              for (const sib of allSiblings) {
                if (sib === labelEl) continue;
                const sibText = sib.textContent?.trim();
                if (sibText && /^[\d\.]+[万k千]?$/.test(sibText)) {
                  const val = parseCount(sibText);
                  if (val > 0 && val < 100000000) {
                    result[statMapping[label]] = val;
                    break;
                  }
                }
              }
            }
          }
        }
      }
      
      // 策略3：从页面脚本标签中提取 JSON 数据
      if (!result.follower_count || !result.following_count || !result.like_count) {
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent || '';
          if (text.includes('follower') || text.includes('fans') || text.includes('following')) {
            // 尝试提取 JSON
            try {
              const jsonMatch = text.match(/\{[^}]*"follower"[^}]*\}/) ||
                               text.match(/\{[^}]*"fans"[^}]*\}/);
              if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                if (data.follower) result.follower_count = parseCount(data.follower);
                if (data.following) result.following_count = parseCount(data.following);
                if (data.fans) result.follower_count = parseCount(data.fans);
              }
            } catch (e) {}
          }
        }
      }
      
      // 策略4：从 meta 描述中提取
      if (!result.follower_count) {
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) {
          const content = ogDesc.getAttribute('content') || '';
          // 格式通常是：抖音号: xxx，粉丝: xxx，获赞: xxx
          const followerMatch = content.match(/粉丝[:\s]*(\d+\.?\d*[万千]?)/);
          const followingMatch = content.match(/关注[:\s]*(\d+\.?\d*[万千]?)/);
          const likeMatch = content.match(/获赞[:\s]*(\d+\.?\d*[万千]?)/);
          
          if (followerMatch) result.follower_count = parseCount(followerMatch[1]);
          if (followingMatch) result.following_count = parseCount(followingMatch[1]);
          if (likeMatch) result.like_count = parseCount(likeMatch[1]);
        }
      }
      
      return result;
    }, ssrData);
    
    if (userPath) {
      data.user_path = userPath;
      data.unique_id = userPath;
    } else {
      data.unique_id = 'dy_' + Date.now();
    }
    
    console.log('[Scraper] 提取数据:', {
      nickname: data.nickname,
      follower_count: data.follower_count,
      following_count: data.following_count,
      like_count: data.like_count
    });
    
    return data;
  }

  // 通用提取（兜底方案）
  async _extractUserDataGeneric(page, url) {
    // 先尝试从页面标题提取
    const titleData = await page.evaluate(() => {
      const title = document.querySelector('title');
      if (!title) return {};
      
      const titleText = title.textContent;
      const result = {};
      
      // 抖音标题格式: "xxx - 用户名 的抖音"
      const dashIndex = titleText.lastIndexOf(' - ');
      if (dashIndex > 0) {
        const afterDash = titleText.substring(dashIndex + 3);
        const dyIndex = afterDash.lastIndexOf('的抖音');
        if (dyIndex > 0) {
          result.nickname = afterDash.substring(0, dyIndex).trim();
        }
      }
      
      return result;
    });
    
    const data = { ...titleData };
    
    // 尝试提取更多信息
    const pageData = await page.evaluate(() => {
      const result = {};
      
      // 尝试找任何看起来像用户名的元素
      const allElements = document.querySelectorAll('h1, h2, [class*="name"], [class*="author"], [class*="nick"]');
      for (const el of allElements) {
        const text = el.textContent.trim();
        if (text && text.length > 1 && text.length < 30 && !text.includes('抖音') && !text.includes('登录')) {
          if (!result.nickname) result.nickname = text;
          break;
        }
      }
      
      // 尝试找头像
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        if (img.src && img.naturalWidth > 50 && img.naturalHeight > 50 && !img.src.includes('icon') && !img.src.includes('logo')) {
          if (!result.avatar) result.avatar = img.src;
          break;
        }
      }
      
      return result;
    });
    
    Object.assign(data, pageData);
    
    // 从URL提取 user_path
    const userMatch = url.match(/\/user\/([a-zA-Z0-9]+)/);
    if (userMatch) {
      data.user_path = userMatch[1];
      data.unique_id = userMatch[1];
    } else {
      data.unique_id = 'dy_' + Date.now();
    }
    
    return data;
  }

  // 获取用户视频列表
  // 返回值: { success, data, error, cookieExpired }
  
  // 关闭抖音登录弹窗
  async _closeLoginModal(page) {
    try {
      await page.waitForTimeout(2000);

      // 策略1：尝试点击关闭按钮
      const closeSelectors = [
        '[class*="loginClose"]',
        '[class*="close-button"]',
        '[class*="closeButton"]',
        'img[class*="close"]',
        '[data-e2e="close"]',
        'button[aria-label="关闭"]',
      ];

      for (const sel of closeSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            console.log(`[Scraper] 关闭登录弹窗: ${sel}`);
            await page.waitForTimeout(1000);
            return true;
          }
        } catch (e) { /* continue */ }
      }

      // 策略2：按 Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);

      // 策略3：移除高 z-index 的遮罩和弹窗元素
      await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
          const style = window.getComputedStyle(el);
          const zIndex = parseInt(style.zIndex) || 0;
          const position = style.position;
          // 移除高 z-index 的 fixed/absolute 元素（弹窗遮罩层）
          if (zIndex > 100 && (position === 'fixed' || position === 'absolute') && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
            el.remove();
          }
        });
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
        document.body.style.position = 'static';
      });
      console.log('[Scraper] 强制移除登录弹窗遮罩');
      await page.waitForTimeout(1000);
      return true;
    } catch (e) {
      console.log('[Scraper] 关闭弹窗异常:', e.message);
      return false;
    }
  }

  async getUserVideos(userPath, maxCount = 50, cookies = null, startDate = null, endDate = null) {
    let context;
    
    if (cookies && cookies.length > 0) {
      // 使用 Cookie 创建上下文
      const browser = await this.getBrowser();
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'zh-CN'
      });
      
      await context.addCookies(cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/'
      })));
      
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
      });
      
      console.log(`[Scraper] 使用 Cookie 获取视频列表: ${userPath}`);
    } else {
      context = await this.createContext();
      console.log(`[Scraper] 获取视频列表 (无Cookie): ${userPath}`);
    }
    
    // 时间范围参数日志
    if (startDate || endDate) {
      console.log(`[Scraper] 时间范围: ${startDate || '不限'} ~ ${endDate || '不限'}`);
    }
    
    const page = await context.newPage();
    
    try {
      const url = `https://www.douyin.com/user/${userPath}`;
      
      // ========== 策略1：通过API拦截获取完整数据（含播放量） ==========
      // 抖音Web端不显示播放量，但内部API /aweme/v1/web/aweme/post/ 返回完整统计数据
      let apiVideoData = []; // 从API收集的所有视频数据（不过滤时间）
      let apiCaptured = false;
      let shouldStopScrolling = false; // 是否应该停止滚动（已到达时间范围外）
      
      // 设置API响应拦截（必须在导航之前）
      page.on('response', async (response) => {
        const respUrl = response.url();
        // 匹配用户视频列表API
        if (respUrl.includes('/aweme/v1/web/aweme/post/') && response.status() === 200) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (!contentType.includes('application/json')) return;
            
            const data = await response.json();
            if (data && data.aweme_list && data.aweme_list.length > 0) {
              // 验证视频是否属于目标用户（检查author信息）
              const firstVideo = data.aweme_list[0];
              const authorUid = firstVideo?.author?.sec_uid || firstVideo?.author?.unique_id || '';
              console.log(`[Scraper] 捕获到视频列表API，包含 ${data.aweme_list.length} 个视频, author: ${authorUid.substring(0, 20)}`);
              
              // 如果API返回的视频属于其他用户（Cookie用户的视频），则跳过
              if (userPath && authorUid && !authorUid.includes(userPath) && !userPath.includes(authorUid)) {
                console.log(`[Scraper] API返回的视频不属于目标用户 ${userPath.substring(0, 20)}，跳过`);
                return;
              }
              
              apiCaptured = true;
              
              for (const item of data.aweme_list) {
                try {
                  const video = this._parseAwemeItem(item);
                  if (video) {
                    apiVideoData.push(video);
                    
                    // 检查是否已超出时间范围（用于提前停止滚动，但不丢弃数据）
                    if (startDate && video.published_at && !shouldStopScrolling) {
                      const pubDate = new Date(video.published_at);
                      const start = new Date(startDate);
                      if (pubDate < start) {
                        // 标记停止滚动，但已收集的数据保留（后面统一过滤）
                        shouldStopScrolling = true;
                        console.log(`[Scraper] 检测到视频 ${video.video_id} 发布时间 ${video.published_at} 早于 ${startDate}，后续将停止滚动`);
                      }
                    }
                  }
                } catch (e) {
                  console.log(`[Scraper] 解析视频项失败:`, e.message);
                }
              }
            } else {
              console.log(`[Scraper] 视频列表API返回空数据`);
            }
          } catch (e) {
            // JSON解析失败，忽略
          }
        }
      });
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      
      // 如果使用了Cookie，检测是否失效
      if (cookies && cookies.length > 0) {
        const cookieExpired = await this._checkCookieExpired(page);
        if (cookieExpired) {
          console.log('[Scraper] Cookie已失效，需要重新登录');
          await context.close();
          return { success: false, error: 'Cookie已失效，请重新扫码登录', cookieExpired: true };
        }
      }
      
      // 关闭登录弹窗
      await this._closeLoginModal(page);
      
      // 滚动加载更多视频，触发API分页请求
      // 如果设置了时间范围且已到达时间范围外的视频，提前停止滚动
      for (let i = 0; i < 15; i++) {
        if (shouldStopScrolling) {
          console.log(`[Scraper] 已到达时间范围边界，停止滚动`);
          break;
        }
        if (apiVideoData.length >= maxCount) {
          console.log(`[Scraper] 已收集 ${apiVideoData.length} 个视频，达到目标数量`);
          break;
        }
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(1500);
      }
      
      // 等待API数据收集完成
      await page.waitForTimeout(3000);
      
      // 去重（按video_id）
      const seenIds = new Set();
      const uniqueApiVideos = [];
      for (const v of apiVideoData) {
        if (!seenIds.has(v.video_id)) {
          seenIds.add(v.video_id);
          uniqueApiVideos.push(v);
        }
      }
      
      console.log(`[Scraper] API拦截获取到 ${uniqueApiVideos.length} 个视频（去重后）`);
      
      // ========== 统一时间范围过滤 ==========
      const filterByTimeRange = (videos) => {
        if (!startDate && !endDate) return videos;
        return videos.filter(v => {
          if (!v.published_at) return true; // 没有发布时间的不过滤
          const pubDate = new Date(v.published_at);
          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (pubDate < start) return false;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (pubDate > end) return false;
          }
          return true;
        });
      };
      
      // 如果API拦截成功且数据充足，直接使用API数据
      if (apiCaptured && uniqueApiVideos.length >= 5) {
        // 先按时间范围过滤，再限制数量
        const filtered = filterByTimeRange(uniqueApiVideos);
        const result = filtered.slice(0, maxCount);
        console.log(`[Scraper] 使用API数据，共 ${uniqueApiVideos.length} 个，时间过滤后 ${filtered.length} 个，返回 ${result.length} 个`);
        
        // 打印前3个视频的播放量用于验证
        for (let i = 0; i < Math.min(3, result.length); i++) {
          console.log(`[Scraper] 视频${i+1}: play=${result[i].play_count}, likes=${result[i].like_count}, title=${result[i].title?.substring(0, 30)}...`);
        }
        
        await context.close();
        return { success: true, data: result, cookieExpired: false };
      }
      
      // ========== 策略2：DOM回退方案（无播放量，但能获取其他数据） ==========
      console.log(`[Scraper] API拦截数据不足(${uniqueApiVideos.length}条)，使用DOM回退方案`);
      
      const videos = await page.evaluate(({ max, apiVideos }) => {
        const data = [];
        
        // 同时抓取视频和图文内容
        const contentLinks = document.querySelectorAll('a[href*="/video/"], a[href*="/note/"]');
        
        // 去重
        const seenIds = new Set();
        
        contentLinks.forEach((linkEl) => {
          if (data.length >= max) return;
          
          const content = {};
          content.url = linkEl.href;
          
          // 判断是视频还是图文
          const isNote = content.url.includes('/note/');
          const idMatch = content.url.match(/(?:video|note)\/(\d+)/);
          content.video_id = idMatch ? idMatch[1] : '';
          content.content_type = isNote ? 'note' : 'video';
          
          // 去重
          if (!content.video_id || seenIds.has(content.video_id)) return;
          seenIds.add(content.video_id);
          
          // 尝试从API数据中补充（如果有）
          const apiMatch = apiVideos.find(v => v.video_id === content.video_id);
          if (apiMatch) {
            Object.assign(content, apiMatch);
          } else {
            // 标题从img alt或链接内p标签获取
            const parentLi = linkEl.closest('li');
            const imgEl = parentLi ? parentLi.querySelector('img') : linkEl.querySelector('img');
            const titleP = linkEl.querySelector('p');
            
            content.title = titleP?.textContent?.trim() || imgEl?.alt?.trim() || '';
            content.cover = imgEl ? (imgEl.src || imgEl.dataset.src || '') : '';
            content.play_count = 0;
            content.like_count = 0;
            content.comment_count = 0;
            content.share_count = 0;
            content.collect_count = 0;
          }
          
          data.push(content);
        });
        
        return data;
      }, { max: maxCount, apiVideos: uniqueApiVideos });
      
      console.log(`[Scraper] DOM获取到 ${videos.length} 个视频，开始获取详情数据...`);
      
      // 为没有API数据的视频获取详情
      const validVideos = [];
      
      for (let i = 0; i < videos.length; i++) {
        const content = videos[i];
        
        // 如果已经有完整数据（来自API），直接保留
        if (content.title && content.like_count !== undefined && content.play_count !== undefined) {
          validVideos.push(content);
          continue;
        }
        
        try {
          const detail = await this._getContentDetail(page, content.video_id, content.content_type);
          
          if (detail.blocked) {
            console.log(`[Scraper] 内容 ${content.video_id} 被拦截，跳过`);
          } else {
            if (detail.published_at) content.published_at = detail.published_at;
            if (detail.play_count > 0) content.play_count = detail.play_count;
            if (detail.like_count !== undefined) content.like_count = detail.like_count;
            if (detail.comment_count !== undefined) content.comment_count = detail.comment_count;
            if (detail.share_count !== undefined) content.share_count = detail.share_count;
            if (detail.collect_count !== undefined) content.collect_count = detail.collect_count;
            if (detail.title) content.title = detail.title;
            
            if (content.title) {
              validVideos.push(content);
            } else {
              console.log(`[Scraper] 内容 ${content.video_id} 无标题，跳过`);
            }
          }
          
          if (i < videos.length - 1) {
            await page.waitForTimeout(1500);
          }
        } catch (e) {
          console.log(`[Scraper] 获取内容 ${content.video_id} 详情失败:`, e.message);
        }
      }
      
      videos.length = 0;
      videos.push(...validVideos);
      
      // 最终统一按时间范围过滤
      const filteredVideos = filterByTimeRange(videos);
      console.log(`[Scraper] DOM方案获取 ${videos.length} 个视频，时间过滤后 ${filteredVideos.length} 个`);
      
      await context.close();
      return { success: true, data: filteredVideos, cookieExpired: false };
      
    } catch (error) {
      console.error('[Scraper] 获取视频失败:', error.message);
      await context.close();
      return { success: false, error: error.message, cookieExpired: false };
    }
  }
  
  // 解析抖音 aweme API 返回的单个视频项
  _parseAwemeItem(item) {
    if (!item) return null;
    
    try {
      const video = {};
      
      // 视频/图文ID
      video.video_id = item.aweme_id || item.aweme_id_str || '';
      if (!video.video_id) return null;
      
      // 作者信息（用于验证视频归属）
      video.author_uid = item.author?.sec_uid || item.author?.unique_id || '';
      
      // 内容类型
      video.content_type = item.content_type === 68 ? 'note' : 'video';
      
      // 标题/描述
      video.title = item.desc || '';
      
      // 封面
      const cover = item.video?.cover?.url_list?.[0] || 
                    item.video?.origin_cover?.url_list?.[0] ||
                    item.video?.dynamic_cover?.url_list?.[0] || '';
      video.cover = cover;
      
      // 视频URL
      video.url = `https://www.douyin.com/${video.content_type === 'note' ? 'note' : 'video'}/${video.video_id}`;
      
      // ========== 统计数据（核心！） ==========
      const stats = item.statistics || {};
      video.play_count = stats.play_count || 0;
      video.like_count = stats.digg_count || 0;
      video.comment_count = stats.comment_count || 0;
      video.share_count = stats.share_count || 0;
      video.collect_count = stats.collect_count || 0;
      
      // 发布时间（Unix时间戳 → 日期字符串）
      if (item.create_time) {
        const date = new Date(item.create_time * 1000);
        video.published_at = date.getFullYear() + '-' + 
          String(date.getMonth() + 1).padStart(2, '0') + '-' + 
          String(date.getDate()).padStart(2, '0') + ' ' + 
          String(date.getHours()).padStart(2, '0') + ':' + 
          String(date.getMinutes()).padStart(2, '0');
      }
      
      return video;
    } catch (e) {
      console.log('[Scraper] _parseAwemeItem 异常:', e.message);
      return null;
    }
  }
  
  // 获取单个内容的详细信息（发布时间 + 互动数据）
  // contentType: 'video' | 'note'
  async _getContentDetail(page, contentId, contentType = 'video') {
    try {
      const contentUrl = contentType === 'note' 
        ? `https://www.douyin.com/note/${contentId}`
        : `https://www.douyin.com/video/${contentId}`;
      await page.goto(contentUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      
      // 检测是否被重定向到首页（公开账号无Cookie时可能被拦截）
      // 抖音是 SPA，URL 可能不变，需要检查页面内容
      const pageContent = await page.evaluate(() => {
        return {
          title: document.title,
          hasVideoPlayer: !!document.querySelector('[data-e2e="video-player-digg"]'),
          hasPublishTime: !!document.querySelector('[data-e2e="detail-video-publish-time"]'),
          hasNoteContent: !!document.querySelector('[data-e2e="note-content"]'),
          bodySnippet: document.body.innerText.substring(0, 200)
        };
      });
      
      if (!pageContent.hasVideoPlayer && !pageContent.hasPublishTime && !pageContent.hasNoteContent) {
        console.log(`[Scraper] 内容 ${contentId} 页面无视频/图文内容，可能被拦截 (title: ${pageContent.title})`);
        return { blocked: true };
      }
      
      // 关闭弹窗
      await page.evaluate(() => {
        document.querySelectorAll('[class*="mask"], [class*="overlay"]').forEach(el => el.remove());
        document.body.style.overflow = 'auto';
      });
      await page.waitForTimeout(500);
      
      // 提取详细数据
      const detail = await page.evaluate(() => {
        const result = {};
        
        // 1. 发布时间（视频用 data-e2e，图文用文本匹配）
        const timeEl = document.querySelector('[data-e2e="detail-video-publish-time"]');
        if (timeEl) {
          const match = timeEl.textContent.match(/发布时间：(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
          if (match) result.published_at = match[1];
        }
        // 备用：图文详情页没有 data-e2e，通过文本查找
        if (!result.published_at) {
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            const text = el.textContent?.trim();
            if (text && text.includes('发布时间：')) {
              const match = text.match(/发布时间：(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
              if (match) { result.published_at = match[1]; break; }
              // 也尝试匹配不带秒的格式
              const match2 = text.match(/发布时间：(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
              if (match2) { result.published_at = match2[1]; break; }
            }
          }
        }
        
        // 2. 点赞数 (video-player-digg)
        const likeEl = document.querySelector('[data-e2e="video-player-digg"]');
        if (likeEl) {
          const text = likeEl.textContent?.trim();
          if (text) {
            result.like_count = parseCount(text);
          }
        }
        
        // 3. 评论数 (feed-comment-icon)
        const commentEl = document.querySelector('[data-e2e="feed-comment-icon"]');
        if (commentEl) {
          const text = commentEl.textContent?.trim();
          if (text) {
            result.comment_count = parseCount(text);
          }
        }
        
        // 4. 收藏数 (video-player-collect)
        const collectEl = document.querySelector('[data-e2e="video-player-collect"]');
        if (collectEl) {
          const text = collectEl.textContent?.trim();
          result.collect_count = parseCount(text);
        }
        
        // 5. 分享数 (video-player-share)
        const shareEl = document.querySelector('[data-e2e="video-player-share"]');
        if (shareEl) {
          const text = shareEl.textContent?.trim();
          result.share_count = parseCount(text);
        }
        
        // 6. 播放量 - 尝试多种方式提取
        // 方式1: 从页面文本中匹配 "xxx次播放" 或 "xxx播放"
        const bodyText = document.body.innerText;
        const playMatch = bodyText.match(/(\d+\.?\d*[万wW]?)[\s]*次?播放/);
        if (playMatch) {
          result.play_count = parseCount(playMatch[1]);
        } else {
          // 方式2: 从视频播放器区域查找播放量元素
          const playEl = document.querySelector('[data-e2e="video-play-count"]') ||
                        document.querySelector('[class*="playCount"]') ||
                        document.querySelector('[class*="play-count"]');
          if (playEl) {
            result.play_count = parseCount(playEl.textContent);
          }
        }
        
        // 7. 标题 - 从详情页获取更准确的标题
        const titleEl = document.querySelector('[data-e2e="video-desc"]') || 
                       document.querySelector('h1') ||
                       document.querySelector('[class*="title"]');
        if (titleEl) {
          result.title = titleEl.textContent?.trim();
        }
        
        function parseCount(text) {
          if (!text) return 0;
          text = text.toString().replace(/,/g, '').trim();
          // 处理 "29.9万"、"1.1万" 等格式
          if (text.includes('万') || text.includes('w') || text.includes('W')) {
            const num = parseFloat(text.replace(/[万wW]/g, ''));
            return Math.round(num * 10000);
          }
          // 处理纯数字
          const num = parseInt(text);
          return isNaN(num) ? 0 : num;
        }
        
        return result;
      });
      
      return detail;
    } catch (e) {
      console.log(`[Scraper] 获取视频 ${contentId} 详情异常:`, e.message);
      return {};
    }
  }
}

module.exports = DouyinScraper;
