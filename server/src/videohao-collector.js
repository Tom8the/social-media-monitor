const { database, withTransaction } = require('./postgres-db');
const { timeZone } = require('./postgres-config');
const desktop = require('./videohao-local-proxy');
const VideohaoScraper = require('./videohao-scraper');
const { createBridge, finderUsername } = require('./videohao-bridge');
const { saveVideohaoPosts } = require('./videohao-posts');

const bridgeUrl = process.env.VIDEOHAO_BRIDGE_URL?.trim();
const mode = (bridgeUrl || process.platform === 'linux') ? 'wx-channels-download' :
  (process.platform === 'win32' ? 'desktop-wechat' : 'unavailable');
const maxPages = Math.min(50, Math.max(1, Number.parseInt(process.env.VIDEOHAO_BRIDGE_MAX_PAGES, 10) || 5));
const scraper = new VideohaoScraper();
const activeAccounts = new Set();
let desktopBusy = false;

function captureError(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

function bridge() {
  return createBridge(bridgeUrl || 'http://127.0.0.1:2022');
}

function requireSupportedMode() {
  if (mode === 'unavailable') throw captureError('请配置 VIDEOHAO_BRIDGE_URL 以启用视频号采集', 503);
}

async function withDesktopCapture(operation) {
  if (desktopBusy) throw captureError('桌面微信正在执行另一项视频号任务，请稍后重试', 409);
  desktopBusy = true;
  try {
    return await operation();
  } finally {
    desktopBusy = false;
  }
}

async function status() {
  let available = false;
  let message;
  try {
    requireSupportedMode();
    if (mode === 'desktop-wechat') {
      const result = await desktop.checkDesktopWeChatStatus();
      available = result.available === true;
      message = result.message || result.error;
    } else {
      available = await bridge().getStatus();
      message = available ? '视频号下载器已连接' : '请在已登录的微信中打开视频号页面，连接下载器';
    }
  } catch (error) {
    message = error.message;
  }
  return { platform: 'videohao', mode, available, hasCookie: available, isValid: available, message, updatedAt: new Date().toISOString() };
}

async function search(keyword, { timeout, pageSize } = {}) {
  requireSupportedMode();
  if (mode === 'wx-channels-download') return bridge().search(keyword, pageSize);
  return withDesktopCapture(async () => {
    const result = await desktop.resolvePublicAccountByDesktopWeChat(keyword, { timeout });
    if (!result.success) throw captureError(result.error || '桌面微信账号搜索失败');
    return [result.data];
  });
}

function targetUsername(account) {
  const username = finderUsername(account.sec_uid) || finderUsername(account.unique_id);
  if (!username) throw captureError('该账号缺少 Finder ID，请在账号管理中搜索并确认对应视频号', 422);
  return username;
}

async function readAuthorizedWindowsAccount(account, profileOnly, startDate, endDate) {
  let authState = null;
  if (account.cookie_data) {
    try { authState = JSON.parse(account.cookie_data); } catch { /* The scraper reports expired authorization. */ }
  }
  if (!authState) throw captureError('视频号授权已失效，请重新扫码登录', 401);
  const result = await scraper.fetchProfileAndPosts(
    account.sec_uid || account.unique_id, authState, profileOnly ? 0 : 50, startDate, endDate
  );
  if (result.cookieExpired) throw captureError('视频号授权已失效，请重新扫码登录', 401);
  if (!result.success) throw captureError(result.error || '视频号授权采集失败', result.busy ? 409 : 502);
  const expected = finderUsername(account.sec_uid) || finderUsername(account.unique_id);
  const actual = finderUsername(result.data?.profile?.unique_id);
  if (expected && actual && expected !== actual) throw captureError('微信返回的账号与目标视频号不匹配');
  return result.data;
}

async function profile(account) {
  requireSupportedMode();
  let data;
  if (mode === 'wx-channels-download') {
    const result = await bridge().fetchAccount(targetUsername(account), { maxPages: 1, profileOnly: true });
    data = result.profile;
  } else if (account.status === 'public') {
    [data] = await search(account.nickname || account.unique_id, { timeout: 25000 });
    const expected = finderUsername(account.sec_uid) || finderUsername(account.unique_id);
    if (expected && finderUsername(data?.unique_id) !== expected) throw captureError('搜索结果与已保存的 Finder ID 不一致');
  } else {
    data = (await readAuthorizedWindowsAccount(account, true))?.profile;
  }
  if (!data || !(data.nickname || data.avatar || data.signature)) {
    throw captureError('未取得可核对的视频号账号资料');
  }
  return data;
}

function selectPosts(posts, startDate, endDate) {
  if (!startDate && !endDate) return posts;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return posts.filter(post => {
    if (!post.published_at) return true;
    const date = formatter.format(new Date(post.published_at));
    return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });
}

async function sync(account, { timeout, startDate, endDate } = {}) {
  requireSupportedMode();
  if ([startDate, endDate].some(date => date && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) ||
      (startDate && endDate && startDate > endDate)) {
    throw captureError('请选择有效的视频号采集日期范围', 400);
  }
  if (activeAccounts.has(account.id)) throw captureError('该视频号账号正在采集，请稍后重试', 409);
  activeAccounts.add(account.id);
  try {
    if (mode === 'desktop-wechat' && account.status === 'public') {
      return await withDesktopCapture(async () => {
        const result = await desktop.desktopSync(account.id, { timeout });
        if (!result.success) throw captureError(result.error || '桌面微信采集失败', result.unavailable ? 503 : 502);
        if (!result.saved) throw captureError('桌面微信已打开，但未捕获到目标账号作品，请检查视频号页面后重试');
        return { mode, saved: result.saved, videosUpdated: true, coverage: { deletionSafe: false } };
      });
    }

    const result = mode === 'wx-channels-download'
      ? await bridge().fetchAccount(targetUsername(account), { maxPages })
      : await readAuthorizedWindowsAccount(account, false, startDate, endDate);
    const posts = mode === 'wx-channels-download' ? selectPosts(result.posts, startDate, endDate) : result.posts || [];
    if (mode === 'desktop-wechat' && !posts.length && !result.profile) {
      throw captureError('未取得可核对的视频号作品或账号资料');
    }
    const updates = { last_fetch_at: new Date().toISOString() };
    const profileData = result.profile || null;
    if (profileData?.nickname) updates.nickname = profileData.nickname;
    if (profileData?.avatar) updates.avatar = profileData.avatar;
    if (profileData?.signature) updates.signature = profileData.signature;
    if (profileData?.follower_count !== undefined) updates.follower_count = profileData.follower_count;
    if (profileData?.video_count !== undefined) updates.video_count = profileData.video_count;
    const summary = await withTransaction(async connection => {
      if (!(await database.updateAccount(account.id, updates, connection))) {
        throw captureError('视频号账号已不存在', 404);
      }
      return saveVideohaoPosts(account.id, posts, { connection });
    });
    return {
      ...summary,
      mode,
      videosUpdated: true,
      profileUpdated: Boolean(profileData),
      coverage: { pages: result.pages, hasMore: result.hasMore, ignored: result.ignored, deletionSafe: false }
    };
  } finally {
    activeAccounts.delete(account.id);
  }
}

module.exports = { mode, status, search, profile, sync, withDesktopCapture };
