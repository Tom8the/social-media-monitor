// 抖音扫码登录服务 - 使用 Puppeteer + stealth 绕过反爬检测
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// 启用 stealth 插件
puppeteer.use(StealthPlugin());

// 存储扫码会话
class QRLoginService {
  constructor() {
    this.sessions = new Map();
  }

  // 创建新的扫码会话
  async createSession() {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      status: 'pending', // pending, scanned, confirmed, expired, error
      qrCodeUrl: null,   // 抖音返回的二维码页面URL
      qrToken: null,     // 用于轮询状态的token
      userData: null,
      error: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5分钟过期
      browser: null,
      page: null
    };

    this.sessions.set(sessionId, session);

    // 创建新会话前，先关闭所有旧会话的浏览器，避免残留进程冲突
    for (const [oldId, oldSession] of this.sessions) {
      if (oldId !== sessionId && oldSession.browser) {
        console.log(`[QRLogin] 清理旧会话浏览器: ${oldId}`);
        try {
          await oldSession.browser.close();
        } catch (e) {}
        oldSession.browser = null;
        oldSession.page = null;
      }
    }

    try {
      await this._startQRLogin(session);
    } catch (error) {
      console.error('[QRLogin] 启动扫码登录失败:', error.message);
      session.status = 'error';
      session.error = error.message;
    }

    // 启动过期检查
    this._startExpiryCheck(sessionId);

