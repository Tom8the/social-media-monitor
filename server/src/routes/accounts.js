const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { database, getPool } = require('../mysql-db');
const DouyinScraper = require('../scraper');
const XiaohongshuScraper = require('../xhs-scraper');
const VideohaoScraper = require('../videohao-scraper');
const videohaoLocalProxy = require('../videohao-local-proxy');
const qrLoginService = require('../qr-login');
const xhsQrLoginService = require('../xhs-qr-login');
const videohaoQrLoginService = require('../videohao-qr-login');

// 扫码登录会话存储（内存存储，生产环境应使用Redis）
const qrSessions = new Map();
const scraper = new DouyinScraper();
const xhsScraper = new XiaohongshuScraper();
const videohaoScraper = new VideohaoScraper();
const SUPPORTED_QR_PLATFORMS = ['douyin', 'xiaohongshu', 'videohao'];

// ========== 工具函数 ==========

// 从用户粘贴的文本中提取URL
function extractUrl(text) {
  if (!text) return null;
  const urlMatch = text.match(/(https?:\/\/[^\s<>"{}|\\^`\]]+)/);
  return urlMatch ? urlMatch[1] : null;
}

// 解析抖音短链接，获取重定向后的完整URL
async function resolveShortUrl(shortUrl) {
  try {
    const response = await fetch(shortUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    // 获取重定向地址
    let redirectUrl = response.headers.get('location') || '';

    // 可能需要多次重定向
    let maxRedirects = 5;
    while (redirectUrl && maxRedirects > 0) {
      if (redirectUrl.startsWith('/')) {
        redirectUrl = 'https://www.douyin.com' + redirectUrl;
      }

      // 检查是否已经是完整URL
      if (redirectUrl.includes('www.douyin.com')) {
        return redirectUrl;
      }

      // 继续跟随重定向
      try {
        const nextResponse = await fetch(redirectUrl, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const nextLocation = nextResponse.headers.get('location');
        if (!nextLocation) break;
        redirectUrl = nextLocation;
        maxRedirects--;
      } catch (e) {
        break;
      }
    }

    return redirectUrl;
  } catch (error) {
    console.error('解析短链接失败:', error.message);
    return null;
  }
}

// 从完整URL中提取用户标识
function extractUserIdFromUrl(fullUrl) {
  if (!fullUrl) return null;

  // 匹配 sec_uid 参数
  const secUidMatch = fullUrl.match(/sec_uid=([a-zA-Z0-9_-]+)/);
  if (secUidMatch) return { type: 'sec_uid', value: secUidMatch[1] };

  // 匹配 /user/ 路径
  const userPathMatch = fullUrl.match(/\/user\/([a-zA-Z0-9]+)/);
  if (userPathMatch) return { type: 'user_path', value: userPathMatch[1] };

  // 匹配 /note/ 或 /video/ 路径（作品页，需要跳转到用户主页）
  const noteMatch = fullUrl.match(/\/(note|video)\/(\d+)/);
  if (noteMatch) return { type: 'content', value: noteMatch[2] };

  return null;
}

// 生成随机抖音账号信息（模拟扫码后获取）
function generateRandomDouyinAccount() {
  const nicknames = [
    '创意无限', '生活美学', '美食探店达人', '旅行日记', '科技前沿',
    '时尚博主', '健身教练', '音乐制作人', '搞笑段子手', '知识分享官'
  ];
  const signatures = [
    '记录美好生活', '分享快乐时光', '用心创作每一帧', '发现生活中的美',
    '让创意点亮生活', '与你分享精彩瞬间', '用镜头记录世界'
  ];

  const nickname = nicknames[Math.floor(Math.random() * nicknames.length)];
  const signature = signatures[Math.floor(Math.random() * signatures.length)];
  const uniqueId = 'dy' + Math.random().toString(36).substring(2, 10);

  return {
    unique_id: uniqueId,
    nickname: nickname,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uniqueId}`,
    follower_count: Math.floor(Math.random() * 500000) + 1000,
    following_count: Math.floor(Math.random() * 1000) + 50,
    like_count: Math.floor(Math.random() * 2000000) + 10000,
    signature: signature,
    verified: Math.random() > 0.7 ? 1 : 0
  };
}

// 工具函数：延迟
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 批量采集存储（内存）
const batchJobs = new Map();

// 限流配置
const RATE_LIMIT = {
  interval: 10000,  // 每个账号之间间隔 10 秒
  maxConcurrent: 1, // 同时只采集 1 个账号
  maxRetries: 2     // 失败最多重试 2 次
};

// 异步批量采集执行器（限流）
async function runBatchSync(jobId, accounts, startDate = null, endDate = null) {
  const job = batchJobs.get(jobId);

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];

    job.currentAccount = account.nickname;
    job.currentIndex = i + 1;

    let success = false;
    let retries = 0;
    let errorMsg = '';

    while (!success && retries <= RATE_LIMIT.maxRetries) {
      try {
        if (retries > 0) {
          console.log(`[BatchSync] 重试第 ${retries} 次: ${account.nickname}`);
          await sleep(RATE_LIMIT.interval * (retries + 1));
        }

        let profileData = null;
        if (account.platform_code === 'douyin' && account.status === 'active' && account.cookie_data) {
          try {
            const cookies = JSON.parse(account.cookie_data);
            const cookiePath = account.sec_uid || account.unique_id;
            const cookieResult = await scraper.fetchWithCookies(cookiePath, cookies);
            if (cookieResult.success && cookieResult.data) {
              profileData = cookieResult.data;
            }
          } catch (cookieError) {
            console.log(`[BatchSync] Cookie 失败，回退公开模式: ${account.nickname}`);
          }
        }

        if (account.platform_code === 'douyin' && !profileData) {
          const userPath = account.unique_id || account.sec_uid;
          if (userPath) {
            const profileResult = await scraper.fetchFromLink(`https://www.douyin.com/user/${userPath}`);
            if (profileResult.success && profileResult.data) {
              profileData = profileResult.data;
            }
          }
        }

        if (profileData) {
          const updates = { last_fetch_at: new Date().toISOString() };
          if (profileData.avatar) updates.avatar = profileData.avatar;
          if (profileData.follower_count !== undefined) updates.follower_count = profileData.follower_count;
          if (profileData.following_count !== undefined) updates.following_count = profileData.following_count;
          if (profileData.like_count !== undefined) updates.like_count = profileData.like_count;
          if (profileData.nickname) updates.nickname = profileData.nickname;
          await database.updateAccount(account.id, updates);
        }

        // 使用 Cookie 获取视频（如果有）
        let cookies = null;
        if (account.cookie_data) {
          try { cookies = JSON.parse(account.cookie_data); } catch (e) {}
        }
        const persistBatchVideo = async (video, stage = 'final') => {
          const existing = await database.getVideoById(video.video_id, account.platform_code);
          let publishedAt = video.published_at
            ? (account.platform_code === 'douyin' ? new Date(video.published_at).toISOString() : video.published_at)
            : null;
          if (!publishedAt && existing && existing.published_at) {
            publishedAt = account.platform_code === 'douyin' && existing.published_at.toISOString
              ? existing.published_at.toISOString()
              : existing.published_at;
          }
          if (!publishedAt && account.platform_code === 'douyin') {
            publishedAt = new Date().toISOString();
          }

          const keepExistingWhenBasic = stage === 'basic' && existing;
          await database.upsertVideo({
            account_id: account.id,
            platform: account.platform_code,
            video_id: video.video_id,
            content_type: video.content_type || existing?.content_type || 'video',
            title: video.title || existing?.title || '',
            description: video.description || existing?.description || '',
            cover_url: video.cover_url || video.cover || existing?.cover_url || '',
            video_url: video.video_url || video.url || existing?.video_url || '',
            duration: video.duration || existing?.duration || 0,
            topic_tags: video.topic_tags || existing?.topic_tags || '',
            play_count: video.play_count || existing?.play_count || 0,
            like_count: video.like_count || existing?.like_count || 0,
            comment_count: keepExistingWhenBasic ? (existing.comment_count || 0) : (video.comment_count || 0),
            share_count: keepExistingWhenBasic ? (existing.share_count || 0) : (video.share_count || 0),
            collect_count: keepExistingWhenBasic ? (existing.collect_count || 0) : (video.collect_count || 0),
            published_at: publishedAt,
            is_deleted: 0
          });
          if (account.platform_code === 'xiaohongshu') {
            console.log(stage === 'final' ? '[XHS-BatchSync] saved:' : '[XHS-BatchSync] incremental-saved:', {
              accountId: account.id,
              videoId: video.video_id,
              stage,
              publishedAt,
              likeCount: video.like_count || existing?.like_count || 0,
              commentCount: keepExistingWhenBasic ? (existing.comment_count || 0) : (video.comment_count || 0),
              collectCount: keepExistingWhenBasic ? (existing.collect_count || 0) : (video.collect_count || 0),
              shareCount: keepExistingWhenBasic ? (existing.share_count || 0) : (video.share_count || 0)
            });
          }
          return existing;
        };
        // XHS uses a single profile+notes page visit, Douyin keeps the existing video flow.
        let videosResult;
        if (account.platform_code === 'xiaohongshu') {
          let xhsCookies = cookies;
          if (!xhsCookies) {
            const xhsGlobalCookie = await getGlobalCookie('xiaohongshu');
            if (xhsGlobalCookie && xhsGlobalCookie.cookieData) {
              try { xhsCookies = JSON.parse(xhsGlobalCookie.cookieData); } catch (e) {}
            }
          }
          const combinedResult = await xhsScraper.fetchProfileAndNotes(
            account.unique_id,
            xhsCookies,
            20,
            startDate,
            endDate,
            async (video, stage) => {
              try {
                await persistBatchVideo(video, stage);
              } catch (error) {
                console.log('[XHS-BatchSync] incremental save failed:', {
                  accountId: account.id,
                  videoId: video.video_id,
                  stage,
                  error: error.message
                });
              }
            },
            { useCreator: account.status === 'active' && !!account.cookie_data }
          );
          if (combinedResult.success && combinedResult.data) {
            profileData = combinedResult.data.profile || profileData;
            videosResult = { success: true, data: combinedResult.data.notes || [] };
            if (profileData) {
              const updates = { last_fetch_at: new Date().toISOString() };
              if (profileData.avatar) updates.avatar = profileData.avatar;
              if (profileData.follower_count !== undefined) updates.follower_count = profileData.follower_count;
              if (profileData.following_count !== undefined) updates.following_count = profileData.following_count;
              if (profileData.like_count !== undefined) updates.like_count = profileData.like_count;
              if (profileData.nickname) updates.nickname = profileData.nickname;
              await database.updateAccount(account.id, updates);
            }
          } else {
            videosResult = { success: false, data: [], error: combinedResult.error };
          }
        } else if (account.platform_code === 'videohao') {
          if (account.status === 'public') {
            videosResult = {
              success: false,
              skipped: true,
              data: [],
              error: '公开视频号请使用桌面微信采集'
            };
            throw new Error(videosResult.error);
          }
          let videohaoAuthState = cookies;
          const targetVideohaoId = account.sec_uid || account.unique_id;
          const videohaoOptions = {};
          const combinedResult = await videohaoScraper.fetchProfileAndPosts(targetVideohaoId, videohaoAuthState, 50, startDate, endDate, videohaoOptions);
          if (combinedResult.success && combinedResult.data) {
            profileData = combinedResult.data.profile || profileData;
            videosResult = { success: true, data: combinedResult.data.posts || [], coverage: combinedResult.data.coverage || null };
            if (profileData) {
              const updates = { last_fetch_at: new Date().toISOString() };
              if (profileData.avatar) updates.avatar = profileData.avatar;
              if (profileData.follower_count !== undefined) updates.follower_count = profileData.follower_count;
              if (profileData.following_count !== undefined) updates.following_count = profileData.following_count;
              if (profileData.like_count !== undefined) updates.like_count = profileData.like_count;
              if (profileData.nickname) updates.nickname = profileData.nickname;
              await database.updateAccount(account.id, updates);
            }
          } else {
            videosResult = combinedResult;
          }
        } else {
          videosResult = await scraper.getUserVideos(account.sec_uid || account.unique_id, 50, cookies, startDate, endDate);
        }
        let addedCount = 0;

        if (videosResult.success) {
          for (const video of videosResult.data) {
            try {
              await persistBatchVideo(video, 'final');
              addedCount++;
              continue;

              const publishedAt = video.published_at
                ? (account.platform_code === 'douyin' ? new Date(video.published_at).toISOString() : video.published_at)
                : (account.platform_code === 'douyin' ? new Date().toISOString() : null);
              await database.upsertVideo({
                account_id: account.id,
                platform: account.platform_code,
                video_id: video.video_id,
                content_type: video.content_type || 'video',
                title: video.title,
                cover_url: video.cover_url || video.cover,
                video_url: video.video_url || video.url,
                play_count: video.play_count,
                like_count: video.like_count,
                comment_count: video.comment_count || 0,
                share_count: video.share_count || 0,
                collect_count: video.collect_count || 0,
                published_at: publishedAt
              });
              addedCount++;
            } catch (e) {
              console.log(`[BatchSync] 视频保存失败: ${video.video_id}`, e.message);
            }
          }
        }

        success = true;
        job.completed++;
        job.results.push({
          accountId: account.id,
          nickname: account.nickname,
          success: true,
          videosAdded: addedCount
        });

      } catch (error) {
        retries++;
        errorMsg = error.message;
        console.log(`[BatchSync] 采集失败 (${retries}/${RATE_LIMIT.maxRetries}): ${account.nickname} - ${error.message}`);
      }
    }

    if (!success) {
      job.failed++;
      job.results.push({
        accountId: account.id,
        nickname: account.nickname,
        success: false,
        error: errorMsg
      });
    }

    if (i < accounts.length - 1) {
      console.log(`[BatchSync] 等待 ${RATE_LIMIT.interval / 1000} 秒后采集下一个账号...`);
      await sleep(RATE_LIMIT.interval);
    }
  }

  job.status = 'completed';
  job.endTime = new Date().toISOString();
  console.log(`[BatchSync] 任务完成: ${job.completed} 成功, ${job.failed} 失败`);
}

