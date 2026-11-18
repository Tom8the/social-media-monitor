function finderUsername(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  const match = name.match(/^(v2_[a-z0-9_-]+)(?:@finder)?$/i);
  return match ? match[1] + '@finder' : '';
}

function bridgeError(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

function count(...values) {
  for (const value of values) {
    if (Number.isSafeInteger(value) && value >= 0) return value;
    if (typeof value !== 'string') continue;
    const raw = value.trim().replaceAll(',', '');
    if (/^\d{1,20}$/.test(raw)) return raw;
    const match = raw.match(/^(\d+(?:\.\d+)?)[ ]*([千万亿kw])\+?$/i);
    if (!match) continue;
    const units = { 千: 1000, 万: 10000, 亿: 100000000, k: 1000, w: 10000 };
    const amount = Math.round(Number(match[1]) * units[match[2].toLowerCase()]);
    if (Number.isSafeInteger(amount)) return amount;
  }
}

function publishedAt(...values) {
  for (const value of values) {
    if (!value) continue;
    const raw = String(value).trim();
    const date = /^\d{10,13}$/.test(raw)
      ? new Date(Number(raw) * (raw.length <= 10 ? 1000 : 1))
      : new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function profileFromContact(contact, data = {}) {
  const username = finderUsername(contact?.username);
  if (!username) return null;
  return {
    unique_id: username,
    sec_uid: username,
    nickname: contact.nickname || '',
    avatar: contact.headUrl || contact.head_url || '',
    signature: contact.signature || '',
    follower_count: count(data.fansCount, contact.fansCount),
    video_count: count(data.originalInfo?.originalCount, data.feedsCount),
    status: 'public',
    source: 'wx-channels-download'
  };
}

function postFromObject(object) {
  const id = String(object.id ?? object.objectId ?? '').trim();
  if (!/^\d+$/.test(id)) return null;
  const desc = object.objectDesc || {};
  const media = desc.media?.[0] || object.files?.[0] || {};
  const description = desc.description || object.description || '';
  return {
    video_id: id,
    content_type: Number(desc.mediaType) === 2 ? 'note' : 'video',
    title: object.shortTitle?.shortTitle || (typeof object.shortTitle === 'string' ? object.shortTitle : '') || description,
    description,
    cover_url: media.coverUrl || media.fullCoverUrl || media.thumbUrl || object.coverUrl,
    video_url: object.source_url || object.shareUrl || media.fullUrl || (media.url && media.url + (media.urlToken || '')),
    duration: count(media.videoPlayLen, object.duration),
    play_count: count(object.playCount, object.readCount, object.viewCount),
    like_count: count(object.likeCount, object.likedCount, object.likeCountFmt),
    comment_count: count(object.commentCount, object.commentCountFmt),
    share_count: count(object.forwardCount, object.shareCount, object.forwardCountFmt),
    collect_count: count(object.collectCount, object.favoriteCount, object.favCount),
    published_at: publishedAt(object.createtime, object.createTime, object.publishTime)
  };
}

function createBridge(baseUrl, { timeout = 25000 } = {}) {
  let endpoint;
  try {
    endpoint = new URL(baseUrl);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password ||
        endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
      throw new Error('Invalid API origin');
    }
  } catch {
    throw bridgeError('请将 VIDEOHAO_BRIDGE_URL 设置为下载器的 HTTP(S) 地址，例如 http://127.0.0.1:2022', 503);
  }

  async function request(path, query = {}) {
    const url = new URL('/api/channels/' + path, endpoint);
    url.search = new URLSearchParams(query).toString();
    let response;
    let body;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: 'error' });
      // Node 22+ exposes the original numeric token before JS precision is lost.
      body = JSON.parse(await response.text(), (_key, value, context) =>
        typeof value === 'number' && !Number.isSafeInteger(value) && /^-?\d+$/.test(context?.source || '')
          ? context.source : value
      );
    } catch (error) {
      if (error instanceof SyntaxError) throw bridgeError('下载器返回了无效的 JSON，请检查 API 地址');
      throw bridgeError('无法连接视频号下载器或请求超时，请检查下载器服务和视频号页面', 503);
    }
    if (!response.ok || body?.code !== 0) {
      throw bridgeError('视频号下载器请求失败，请检查微信视频号页面和下载器日志');
    }
    return body.data;
  }

  async function getStatus() {
    const data = await request('status');
    if (typeof data?.available !== 'boolean') throw bridgeError('下载器没有返回有效的视频号连接状态');
    return data.available;
  }

  async function requireAvailable() {
    if (!(await getStatus())) {
      throw bridgeError('视频号页面尚未连接下载器，请在已登录的微信中打开视频号页面', 503);
    }
  }

  async function upstreamData(path, query) {
    const result = await request(path, query);
    const data = result?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        Number(result.errCode ?? 0) !== 0 || Number(data.BaseResponse?.Ret ?? 0) !== 0) {
      throw bridgeError('微信没有返回可用的' + (path === 'contact/search' ? '账号搜索结果' : '作品列表'));
    }
    return data;
  }

  async function search(keyword, pageSize = 10) {
    await requireAvailable();
    const exact = finderUsername(keyword);
    if (exact) {
      const { profile } = await getPage(exact);
      if (!profile) throw bridgeError('微信未返回此 Finder ID 的账号资料', 404);
      return [profile];
    }
    const data = await upstreamData('contact/search', { keyword });
    if (data.infoList != null && !Array.isArray(data.infoList)) throw bridgeError('下载器返回了无效的账号列表');
    const matches = new Map();
    for (const item of data.infoList || []) {
      const profile = profileFromContact(item?.contact);
      if (profile) matches.set(profile.unique_id, profile);
    }
    return [...matches.values()].slice(0, pageSize);
  }

  async function getPage(username, cursor) {
    const data = await upstreamData('contact/feed/list', {
      username,
      ...(cursor ? { next_marker: cursor } : {})
    });
    if (data.object != null && !Array.isArray(data.object)) throw bridgeError('下载器返回了无效的作品列表');
    const profile = profileFromContact(data.contact, data);
    if (profile && profile.unique_id !== username) throw bridgeError('微信返回的账号与目标视频号不匹配');

    const objects = data.object || [];
    const posts = [];
    let matchingContact = profile;
    let ignored = 0;
    for (const object of objects) {
      const author = profileFromContact(object?.contact, data);
      if (!object || (author && author.unique_id !== username)) {
        ignored++;
        continue;
      }
      if (author) matchingContact ||= author;
      const post = postFromObject(object);
      if (post) posts.push(post);
      else ignored++;
    }
    if (objects.length && !posts.length) throw bridgeError('微信返回的作品无法与目标账号和作品 ID 核对');
    if (!matchingContact) throw bridgeError('微信作品列表缺少可核对的作者信息');

    const next = typeof data.lastBuffer === 'string' ? data.lastBuffer : '';
    const hasMore = data.continueFlag == null ? Boolean(next) : Number(data.continueFlag) > 0;
    if (hasMore && (!next || next === cursor)) throw bridgeError('视频号分页游标缺失或重复');
    return { profile: matchingContact, posts, ignored, next: hasMore ? next : '' };
  }

  async function fetchAccount(username, { maxPages, profileOnly = false }) {
    await requireAvailable();
    const posts = new Map();
    const cursors = new Set();
    let profile = null;
    let cursor = '';
    let pages = 0;
    let ignored = 0;
    do {
      const result = await getPage(username, cursor);
      pages++;
      profile ||= result.profile;
      ignored += result.ignored;
      for (const post of result.posts) {
        if (!posts.has(post.video_id)) posts.set(post.video_id, post);
      }
      cursor = result.next;
      if (cursor && cursors.has(cursor)) throw bridgeError('视频号分页游标循环，请稍后重试');
      if (cursor) cursors.add(cursor);
    } while (cursor && pages < maxPages && !profileOnly);
    return { profile, posts: [...posts.values()], pages, hasMore: Boolean(cursor), ignored };
  }

  return { getStatus, search, fetchAccount };
}

module.exports = { createBridge, finderUsername };