    return {
      sessionId,
      qrCode: null, // 不再需要二维码图片，用户在弹出的浏览器中扫码
      status: session.status,
      expiresAt: session.expiresAt
    };
  }

  // 启动浏览器并获取二维码
  async _startQRLogin(session) {
    console.log(`[QRLogin] 启动浏览器，会话: ${session.id}`);

    // 查找本地 Chrome 路径
    const chromePath = this._findChromePath();
    if (!chromePath) {
      throw new Error('未找到 Chrome 浏览器，请确保已安装 Chrome');
    }
    console.log('[QRLogin] 使用 Chrome:', chromePath);

    const browser = await puppeteer.launch({
      headless: false, // 显示浏览器窗口，让用户扫码
      executablePath: chromePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=800,700',
        '--disable-gpu',
        '--disable-dev-shm-usage'
      ]
    });

    // 每次创建新页面
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    session.browser = browser;
    session.page = page;

    // 拦截二维码 API 响应
    let qrCodeResolved = false;
    
    page.on('response', async (response) => {
      const url = response.url();
      
      // 拦截 get_qrcode 响应
      if (url.includes('get_qrcode') && !qrCodeResolved) {
        try {
          const data = await response.json();
          console.log('[QRLogin] 拦截到 get_qrcode 响应');
          
          // 解析响应数据
          const qrData = data.data || data;
          if (qrData.qrcode_index_url || qrData.token) {
            session.qrCodeUrl = qrData.qrcode_index_url || qrData.qrcode_url;
            session.qrToken = qrData.token;
            qrCodeResolved = true;
            console.log('[QRLogin] ✅ 获取到二维码URL');
            
            // 生成二维码图片
            await this._generateQRImage(session);
          }
        } catch (e) {
          console.log('[QRLogin] 解析 get_qrcode 响应失败:', e.message);
        }
      }
      
      // 拦截 check_qrconnect 响应，获取扫码状态
      if (url.includes('check_qrconnect')) {
        try {
          const data = await response.json();
          const checkData = data.data || data;
          
          if (checkData.status) {
            console.log('[QRLogin] 扫码状态:', checkData.status);
            
            if (checkData.status === 'scanned') {
              session.status = 'scanned';
            } else if (checkData.status === 'confirmed' || checkData.status === 'success') {
              // 不要在这里设置 confirmed，等 userData 提取完成后再设置
              // session.status = 'confirmed';
              // 扫码成功，等待页面跳转到用户主页
              this._waitForUserPage(session);
            }
          }
        } catch (e) {}
      }
    });

    // 访问抖音首页
    console.log('[QRLogin] 访问抖音...');
    try {
      await page.goto('https://www.douyin.com', { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 
      });
    } catch (e) {
      console.log('[QRLogin] 页面加载超时，等待页面稳定...');
    }

    // 等待页面稳定（等待URL不再变化）
    console.log('[QRLogin] 等待页面稳定...');
    let lastUrl = '';
    for (let i = 0; i < 10; i++) {
      await this._wait(2000);
      try {
        const currentUrl = page.url();
        if (currentUrl === lastUrl && currentUrl !== 'about:blank') break;
        lastUrl = currentUrl;
      } catch (e) {
        // 页面可能已 detached，尝试重新导航
        console.log('[QRLogin] 页面 detached，重新导航...');
        try {
          await page.goto('https://www.douyin.com', { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
          });
        } catch (e2) {
          console.log('[QRLogin] 重新导航失败:', e2.message);
        }
        break;
      }
    }

    // 检查是否被拦截
    try {
      const isBlocked = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return text.includes('非法应用') || text.includes('error_code');
      });

      if (isBlocked) {
        throw new Error('抖音检测到自动化访问，请稍后重试');
      }
    } catch (e) {
      if (e.message?.includes('自动化访问')) throw e;
      console.log('[QRLogin] 检查拦截状态失败，继续:', e.message);
    }

    // 点击登录按钮（增加重试）
    console.log('[QRLogin] 点击登录按钮...');
    let loginClicked = false;
    for (let retry = 0; retry < 3; retry++) {
      try {
        const clicked = await page.evaluate(() => {
          const btns = document.querySelectorAll('button, a');
          for (const btn of btns) {
            if (btn.textContent.trim() === '登录') {
              btn.click();
              return true;
            }
          }
          return false;
        });
        console.log('[QRLogin] 登录按钮点击结果:', clicked);
        if (clicked) { loginClicked = true; break; }
        await this._wait(2000);
      } catch (e) {
        console.log('[QRLogin] 点击登录按钮失败(重试' + (retry+1) + '):', e.message);
        await this._wait(2000);
      }
    }

    // 等待登录弹窗加载
    await this._wait(5000);

    // 等待二维码 API 被调用
    console.log('[QRLogin] 等待二维码...');
    for (let i = 0; i < 20; i++) {
      await this._wait(2000);
      if (session.qrCodeUrl) {
        console.log('[QRLogin] ✅ 二维码已生成');
        session.status = 'pending';
        break;
      }
    }

    if (!session.qrCodeUrl) {
      throw new Error('未能获取二维码，请重试');
    }

    // 开始监听登录状态
    this._monitorLoginStatus(session);

    return session;
  }

  // 生成二维码图片（截图二维码区域）
  async _generateQRImage(session) {
    try {
      const page = session.page;
      
      // 等待二维码元素加载
      await this._wait(3000);
      
      const qrPath = path.join(__dirname, '..', 'qrcodes', `${session.id}.png`);
      const qrDir = path.dirname(qrPath);
      if (!fs.existsSync(qrDir)) {
        fs.mkdirSync(qrDir, { recursive: true });
      }
      
      // 方法1: 用 JS 找到二维码图片元素的位置，精确裁剪
      try {
        const rect = await page.evaluate(() => {
          // 查找登录弹窗中的二维码图片
          const imgs = document.querySelectorAll('img');
          for (const img of imgs) {
            const box = img.getBoundingClientRect();
            // 二维码图片通常是正方形，尺寸在 150-350px 之间
            if (box.width > 100 && box.width < 400 && box.height > 100 && box.height < 400) {
              // 检查是否在登录弹窗内
              const parent = img.closest('[class*="login"]') || 
                            img.closest('[class*="dialog"]') ||
                            img.closest('[class*="modal"]');
              if (parent) {
                return { x: box.x, y: box.y, width: box.width, height: box.height };
              }
            }
          }
          // 查找 canvas 元素
          const canvases = document.querySelectorAll('canvas');
          for (const canvas of canvases) {
            const box = canvas.getBoundingClientRect();
            if (box.width > 100 && box.width < 400 && box.height > 100 && box.height < 400) {
              const parent = canvas.closest('[class*="login"]') || 
                            canvas.closest('[class*="dialog"]') ||
                            canvas.closest('[class*="modal"]');
              if (parent) {
                return { x: box.x, y: box.y, width: box.width, height: box.height };
              }
            }
          }
          return null;
        });
        
        if (rect && rect.width > 50 && rect.height > 50) {
          // 加一点 padding
          const padding = 10;
          await page.screenshot({
            path: qrPath,
            clip: {
              x: Math.max(0, rect.x - padding),
              y: Math.max(0, rect.y - padding),
              width: rect.width + padding * 2,
              height: rect.height + padding * 2
            }
          });
          session.qrImagePath = qrPath;
          console.log(`[QRLogin] 二维码裁剪截图已保存: ${rect.width}x${rect.height}`);
          return;
        }
      } catch (e) {
        console.log('[QRLogin] 裁剪截图失败:', e.message);
      }
      
      // 方法2: 截取整个页面
      await page.screenshot({ path: qrPath, fullPage: false });
      session.qrImagePath = qrPath;
      console.log('[QRLogin] 页面截图已保存（未裁剪）');
      
    } catch (error) {
      console.error('[QRLogin] 生成二维码图片失败:', error.message);
    }
  }

  // 监听登录状态
  async _monitorLoginStatus(session) {
    console.log(`[QRLogin] 开始监听登录状态: ${session.id}`);

    const startTime = Date.now();
    const maxWaitTime = 5 * 60 * 1000; // 5分钟

    try {
      while (Date.now() - startTime < maxWaitTime && 
             session.status !== 'confirmed' && 
             session.status !== 'expired' &&
             session.status !== 'error') {
        
        await this._wait(3000);
        
        try {
          const page = session.page;
          if (!page) break;
          
          const currentUrl = page.url();
          
          // 方法1: 检查是否跳转到用户主页
          if (currentUrl.includes('/user/')) {
            console.log('[QRLogin] 检测到已登录，跳转到用户主页');
            // 保存Cookie
            try {
              const cookies = await page.cookies();
              session.cookieData = JSON.stringify(cookies);
              console.log('[QRLogin] 已保存Cookie，数量:', cookies.length);
            } catch (e) {
              console.log('[QRLogin] 保存Cookie失败:', e.message);
            }
            const userData = await this._extractUserData(session);
            session.userData = userData;
            session.status = 'confirmed';
            console.log('[QRLogin] 用户数据提取完成:', userData?.nickname);
            // 登录成功，立即关闭浏览器
            console.log('[QRLogin] 登录成功，立即关闭浏览器');
            await this._closeSession(session);
            break;
          }
          
          // 方法1.5: 如果已在抖音域名且不在登录页，尝试跳转到用户主页获取sec_uid
          if (currentUrl.includes('douyin.com') && !currentUrl.includes('passport') && !currentUrl.includes('login')) {
            console.log('[QRLogin] 已登录抖音，尝试跳转到用户主页获取sec_uid');
            try {
              // 保存Cookie
              const cookies = await page.cookies();
              session.cookieData = JSON.stringify(cookies);
              console.log('[QRLogin] 已保存Cookie，数量:', cookies.length);
              
              // 尝试访问用户主页（/user/self 是SPA，需要等待前端路由跳转）
              await page.goto('https://www.douyin.com/user/self', { waitUntil: 'domcontentloaded', timeout: 30000 });
              
              // 等待URL变化（前端路由跳转到实际用户主页）
              console.log('[QRLogin] 等待前端路由跳转...');
              for (let i = 0; i < 15; i++) {
                await this._wait(1000);
                const newUrl = page.url();
                console.log('[QRLogin] 当前URL:', newUrl.substring(0, 80));
                if (newUrl.includes('/user/') && !newUrl.includes('/user/self')) {
                  console.log('[QRLogin] 已跳转到用户主页:', newUrl);
                  break;
                }
              }
              
              const userData = await this._extractUserData(session);
              session.userData = userData;
              session.status = 'confirmed';
              console.log('[QRLogin] 用户数据提取完成:', userData?.nickname, 'sec_uid:', userData?.unique_id?.substring(0, 20));
              
              // 登录成功，立即关闭浏览器
              console.log('[QRLogin] 登录成功，立即关闭浏览器');
              await this._closeSession(session);
              break;
            } catch (e) {
              console.log('[QRLogin] 跳转用户主页失败:', e.message);
            }
          }
          
          // 方法2: 检查页面中是否出现登录后的用户头像（data-e2e="user-avatar"）
          const isLoggedIn = await page.evaluate(() => {
            // 检查是否有用户头像（登录成功的标志）
            const avatar = document.querySelector('[data-e2e="user-avatar"]');
            if (avatar) return true;
            // 检查登录弹窗是否已消失
            const loginModal = document.querySelector('[class*="login"]') || 
                              document.querySelector('[class*="Login"]');
            // 如果没有登录弹窗且有用户相关元素
            if (!loginModal) {
              const userElements = document.querySelector('[data-e2e="user-info"]') ||
                                  document.querySelector('[class*="user-avatar"]');
              if (userElements) return true;
            }
            return false;
          });
          
          if (isLoggedIn) {
            console.log('[QRLogin] 检测到页面已登录');
            // 保存Cookie
            try {
              const cookies = await page.cookies();
              session.cookieData = JSON.stringify(cookies);
              console.log('[QRLogin] 已保存Cookie，数量:', cookies.length);
            } catch (e) {
              console.log('[QRLogin] 保存Cookie失败:', e.message);
            }
            // 尝试提取用户数据
            const userData = await this._extractUserDataFromPage(session);
            session.userData = userData;
            session.status = 'confirmed';
            console.log('[QRLogin] 用户数据提取完成:', userData?.nickname);
            
            // 登录成功，立即关闭浏览器
            console.log('[QRLogin] 登录成功，立即关闭浏览器');
            await this._closeSession(session);
            break;
          }
          
          // 方法3: 检查 URL 是否从登录页变为其他页面
          if (currentUrl.includes('passport') || currentUrl.includes('login')) {
            // 还在登录页，继续等待
          } else if (currentUrl.includes('douyin.com') && !currentUrl.includes('passport')) {
            // 已离开登录页，可能登录成功
            console.log('[QRLogin] 检测到页面已离开登录区域:', currentUrl);
            
            // 等待页面完全加载并可能跳转到用户主页
            await this._wait(5000);
            
            // 检查是否已跳转到用户主页
            let checkUrl = page.url();
            console.log('[QRLogin] 检查当前URL:', checkUrl);
            
            // 如果还在非用户主页（如 jingxuan），尝试点击个人中心进入用户主页
            if (!checkUrl.includes('/user/')) {
              console.log('[QRLogin] 未在用户主页，尝试点击个人中心...');
              try {
                await page.evaluate(() => {
                  // 尝试点击个人中心链接或头像
                  const links = Array.from(document.querySelectorAll('a'));
                  const profileLink = links.find(a => 
                    a.href.includes('/user/') || 
                    a.textContent.includes('我的') ||
                    a.textContent.includes('个人中心')
                  );
                  if (profileLink) {
                    console.log('[QRLogin] 点击个人中心:', profileLink.href);
                    profileLink.click();
                  }
                });
                
                // 等待跳转到用户主页
                await this._wait(5000);
                checkUrl = page.url();
                console.log('[QRLogin] 点击后URL:', checkUrl);
              } catch (e) {
                console.log('[QRLogin] 点击个人中心失败:', e.message);
              }
            }
            
            // 确认已不在登录页
            if (!checkUrl.includes('passport') && !checkUrl.includes('login')) {
              // 保存Cookie
              try {
                const cookies = await page.cookies();
                session.cookieData = JSON.stringify(cookies);
                console.log('[QRLogin] 已保存Cookie，数量:', cookies.length);
              } catch (e) {
                console.log('[QRLogin] 保存Cookie失败:', e.message);
              }
              const userData = await this._extractUserDataFromPage(session);
              session.userData = userData;
              session.status = 'confirmed';
              console.log('[QRLogin] 用户数据提取完成:', userData?.nickname);
              
              // 登录成功，立即关闭浏览器
              console.log('[QRLogin] 登录成功，立即关闭浏览器');
              await this._closeSession(session);
              break;
            }
          }
          
          // 打印当前URL方便调试
          console.log('[QRLogin] 等待扫码中... URL:', currentUrl.substring(0, 80));
          
        } catch (e) {
          // page 可能已被关闭
          console.log('[QRLogin] 检查页面状态出错:', e.message);
        }
      }

      if (session.status === 'pending') {
        session.status = 'expired';
      }

    } catch (error) {
      console.error('[QRLogin] 监听登录状态出错:', error.message);
      session.status = 'error';
      session.error = error.message;
    } finally {
      // 只有登录未成功时才自动关闭浏览器，成功时让 _startExpiryCheck 处理
      if (session.status !== 'confirmed') {
        setTimeout(() => {
          this._closeSession(session);
        }, 5000);
      }
    }
  }

  // 从当前页面提取用户数据
  async _extractUserDataFromPage(session) {
    try {
      const page = session.page;
      const currentUrl = page.url();
      
      console.log('[QRLogin] 从页面提取用户数据:', currentUrl);
      
      // 方法1: 如果在用户主页，使用原有提取逻辑获取完整数据（包括粉丝数、获赞数）
      if (currentUrl.includes('/user/')) {
        console.log('[QRLogin] 检测到用户主页，使用完整提取逻辑');
        return await this._extractUserData(session);
      }
      
      // 方法2: 使用通用的选择器从任何抖音页面提取用户信息
      const userData = await page.evaluate(() => {
        const result = { nickname: '', avatar: '', unique_id: '' };
        
        // 尝试多种方式获取昵称
        // 1. 从用户菜单/头像区域
        const userMenu = document.querySelector('[data-e2e="user-menu"]');
        if (userMenu) {
          const nameEl = userMenu.querySelector('[class*="name"]') || 
                        userMenu.querySelector('span');
          if (nameEl) result.nickname = nameEl.textContent.trim();
        }
        
        // 2. 从页面头部用户信息
        if (!result.nickname) {
          const headerUser = document.querySelector('header [class*="user"]');
          if (headerUser) {
            const nameEl = headerUser.querySelector('span') || 
                          headerUser.querySelector('[class*="name"]');
            if (nameEl) result.nickname = nameEl.textContent.trim();
          }
        }
        
        // 3. 从个人中心链接
        if (!result.nickname) {
          const profileLink = document.querySelector('a[href*="/user/"]');
          if (profileLink) {
            const text = profileLink.textContent.trim();
            if (text && text.length < 50) result.nickname = text;
          }
        }
        
        // 4. 从meta或title提取
        if (!result.nickname) {
          const title = document.querySelector('title')?.textContent;
          if (title && title.includes('抖音')) {
            const match = title.match(/(.+?)的?抖音/);
            if (match) result.nickname = match[1].trim();
          }
        }
        
        // 获取头像 - 扩展选择器（按优先级排序）
        const avatarSelectors = [
          // 用户菜单中的头像
          '[data-e2e="user-avatar"] img',
          '[data-e2e="user-avatar"]',
          // 头部导航栏头像
          'header img[class*="avatar"]',
          'header [class*="avatar"] img',
          // 个人中心入口的头像
          'a[href*="/user/"] img',
          // 侧边栏头像
          '[class*="side"] img[class*="avatar"]',
          '[class*="menu"] img[class*="avatar"]',
          // 抖音图片域名
          'img[src*="douyinpic.com"]',
          'img[src*="p3.douyinpic.com"]',
          'img[src*="p11.douyinpic.com"]',
          // 通用 avatar 类
          '[class*="avatar"] img',
          '[class*="Avatar"] img',
          'img[class*="avatar"]'
        ];
        
        for (const sel of avatarSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const src = el.src || el.getAttribute('src');
            if (src && !src.includes('data:image') && !src.includes('svg')) {
              result.avatar = src;
              console.log('[QRLogin Debug] 找到头像:', sel, src.substring(0, 100));
              break;
            }
          }
        }
        
        // 获取用户ID（从链接）- 排除 self
        const userLinks = document.querySelectorAll('a[href*="/user/"]');
        for (const link of userLinks) {
          const match = link.href.match(/\/user\/([^\/\?]+)/);
          if (match && match[1] !== 'self' && match[1].length > 10) {
            result.unique_id = match[1];
            break;
          }
        }
        
        return result;
      });
      
      console.log('[QRLogin] 提取到用户信息:', userData);
      
      // 如果提取到了有效的昵称（不是"我的"、"登录"等通用文字），直接返回
      const invalidNames = ['我的', '登录', '个人中心', '我', '登录后即可观看喜欢、收藏作品'];
      if (userData.nickname && !invalidNames.includes(userData.nickname)) {
        return {
          nickname: userData.nickname,
          avatar: userData.avatar || '',
          platform: 'douyin',
          unique_id: userData.unique_id || ('dy_qr_' + Date.now()),
          follower_count: 0,
          following_count: 0,
          like_count: 0,
          signature: '扫码登录导入',
          verified: 0
        };
      }
      
      // 方法3: 尝试访问用户主页获取详细信息
      console.log('[QRLogin] 尝试访问用户主页获取信息...');
      try {
        // 先尝试点击个人中心链接
        await page.evaluate(() => {
          const profileLink = document.querySelector('a[href*="/user/"]') ||
                             document.querySelector('[data-e2e="user-menu"] a');
          if (profileLink) profileLink.click();
        });
        
        await this._wait(5000);
        
        // 检查是否跳转到了用户主页
        const newUrl = page.url();
        if (newUrl.includes('/user/')) {
          return await this._extractUserData(session);
        }
      } catch (e) {
        console.log('[QRLogin] 访问用户主页失败:', e.message);
      }
      
      // 返回默认数据
      return {
        nickname: '抖音用户_' + Date.now().toString().slice(-6),
        avatar: '',
        platform: 'douyin',
        unique_id: 'dy_qr_' + Date.now(),
        follower_count: 0,
        following_count: 0,
        like_count: 0,
        signature: '扫码登录导入',
        verified: 0
      };
      
    } catch (error) {
      console.error('[QRLogin] 提取用户数据失败:', error.message);
      return {
        nickname: '抖音用户_' + Date.now().toString().slice(-6),
        platform: 'douyin',
        unique_id: 'dy_qr_' + Date.now(),
        follower_count: 0,
        following_count: 0,
        like_count: 0,
        signature: '扫码登录导入',
        verified: 0
      };
    }
  }

  // 等待用户页面加载并提取数据
  async _waitForUserPage(session) {
    console.log('[QRLogin] 等待跳转到用户主页...');
    
    for (let i = 0; i < 30; i++) {
      await this._wait(2000);
      
      try {
        const url = session.page?.url();
        if (url && url.includes('/user/')) {
          console.log('[QRLogin] 已跳转到用户主页:', url);
          
          // 等待页面加载
          await this._wait(5000);
          
          // 保存 Cookie 到 session
          try {
            const cookies = await session.page.cookies();
            session.cookieData = JSON.stringify(cookies);
            console.log('[QRLogin] 已保存 Cookie，数量:', cookies.length);
          } catch (e) {
            console.log('[QRLogin] 保存 Cookie 失败:', e.message);
          }
          
          // 提取用户数据
          try {
            const userData = await this._extractUserData(session);
            session.userData = userData;
            session.status = 'confirmed';
            console.log('[QRLogin] 用户数据:', userData?.nickname);
            
            // 登录成功，立即关闭浏览器
            console.log('[QRLogin] 登录成功，立即关闭浏览器');
            await this._closeSession(session);
            return;
          } catch (e) {
            console.log('[QRLogin] 提取用户数据失败:', e.message);
            session.error = '提取用户数据失败: ' + e.message;
            session.status = 'error';
            return;
          }
        }
      } catch (e) {
        console.log('[QRLogin] 检查页面状态失败:', e.message);
      }
    }
    
    // 超时处理
    console.log('[QRLogin] 等待用户主页超时');
    session.error = '等待跳转到用户主页超时';
    session.status = 'error';
  }

  // 从页面提取用户数据
  async _extractUserData(session) {
    try {
      const page = session.page;
      let url = page.url();
      
      // 重新获取当前URL（可能在调用前已经跳转了）
      console.log('[QRLogin] _extractUserData, 初始URL:', url);
      
      // 如果URL是 /user/self，等待前端路由跳转完成
      if (url.includes('/user/self')) {
        console.log('[QRLogin] URL是/user/self，等待前端路由跳转...');
        for (let i = 0; i < 10; i++) {
          await this._wait(1000);
          url = page.url();
          if (url.includes('/user/') && !url.includes('/user/self')) {
            console.log('[QRLogin] 前端路由已跳转到:', url.substring(0, 80));
            break;
          }
        }
      }
      
      console.log('[QRLogin] _extractUserData, 最终URL:', url);
      
      // 等待页面完全加载
      await this._wait(3000);
      
      // 1. 先从右上角获取头像（无论在哪个页面都能获取）
      const headerAvatar = await page.evaluate(() => {
        // 右上角头像 - 抖音页面 header 区域的头像
        const selectors = [
          // header 右侧区域的头像
          'header img[src*="douyinpic.com"]',
          'header img[class*="avatar"]',
          'header [class*="avatar"] img',
          // 通用右上角头像
          '[class*="header"] img[src*="douyinpic.com"]',
          '[class*="topbar"] img[src*="douyinpic.com"]',
          // data-e2e 属性
          '[data-e2e="user-avatar"] img',
          '[data-e2e="user-avatar"]',
          // 任何 douyinpic 头像
          'img[src*="douyinpic.com"][class*="avatar"]',
          'img[src*="p3.douyinpic.com"]',
          'img[src*="p11.douyinpic.com"]',
          'img[src*="p6.douyinpic.com"]',
          'img[src*="p9.douyinpic.com"]',
          'img[src*="p26.douyinpic.com"]',
          'img[src*="p77.douyinpic.com"]',
        ];
        
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            const src = el.src || el.getAttribute('src') || '';
            if (src && !src.includes('data:image') && !src.includes('svg') && src.includes('douyinpic')) {
              return src;
            }
          }
        }
        
        // 最后兜底：找所有 douyinpic 图片，取最小的（通常是头像）
        const allImgs = document.querySelectorAll('img[src*="douyinpic.com"]');
        let smallestAvatar = null;
        let smallestSize = Infinity;
        for (const img of allImgs) {
          const rect = img.getBoundingClientRect();
          const size = rect.width * rect.height;
          // 头像通常比较小（30-80px），排除大图（视频封面等）
          if (size > 400 && size < 10000 && size < smallestSize) {
            smallestSize = size;
            smallestAvatar = img.src;
          }
        }
        return smallestAvatar;
      });
      
      console.log('[QRLogin] 右上角头像:', headerAvatar ? headerAvatar.substring(0, 80) + '...' : '未找到');
      
      // 2. 从页面标题获取昵称
      const pageTitle = await page.title();
      let nickname = '';
      const titleMatch = pageTitle.match(/(.+?)的抖音/);
      if (titleMatch) {
        nickname = titleMatch[1].trim();
      }
      console.log('[QRLogin] 页面标题:', pageTitle, '昵称:', nickname);
      
      // 3. 如果在 /user/self 页面，尝试切换到"作品"标签页获取粉丝数据
      let follower_count = 0;
      let following_count = 0;
      let like_count = 0;
      let signature = '';
      
      if (url.includes('/user/')) {
        // 尝试点击"作品"标签
        try {
          const clickedWorks = await page.evaluate(() => {
            // 查找"作品"标签
            const tabs = document.querySelectorAll('[class*="tab"] span, [class*="tab"] a, [data-e2e*="tab"] span');
            for (const tab of tabs) {
              if (tab.textContent.trim().startsWith('作品')) {
                tab.click();
                return true;
              }
            }
            // 备用：找包含"作品"文本的元素
            const allEls = document.querySelectorAll('span, a, div');
            for (const el of allEls) {
              const text = el.textContent?.trim();
              if (text === '作品' || text.startsWith('作品 ')) {
                el.click();
                return true;
              }
            }
            return false;
          });
          
          if (clickedWorks) {
            console.log('[QRLogin] 已切换到作品标签页');
            await this._wait(3000);
          }
        } catch (e) {
          console.log('[QRLogin] 切换标签页失败:', e.message);
        }
        
        // 使用 scraper 提取数据
        const DouyinScraper = require('./scraper');
        const scraperInstance = new DouyinScraper();
        const data = await scraperInstance._getDataFromDOM(page);
        
        follower_count = data?.follower_count || 0;
        following_count = data?.following_count || 0;
        like_count = data?.like_count || 0;
        signature = data?.signature || '';
        
        // 如果 scraper 没拿到昵称，用标题的
        if (!nickname && data?.nickname) {
          nickname = data.nickname;
        }
        
        // 优先使用 scraper 从用户主页提取的头像（而非右上角登录用户的头像）
        if (data?.avatar) {
          headerAvatar = data.avatar;
          console.log('[QRLogin] 使用用户主页头像:', headerAvatar.substring(0, 80));
        }
      }
      
      // 获取 user_path（排除 self）
      const userMatch = url.match(/\/user\/([a-zA-Z0-9_-]+)/);
      const userPath = (userMatch && userMatch[1] !== 'self') ? userMatch[1] : null;
      
      console.log('[QRLogin] URL分析:', { url: url.substring(0, 100), userMatch: userMatch ? userMatch[1] : null, userPath });
      
      // 尝试从页面获取真实的 sec_uid
      let realUniqueId = userPath;
      if (!realUniqueId) {
        try {
          realUniqueId = await page.evaluate(() => {
            // 方法0: 从 RENDER_DATA div 中提取（抖音新版数据格式）
            const rd = document.getElementById('RENDER_DATA');
            if (rd) {
              const text = decodeURIComponent(rd.textContent || '');
              const secMatch = text.match(/"secUid"\s*:\s*"([^"]+)"/);
              if (secMatch && secMatch[1] !== 'self') return secMatch[1];
              const secMatch2 = text.match(/"sec_uid"\s*:\s*"([^"]+)"/);
              if (secMatch2 && secMatch2[1] !== 'self') return secMatch2[1];
            }
            
            // 方法1: 从页面脚本中获取
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
              const text = script.textContent || '';
              const secMatch = text.match(/"sec_uid"\s*:\s*"([^"]+)"/);
              if (secMatch && secMatch[1] !== 'self') return secMatch[1];
              const secMatch2 = text.match(/"secUid"\s*:\s*"([^"]+)"/);
              if (secMatch2 && secMatch2[1] !== 'self') return secMatch2[1];
              const idMatch = text.match(/"id"\s*:\s*"([A-Za-z0-9_-]{20,})"/);
              if (idMatch) return idMatch[1];
              const uidMatch = text.match(/"uniqueId"\s*:\s*"([^"]+)"/);
              if (uidMatch && uidMatch[1] !== 'self') return uidMatch[1];
            }
            
            // 方法2: 从 __NEXT_DATA__ 获取
            const nextData = window.__NEXT_DATA__;
            if (nextData && nextData.props && nextData.props.pageProps && nextData.props.pageProps.user && nextData.props.pageProps.user.sec_uid) {
              return nextData.props.pageProps.user.sec_uid;
            }
            
            return null;
          });
        } catch (e) {
          console.log('[QRLogin] 获取 sec_uid 失败:', e.message);
        }
      }
      
      // 如果还是拿不到，用时间戳生成唯一ID
      const finalUniqueId = realUniqueId || ('dy_qr_' + Date.now());
      
      console.log('[QRLogin] sec_uid提取结果:', { realUniqueId: realUniqueId ? realUniqueId.substring(0, 30) : null, finalUniqueId: finalUniqueId.substring(0, 30) });
      
      console.log('[QRLogin] 最终数据:', {
        nickname,
        avatar: headerAvatar ? '已获取' : '未获取',
        follower_count,
        unique_id: finalUniqueId
      });
      
      return {
        nickname: nickname || '抖音用户',
        avatar: headerAvatar || '',
        signature: signature || '扫码登录导入',
        follower_count,
        following_count,
        like_count,
        verified: 0,
        platform: 'douyin',
        user_path: userPath,
        unique_id: finalUniqueId,
        cookie_data: session.cookieData || null
      };
    } catch (error) {
      console.error('[QRLogin] 提取用户数据失败:', error.message);
      return {
        nickname: '抖音用户',
        avatar: '',
        signature: '扫码登录导入',
        follower_count: 0,
        following_count: 0,
        like_count: 0,
        verified: 0,
        platform: 'douyin',
        unique_id: 'dy_qr_' + Date.now(),
        cookie_data: session.cookieData || null
      };
    }
  }

  // 获取二维码图片路径
  getQRImagePath(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.qrImagePath) {
      return null;
    }
    return session.qrImagePath;
  }

  // 获取会话状态
  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { error: '会话不存在' };
    }

    return {
      sessionId: session.id,
      status: session.status,
      qrCode: session.status === 'pending' ? `/api/accounts/qr-code/image/${sessionId}` : null,
      userData: session.status === 'confirmed' ? session.userData : null,
      cookieData: session.status === 'confirmed' ? session.cookieData : null,
      error: session.error,
      expiresAt: session.expiresAt
    };
  }

  // 关闭会话
  async _closeSession(session) {
    console.log(`[QRLogin] 关闭会话: ${session.id}`);

    if (session.browser) {
      try {
        await session.browser.close();
      } catch (e) {}
    }

    session.browser = null;
    session.page = null;
    
    // 删除二维码图片
    if (session.qrImagePath && fs.existsSync(session.qrImagePath)) {
      try {
        fs.unlinkSync(session.qrImagePath);
      } catch (e) {}
    }
  }

  // 启动过期检查
  _startExpiryCheck(sessionId) {
    const checkInterval = setInterval(() => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        clearInterval(checkInterval);
        return;
      }

      if (Date.now() > session.expiresAt ||
          session.status === 'error') {
        clearInterval(checkInterval);

        // 失败/过期后5秒关闭
        setTimeout(() => {
          this._closeSession(session);
          this.sessions.delete(sessionId);
          console.log(`[QRLogin] 会话已清理: ${sessionId}`);
        }, 5000);
      }
      // 注意：登录成功(confirmed)时立即关闭浏览器，在 _monitorLoginStatus 中处理
    }, 5000);
  }

  // 查找 Chrome 路径
  _findChromePath() {
    const possiblePaths = [
      // Windows
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      // macOS
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      // Linux
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    ];

    for (const chromePath of possiblePaths) {
      if (chromePath && fs.existsSync(chromePath)) {
        return chromePath;
      }
    }

    return null;
  }

  // 辅助方法：等待
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 清理所有过期会话
  cleanup() {
    for (const [sessionId, session] of this.sessions) {
      if (Date.now() > session.expiresAt) {
        this._closeSession(session);
        this.sessions.delete(sessionId);
      }
    }
  }
}

// 单例实例
const qrLoginService = new QRLoginService();

module.exports = qrLoginService;