// 获取账号列表
router.get('/', async (req, res) => {
  try {
    const { platform, status, groupId } = req.query;
    const accounts = await database.getAllAccounts({ platform, status, groupId });

    res.json({
      code: 0,
      message: 'success',
      data: {
        list: accounts,
        total: accounts.length
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 创建账号（手动添加）
router.post('/', async (req, res) => {
  try {
    const account = {
      platform: req.body.platform || 'douyin',
      unique_id: req.body.uniqueId,
      nickname: req.body.nickname,
      avatar: req.body.avatar || '',
      follower_count: req.body.followerCount || 0,
      following_count: req.body.followingCount || 0,
      like_count: req.body.likeCount || 0,
      video_count: req.body.videoCount || 0,
      signature: req.body.signature || '',
      verified: req.body.verified || 0,
      remark: req.body.remark || '',
      status: req.body.status || 'active',
      sec_uid: req.body.secUid || req.body.sec_uid || null,
      cookie_data: req.body.cookieData || null
    };

    const result = await database.createAccount(account);
    res.json({
      code: 0,
      message: '创建成功',
      data: result
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 删除账号
router.delete('/:id', async (req, res) => {
  try {
    const result = await database.deleteAccount(req.params.id);
    res.json({
      code: 0,
      message: '删除成功',
      data: result
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.avatar !== undefined) updates.avatar = req.body.avatar;
    if (req.body.nickname !== undefined) updates.nickname = req.body.nickname;
    if (req.body.follower_count !== undefined) updates.follower_count = req.body.follower_count;
    if (req.body.followerCount !== undefined) updates.follower_count = req.body.followerCount;
    if (req.body.following_count !== undefined) updates.following_count = req.body.following_count;
    if (req.body.followingCount !== undefined) updates.following_count = req.body.followingCount;
    if (req.body.like_count !== undefined) updates.like_count = req.body.like_count;
    if (req.body.likeCount !== undefined) updates.like_count = req.body.likeCount;
    if (req.body.signature !== undefined) updates.signature = req.body.signature;
    if (req.body.cookie_data !== undefined) updates.cookie_data = req.body.cookie_data;
    if (req.body.cookieData !== undefined) updates.cookie_data = req.body.cookieData;
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (req.body.last_fetch_at !== undefined) updates.last_fetch_at = req.body.last_fetch_at;

    const result = await database.updateAccount(req.params.id, updates);
    res.json({
      code: 0,
      message: '更新成功',
      data: result
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// ========== 扫码登录相关接口 ==========

// 1. 生成二维码 - 真实扫码登录
router.post('/qr-code/generate', async (req, res) => {
  try {
    const { platform = 'douyin' } = req.body;

    if (!SUPPORTED_QR_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        code: 400,
        message: '扫码登录目前支持抖音、小红书和视频号'
      });
    }

    // 创建真实的扫码登录会话
    const loginService = platform === 'xiaohongshu'
      ? xhsQrLoginService
      : (platform === 'videohao' ? videohaoQrLoginService : qrLoginService);
    const result = await loginService.createSession();

    if (result.error) {
      return res.status(500).json({ code: 500, message: result.error });
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        sessionId: result.sessionId,
        qrCode: result.qrCode,
        expiresIn: 300
      }
    });
  } catch (error) {
    console.error('[QRLogin] 生成二维码失败:', error);
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 2. 查询二维码状态
router.get('/qr-code/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // 先从真实扫码服务查询
    let session = qrLoginService.getSessionStatus(sessionId);
    if (session.error) {
      session = xhsQrLoginService.getSessionStatus(sessionId);
    }
    if (session.error) {
      session = videohaoQrLoginService.getSessionStatus(sessionId);
    }

    if (session.error) {
      // 如果新服务找不到，尝试从旧的模拟会话查询
      const oldSession = qrSessions.get(sessionId);
      if (!oldSession) {
        return res.status(404).json({ code: 404, message: 'Session not found' });
      }

      return res.json({
        code: 0,
        data: {
          sessionId: oldSession.id,
          status: oldSession.status,
          accountInfo: oldSession.accountInfo
        }
      });
    }

    res.json({
      code: 0,
      data: {
        sessionId: session.sessionId,
        status: session.status,
        accountInfo: session.userData,
        cookieData: session.cookieData,
        error: session.error
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 3. 模拟扫码（用于演示）
router.post('/qr-code/mock-scan', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = qrSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ code: 404, message: '会话不存在或已过期' });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({ code: 400, message: '二维码已失效' });
    }

    // 更新状态为已扫码
    session.status = 'scanned';
    qrSessions.set(sessionId, session);

    // 模拟用户确认延迟（2秒后确认）
    setTimeout(async () => {
      const currentSession = qrSessions.get(sessionId);
      if (currentSession && currentSession.status === 'scanned') {
        // 生成随机账号信息
        const accountInfo = generateRandomDouyinAccount();
        currentSession.status = 'confirmed';
        currentSession.accountInfo = accountInfo;
        qrSessions.set(sessionId, currentSession);
      }
    }, 2000);

    res.json({
      code: 0,
      message: '扫码成功，等待确认',
      data: { status: 'scanned' }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 4. 确认登录并创建账号
router.post('/qr-code/confirm', async (req, res) => {
  try {
    const { sessionId } = req.body;

    // 从扫码服务获取会话
    let sessionStatus = qrLoginService.getSessionStatus(sessionId);
    if (sessionStatus.error) {
      sessionStatus = xhsQrLoginService.getSessionStatus(sessionId);
    }
    if (sessionStatus.error) {
      sessionStatus = videohaoQrLoginService.getSessionStatus(sessionId);
    }

    if (sessionStatus.error || !sessionStatus.userData) {
      return res.status(400).json({ code: 400, message: sessionStatus.error || '登录未确认或会话不存在' });
    }

    if (sessionStatus.status !== 'confirmed') {
      return res.status(400).json({ code: 400, message: '登录未确认，当前状态: ' + sessionStatus.status });
    }

    let accountInfo = sessionStatus.userData;
    if ((accountInfo.platform || 'douyin') === 'xiaohongshu' && accountInfo.unique_id && sessionStatus.cookieData) {
      try {
        const creatorProfile = await xhsScraper.fetchCreatorProfile(
          accountInfo.unique_id,
          JSON.parse(sessionStatus.cookieData)
        );
        if (creatorProfile.success && creatorProfile.data) {
          accountInfo = {
            ...accountInfo,
            ...creatorProfile.data,
            platform: 'xiaohongshu',
            unique_id: accountInfo.unique_id,
            sec_uid: accountInfo.sec_uid || creatorProfile.data.sec_uid || null,
            avatar: creatorProfile.data.avatar || accountInfo.avatar || '',
            cookie_data: sessionStatus.cookieData || null
          };
        }
      } catch (error) {
        console.log('[XHSQRConfirm] creator profile fallback failed:', error.message);
      }
    }

    // 检查账号是否已存在
    const existingAccounts = await database.getAllAccounts({ platform: accountInfo.platform || 'douyin' });
    const exists = existingAccounts.find(a => a.unique_id === accountInfo.unique_id);

    if (exists) {
      return res.status(400).json({ code: 400, message: '该账号已存在' });
    }

    // 创建新账号
    const newAccount = await database.createAccount({
      platform: accountInfo.platform || 'douyin',
      unique_id: accountInfo.unique_id,
      sec_uid: accountInfo.sec_uid || null,
      nickname: accountInfo.nickname || '扫码登录用户',
      avatar: accountInfo.avatar || '',
      follower_count: accountInfo.follower_count || 0,
      following_count: accountInfo.following_count || 0,
      like_count: accountInfo.like_count || 0,
      video_count: accountInfo.video_count || 0,
      signature: accountInfo.signature || '扫码登录导入',
      verified: accountInfo.verified || 0,
      remark: '扫码添加',
      status: 'active',
      cookie_data: sessionStatus.cookieData || null
    });

    res.json({
      code: 0,
      message: '登录成功',
      data: newAccount
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// ========== 真实数据采集接口 ==========

// 解析抖音链接并获取账号信息
router.post('/videohao/search-accounts', async (req, res) => {
  try {
    const keyword = String(req.body.keyword || '').trim();
    if (!keyword) {
      return res.status(400).json({ code: 400, message: '请输入视频号名称或ID' });
    }

    const result = await videohaoLocalProxy.resolvePublicAccountByDesktopWeChat(keyword, {
      timeout: Number(req.body.timeout) || 25000
    });
    if (!result.success) {
      return res.status(502).json({ code: 502, message: result.error || '视频号账号搜索失败' });
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        list: [result.data],
        total: 1
      }
    });
  } catch (error) {
    console.error('[VideohaoSearch] failed:', error);
    res.status(500).json({ code: 500, message: error.message });
  }
});

router.post('/fetch-from-url', async (req, res) => {
  try {
    const { url, platform = 'douyin' } = req.body;

    if (!url) {
      return res.status(400).json({ code: 400, message: '请提供分享链接' });
    }
    if (!['douyin', 'xiaohongshu', 'videohao'].includes(platform)) {
      return res.status(400).json({ code: 400, message: '链接导入目前支持抖音和小红书' });
    }
    if (platform === 'videohao') {
      return res.status(400).json({ code: 400, message: '视频号暂不支持链接导入，请使用扫码登录添加账号' });
    }

    // 1. 从粘贴文本中提取URL
    const cleanUrl = extractUrl(url);
    if (!cleanUrl) {
      return res.status(400).json({ code: 400, message: '未检测到有效链接，请检查输入' });
    }

    console.log(`[采集] 原始输入: ${url}`);
    console.log(`[采集] 提取URL: ${cleanUrl}`);

    let fetchCookies = null;
    if (platform === 'xiaohongshu') {
      const globalCookie = await getGlobalCookie('xiaohongshu');
      if (!globalCookie || !globalCookie.cookieData) {
        return res.status(401).json({
          code: 401,
          message: '小红书链接导入需要先扫码获取全局Cookie，才能采集准确数据',
          data: { needGlobalCookie: true, platform: 'xiaohongshu' }
        });
      }
      try {
        fetchCookies = JSON.parse(globalCookie.cookieData);
      } catch (e) {
        await invalidateGlobalCookie('xiaohongshu');
        return res.status(401).json({
          code: 401,
          message: '小红书全局Cookie已失效，请重新扫码',
          data: { needGlobalCookie: true, platform: 'xiaohongshu' }
        });
      }
    }

    // 2. 使用 Playwright 打开链接，获取页面数据
    const platformScraper = platform === 'xiaohongshu' ? xhsScraper : scraper;
    const result = await platformScraper.fetchFromLink(cleanUrl, fetchCookies);

    if (!result.success) {
      if (platform === 'xiaohongshu' && result.cookieExpired) {
        await invalidateGlobalCookie('xiaohongshu');
        return res.status(401).json({
          code: 401,
          message: result.error || '小红书全局Cookie已失效，请重新扫码',
          data: { needGlobalCookie: true, platform: 'xiaohongshu' }
        });
      }
      return res.status(500).json({ code: 500, message: '采集失败: ' + result.error });
    }

    console.log(`[采集] 获取到用户: ${result.data.nickname}`);

    // 3. 检查账号是否已存在
    const existingAccounts = await database.getAllAccounts({ platform });
    const exists = existingAccounts.find(a => a.unique_id === result.data.unique_id);

    if (exists) {
      return res.status(400).json({ code: 400, message: '该账号已存在，无需重复添加' });
    }

    // 4. 创建账号 - 链接导入标记为 public（公开监控）
    const accountData = {
      platform,
      unique_id: result.data.unique_id,
      nickname: result.data.nickname || '未知用户',
      avatar: result.data.avatar || '',
      follower_count: result.data.follower_count || 0,
      following_count: result.data.following_count || 0,
      like_count: result.data.like_count || 0,
      signature: result.data.signature || '',
      verified: result.data.verified || 0,
      remark: '链接导入',
      status: 'public'  // 公开监控
    };

    const newAccount = await database.createAccount(accountData);

    res.json({
      code: 0,
      message: '添加成功',
      data: {
        account: newAccount
      }
    });

  } catch (error) {
    console.error('采集错误:', error);
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 通过用户ID直接获取数据（无需分享链接）
router.post('/fetch-by-secuid', async (req, res) => {
  try {
    const { secUid, platform = 'douyin' } = req.body;

    if (!secUid) {
      return res.status(400).json({ code: 400, message: '请提供用户secUid' });
    }

    // 使用浏览器采集数据
    const result = await scraper.getUserProfile(secUid);

    if (!result.success) {
      return res.status(500).json({ code: 500, message: '采集失败: ' + result.error });
    }

    // 检查账号是否已存在
    const existingAccounts = await database.getAllAccounts({ platform });
    const exists = existingAccounts.find(a => a.unique_id === secUid);

    if (exists) {
      return res.status(400).json({ code: 400, message: '该账号已存在' });
    }

    // 创建账号
    const accountData = {
      platform,
      unique_id: secUid,
      nickname: result.data.nickname || '未知用户',
      avatar: result.data.avatar || '',
      follower_count: result.data.follower_count || 0,
      following_count: result.data.following_count || 0,
      like_count: result.data.like_count || 0,
      signature: result.data.signature || '',
      verified: result.data.verified || 0,
      remark: 'ID导入',
      status: 'active'
    };

    const newAccount = await database.createAccount(accountData);

    res.json({
      code: 0,
      message: '采集成功',
      data: newAccount
    });

  } catch (error) {
    console.error('采集错误:', error);
    res.status(500).json({ code: 500, message: error.message });
  }
});

// ========== 批量采集（带限流控制） ==========

// 批量采集：按条件筛选账号并逐个采集
router.post('/batch-sync', async (req, res) => {
  try {
    const { platform, accountIds, startDate, endDate } = req.body;

    const jobId = uuidv4();

    let accounts = await database.getAllAccounts();

    if (platform) {
      accounts = accounts.filter(a => a.platform_code === platform);
    }
    if (accountIds && accountIds.length > 0) {
      accounts = accounts.filter(a => accountIds.includes(a.id));
    }

    if (accounts.length === 0) {
      return res.json({ code: 0, message: '没有需要采集的账号', data: { jobId, total: 0 } });
    }

    const jobStatus = {
      jobId,
      total: accounts.length,
      completed: 0,
      failed: 0,
      results: [],
      status: 'running',
      startTime: new Date().toISOString()
    };
    batchJobs.set(jobId, jobStatus);

    res.json({
      code: 0,
      message: `开始采集 ${accounts.length} 个账号`,
      data: { jobId, total: accounts.length }
    });

    // 异步执行采集（带限流）
    runBatchSync(jobId, accounts, startDate, endDate);

  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 查询批量采集进度
router.get('/batch-sync/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = batchJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ code: 404, message: '任务不存在' });
    }
    res.json({ code: 0, data: job });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 同步账号视频数据
router.post('/:id/sync', async (req, res) => {
  try {
    const accountId = req.params.id;
    const { startDate, endDate } = req.body || {};
    const maxNotes = Math.min(Math.max(parseInt(req.body?.maxNotes || '20', 10) || 20, 1), 20);

    // 获取账号信息
    const accounts = await database.getAllAccounts();
    const account = accounts.find(a => a.id === accountId);

    if (!account) {
      return res.status(404).json({ code: 404, message: '账号不存在' });
    }

    if (account.platform_code === 'xiaohongshu') {
      console.log('[XHS-Sync] start:', {
        accountId,
        nickname: account.nickname,
        uniqueId: account.unique_id,
        status: account.status,
        hasAccountCookie: !!account.cookie_data,
        maxNotes,
        startDate,
        endDate
      });
    }

    // 公开监控账号：除视频号外，仍需要对应平台全局Cookie。视频号公开监控使用桌面微信采集。
    if (account.status === 'public' && account.platform_code !== 'videohao') {
      const globalCookie = await getGlobalCookie(account.platform_code);
      if (!globalCookie || !globalCookie.cookieData) {
        console.log('[Sync] 公开账号无有效全局Cookie，需要扫码登录');
        return res.status(401).json({ 
          code: 401, 
          message: '公开监控账号需要先在账号监控管理页扫码获取全局Cookie',
          data: { needRelogin: true }
        });
      }
    }

    // 1. 重新获取用户资料（头像、粉丝数等）
    let profileUpdated = false;
    let profileData = null;
    
    try {
      // 深度授权账号：使用保存的 Cookie 获取数据
      if (account.platform_code === 'douyin' && account.status === 'active' && account.cookie_data) {
        console.log('[Sync] 使用保存的 Cookie 同步深度授权账号:', account.nickname);
        try {
          const cookies = JSON.parse(account.cookie_data);
          const userPath = account.sec_uid || account.unique_id;
          const cookieResult = await scraper.fetchWithCookies(userPath, cookies);
          if (cookieResult.success && cookieResult.data) {
            profileData = cookieResult.data;
          }
        } catch (cookieError) {
          console.log('[Sync] Cookie 同步失败，回退到公开模式:', cookieError.message);
        }
      }
      
      // 公开监控账号：尝试使用全局Cookie获取资料
      const globalCookie = await getGlobalCookie(account.platform_code);
      if (account.platform_code === 'douyin' && !profileData && globalCookie && globalCookie.cookieData) {
        try {
          const cookies = JSON.parse(globalCookie.cookieData);
          const userPath = account.sec_uid || account.unique_id;
          console.log('[Sync] 使用全局Cookie获取公开账号资料:', account.nickname);
          const cookieResult = await scraper.fetchWithCookies(userPath, cookies);
          if (cookieResult.cookieExpired) {
            // Cookie失效，标记并返回错误
            await invalidateGlobalCookie(account.platform_code);
            return res.status(401).json({ 
              code: 401, 
              message: 'Cookie已失效，请重新扫码登录',
              data: { needRelogin: true }
            });
          }
          if (cookieResult.success && cookieResult.data) {
            profileData = cookieResult.data;
          }
        } catch (e) {
          console.log('[Sync] 全局Cookie获取资料失败:', e.message);
        }
      }
      
      // 如果 Cookie 方式失败或无 Cookie，使用公开模式（仅限深度授权账号）
      if (account.platform_code === 'douyin' && !profileData && account.status === 'active') {
        const userPath = account.unique_id || account.sec_uid;
        if (userPath) {
          const profileResult = await scraper.fetchFromLink(`https://www.douyin.com/user/${userPath}`);
          if (profileResult.success && profileResult.data) {
            profileData = profileResult.data;
          }
        }
      }
      
      if (profileData) {
        // 更新账号资料
        const updates = {
          last_fetch_at: new Date().toISOString()
        };
        
        // 如果获取到了新数据，更新字段
        if (profileData.avatar) {
          updates.avatar = profileData.avatar;
        }
        if (profileData.follower_count !== undefined) {
          updates.follower_count = profileData.follower_count;
        }
        if (profileData.following_count !== undefined) {
          updates.following_count = profileData.following_count;
        }
        if (profileData.like_count !== undefined) {
          updates.like_count = profileData.like_count;
        }
        if (profileData.nickname) {
          updates.nickname = profileData.nickname;
        }
        
        await database.updateAccount(accountId, updates);
        profileUpdated = true;
      }
    } catch (profileError) {
      console.log('[Sync] 获取用户资料失败:', profileError.message);
      // 继续同步视频，不阻断流程
    }

    // 2. 采集视频数据（优先使用账号Cookie；公开视频号不使用全局Cookie，改走桌面微信接口）
    const videoUserPath = account.sec_uid || account.unique_id;
    let syncCookies = null;
    let usedGlobalCookie = false;
    if (account.cookie_data) {
      try { syncCookies = JSON.parse(account.cookie_data); } catch (e) {}
    }
    if (account.platform_code !== 'videohao') {
      // 公开监控账号：使用全局Cookie
      const videoGlobalCookie = await getGlobalCookie(account.platform_code);
      console.log('[Sync] 全局Cookie状态:', { hasGlobalCookie: !!videoGlobalCookie, hasCookieData: !!(videoGlobalCookie && videoGlobalCookie.cookieData) });
      if (!syncCookies && videoGlobalCookie && videoGlobalCookie.cookieData) {
        try { syncCookies = JSON.parse(videoGlobalCookie.cookieData); } catch (e) {}
        if (syncCookies) {
          usedGlobalCookie = true;
          console.log('[Sync] 使用全局Cookie采集公开账号:', account.nickname);
        }
      }
    }
    // 传递时间范围参数给scraper，让其在采集时就过滤
    const persistFetchedVideo = async (video, stage = 'final') => {
      const existing = await database.getVideoById(video.video_id, account.platform_code);
      let publishedAt = video.published_at
        ? (account.platform_code === 'douyin' ? new Date(video.published_at).toISOString() : video.published_at)
        : null;
      if (!publishedAt && existing && existing.published_at) {
        publishedAt = account.platform_code === 'douyin' && existing.published_at.toISOString
          ? existing.published_at.toISOString()
          : existing.published_at;
      }
      if (!publishedAt && account.platform_code === 'douyin') {
        publishedAt = new Date().toISOString();
      }

      const keepExistingWhenBasic = stage === 'basic' && existing;
      const savedVideo = {
        account_id: account.id,
        platform: account.platform_code,
        video_id: video.video_id,
        content_type: video.content_type || existing?.content_type || 'video',
        title: video.title || existing?.title || '',
        description: video.description || existing?.description || '',
        cover_url: video.cover_url || video.cover || existing?.cover_url || '',
        video_url: video.video_url || video.url || existing?.video_url || '',
        duration: video.duration || existing?.duration || 0,
        topic_tags: video.topic_tags || existing?.topic_tags || '',
        play_count: video.play_count || existing?.play_count || 0,
        like_count: video.like_count || existing?.like_count || 0,
        comment_count: keepExistingWhenBasic ? (existing.comment_count || 0) : (video.comment_count || 0),
        share_count: keepExistingWhenBasic ? (existing.share_count || 0) : (video.share_count || 0),
        collect_count: keepExistingWhenBasic ? (existing.collect_count || 0) : (video.collect_count || 0),
        published_at: publishedAt,
        is_deleted: 0
      };

      await database.upsertVideo(savedVideo);
      if (account.platform_code === 'xiaohongshu') {
        console.log(stage === 'final' ? '[XHS-Sync] saved:' : '[XHS-Sync] incremental-saved:', {
          accountId,
          videoId: video.video_id,
          stage,
          publishedAt,
          publishSource: video.publish_time_source || 'unknown',
          likeCount: savedVideo.like_count || 0,
          commentCount: savedVideo.comment_count || 0,
          collectCount: savedVideo.collect_count || 0,
          shareCount: savedVideo.share_count || 0
        });
      }

      return existing;
    };

    let videosResult;
    if (account.platform_code === 'xiaohongshu') {
      const combinedResult = await xhsScraper.fetchProfileAndNotes(
        account.unique_id,
        syncCookies,
        maxNotes,
        startDate,
        endDate,
        async (video, stage) => {
          try {
            await persistFetchedVideo(video, stage);
          } catch (error) {
            console.log('[XHS-Sync] incremental save failed:', {
              accountId,
              videoId: video.video_id,
              stage,
              error: error.message
            });
          }
        },
        { useCreator: account.status === 'active' && !!account.cookie_data }
      );
      if (combinedResult.busy) {
        console.log('[XHS-Sync] busy:', { accountId, nickname: account.nickname });
        return res.status(409).json({
          code: 409,
          message: combinedResult.error || '该小红书账号正在采集中，请等待当前任务完成后再试'
        });
      }
      if (combinedResult.cookieExpired && usedGlobalCookie) {
        console.log('[XHS-Sync] cookie expired:', { accountId, nickname: account.nickname });
        await invalidateGlobalCookie(account.platform_code);
        return res.status(401).json({ code: 401, message: 'Cookie已失效，请重新扫码登录', data: { needRelogin: true } });
      }
      if (combinedResult.rateLimited) {
        console.log('[XHS-Sync] rate limited:', {
          accountId,
          nickname: account.nickname,
          retryAfterMs: combinedResult.retryAfterMs || null
        });
        return res.status(429).json({
          code: 429,
          message: combinedResult.error || '小红书触发安全验证，请稍后再试',
          data: { retryAfterMs: combinedResult.retryAfterMs || null }
        });
      }
      if (combinedResult.success && combinedResult.data) {
        profileData = combinedResult.data.profile || profileData;
        videosResult = {
          success: true,
          data: combinedResult.data.notes || [],
          cookieExpired: false,
          coverage: combinedResult.data.coverage || null
        };
        console.log('[XHS-Sync] fetched:', {
          accountId,
          nickname: account.nickname,
          notes: videosResult.data.length,
          hasProfile: !!profileData,
          coverage: videosResult.coverage
        });
      } else {
        videosResult = { success: false, data: [], error: combinedResult.error };
      }
    } else if (account.platform_code === 'videohao') {
      const targetVideohaoId = account.sec_uid || account.unique_id;
      const videohaoOptions = account.status === 'public'
        ? { targetUrl: `https://channels.weixin.qq.com/web/pages/profile?username=${encodeURIComponent(targetVideohaoId)}` }
        : {};
      const combinedResult = await videohaoScraper.fetchProfileAndPosts(targetVideohaoId, syncCookies, 50, startDate, endDate, videohaoOptions);
      if (combinedResult.busy) {
        return res.status(409).json({
          code: 409,
          message: combinedResult.error || '该视频号账号正在采集中，请稍后再试'
        });
      }
      if (combinedResult.cookieExpired && usedGlobalCookie) {
        await invalidateGlobalCookie(account.platform_code);
        return res.status(401).json({ code: 401, message: 'Cookie已失效，请重新扫码登录', data: { needRelogin: true } });
      }
      if (combinedResult.success && combinedResult.data) {
        profileData = combinedResult.data.profile || profileData;
        videosResult = {
          success: true,
          data: combinedResult.data.posts || [],
          cookieExpired: false,
          coverage: combinedResult.data.coverage || null
        };
      } else {
        videosResult = { success: false, data: [], error: combinedResult.error };
      }
    } else {
      videosResult = await scraper.getUserVideos(videoUserPath, 50, syncCookies, startDate, endDate);
    }

    if ((account.platform_code === 'xiaohongshu' || account.platform_code === 'videohao') && profileData && !profileUpdated) {
      const updates = { last_fetch_at: new Date().toISOString() };
      if (profileData.avatar) updates.avatar = profileData.avatar;
      if (profileData.follower_count !== undefined) updates.follower_count = profileData.follower_count;
      if (profileData.following_count !== undefined) updates.following_count = profileData.following_count;
      if (profileData.like_count !== undefined) updates.like_count = profileData.like_count;
      if (profileData.nickname) updates.nickname = profileData.nickname;
      await database.updateAccount(accountId, updates);
      profileUpdated = true;
    }
    
    // 检测Cookie是否失效（仅抖音）
    if (videosResult.cookieExpired && usedGlobalCookie && account.platform_code !== 'xiaohongshu') {
      console.log('[Sync] 全局Cookie已失效，标记并返回错误');
      await invalidateGlobalCookie(account.platform_code);
      return res.status(401).json({ 
        code: 401, 
        message: 'Cookie已失效，请重新扫码登录',
        data: { needRelogin: true }
      });
    }

    if (!videosResult.success && (account.platform_code === 'xiaohongshu' || account.platform_code === 'videohao')) {
      console.log('[XHS-Sync] failed:', {
        accountId,
        nickname: account.nickname,
        error: videosResult.error || 'unknown'
      });
      return res.status(502).json({
        code: 502,
        message: videosResult.error || '内容采集失败',
        data: {
          rateLimited: !!videosResult.rateLimited
        }
      });
    }

    let addedCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    let videosUpdated = false;
    
    if (videosResult.success) {
      videosUpdated = true;
      const fetchedVideoIds = new Set(videosResult.data.map(v => v.video_id));
      
      // 按时间范围过滤（没有发布时间的不过滤，保留）
      const filteredVideos = videosResult.data.filter(video => {
        if (!video.published_at) {
          console.log(`[Sync] 视频 ${video.video_id} 无发布时间，保留`);
          return true;
        }
        const pubDate = new Date(video.published_at);
        if (startDate) {
          const start = new Date(startDate);
          if (pubDate < start) {
            console.log(`[Sync] 视频 ${video.video_id} 发布时间 ${video.published_at} 早于 ${startDate}，过滤`);
            return false;
          }
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (pubDate > end) {
            console.log(`[Sync] 视频 ${video.video_id} 发布时间 ${video.published_at} 晚于 ${endDate}，过滤`);
            return false;
          }
        }
        console.log(`[Sync] 视频 ${video.video_id} 发布时间 ${video.published_at}，保留`);
        return true;
      });
      
      console.log(`[Sync] 时间过滤: 抓取 ${videosResult.data.length} 条, 符合条件 ${filteredVideos.length} 条 (范围: ${startDate || '不限'} ~ ${endDate || '不限'})`);
      if (account.platform_code === 'xiaohongshu') {
        console.log('[XHS-Sync] filtered:', {
          accountId,
          fetched: videosResult.data.length,
          filtered: filteredVideos.length
        });
      }
      
      // 小红书/视频号先保存本次抓到的全部内容，避免真实发布时间落在筛选范围外时，旧的错误发布时间无法被修正。
      const videosToSave = (account.platform_code === 'xiaohongshu' || account.platform_code === 'videohao') ? videosResult.data : filteredVideos;

      // 1. 更新或新增视频
      for (const video of videosToSave) {
        try {
          const savedExisting = await persistFetchedVideo(video, 'final');
          if (savedExisting) {
            updatedCount++;
          } else {
            addedCount++;
          }
          continue;

          // 检查数据库中是否已有该视频
          const existing = await database.getVideoById(video.video_id, account.platform_code);
          
          // 如果没有发布时间，抖音沿用历史兜底；小红书/视频号不伪造当前时间
          let publishedAt = video.published_at
            ? (account.platform_code === 'douyin' ? new Date(video.published_at).toISOString() : video.published_at)
            : null;
          if (!publishedAt && account.platform_code === 'douyin') {
            if (existing && existing.published_at) {
              publishedAt = existing.published_at.toISOString();
            } else {
              publishedAt = new Date().toISOString();
            }
          }
          
          await database.upsertVideo({
            account_id: account.id,
            platform: account.platform_code,
            video_id: video.video_id,
            content_type: video.content_type || 'video',
            title: video.title,
            cover_url: video.cover_url || video.cover,
            video_url: video.video_url || video.url,
            play_count: video.play_count,
            like_count: video.like_count,
            comment_count: video.comment_count || 0,
            share_count: video.share_count || 0,
            collect_count: video.collect_count || 0,
            published_at: publishedAt,
            is_deleted: 0 // 重置删除标记
          });
          if (account.platform_code === 'xiaohongshu') {
            console.log('[XHS-Sync] saved:', {
              accountId,
              videoId: video.video_id,
              publishedAt,
              publishSource: video.publish_time_source || 'unknown',
              likeCount: video.like_count || 0,
              commentCount: video.comment_count || 0,
              collectCount: video.collect_count || 0,
              shareCount: video.share_count || 0
            });
          }
          
          // 检查是新增还是更新
          if (existing) {
            updatedCount++;
          } else {
            addedCount++;
          }
        } catch (e) {
          console.log('[Sync] 视频保存失败:', video.video_id, e.message);
        }
      }
      
      // 2. 标记已删除的视频（数据库中有但主页上没有的）
      // 注意：只标记时间范围内、且有完整数据（有标题）的视频
      // 避免因采集数量限制（只抓20条）导致误删
      try {
        const dbVideos = await database.getVideosByAccount(account.id);
        const canMarkDeleted = !['xiaohongshu', 'videohao'].includes(account.platform_code) || !!videosResult.coverage?.deletionSafe;
        if (!canMarkDeleted) {
          console.log('[XHS-Sync] skip delete marking: coverage not safe', {
            accountId,
            coverage: videosResult.coverage || null,
            startDate: startDate || null,
            endDate: endDate || null
          });
        }
        for (const dbVideo of dbVideos) {
          if (!canMarkDeleted) break;
          if (dbVideo.is_deleted === 0 && !fetchedVideoIds.has(dbVideo.video_id)) {
            // 只标记有完整数据的视频（有标题说明之前成功采集过详情）
            if (!dbVideo.title) continue;
            
            // 检查是否在时间范围内
            if (dbVideo.published_at) {
              const pubDate = new Date(dbVideo.published_at);
              let inRange = true;
              if (startDate && pubDate < new Date(startDate)) inRange = false;
              if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                if (pubDate > end) inRange = false;
              }
              if (!inRange) continue;
            }
            
            // 只有当本次采集数量足够覆盖时才标记删除
            // 如果采集到的视频数量少于20条（可能被拦截），不标记删除
            if (fetchedVideoIds.size < 10) {
              console.log(`[Sync] 本次仅采集到 ${fetchedVideoIds.size} 条，跳过删除标记`);
              break;
            }
            
            await database.markVideoDeleted(dbVideo.video_id, account.platform_code);
            deletedCount++;
            console.log(`[Sync] 标记删除: ${dbVideo.video_id} (${dbVideo.title?.substring(0, 20)}...)`);
          }
        }
      } catch (e) {
        console.log('[Sync] 标记删除失败:', e.message);
      }
    }

    res.json({
      code: 0,
      message: '同步成功',
      data: {
        addedCount,
        updatedCount,
        deletedCount,
        profileUpdated,
        videosUpdated,
        profileData: profileData ? {
          nickname: profileData.nickname,
          avatar: profileData.avatar,
          follower_count: profileData.follower_count
        } : null
      }
    });

  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 获取二维码图片
router.get('/qr-code/image/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const qrPath = qrLoginService.getQRImagePath(sessionId);

    if (!qrPath || !fs.existsSync(qrPath)) {
      return res.status(404).json({ code: 404, message: '二维码不存在或已过期' });
    }

    res.sendFile(qrPath);
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// ========== 全局采集Cookie管理 ==========

const GLOBAL_COOKIE_PLATFORM_IDS = {
  douyin: 1,
  xiaohongshu: 2,
  videohao: 3
};

function normalizeGlobalCookiePlatform(platform = 'douyin') {
  return GLOBAL_COOKIE_PLATFORM_IDS[platform] ? platform : 'douyin';
}

function getGlobalCookieId(platform = 'douyin') {
  return GLOBAL_COOKIE_PLATFORM_IDS[normalizeGlobalCookiePlatform(platform)];
}

// 获取全局Cookie状态
router.get('/global-cookie/status', async (req, res) => {
  try {
    const platform = req.query.platform;
    const pool = getPool();

    if (platform) {
      const normalizedPlatform = normalizeGlobalCookiePlatform(platform);
      if (normalizedPlatform === 'videohao') {
        return res.json({
          code: 0,
          data: {
            hasCookie: false,
            platform: 'videohao',
            updatedAt: null,
            isValid: false,
            mode: 'desktop-wechat'
          }
        });
      }
      const [rows] = await pool.query('SELECT * FROM global_cookies WHERE id = ?', [getGlobalCookieId(normalizedPlatform)]);
      const cookie = rows[0];
      return res.json({
        code: 0,
        data: {
          hasCookie: !!cookie && !!cookie.is_valid,
          platform: normalizedPlatform,
          updatedAt: cookie?.updated_at || null,
          isValid: !!(cookie?.is_valid)
        }
      });
    }

    const ids = Object.values(GLOBAL_COOKIE_PLATFORM_IDS);
    const [rows] = await pool.query(
      `SELECT * FROM global_cookies WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids
    );
    const byPlatform = {};
    rows.forEach(cookie => {
      byPlatform[cookie.platform] = {
        hasCookie: !!cookie.is_valid,
        platform: cookie.platform,
        updatedAt: cookie.updated_at || null,
        isValid: !!cookie.is_valid
      };
    });

    res.json({
      code: 0,
      data: {
        hasCookie: !!byPlatform.douyin?.hasCookie,
        platform: byPlatform.douyin?.platform || null,
        updatedAt: byPlatform.douyin?.updatedAt || null,
        isValid: byPlatform.douyin?.isValid || false,
        platforms: {
          douyin: byPlatform.douyin || { hasCookie: false, platform: 'douyin', updatedAt: null, isValid: false },
          xiaohongshu: byPlatform.xiaohongshu || { hasCookie: false, platform: 'xiaohongshu', updatedAt: null, isValid: false },
          videohao: { hasCookie: false, platform: 'videohao', updatedAt: null, isValid: false, mode: 'desktop-wechat' }
        }
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 保存全局Cookie（扫码登录成功后调用）
router.post('/global-cookie/save', async (req, res) => {
  try {
    const { cookieData } = req.body;
    const platform = normalizeGlobalCookiePlatform(req.body.platform);
    if (!cookieData) {
      return res.status(400).json({ code: 400, message: 'cookieData不能为空' });
    }
    const cookieStr = typeof cookieData === 'string' ? cookieData : JSON.stringify(cookieData);
    const cookieId = getGlobalCookieId(platform);
    
    const pool = getPool();
    // 使用 UPSERT
    await pool.query(`
      INSERT INTO global_cookies (id, platform, cookie_data, is_valid)
      VALUES (?, ?, ?, TRUE)
      ON DUPLICATE KEY UPDATE platform = ?, cookie_data = ?, is_valid = TRUE, updated_at = NOW()
    `, [cookieId, platform, cookieStr, platform, cookieStr]);
    
    console.log(`[GlobalCookie] 已保存全局Cookie到数据库 (平台: ${platform})`);
    res.json({ code: 0, message: 'Cookie保存成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 标记全局Cookie失效
router.post('/global-cookie/invalidate', async (req, res) => {
  try {
    const platform = normalizeGlobalCookiePlatform(req.body?.platform || req.query.platform);
    const pool = getPool();
    await pool.query('UPDATE global_cookies SET is_valid = FALSE WHERE id = ?', [getGlobalCookieId(platform)]);
    console.log(`[GlobalCookie] 已标记全局Cookie失效 (平台: ${platform})`);
    res.json({ code: 0, message: 'Cookie已标记失效' });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 删除全局Cookie
router.delete('/global-cookie', async (req, res) => {
  try {
    const platform = normalizeGlobalCookiePlatform(req.body?.platform || req.query.platform);
    const pool = getPool();
    await pool.query('DELETE FROM global_cookies WHERE id = ?', [getGlobalCookieId(platform)]);
    console.log(`[GlobalCookie] 已清除全局Cookie (平台: ${platform})`);
    res.json({ code: 0, message: 'Cookie已清除' });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 获取全局Cookie（内部使用）
async function getGlobalCookie(platform = 'douyin') {
  try {
    const normalizedPlatform = normalizeGlobalCookiePlatform(platform);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM global_cookies WHERE id = ? AND is_valid = TRUE', [getGlobalCookieId(normalizedPlatform)]);
    if (rows[0]) {
      return {
        cookieData: rows[0].cookie_data,
        platform: rows[0].platform,
        updatedAt: rows[0].updated_at
      };
    }
    return null;
  } catch (error) {
    console.error('[GlobalCookie] 获取失败:', error.message);
    return null;
  }
}

// 标记全局Cookie失效（内部使用）
async function invalidateGlobalCookie(platform = 'douyin') {
  try {
    const normalizedPlatform = normalizeGlobalCookiePlatform(platform);
    const pool = getPool();
    await pool.query('UPDATE global_cookies SET is_valid = FALSE WHERE id = ?', [getGlobalCookieId(normalizedPlatform)]);
    console.log(`[GlobalCookie] 已标记全局Cookie失效 (平台: ${normalizedPlatform})`);
    return true;
  } catch (error) {
    console.error('[GlobalCookie] 标记失效失败:', error.message);
    return false;
  }
}

// 临时删除视频接口
router.delete('/videos/:videoId', async (req, res) => {
  try {
    const pool = getPool();
    const [result] = await pool.query('DELETE FROM videos WHERE video_id = ?', [req.params.videoId]);
    res.json({ code: 0, message: '删除成功', deleted: result.affectedRows });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

module.exports = router;
