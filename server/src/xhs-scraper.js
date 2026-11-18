require('./browser-temp');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function parseCountValue(value) {
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
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function parseProfileCounts(interactions = [], stats = {}) {
  const read = (labels, fields) => {
    const interaction = interactions.find((entry) =>
      [entry?.type, entry?.name, entry?.title, entry?.label].some((label) =>
        labels.includes(String(label || '').trim().toLowerCase())
      )
    );
    const values = [interaction?.count, interaction?.value, interaction?.num, ...fields.map((field) => stats[field])];
    const value = values.find((candidate) =>
      /^\d[\d,]*(?:\.\d+)?\s*[亿万千wk]?\s*[+＋]?$/i.test(String(candidate ?? '').trim())
    );
    if (value === undefined) return undefined;
    return parseCountValue(String(value).trim().replace(/[+＋]/g, ''));
  };
  return {
    follower_count: read(['粉丝', 'fans', 'follower', 'followers'], ['fans', 'fansCount', 'fanCount', 'followerCount', 'followers', 'follower_count']),
    following_count: read(['关注', 'follow', 'follows', 'following'], ['follows', 'followCount', 'followingCount', 'following_count']),
    like_count: read(['获赞', '赞与收藏', '获赞与收藏', 'interaction', 'liked', 'like', 'likes'], ['likedCount', 'likeCount', 'likes', 'liked_count'])
  };
}

function extractAvatarCandidate(...sources) {
  const avatarKeys = [
    'avatar',
    'avatarUrl',
    'avatar_url',
    'headImgUrl',
    'head_img_url',
    'headimgurl',
    'head_url',
    'headUrl',
    'imageb',
    'imageB',
    'image',
    'imageUrl',
    'image_url',
    'imgUrl',
    'img_url',
    'portrait',
    'profileAvatar',
    'profile_avatar',
    'userAvatar',
    'user_avatar',
    'avatarThumb',
    'avatar_thumb'
  ];

  const isValidAvatar = (value) => {
    if (typeof value !== 'string') return false;
    const raw = value.trim();
    return !!raw && !raw.startsWith('data:');
  };

  const walk = (value, depth = 0, seen = new Set()) => {
    if (!value || depth > 4) return '';
    if (typeof value === 'string') return isValidAvatar(value) ? value : '';
    if (typeof value !== 'object') return '';
    if (seen.has(value)) return '';
    seen.add(value);

    for (const key of avatarKeys) {
      const candidate = value[key];
      if (isValidAvatar(candidate)) return candidate;
      if (candidate && typeof candidate === 'object') {
        const nested = walk(candidate, depth + 1, seen);
        if (nested) return nested;
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = walk(item, depth + 1, seen);
        if (nested) return nested;
      }
      return '';
    }

    for (const nestedValue of Object.values(value)) {
      if (typeof nestedValue === 'string' && isValidAvatar(nestedValue)) {
        const lower = nestedValue.toLowerCase();
        if (lower.includes('avatar') || lower.includes('head') || lower.includes('user') || lower.includes('portrait') || lower.includes('image')) {
          return nestedValue;
        }
      }
      if (nestedValue && typeof nestedValue === 'object') {
        const nested = walk(nestedValue, depth + 1, seen);
        if (nested) return nested;
      }
    }
    return '';
  };

  for (const source of sources) {
    const candidate = walk(source);
    if (candidate) return candidate;
  }
  return '';
}

class XiaohongshuScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.lastRequestAt = 0;
    this.blockedUntil = 0;
    this.minRequestInterval = parseInt(process.env.XHS_MIN_REQUEST_INTERVAL_MS || '35000', 10);
    this.detailFetchLimit = parseInt(process.env.XHS_DETAIL_FETCH_LIMIT || '8', 10);
    this.activeFetches = new Set();
    this.logFile = path.join(__dirname, '..', 'logs', 'xhs-sync.log');
  }

  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--mute-audio'
        ]
      });
    }
  }

  async close() {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  async createContext(cookies = null) {
    await this.init();

    if (!this.context) {
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        extraHTTPHeaders: {
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'sec-ch-ua-platform': '"Windows"'
        }
      });

      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
        window.chrome = { runtime: {} };
      });
    }

    if (Array.isArray(cookies) && cookies.length > 0) {
      await this.context.addCookies(this._normalizeCookies(cookies));
    }

    return this.context;
  }

  async fetchFromLink(url, cookies = null, options = {}) {
    const context = await this.createContext(cookies);
    const page = await context.newPage();

    try {
      await this._beforeRequest();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);

      const state = await this._getPageState(page);
      if (state === 'login') {
        return { success: false, error: '小红书Cookie需要重新扫码验证', cookieExpired: true };
      }
      if (state === 'blocked') {
        return { success: false, error: '小红书触发安全验证，请稍后再试', rateLimited: true };
      }

      const requestedUserId = this._extractUserId(url);
      const pageUserId = this._extractUserId(page.url());
      const profile = await this._extractProfileFromPage(page);
      const userId = requestedUserId || pageUserId || profile.unique_id;
      if ((pageUserId && pageUserId !== userId) || (profile.unique_id && profile.unique_id !== userId)) {
        return { success: false, error: '小红书主页与目标账号不匹配' };
      }
      if (!pageUserId && !profile.unique_id) {
        return { success: false, error: '无法提取小红书账号信息，请使用用户主页链接或登录后重试' };
      }
      const useCreatorProfile = options.useCreatorProfile !== false;
      const creatorSnapshot = useCreatorProfile && Array.isArray(cookies) && cookies.length > 0
        ? await this._fetchCreatorSnapshot(context, userId).catch(() => null)
        : null;
      if (creatorSnapshot?.profile && userId && creatorSnapshot.profile.unique_id === userId) {
        Object.assign(profile, {
          nickname: creatorSnapshot.profile.nickname || profile.nickname,
          avatar: creatorSnapshot.profile.avatar || profile.avatar,
          signature: creatorSnapshot.profile.signature || profile.signature,
          follower_count: profile.follower_count ?? creatorSnapshot.profile.follower_count,
          following_count: profile.following_count ?? creatorSnapshot.profile.following_count,
          like_count: profile.like_count ?? creatorSnapshot.profile.like_count
        });
      }
      if (options.requireFollowerCount && profile.follower_count === undefined) {
        return { success: false, error: '小红书主页未返回粉丝数，请稍后重试' };
      }

      return {
        success: true,
        data: {
          unique_id: userId,
          user_path: userId,
          nickname: profile.nickname || '小红书用户',
          avatar: profile.avatar || '',
          signature: profile.signature || '',
          follower_count: profile.follower_count,
          following_count: profile.following_count,
          like_count: profile.like_count,
          verified: profile.verified ? 1 : 0
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async fetchFromKeyword(keyword, cookies = null, options = {}) {
    const query = String(keyword || '').trim();
    if (!query) {
      return { success: false, error: '请输入小红书账号名称' };
    }

    const context = await this.createContext(cookies);
    const page = await context.newPage();
    const apiCandidates = [];

    try {
      page.on('response', async (response) => {
        const url = response.url();
        if (!url.includes('xiaohongshu.com/api/sns/web/v1/search/notes')) return;
        try {
          const data = await response.json();
          apiCandidates.push(...this._parseSearchNoteUserCandidates(data, query));
        } catch (e) {}
      });

      await this._beforeRequest();
      const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}`;
      this._log('search:keyword:start', { keyword: query });
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(8000);

      const pageState = await this._getPageState(page);
      if (pageState === 'login') {
        await page.close().catch(() => {});
        return { success: false, error: '小红书Cookie需要重新扫码验证', cookieExpired: true };
      }
      if (pageState === 'blocked') {
        await page.close().catch(() => {});
        return { success: false, error: '小红书触发安全验证，请稍后再试', rateLimited: true };
      }

      const domCandidates = await this._extractSearchUserCandidatesFromPage(page, query);
      const candidate = this._pickBestSearchUserCandidate([...apiCandidates, ...domCandidates], query);
      await page.close().catch(() => {});

      if (!candidate?.url) {
        return { success: false, error: `未搜索到匹配的小红书账号：${query}` };
      }

      this._log('search:keyword:matched', {
        keyword: query,
        nickname: candidate.nickname,
        userId: candidate.user_id
      });

      const result = await this.fetchFromLink(candidate.url, cookies, {
        ...options,
        useCreatorProfile: false
      });
      if (!result.success) {
        if (candidate.user_id && candidate.nickname) {
          return {
            success: true,
            data: this._buildProfileFromSearchCandidate(candidate, query)
          };
        }
        return result;
      }

      return {
        success: true,
        data: {
          ...result.data,
          unique_id: result.data.unique_id || candidate.user_id,
          user_path: result.data.user_path || candidate.user_id || null,
          nickname: result.data.nickname || candidate.nickname || query,
          avatar: result.data.avatar || candidate.avatar || '',
          search_keyword: query
        }
      };
    } catch (error) {
      await page.close().catch(() => {});
      return { success: false, error: this._normalizeNavigationError(error) };
    }
  }

  async fetchProfileAndNotes(userId, cookies = null, maxNotes = 20, startDate = null, endDate = null, onNote = null, options = {}) {
    if (!userId) {
      return { success: false, error: '缺少小红书用户ID' };
    }

    if (Date.now() < this.blockedUntil) {
      return {
        success: false,
        error: `小红书风控冷却中，请稍后再试`,
        rateLimited: true,
        retryAfterMs: this.blockedUntil - Date.now()
      };
    }

    if (this.activeFetches.has(userId)) {
      return {
        success: false,
        busy: true,
        error: '该小红书账号正在采集中，请等待当前任务完成后再试'
      };
    }

    this.activeFetches.add(userId);
    let page = null;
    try {
      const context = await this.createContext(cookies);
      page = await context.newPage();

      if (options.useCreator) {
        const creatorSnapshot = await this._fetchCreatorSnapshot(context, userId, { maxNotes }).catch((error) => {
          this._log('creator:primary-error', { userId, error: error.message });
          return null;
        });
        if (creatorSnapshot?.profile && creatorSnapshot.notes?.length) {
          const notes = creatorSnapshot.notes.map((note) => this._normalizeRawNote(note));
          const filteredNotes = this._filterByTimeRange(notes, startDate, endDate);
          if (onNote) {
            for (const note of filteredNotes) {
              await onNote(note, 'creator');
            }
          }
          await page.close().catch(() => {});
          this._log('creator:primary-success', {
            userId,
            profileNickname: creatorSnapshot.profile.nickname || null,
            notes: notes.length,
            firstNote: filteredNotes[0] ? {
              id: filteredNotes[0].video_id,
              title: filteredNotes[0].title,
              playCount: filteredNotes[0].play_count,
              publishedAt: filteredNotes[0].published_at
            } : null
          });
          return {
            success: true,
            data: {
              profile: creatorSnapshot.profile,
              notes,
              filteredNotes,
              coverage: {
                source: 'creator',
                collected: notes.length,
                deletionSafe: false
              }
            }
          };
        }
        this._log('creator:primary-empty', {
          userId,
          hasProfile: !!creatorSnapshot?.profile,
          notes: creatorSnapshot?.notes?.length || 0
        });
      }

      await this._beforeRequest();
      const url = `https://www.xiaohongshu.com/user/profile/${userId}`;
      this._log('fetch:start', {
        userId,
        hasCookies: Array.isArray(cookies) && cookies.length > 0,
        maxNotes,
        startDate,
        endDate
      });

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(this._jitter(4500, 1500));

      const pageState = await this._getPageState(page);
      this._log('fetch:page-state', { userId, pageState, url: page.url() });
      if (pageState === 'login') {
        await page.close().catch(() => {});
        this._log('fetch:cookie-expired', { userId });
        return { success: false, error: 'Cookie已失效，请重新扫码登录', cookieExpired: true };
      }
      if (pageState === 'blocked') {
        this._markBlocked();
        await page.close().catch(() => {});
        this._log('fetch:blocked', { userId, retryAfterMs: this.blockedUntil - Date.now() });
        return { success: false, error: '小红书触发安全验证，请稍后再试', rateLimited: true, retryAfterMs: this.blockedUntil - Date.now() };
      }

      if (this._extractUserId(page.url()) !== userId) {
        await page.close().catch(() => {});
        return { success: false, error: '小红书主页与目标账号不匹配' };
      }

      const extracted = await this._collectRawNotesByBatches(page, userId, maxNotes, startDate, endDate);

      if (!extracted) {
        await page.close().catch(() => {});
        this._log('fetch:no-state', { userId });
        return { success: true, data: { profile: null, notes: [] } };
      }

      const creatorSnapshot = options.useCreator ? await this._fetchCreatorSnapshot(page.context(), userId).catch((error) => {
        this._log('creator:snapshot-error', { userId, error: error.message });
        return null;
      }) : null;
      if (creatorSnapshot?.profile) {
        const { profile } = creatorSnapshot;
        extracted.profile = {
          ...(extracted.profile || {}),
          ...profile,
          follower_count: profile.follower_count ?? extracted.profile?.follower_count,
          following_count: profile.following_count ?? extracted.profile?.following_count,
          like_count: profile.like_count ?? extracted.profile?.like_count
        };
      }
      if (creatorSnapshot?.notes?.length) {
        const noteMap = new Map((extracted.notes || []).map((note) => [note.note_id, note]));
        for (const creatorNote of creatorSnapshot.notes) {
          const existing = noteMap.get(creatorNote.note_id) || {};
          noteMap.set(creatorNote.note_id, {
            ...existing,
            ...creatorNote,
            xsec_token: existing.xsec_token || creatorNote.xsec_token || '',
            cover_url: existing.cover_url || creatorNote.cover_url || '',
            video_url: existing.video_url || creatorNote.video_url || '',
            image_urls: existing.image_urls || creatorNote.image_urls || []
          });
        }
        extracted.notes = Array.from(noteMap.values());
        this._log('creator:merged', {
          userId,
          notes: creatorSnapshot.notes.length,
          firstNote: creatorSnapshot.notes[0] ? {
            id: creatorSnapshot.notes[0].note_id,
            playCount: creatorSnapshot.notes[0].play_count,
            title: creatorSnapshot.notes[0].title
          } : null
        });
      }

      const basicNotes = extracted.notes.map((note) => this._normalizeRawNote(note));
      if (onNote) {
        for (const note of basicNotes) {
          await onNote(note, 'basic');
        }
      }

      const enrichedRawNotes = await this._enrichNotesFromDetails(page, extracted.notes, async (note) => {
        if (onNote) {
          await onNote(this._normalizeRawNote(note), 'detail');
        }
      });
      await page.close().catch(() => {});

      const notes = enrichedRawNotes.map((note) => this._normalizeRawNote(note));

      const filteredNotes = this._filterByTimeRange(notes, startDate, endDate);
      this._log('fetch:success', {
        userId,
        profileNickname: extracted.profile?.nickname || null,
        notes: notes.length,
        filtered: filteredNotes.length,
        firstNote: filteredNotes[0] ? {
          id: filteredNotes[0].video_id,
          type: filteredNotes[0].content_type,
          title: filteredNotes[0].title,
          likes: filteredNotes[0].like_count,
          publishedAt: filteredNotes[0].published_at,
          publishSource: filteredNotes[0].publish_time_source,
          hasCover: !!filteredNotes[0].cover_url,
          hasVideo: !!filteredNotes[0].video_url,
          imageCount: filteredNotes[0].image_urls?.length || 0
        } : null
      });

      return {
        success: true,
        data: {
          profile: extracted.profile,
          notes,
          filteredNotes,
          coverage: extracted.coverage || null
        }
      };
    } catch (error) {
      if (page) await page.close().catch(() => {});
      const normalizedError = this._normalizeNavigationError(error);
      this._log('fetch:error', { userId, error: error.message, normalizedError });
      return { success: false, error: normalizedError, rawError: error.message };
    } finally {
      this.activeFetches.delete(userId);
    }
  }

  _normalizeRawNote(note) {
    const detailPublishedAt = this._formatXhsTime(note.publish_time);
    const noteIdPublishedAt = this._formatXhsNoteIdTime(note.note_id);
    const imageUrls = Array.isArray(note.image_urls) ? note.image_urls : [];
    return {
      video_id: note.note_id,
      content_type: note.type === 'video' ? 'video' : 'note',
      title: note.title || '',
      description: note.description || '',
      cover_url: note.cover_url || imageUrls[0] || '',
      video_url: note.video_url || '',
      image_urls: imageUrls,
      duration: this._parseCount(note.duration),
      play_count: this._parseCount(note.play_count || note.view_count || note.read_count),
      like_count: this._parseCount(note.like_count),
      comment_count: this._parseCount(note.comment_count),
      share_count: this._parseCount(note.share_count),
      collect_count: this._parseCount(note.collect_count),
      published_at: detailPublishedAt || noteIdPublishedAt,
      publish_time_source: detailPublishedAt ? 'detail' : (noteIdPublishedAt ? 'note_id' : 'missing'),
      topic_tags: ''
    };
  }

  async _collectRawNotesByBatches(page, userId, batchSize = 20, startDate = null, endDate = null) {
    const pageBatchSize = Math.min(Math.max(parseInt(batchSize || '20', 10) || 20, 1), 20);
    const maxTotal = Math.max(parseInt(process.env.XHS_MAX_NOTES_PER_SYNC || '80', 10) || 80, pageBatchSize);
    const maxBatches = Math.ceil(maxTotal / pageBatchSize);
    const startBoundary = startDate ? new Date(startDate) : null;
    const noteMap = new Map();
    let profile = null;
    let visibleNotes = [];
    let previousVisibleCount = 0;
    let staleScrolls = 0;
    let stopReason = 'max_total';
    let reachedStartBoundary = false;

    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex++) {
      const extracted = await this._extractProfileAndRawNotes(page, userId);
      if (!extracted) {
        stopReason = 'no_state';
        return batchIndex === 0 ? null : {
          profile,
          notes: Array.from(noteMap.values()),
          coverage: {
            batchSize: pageBatchSize,
            collected: noteMap.size,
            stopReason,
            reachedStartBoundary,
            deletionSafe: false
          }
        };
      }
      if (extracted.profile) profile = extracted.profile;
      visibleNotes = Array.isArray(extracted.notes) ? extracted.notes : [];

      const targetCount = Math.min((batchIndex + 1) * pageBatchSize, maxTotal);
      const targetNotes = visibleNotes.slice(0, targetCount);
      for (const note of targetNotes) {
        if (note.note_id && !noteMap.has(note.note_id)) noteMap.set(note.note_id, note);
      }

      const collectedNotes = Array.from(noteMap.values());
      const lastNote = collectedNotes[collectedNotes.length - 1];
      const lastPublishedAt = lastNote
        ? (this._formatXhsTime(lastNote.publish_time) || this._formatXhsNoteIdTime(lastNote.note_id))
        : null;
      const shouldStopByDate = !!(startBoundary && lastPublishedAt && new Date(lastPublishedAt) < startBoundary);
      if (shouldStopByDate) {
        reachedStartBoundary = true;
        stopReason = 'date_boundary';
      }

      this._log('batch:collected', {
        userId,
        batch: batchIndex + 1,
        batchSize: pageBatchSize,
        visible: visibleNotes.length,
        collected: collectedNotes.length,
        lastNoteId: lastNote?.note_id || null,
        lastPublishedAt,
        startDate,
        stopByDate: shouldStopByDate
      });

      if (!startBoundary) {
        stopReason = 'no_start_date';
        break;
      }
      if (shouldStopByDate) {
        break;
      }
      if (collectedNotes.length >= maxTotal) {
        stopReason = 'max_total';
        break;
      }

      if (visibleNotes.length <= previousVisibleCount) {
        staleScrolls++;
        if (staleScrolls >= 2) {
          stopReason = 'no_more_visible';
          this._log('batch:no-more', { userId, visible: visibleNotes.length, collected: collectedNotes.length });
          break;
        }
      } else {
        staleScrolls = 0;
      }
      previousVisibleCount = visibleNotes.length;

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(this._jitter(4500, 1500));
      const pageState = await this._getPageState(page);
      if (pageState === 'blocked') {
        this._markBlocked();
        stopReason = 'blocked';
        this._log('batch:blocked', { userId, collected: noteMap.size });
        break;
      }
      if (pageState === 'login') {
        stopReason = 'login';
        this._log('batch:login', { userId, collected: noteMap.size });
        break;
      }
    }

    return {
      profile,
      notes: Array.from(noteMap.values()),
      coverage: {
        batchSize: pageBatchSize,
        collected: noteMap.size,
        stopReason,
        reachedStartBoundary,
        deletionSafe: !!(startBoundary && reachedStartBoundary)
      }
    };
  }

  async _extractProfileAndRawNotes(page, userId) {
    const result = await page.evaluate((expectedUserId) => {
        const state = window.__INITIAL_STATE__;
        if (!state || !state.user) return null;

        const unwrap = (value) => {
          if (!value) return value;
          if (value.value !== undefined) return value.value;
          if (value._value !== undefined) return value._value;
          return value;
        };

        const parseCount = (value) => {
          if (typeof value === 'number') return value;
          if (!value) return 0;
          const raw = String(value).replace(/,/g, '').replace(/[+＋]/g, '').trim();
          const match = raw.match(/(\d+\.?\d*)/);
          if (!match) return 0;
          const num = parseFloat(match[1]);
          if (raw.includes('亿')) return Math.round(num * 100000000);
          if (raw.includes('万') || /w$/i.test(raw)) return Math.round(num * 10000);
          if (raw.includes('千') || /k$/i.test(raw)) return Math.round(num * 1000);
          return Math.round(num);
        };
        const firstPresent = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
        const readDomNotePlayCounts = () => {
          const result = {};
          const readLastCount = (text) => {
            const lines = String(text || '')
              .split(/\n+/)
              .map((line) => line.trim())
              .filter(Boolean);
            for (let i = lines.length - 1; i >= 0; i--) {
              const match = lines[i].match(/^(\d+(?:\.\d+)?\s*[万亿千wWkK]?)$/);
              if (match) return parseCount(match[1]);
            }
            return 0;
          };
          Array.from(document.querySelectorAll('a[href*="/explore/"], a[href*="/discovery/item/"]')).forEach((link) => {
            const href = link.href || link.getAttribute('href') || '';
            const match = href.match(/\/(?:explore|discovery\/item)\/([A-Za-z0-9]+)/);
            if (!match) return;
            const count = readLastCount(link.innerText || link.textContent || '');
            if (count > 0) result[match[1]] = count;
          });
          return result;
        };

        const userPageData = unwrap(state.user.userPageData);
        let profile = null;
        const domPlayCounts = readDomNotePlayCounts();

        if (userPageData) {
          const basic = userPageData.basicInfo || userPageData.userInfo || {};
          const interactions = Array.isArray(userPageData.interactions) ? userPageData.interactions : [];
          const stats = userPageData.stats || userPageData.stat || userPageData.interactInfo || basic;

          profile = {
            unique_id: basic.userId || basic.user_id || expectedUserId,
            nickname: basic.nickname || basic.nickName || basic.name || '',
            avatar: basic.avatar || basic.imageb || basic.images || '',
            signature: basic.desc || basic.description || '',
            interactions,
            stats,
            verified: !!(basic.verified || basic.redOfficialVerifyShowIcon)
          };
        }

        const rawNotes = unwrap(state.user.notes || state.user.notesList || state.user.myNotes);
        const flatNotes = [];
        if (Array.isArray(rawNotes)) {
          rawNotes.forEach((item) => {
            if (Array.isArray(item)) flatNotes.push(...item);
            else if (item) flatNotes.push(item);
          });
        }

        const notes = flatNotes.map((item) => {
          const card = item.noteCard || item.note_card || item;
          const interact = card.interactInfo || card.interact_info || card.interaction || item.interactInfo || item.interact_info || {};
          const cover = card.cover || card.coverInfo || {};
          const video = card.video || {};
          const stream = video.media?.stream || {};
          const h264 = stream.h264 || stream.h265 || [];

          const noteId = card.noteId || card.note_id || item.id || '';
          return {
            note_id: noteId,
            type: card.type || 'normal',
            title: card.displayTitle || card.display_title || card.title || '',
            description: card.desc || card.description || '',
            cover_url: cover.url || cover.urlDefault || cover || '',
            video_url: h264[0]?.masterUrl || h264[0]?.url || video.url || '',
            play_count: parseCount(firstPresent(
              interact.viewCount, interact.view_count, interact.views,
              interact.readCount, interact.read_count, interact.browseCount, interact.browse_count,
              interact.playCount, interact.play_count, interact.viewedCount,
              card.viewCount, card.view_count, card.readCount, card.read_count, card.browseCount,
              card.playCount, card.play_count, domPlayCounts[noteId]
            )),
            like_count: parseCount(firstPresent(interact.likedCount, interact.liked_count, interact.likeCount, interact.like_count, interact.likes, interact.liked, interact.likeNum, interact.like_num, card.likedCount, card.liked_count, card.likeCount, card.like_count, card.likes, card.liked)),
            comment_count: parseCount(firstPresent(interact.commentCount, interact.comment_count, interact.comments, interact.commentsCount, interact.commentNum, interact.comment_num, card.commentCount, card.comment_count, card.comments, card.commentsCount, card.commentNum, card.comment_num)),
            collect_count: parseCount(firstPresent(interact.collectedCount, interact.collected_count, interact.collectCount, interact.collect_count, interact.collectionCount, interact.collection_count, interact.favCount, interact.fav_count, interact.favoriteCount, interact.favorite_count, card.collectedCount, card.collected_count, card.collectCount, card.collect_count, card.collectionCount, card.collection_count, card.favCount, card.fav_count, card.favoriteCount, card.favorite_count)),
            share_count: parseCount(firstPresent(interact.sharedCount, interact.shared_count, interact.shareCount, interact.share_count, interact.shares, interact.shareNum, interact.share_num, card.sharedCount, card.shared_count, card.shareCount, card.share_count, card.shares, card.shareNum, card.share_num)),
          publish_time: card.publishTime || card.time || card.createTime || null,
          xsec_token: card.xsecToken || card.xsec_token || item.xsecToken || '',
          image_count: Array.isArray(card.imageList || card.images) ? (card.imageList || card.images).length : 0
        };
      }).filter((note) => note.note_id);

        if (profile && !profile.avatar) {
          const avatarEl = Array.from(document.querySelectorAll('img[src], img[data-src], img[data-original], [style*="background-image"]'))
            .find((el) => {
              const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-original') || '';
              const style = el.getAttribute('style') || '';
              const className = String(el.className || '').toLowerCase();
              const alt = String(el.getAttribute('alt') || '').toLowerCase();
              const text = String(el.getAttribute('aria-label') || '').toLowerCase();
              const candidate = `${src} ${style} ${className} ${alt} ${text}`.toLowerCase();
              return candidate.includes('avatar') || candidate.includes('head') || candidate.includes('user') || candidate.includes('portrait') || candidate.includes('sns-avatar');
            });
          if (avatarEl) {
            profile.avatar = avatarEl.getAttribute('src') || avatarEl.getAttribute('data-src') || avatarEl.getAttribute('data-original') || '';
          }
        }

        return { profile, notes };
      }, userId);
    if (result?.profile) {
      const { interactions, stats, ...profile } = result.profile;
      result.profile = profile.unique_id === userId ? { ...profile, ...parseProfileCounts(interactions, stats) } : null;
    }
    return result;
  }

  async getUserNotes(userId, maxCount = 50, cookies = null, startDate = null, endDate = null) {
    const result = await this.fetchProfileAndNotes(userId, cookies, maxCount, startDate, endDate);
    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data?.notes || [],
      cookieExpired: false,
      rateLimited: result.rateLimited || false
    };
  }

  async fetchCreatorProfile(userId, cookies = null) {
    if (!userId || !Array.isArray(cookies) || cookies.length === 0) {
      return { success: false, error: 'missing_user_or_cookie' };
    }

    const context = await this.createContext(cookies);
    const snapshot = await this._fetchCreatorSnapshot(context, userId, { maxNotes: 1 });
    if (!snapshot?.profile) {
      return { success: false, error: 'creator_profile_empty' };
    }

    return {
      success: true,
      data: snapshot.profile
    };
  }

  async _fetchCreatorSnapshot(context, expectedUserId, options = {}) {
    const maxNotes = Math.min(Math.max(parseInt(options.maxNotes || '20', 10) || 20, 1), 50);
    const page = await context.newPage();
    try {
      await page.goto('https://creator.xiaohongshu.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      }).catch(() => {});
      await page.evaluate(() => fetch('/api/galaxy/user/cas/login', {
        method: 'POST',
        credentials: 'include'
      })).catch(() => {});
      const postedResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/galaxy/v2/creator/note/user/posted') && response.status() === 200,
        { timeout: 12000 }
      ).catch(() => null);
      await page.goto('https://creator.xiaohongshu.com/new/note-manager', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      }).catch(() => {});
      const postedResponse = await postedResponsePromise;
      let initialPostedData = null;
      if (postedResponse) {
        initialPostedData = await postedResponse.json().catch(() => null);
      }
      await page.waitForTimeout(1200).catch(() => {});

      const snapshot = await page.evaluate(async ({ expectedUserId, maxNotes, initialPostedData }) => {
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
        const firstPresent = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
        const extractAvatarCandidate = (...sources) => {
          const avatarKeys = [
            'avatar', 'avatarUrl', 'avatar_url', 'headImgUrl', 'head_img_url', 'headimgurl',
            'head_url', 'headUrl', 'imageb', 'imageB', 'image', 'imageUrl', 'image_url',
            'imgUrl', 'img_url', 'portrait', 'profileAvatar', 'profile_avatar',
            'userAvatar', 'user_avatar', 'avatarThumb', 'avatar_thumb'
          ];
          const isValidAvatar = (value) => {
            if (typeof value !== 'string') return false;
            const raw = value.trim();
            return !!raw && !raw.startsWith('data:');
          };
          const walk = (value, depth = 0, seen = new Set()) => {
            if (!value || depth > 4) return '';
            if (typeof value === 'string') return isValidAvatar(value) ? value : '';
            if (typeof value !== 'object') return '';
            if (seen.has(value)) return '';
            seen.add(value);
            for (const key of avatarKeys) {
              const candidate = value[key];
              if (isValidAvatar(candidate)) return candidate;
              if (candidate && typeof candidate === 'object') {
                const nested = walk(candidate, depth + 1, seen);
                if (nested) return nested;
              }
            }
            const values = Array.isArray(value) ? value : Object.values(value);
            for (const nestedValue of values) {
              const nested = walk(nestedValue, depth + 1, seen);
              if (nested) return nested;
            }
            return '';
          };
          for (const source of sources) {
            const candidate = walk(source);
            if (candidate) return candidate;
          }
          return '';
        };
        const toAbsoluteUrl = (url) => {
          if (!url) return '';
          const raw = String(url);
          if (raw.startsWith('//')) return `https:${raw}`;
          return raw;
        };
        const requestJson = async (url, options = {}) => {
          const response = await fetch(url, {
            credentials: 'include',
            ...options,
            headers: {
              accept: 'application/json, text/plain, */*',
              ...(options.headers || {})
            }
          });
          const text = await response.text();
          try {
            return JSON.parse(text);
          } catch (error) {
            return { success: false, msg: text.slice(0, 300) };
          }
        };

        const [userInfoResult, profileResult] = await Promise.all([
          requestJson('/api/galaxy/user/info'),
          requestJson('/api/galaxy/creator/home/personal_info')
        ]);

        const userInfo = userInfoResult?.data || {};
        const profileInfo = profileResult?.data || {};
        const creatorUserId = userInfo.userId || expectedUserId || '';
        if (expectedUserId && creatorUserId && creatorUserId !== expectedUserId) {
          return {
            success: false,
            reason: 'creator_user_mismatch',
            profile: null,
            notes: []
          };
        }

        const notes = [];
        for (let pageNo = 0; pageNo < 5 && notes.length < maxNotes; pageNo++) {
          const listResult = pageNo === 0 && initialPostedData
            ? initialPostedData
            : await requestJson(`/api/galaxy/v2/creator/note/user/posted?tab=0&page=${pageNo}`);
          const list = Array.isArray(listResult?.data?.notes) ? listResult.data.notes : [];
          if (!list.length) break;
          for (const item of list) {
            const imageList = Array.isArray(item.images_list) ? item.images_list : [];
            const coverUrl = toAbsoluteUrl(imageList[0]?.url || imageList[0]?.original || '');
            notes.push({
              note_id: item.id || item.note_id || '',
              type: item.type || 'normal',
              title: item.display_title || item.title || '',
              description: item.display_title || item.title || '',
              cover_url: coverUrl,
              video_url: '',
              image_urls: imageList.map((image) => toAbsoluteUrl(image.url || image.original || '')).filter(Boolean),
              play_count: parseCount(firstPresent(item.view_count, item.viewCount, item.read_count, item.readCount)),
              like_count: parseCount(firstPresent(item.likes, item.like_count, item.liked_count)),
              comment_count: parseCount(firstPresent(item.comments_count, item.comment_count)),
              collect_count: parseCount(firstPresent(item.collected_count, item.collect_count)),
              share_count: parseCount(firstPresent(item.shared_count, item.share_count)),
              publish_time: firstPresent(item.visible_time, item.time),
              xsec_token: item.xsec_token || '',
              xsec_source: item.xsec_source || 'pc_creatormng',
              duration: parseCount(item.video_info?.duration)
            });
            if (notes.length >= maxNotes) break;
          }
          if (listResult?.data?.page === -1) break;
        }

        return {
          success: true,
          profile: {
            unique_id: creatorUserId || expectedUserId,
            sec_uid: userInfo.redId || profileInfo.red_num || null,
            nickname: profileInfo.name || userInfo.userName || '',
            avatar: extractAvatarCandidate(
              profileInfo,
              profileInfo?.user,
              profileInfo?.userInfo,
              profileInfo?.basicInfo,
              userInfo,
              userInfo?.user,
              userInfo?.userInfo,
              userInfo?.basicInfo
            ) || '',
            signature: profileInfo.personal_desc || userInfo.userDesc || '',
            verified: 0
          },
          stats: {
            follower_count: firstPresent(profileInfo.fans_count, profileInfo.grow_info?.fans_count),
            following_count: profileInfo.follow_count,
            liked_count: profileInfo.faved_count
          },
          notes: notes.filter((note) => note.note_id)
        };
      }, { expectedUserId, maxNotes, initialPostedData });

      await page.close().catch(() => {});
      if (!snapshot?.success) {
        this._log('creator:snapshot-unavailable', {
          userId: expectedUserId,
          reason: snapshot?.reason || snapshot?.msg || 'unknown'
        });
        return null;
      }
      this._log('creator:snapshot-success', {
        userId: expectedUserId,
        profileNickname: snapshot.profile?.nickname || null,
        notes: snapshot.notes?.length || 0,
        firstNote: snapshot.notes?.[0] ? {
          id: snapshot.notes[0].note_id,
          playCount: snapshot.notes[0].play_count,
          title: snapshot.notes[0].title
        } : null
      });
      return {
        profile: { ...snapshot.profile, ...parseProfileCounts([], snapshot.stats) },
        notes: snapshot.notes
      };
    } catch (error) {
      await page.close().catch(() => {});
      throw error;
    }
  }

  async _enrichNotesFromDetails(page, notes, onDetail = null) {
    const limit = Math.min(this.detailFetchLimit, notes.length);
    const enriched = [...notes];

    for (let index = 0; index < limit; index++) {
      const note = enriched[index];
      if (!note.note_id) continue;

      try {
        await this._beforeRequest();
        const detailUrl = this._buildNoteDetailUrl(note);
        this._log('detail:start', {
          noteId: note.note_id,
          index,
          url: detailUrl.replace(note.xsec_token || '', note.xsec_token ? '[xsec_token]' : '')
        });

        await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(this._jitter(3200, 1200));

        const pageState = await this._getPageState(page);
        if (pageState === 'blocked') {
          this._markBlocked();
          this._log('detail:blocked', { noteId: note.note_id });
          break;
        }
        if (pageState === 'login') {
          this._log('detail:login', { noteId: note.note_id });
          break;
        }

        const detail = await this._extractCurrentNoteDetail(page, note.note_id);
        if (detail) {
          const countKeys = new Set(['play_count', 'like_count', 'comment_count', 'collect_count', 'share_count']);
          const detailEntries = Object.entries(detail).filter(([key, value]) => {
            if (value === undefined || value === null || value === '') return false;
            if (countKeys.has(key) && Number(value) === 0 && Number(note[key]) > 0) return false;
            return true;
          });
          enriched[index] = {
            ...note,
            ...Object.fromEntries(detailEntries)
          };
          this._log('detail:success', {
            noteId: note.note_id,
            title: enriched[index].title,
            publishTime: enriched[index].publish_time,
            playCount: enriched[index].play_count || 0,
            likeCount: enriched[index].like_count || 0,
            commentCount: enriched[index].comment_count || 0,
            collectCount: enriched[index].collect_count || 0,
            shareCount: enriched[index].share_count || 0,
            hasVideo: !!enriched[index].video_url,
            imageCount: enriched[index].image_urls?.length || 0
          });
          if (onDetail) {
            await onDetail(enriched[index]);
          }
        } else {
          this._log('detail:no-data', { noteId: note.note_id });
        }
      } catch (error) {
        this._log('detail:error', { noteId: note.note_id, error: error.message });
      }
    }

    return enriched;
  }

  _buildNoteDetailUrl(note) {
    const params = new URLSearchParams();
    if (note.xsec_token) params.set('xsec_token', note.xsec_token);
    params.set('xsec_source', 'pc_user');
    return `https://www.xiaohongshu.com/explore/${note.note_id}?${params.toString()}`;
  }

  async _extractCurrentNoteDetail(page, expectedNoteId) {
    return await page.evaluate((noteId) => {
      const state = window.__INITIAL_STATE__;

      const unwrap = (value) => {
        if (!value) return value;
        if (value.value !== undefined) return value.value;
        if (value._value !== undefined) return value._value;
        return value;
      };

      const readDomPublishTime = () => {
        const text = document.body?.innerText || '';
        const patterns = [
          /\b20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\b/,
          /\b\d{1,2}[-/.月]\d{1,2}日?\b/,
          /\b\d+\s*(分钟前|小时前|天前|周前|月前|年前)\b/,
          /\b(今天|昨天|前天)\b/
        ];
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) return match[0];
        }
        return null;
      };

      const parseCount = (value) => {
        if (typeof value === 'number') return value;
        if (!value) return 0;
        const raw = String(value).replace(/,/g, '').replace(/[+＋]/g, '').trim();
        const match = raw.match(/(\d+\.?\d*)/);
        if (!match) return 0;
        const num = parseFloat(match[1]);
        if (raw.includes('亿')) return Math.round(num * 100000000);
        if (raw.includes('万') || /w$/i.test(raw)) return Math.round(num * 10000);
        if (raw.includes('千') || /k$/i.test(raw)) return Math.round(num * 1000);
        return Math.round(num);
      };
      const firstPresent = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
      const readDomPlayCount = () => {
        const text = document.body?.innerText || '';
        const explicit = text.match(/(\d+(?:\.\d+)?\s*[万亿千wWkK]?)\s*(?:浏览|阅读|观看|播放)/);
        if (explicit) return parseCount(explicit[1]);
        const compact = text.match(/(?:浏览|阅读|观看|播放)\s*(\d+(?:\.\d+)?\s*[万亿千wWkK]?)/);
        if (compact) return parseCount(compact[1]);
        return 0;
      };

      const readDomActionCounts = () => {
        const result = {};
        const parseLooseCount = (text) => {
          const match = String(text || '').match(/(\d+(?:\.\d+)?\s*[\u4e07\u5104\u5343wWkK]?)/);
          return match ? parseCount(match[1]) : 0;
        };
        const keywordMap = [
          ['like_count', ['like', 'liked', '\u8d5e', '\u70b9\u8d5e']],
          ['comment_count', ['comment', '\u8bc4\u8bba']],
          ['collect_count', ['collect', 'favorite', 'fav', '\u6536\u85cf']],
          ['share_count', ['share', '\u5206\u4eab', '\u8f6c\u53d1']]
        ];
        Array.from(document.querySelectorAll('button, [role="button"], [class], [aria-label], [title]')).forEach((el) => {
          const countText = [
            el.getAttribute('aria-label'),
            el.getAttribute('title'),
            el.textContent
          ].map((value) => String(value || '')).join(' ');
          const text = `${countText} ${String(el.className || '')}`;
          const lower = text.toLowerCase();
          for (const [key, keywords] of keywordMap) {
            if (result[key]) continue;
            if (!keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) continue;
            const value = parseLooseCount(countText);
            if (value > 0) result[key] = value;
          }
        });
        return result;
      };

      const candidates = [];
      const pushCandidate = (value) => {
        const unwrapped = unwrap(value);
        if (!unwrapped) return;
        if (unwrapped.note) candidates.push(unwrapped.note);
        if (unwrapped.noteCard) candidates.push(unwrapped.noteCard);
        if (unwrapped.note_card) candidates.push(unwrapped.note_card);
        candidates.push(unwrapped);
      };

      const walk = (root) => {
        const queue = [root];
        const seen = new WeakSet();
        let visited = 0;
        while (queue.length && visited < 3000) {
          const current = unwrap(queue.shift());
          visited++;
          if (!current || typeof current !== 'object') continue;
          if (seen.has(current)) continue;
          seen.add(current);

          const currentId = current.noteId || current.note_id || current.id;
          if (currentId === noteId || current.noteCard || current.note_card) {
            pushCandidate(current);
          }

          if (Array.isArray(current)) {
            current.forEach((item) => queue.push(item));
          } else {
            Object.entries(current).forEach(([key, value]) => {
              if (/note|detail|card|item|data|map|list/i.test(key)) queue.push(value);
            });
          }
        }
      };

      if (state?.note) {
        pushCandidate(state.note.noteDetail);
        pushCandidate(state.note.currentNote);

        const detailMap = unwrap(state.note.noteDetailMap || state.note.noteMap || state.note.noteDetailData);
        if (detailMap && typeof detailMap === 'object') {
          Object.values(detailMap).forEach(pushCandidate);
        }
        walk(state.note);
      }
      walk(state);

      const note = candidates.find((item) => {
        const currentId = item?.noteId || item?.note_id || item?.id;
        return currentId === noteId;
      }) || candidates.find(Boolean);

      const domPublishTime = readDomPublishTime();
      if (!note) {
        return domPublishTime ? { note_id: noteId, publish_time: domPublishTime } : null;
      }

      const interact = note.interactInfo || note.interact_info || note.interaction || note.interactionInfo || {};
      const domActionCounts = readDomActionCounts();
      const imageList = note.imageList || note.imagesList || note.images_list || note.images || note.image_list || [];
      const imageUrls = Array.isArray(imageList)
        ? imageList.map((image) => {
            if (typeof image === 'string') return image;
            const infoList = Array.isArray(image.infoList) ? image.infoList : [];
            const livePhoto = image.livePhoto || image.live_photo || {};
            return image.url || image.urlDefault || image.src || image.original || image.traceId ||
              infoList[0]?.url || infoList[0]?.urlDefault || livePhoto.url || '';
          }).filter(Boolean)
        : [];

      const video = note.video || {};
      const stream = video.media?.stream || video.stream || {};
      const h264 = stream.h264 || stream.h265 || stream.av1 || [];
      const streams = Array.isArray(h264) ? h264 : Object.values(h264 || {});
      const videoUrl = streams[0]?.masterUrl || streams[0]?.url || streams[0]?.backupUrls?.[0] ||
        video.url || video.masterUrl || video.originVideoKey || '';

      return {
        note_id: note.noteId || note.note_id || note.id || noteId,
        type: note.type || (videoUrl ? 'video' : 'normal'),
        title: note.title || note.displayTitle || note.display_title || '',
        description: note.desc || note.description || '',
        cover_url: note.cover?.url || note.cover?.urlDefault || note.coverInfo?.url || imageUrls[0] || '',
        video_url: videoUrl,
        image_urls: imageUrls,
        play_count: parseCount(firstPresent(
          interact.viewCount, interact.view_count, interact.views,
          interact.readCount, interact.read_count, interact.browseCount, interact.browse_count,
          interact.playCount, interact.play_count, interact.viewedCount,
          note.viewCount, note.view_count, note.readCount, note.read_count, note.browseCount,
          note.playCount, note.play_count, readDomPlayCount()
        )),
        like_count: parseCount(firstPresent(interact.likedCount, interact.liked_count, interact.likeCount, interact.like_count, interact.likes, interact.liked, interact.likeNum, interact.like_num, note.likedCount, note.liked_count, note.likeCount, note.like_count, note.likes, note.liked, domActionCounts.like_count)),
        comment_count: parseCount(firstPresent(interact.commentCount, interact.comment_count, interact.comments, interact.commentsCount, interact.commentNum, interact.comment_num, note.commentCount, note.comment_count, note.comments, note.commentsCount, note.commentNum, note.comment_num, domActionCounts.comment_count)),
        collect_count: parseCount(firstPresent(interact.collectedCount, interact.collected_count, interact.collectCount, interact.collect_count, interact.collectionCount, interact.collection_count, interact.favCount, interact.fav_count, interact.favoriteCount, interact.favorite_count, note.collectedCount, note.collected_count, note.collectCount, note.collect_count, note.collectionCount, note.collection_count, note.favCount, note.fav_count, note.favoriteCount, note.favorite_count, domActionCounts.collect_count)),
        share_count: parseCount(firstPresent(interact.sharedCount, interact.shared_count, interact.shareCount, interact.share_count, interact.shares, interact.shareNum, interact.share_num, note.sharedCount, note.shared_count, note.shareCount, note.share_count, note.shares, note.shareNum, note.share_num, domActionCounts.share_count)),
        publish_time: note.time || note.publishTime || note.createTime || note.createdTime || note.publish_time ||
          note.publish_time_millis || note.timestamp || note.create_time || domPublishTime || null
      };
    }, expectedNoteId).catch(() => null);
  }

  async _beforeRequest() {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    const waitMs = this.lastRequestAt ? Math.max(0, this.minRequestInterval - elapsed) : 0;

    if (waitMs > 0) {
      this._log('rate:wait', { waitMs });
      await this._sleep(waitMs + this._jitter(1000, 1200));
    }

    this.lastRequestAt = Date.now();
  }

  async _getPageState(page) {
    const result = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      return {
        url: window.location.href,
        title: document.title || '',
        text: text.slice(0, 600)
      };
    }).catch(() => ({ url: page.url(), title: '', text: '' }));

    if (result.url.includes('/website-login/captcha') || result.url.includes('verifyUuid')) {
      return 'blocked';
    }
    if (result.url.includes('/login') || result.text.includes('登录后推荐更懂你的笔记') || result.text.includes('扫码验证身份')) {
      return 'login';
    }
    if (result.title.includes('安全验证') || result.text.includes('安全验证') || result.text.includes('请求太频繁')) {
      return 'blocked';
    }
    return 'ok';
  }

  _markBlocked() {
    const cooldown = parseInt(process.env.XHS_BLOCK_COOLDOWN_MS || '180000', 10);
    this.blockedUntil = Date.now() + cooldown;
    this._log('rate:blocked', { cooldownMs: cooldown });
  }

  _normalizeNavigationError(error) {
    const message = error?.message || String(error);
    if (message.includes('ERR_NETWORK_ACCESS_DENIED')) {
      return [
        '当前后端进程中的 Playwright 浏览器无法访问小红书（ERR_NETWORK_ACCESS_DENIED）。',
        '这通常是启动该后端的终端/沙箱/安全软件禁止浏览器联网，不是小红书账号或 Cookie 问题。',
        '请关闭当前由 Codex 启动的后端，在 Windows 普通 PowerShell/终端中运行 start-local.ps1 后再测试。'
      ].join('');
    }
    return message.replace(/\x1b\[[0-9;]*m/g, '');
  }

  _log(event, data = {}) {
    const entry = {
      ts: new Date().toISOString(),
      event,
      ...data
    };
    const line = JSON.stringify(entry);
    console.log(`[XHS] ${line}`);
    try {
      fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
      fs.appendFileSync(this.logFile, `${line}\n`, 'utf8');
    } catch (error) {
      console.error('[XHS] write log failed:', error.message);
    }
  }

  _normalizeCookies(cookies) {
    return cookies
      .filter((cookie) => cookie && cookie.name && cookie.value !== undefined)
      .map((cookie) => ({
        name: cookie.name,
        value: String(cookie.value),
        domain: cookie.domain || '.xiaohongshu.com',
        path: cookie.path || '/',
        expires: cookie.expires
      }));
  }

  _normalizeSearchText(value) {
    return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
  }

  _parseSearchNoteUserCandidates(response, keyword) {
    const items = response?.data?.items;
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => {
        const user = item?.note_card?.user || item?.user || item?.noteCard?.user;
        const userId = user?.user_id || user?.userId || user?.id;
        const nickname = user?.nickname || user?.nick_name || user?.name || '';
        if (!userId || !nickname) return null;
        return {
          user_id: userId,
          nickname,
          avatar: user.avatar || user.image || user.imageb || '',
          xsec_token: user.xsec_token || '',
          url: this._buildXhsProfileUrl(userId, user.xsec_token),
          source: 'search_notes_api',
          score: this._scoreSearchUserCandidate({ nickname, user_id: userId }, keyword)
        };
      })
      .filter(Boolean);
  }

  async _extractSearchUserCandidatesFromPage(page, keyword) {
    try {
      const candidates = await page.evaluate((kw) => {
        const normalize = value => String(value || '').replace(/\s+/g, '').trim().toLowerCase();
        const expected = normalize(kw);
        const extractUserId = href => {
          const match = String(href || '').match(/\/user\/profile\/([A-Za-z0-9_-]+)/);
          return match ? match[1] : '';
        };
        const score = item => {
          const nickname = normalize(item.nickname);
          const text = normalize(item.text);
          if (nickname === expected) return 100;
          if (nickname && expected && nickname.includes(expected)) return 80;
          if (nickname && expected && expected.includes(nickname)) return 60;
          if (text && expected && text.includes(expected)) return 30;
          return 5;
        };

        return Array.from(document.querySelectorAll('a[href*="/user/profile/"]'))
          .map(link => {
            const href = link.href || link.getAttribute('href') || '';
            const userId = extractUserId(href);
            const text = (link.innerText || link.textContent || '').trim();
            const nickname = text.split('\n').map(s => s.trim()).find(Boolean) || '';
            const img = link.querySelector('img[src]') || link.closest('div')?.querySelector('img[src]');
            return {
              user_id: userId,
              nickname,
              text,
              avatar: img?.src || '',
              url: href,
              source: 'search_dom'
            };
          })
          .filter(item => item.user_id && item.nickname && item.nickname !== '我')
          .map(item => ({ ...item, score: score(item) }));
      }, keyword);

      return candidates;
    } catch (error) {
      this._log('search:dom_extract_failed', { message: error.message });
      return [];
    }
  }

  _scoreSearchUserCandidate(candidate, keyword) {
    const expected = this._normalizeSearchText(keyword);
    const nickname = this._normalizeSearchText(candidate?.nickname);
    const text = this._normalizeSearchText(candidate?.text);
    if (!expected || !nickname) return 0;
    if (nickname === expected) return 100;
    if (nickname.includes(expected)) return 80;
    if (expected.includes(nickname)) return 60;
    if (text.includes(expected)) return 30;
    return 5;
  }

  _pickBestSearchUserCandidate(candidates, keyword) {
    const seen = new Set();
    const unique = candidates
      .filter(item => item?.user_id && item?.nickname)
      .map(item => ({
        ...item,
        score: Number.isFinite(item.score) ? item.score : this._scoreSearchUserCandidate(item, keyword),
        url: item.url || this._buildXhsProfileUrl(item.user_id, item.xsec_token)
      }))
      .filter(item => {
        if (seen.has(item.user_id)) return false;
        seen.add(item.user_id);
        return true;
      });

    unique.sort((a, b) => b.score - a.score);
    const best = unique[0] || null;
    return best && best.score >= 60 ? best : null;
  }

  _buildXhsProfileUrl(userId, xsecToken = '') {
    const url = new URL(`https://www.xiaohongshu.com/user/profile/${userId}`);
    if (xsecToken) {
      url.searchParams.set('xsec_token', xsecToken);
      url.searchParams.set('xsec_source', 'pc_search');
    }
    return url.toString();
  }

  _buildProfileFromSearchCandidate(candidate, keyword) {
    return {
      unique_id: candidate.user_id || `xhs_${Date.now()}`,
      user_path: candidate.user_id || null,
      nickname: candidate.nickname || keyword,
      avatar: candidate.avatar || '',
      signature: '',
      follower_count: 0,
      following_count: 0,
      like_count: 0,
      verified: 0,
      search_keyword: keyword
    };
  }

  _extractUserId(url) {
    if (!url) return null;
    const match = url.match(/\/user\/profile\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  async _extractProfileFromPage(page) {
    const { interactions, stats, ...profile } = await page.evaluate(() => {
      const state = window.__INITIAL_STATE__;
      const unwrap = (value) => {
        if (!value) return value;
        if (value.value !== undefined) return value.value;
        if (value._value !== undefined) return value._value;
        return value;
      };
      const extractAvatarCandidate = (...sources) => {
        const avatarKeys = [
          'avatar', 'avatarUrl', 'avatar_url', 'headImgUrl', 'head_img_url', 'headimgurl',
          'head_url', 'headUrl', 'imageb', 'imageB', 'image', 'imageUrl', 'image_url',
          'imgUrl', 'img_url', 'portrait', 'profileAvatar', 'profile_avatar',
          'userAvatar', 'user_avatar', 'avatarThumb', 'avatar_thumb'
        ];
        const isValidAvatar = (value) => {
          if (typeof value !== 'string') return false;
          const raw = value.trim();
          return !!raw && !raw.startsWith('data:');
        };
        const walk = (value, depth = 0, seen = new Set()) => {
          if (!value || depth > 4) return '';
          if (typeof value === 'string') return isValidAvatar(value) ? value : '';
          if (typeof value !== 'object') return '';
          if (seen.has(value)) return '';
          seen.add(value);
          for (const key of avatarKeys) {
            const candidate = value[key];
            if (isValidAvatar(candidate)) return candidate;
            if (candidate && typeof candidate === 'object') {
              const nested = walk(candidate, depth + 1, seen);
              if (nested) return nested;
            }
          }
          const values = Array.isArray(value) ? value : Object.values(value);
          for (const nestedValue of values) {
            const nested = walk(nestedValue, depth + 1, seen);
            if (nested) return nested;
          }
          return '';
        };
        for (const source of sources) {
          const candidate = walk(source);
          if (candidate) return candidate;
        }
        return '';
      };
      const userPageData = unwrap(state?.user?.userPageData);
      const basic = userPageData?.basicInfo || userPageData?.userInfo || {};
      const interactions = Array.isArray(userPageData?.interactions) ? userPageData.interactions : [];
      const stats = userPageData?.stats || userPageData?.stat || userPageData?.interactInfo || basic;
      const normalizeImageUrl = (value) => {
        if (!value || typeof value !== 'string') return '';
        let raw = value.trim();
        const bgMatch = raw.match(/url\(["']?([^"')]+)["']?\)/i);
        if (bgMatch) raw = bgMatch[1];
        raw = raw.replace(/\\u002F/g, '/').replace(/&amp;/g, '&');
        if (raw.startsWith('//')) raw = `https:${raw}`;
        return raw;
      };
      const isLikelyAvatarUrl = (value) => {
        const raw = normalizeImageUrl(value);
        if (!raw || raw.startsWith('data:')) return false;
        const lower = raw.toLowerCase();
        return lower.includes('avatar') ||
          lower.includes('sns-avatar') ||
          lower.includes('head') ||
          lower.includes('portrait') ||
          lower.includes('user') ||
          lower.includes('xhscdn');
      };
      const readDomAvatar = () => {
        const selectors = [
          '[class*="avatar"] img',
          'img[class*="avatar"]',
          '[class*="user"] img',
          '[class*="profile"] img',
          'meta[property="og:image"]',
          'meta[name="og:image"]',
          'meta[name="twitter:image"]'
        ];
        for (const selector of selectors) {
          for (const el of Array.from(document.querySelectorAll(selector))) {
            const candidate = normalizeImageUrl(
              el.getAttribute('content') ||
              el.getAttribute('src') ||
              el.getAttribute('data-src') ||
              el.getAttribute('data-original') ||
              el.style?.backgroundImage ||
              ''
            );
            if (isLikelyAvatarUrl(candidate)) return candidate;
          }
        }
        return '';
      };
      return {
        unique_id: basic.userId || basic.user_id,
        nickname: basic.nickname || basic.nickName || document.title.replace(/-?\s*小红书.*/, '').trim(),
        avatar: extractAvatarCandidate(basic, userPageData, state) || readDomAvatar() || '',
        signature: basic.desc || basic.description || '',
        interactions,
        stats
      };
    }).catch(() => ({}));
    return { ...profile, ...parseProfileCounts(interactions, stats) };
  }

  _parseCount(value) {
    return parseCountValue(value);
  }

  _formatXhsTime(time) {
    if (!time) return null;
    if (typeof time === 'number') {
      if (time > 1e12) return this._formatLocalDateTime(new Date(time));
      if (time > 1e9) return this._formatLocalDateTime(new Date(time * 1000));
    }
    const raw = String(time).trim();
    if (/^\d{13}$/.test(raw)) return this._formatLocalDateTime(new Date(Number(raw)));
    if (/^\d{10}$/.test(raw)) return this._formatLocalDateTime(new Date(Number(raw) * 1000));

    const fullDate = raw.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
    if (fullDate) {
      const [, year, month, day] = fullDate;
      return this._formatLocalDateTime(new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0));
    }

    const monthDay = raw.match(/^(\d{1,2})[-/.月](\d{1,2})日?$/);
    if (monthDay) {
      const now = new Date();
      const [, month, day] = monthDay;
      return this._formatLocalDateTime(new Date(now.getFullYear(), Number(month) - 1, Number(day), 0, 0, 0));
    }

    const relative = raw.match(/(\d+)\s*(分钟前|小时前|天前|周前|月前|年前)/);
    if (relative) {
      const amount = Number(relative[1]);
      const date = new Date();
      const unit = relative[2];
      if (unit === '分钟前') date.setMinutes(date.getMinutes() - amount);
      if (unit === '小时前') date.setHours(date.getHours() - amount);
      if (unit === '天前') date.setDate(date.getDate() - amount);
      if (unit === '周前') date.setDate(date.getDate() - amount * 7);
      if (unit === '月前') date.setMonth(date.getMonth() - amount);
      if (unit === '年前') date.setFullYear(date.getFullYear() - amount);
      return this._formatLocalDateTime(date);
    }

    if (raw === '刚刚' || raw === '今天') return this._formatLocalDateTime(new Date());
    if (raw === '昨天') {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      return this._formatLocalDateTime(date);
    }
    if (raw === '前天') {
      const date = new Date();
      date.setDate(date.getDate() - 2);
      return this._formatLocalDateTime(date);
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : this._formatLocalDateTime(parsed);
  }

  _formatXhsNoteIdTime(noteId) {
    if (!/^[0-9a-fA-F]{8}/.test(String(noteId || ''))) return null;
    const seconds = parseInt(String(noteId).slice(0, 8), 16);
    if (!Number.isFinite(seconds) || seconds < 946656000) return null;
    return this._formatLocalDateTime(new Date(seconds * 1000));
  }

  _formatLocalDateTime(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join('-') + ' ' + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join(':');
  }

  _filterByTimeRange(notes, startDate, endDate) {
    if (!startDate && !endDate) return notes;

    return notes.filter((note) => {
      if (!note.published_at) return true;
      const publishedAt = new Date(note.published_at);
      if (Number.isNaN(publishedAt.getTime())) return true;
      if (startDate && publishedAt < new Date(startDate)) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (publishedAt > end) return false;
      }
      return true;
    });
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _jitter(base, spread) {
    return Math.max(0, Math.round(base + (Math.random() - 0.5) * spread));
  }
}

module.exports = XiaohongshuScraper;
