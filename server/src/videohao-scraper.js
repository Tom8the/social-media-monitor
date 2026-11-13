const VideohaoScraper = require('./videohao-scraper.min.js');

if (VideohaoScraper && VideohaoScraper.prototype) {
  VideohaoScraper.prototype._matchesAccount = function () {
    return true;
  };

  const firstPresent = (...values) => values.find(value => value !== undefined && value !== null && value !== '');

  const textFrom = (...values) => {
    const read = (value, depth = 0) => {
      if (value === undefined || value === null || depth > 5) return '';
      if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
      if (Array.isArray(value)) {
        return value.map(item => read(item, depth + 1)).find(Boolean) || '';
      }
      if (typeof value !== 'object') return '';

      const preferredKeys = [
        'text', 'content', 'wording', 'title', 'shortTitle', 'description',
        'desc', 'value', 'name', 'label'
      ];
      for (const key of preferredKeys) {
        const text = read(value[key], depth + 1);
        if (text) return text;
      }
      for (const item of Object.values(value)) {
        const text = read(item, depth + 1);
        if (text) return text;
      }
      return '';
    };

    for (const value of values) {
      const text = read(value);
      if (text) return text;
    }
    return '';
  };

  const urlFrom = (...values) => {
    const read = (value, depth = 0) => {
      if (value === undefined || value === null || depth > 6) return '';
      if (typeof value === 'string') {
        const raw = value.trim();
        return /^https?:\/\//i.test(raw) || raw.startsWith('//') ? raw : '';
      }
      if (Array.isArray(value)) {
        return value.map(item => read(item, depth + 1)).find(Boolean) || '';
      }
      if (typeof value !== 'object') return '';

      const preferredKeys = [
        'coverUrl', 'cover_url', 'fullCoverUrl', 'full_cover_url',
        'thumbUrl', 'thumb_url', 'fullThumbUrl', 'full_thumb_url',
        'imageUrl', 'image_url', 'imgUrl', 'img_url', 'url'
      ];
      for (const key of preferredKeys) {
        const url = read(value[key], depth + 1);
        if (url) return url;
      }
      for (const [key, item] of Object.entries(value)) {
        if (/cover|thumb|image|img|media/i.test(key)) {
          const url = read(item, depth + 1);
          if (url) return url;
        }
      }
      return '';
    };

    for (const value of values) {
      const url = read(value);
      if (url) return url;
    }
    return '';
  };

  const parseCount = (value) => {
    if (typeof value === 'number') return Math.max(0, Math.round(value));
    if (!value) return 0;
    const raw = String(value).replace(/,/g, '').replace(/[+\s]/g, '').trim();
    const match = raw.match(/(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    const num = Number(match[1]);
    if (raw.includes('亿')) return Math.round(num * 100000000);
    if (raw.includes('万') || /w$/i.test(raw)) return Math.round(num * 10000);
    if (raw.includes('千') || /k$/i.test(raw)) return Math.round(num * 1000);
    return Math.round(num);
  };

  const pickMedia = (value) => {
    const desc = value && typeof value.objectDesc === 'object'
      ? value.objectDesc
      : (value && typeof value.desc === 'object' ? value.desc : {});
    const mediaList = [
      value?.media,
      value?.mediaList,
      value?.media_list,
      desc?.media,
      desc?.mediaList,
      desc?.media_list
    ];
    for (const item of mediaList) {
      if (Array.isArray(item) && item.find(Boolean)) return item.find(Boolean);
      if (item && typeof item === 'object') return item;
    }
    return {};
  };

  const pickShortTitle = (desc) => {
    const shortTitle = desc?.shortTitle || desc?.short_title;
    if (Array.isArray(shortTitle)) {
      return textFrom(...shortTitle);
    }
    return textFrom(shortTitle);
  };

  const parseVideohaoPostItem = function (value) {
    if (!value || typeof value !== 'object') return null;
    const desc = value.objectDesc && typeof value.objectDesc === 'object'
      ? value.objectDesc
      : (value.desc && typeof value.desc === 'object' ? value.desc : {});
    const media = pickMedia(value);
    const videoId = firstPresent(
      value.objectId,
      value.object_id,
      value.feedId,
      value.feed_id,
      value.finderFeedId,
      value.exportId,
      value.export_id,
      value.id,
      value.objectNonceId,
      value.objectNonce
    );
    if (!videoId) return null;

    const description = textFrom(
      desc.description,
      value.description,
      value.desc,
      value.content,
      value.wording
    );
    const title = textFrom(
      value.title,
      value.shortTitle,
      pickShortTitle(desc),
      desc.title,
      desc.wording,
      description.split(/\r?\n/)[0],
      description
    );
    const coverUrl = urlFrom(
      value.coverUrl,
      value.cover_url,
      value.thumbUrl,
      value.thumb_url,
      media.coverUrl,
      media.cover_url,
      media.fullCoverUrl,
      media.full_cover_url,
      media.thumbUrl,
      media.thumb_url,
      media.fullThumbUrl,
      media.full_thumb_url,
      media.url,
      desc,
      value
    );
    const videoUrl = urlFrom(
      value.videoUrl,
      value.video_url,
      value.detailUrl,
      value.jumpUrl,
      media.fullUrl,
      media.full_url,
      media.url
    );

    return {
      video_id: String(videoId).trim(),
      content_type: 'video',
      title,
      description: description || title,
      cover_url: coverUrl,
      video_url: videoUrl,
      duration: parseCount(firstPresent(value.duration, value.videoPlayLen, media.videoPlayLen, media.duration)),
      play_count: parseCount(firstPresent(value.playCount, value.play_count, value.readCount, value.read_count, value.viewCount, value.view_count)),
      like_count: parseCount(firstPresent(value.likeCount, value.like_count, value.likedCount)),
      comment_count: parseCount(firstPresent(value.commentCount, value.comment_count, value.comments)),
      share_count: parseCount(firstPresent(value.shareCount, value.share_count, value.forwardAggregationCount, value.forwardCount, value.forward_count)),
      collect_count: parseCount(firstPresent(value.collectCount, value.collect_count, value.favoriteCount, value.favCount)),
      published_at: firstPresent(value.publishTime, value.publish_time, value.createTime, value.create_time, value.createtime, value.timestamp, value.postTime),
      topic_tags: description ? Array.from(new Set(Array.from(description.matchAll(/#([^\s#]+)/g)).map(match => match[1].trim()).filter(Boolean))).join(',') : ''
    };
  };

  VideohaoScraper.prototype._parsePostListItem = parseVideohaoPostItem;

  VideohaoScraper.prototype._extractPostsFromJson = function (data) {
    const posts = [];
    const directLists = [
      data?.data?.list,
      data?.list,
      data?.data?.postList,
      data?.postList,
      data?.data?.feeds,
      data?.feeds,
      data?.data?.cardObjects,
      data?.cardObjects
    ].filter(Array.isArray);

    for (const list of directLists) {
      for (const item of list) {
        const parsed = parseVideohaoPostItem.call(this, item);
        if (parsed) posts.push(parsed);
      }
    }

    if (typeof this._walk === 'function') {
      this._walk(data, (value) => {
        if (!value || typeof value !== 'object') return;
        const parsed = parseVideohaoPostItem.call(this, value);
        if (!parsed) return;
        const hasMetadata = parsed.title || parsed.description || parsed.cover_url || parsed.published_at ||
          parsed.like_count || parsed.play_count || parsed.comment_count;
        if (hasMetadata) posts.push(parsed);
      }, 6000);
    }

    const map = new Map();
    for (const post of posts) {
      if (!post.video_id) continue;
      const existing = map.get(post.video_id);
      if (!existing) {
        map.set(post.video_id, post);
        continue;
      }
      map.set(post.video_id, {
        ...existing,
        ...post,
        title: post.title || existing.title,
        description: post.description || existing.description,
        cover_url: post.cover_url || existing.cover_url,
        video_url: post.video_url || existing.video_url,
        published_at: post.published_at || existing.published_at
      });
    }
    return Array.from(map.values());
  };

  VideohaoScraper.prototype.fetchProfileAndPosts = async function (accountIdentifier, authState = null, maxPosts = 50, startDate = null, endDate = null, options = {}) {
    const accountKey = accountIdentifier || 'current';
    if (this.activeFetches.has(accountKey)) {
      return { success: false, busy: true, error: '该视频号账号正在采集中，请稍后再试' };
    }

    this.activeFetches.add(accountKey);
    let page = null;
    try {
      await this.init();
      page = await this.browser.newPage();
      await page.setViewport({ width: 1366, height: 900 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36');

      const normalizedAuth = this._normalizeAuthState(authState);
      await this._applyAuthState(page, normalizedAuth);

      const capturedPosts = [];
      let capturedProfile = null;
      page.on('response', async (response) => {
        try {
          const url = response.url();
          const contentType = response.headers()['content-type'] || '';
          if (!url.includes('channels.weixin.qq.com') || !contentType.includes('application/json')) return;
          const data = await response.json();
          const profile = this._extractProfileFromJson(data);
          if (profile && (profile.unique_id || profile.nickname)) {
            capturedProfile = { ...(capturedProfile || {}), ...profile };
          }
          const posts = this._extractPostsFromJson(data);
      if (posts.length) capturedPosts.push(...posts);
          if (posts.length && posts.some(post => !post.title || !post.cover_url)) {
            console.log('[VH-Auth] parsed posts with missing fields:', posts.slice(0, 3).map(post => ({
              id: post.video_id,
              title: post.title,
              hasCover: !!post.cover_url
            })));
          }
        } catch (error) {}
      });

      const targetUrl = options && options.targetUrl ? String(options.targetUrl).trim() : '';
      const entryUrl = targetUrl || 'https://channels.weixin.qq.com/platform/post/list';
      await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await this._wait(3500);

      if (await this._isLoginRequired(page)) {
        await page.close().catch(() => {});
        return { success: false, cookieExpired: true, error: '视频号 Cookie 已失效，请重新扫码登录' };
      }

      if (!targetUrl && !page.url().includes('/platform/post/list')) {
        await page.goto('https://channels.weixin.qq.com/platform/post/list', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await this._wait(3500);
      }

      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight)).catch(() => {});
        await this._wait(1500);
        if (capturedPosts.length >= maxPosts) break;
      }

      let posts = this._dedupePosts(capturedPosts)
        .map(post => this._normalizePost(post))
        .filter(post => post && post.video_id);

      if (posts.length === 0) {
        const domPosts = await page.evaluate(() => {
          const items = Array.from(document.querySelectorAll('[class*=post], [class*=feed], [class*=card], [class*=video]'));
          return items.map((el) => {
            const link = el.querySelector('a[href*="post"], a[href*="finder"], a[href*="export"]');
            const href = link?.href || '';
            const img = el.querySelector('img');
            const title = (el.querySelector('[class*=title], [class*=desc], h3, h4')?.textContent || '').trim();
            const text = (el.textContent || '').trim();
            const idMatch = href.match(/(?:id|feedId|objectId|export_id)=([^&]+)/i) || href.match(/export\/[^/?#]+/i);
            return {
              video_id: idMatch ? decodeURIComponent(idMatch[1] || idMatch[0]) : '',
              title: title || text.split(/\r?\n/)[0] || '',
              description: text,
              cover_url: img?.src || img?.getAttribute('src') || '',
              video_url: href
            };
          }).filter(item => item.video_id || item.title || item.cover_url);
        }).catch(() => []);
        posts = this._dedupePosts(domPosts)
          .map(post => this._normalizePost(post))
          .filter(post => post && post.video_id);
      }

      posts = posts
        .filter(post => typeof this._inTimeRange === 'function' ? this._inTimeRange(post.published_at, startDate, endDate) : true)
        .slice(0, maxPosts);

      await page.close().catch(() => {});
      return {
        success: true,
        data: {
          profile: capturedProfile,
          posts,
          coverage: {
            collected: posts.length,
            deletionSafe: false,
            source: capturedPosts.length > 0 ? 'network' : 'dom'
          }
        }
      };
    } catch (error) {
      if (page) await page.close().catch(() => {});
      return { success: false, error: error.message };
    } finally {
      this.activeFetches.delete(accountKey);
    }
  };
}

module.exports = VideohaoScraper;
