const { createPool } = require('./postgres-config');
const { v4: uuidv4 } = require('uuid');

const pool = createPool();
pool.on('error', error => console.error('PostgreSQL idle connection error:', error.message));

async function initDatabase() {
  await checkDatabase();
  await pool.query('SELECT a.cookie_data, v.content_type, v.is_deleted, c.is_valid FROM accounts a, videos v, global_cookies c LIMIT 0');
}

async function checkDatabase() {
  await pool.query('SELECT 1');
}

function closeDatabase() {
  return pool.end();
}

async function withTransaction(operation) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    const result = await operation(connection);
    await connection.query('COMMIT');
    return result;
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

const videoSortColumns = new Set([
  'id', 'account_id', 'platform_code', 'video_id', 'title', 'duration', 'content_type',
  'play_count', 'like_count', 'comment_count', 'share_count', 'collect_count', 'published_at',
  'fetched_at', 'created_at', 'updated_at', 'is_deleted', 'description', 'cover_url', 'video_url', 'topic_tags'
]);
const videoTimeRanges = new Map([['week', 7], ['7', 7], ['14', 14], ['month', 30], ['30', 30]]);

function buildVideoFilter(filters) {
  const params = [];
  let where = 'WHERE TRUE';
  if (filters.accountId) {
    where += ' AND v.account_id = $' + params.push(filters.accountId);
  }
  if (filters.platform) {
    where += ' AND v.platform_code = $' + params.push(filters.platform);
  }
  if (!filters.includeMediaOnly) {
    where += " AND COALESCE(v.content_type, 'video') <> 'video_media'";
  }
  if (filters.startDate && filters.endDate) {
    where += ' AND v.published_at >= $' + params.push(filters.startDate) + '::date';
    where += ' AND v.published_at < ($' + params.push(filters.endDate) + '::date + 1)';
  } else if (filters.timeRange === 'today') {
    where += ' AND v.published_at >= CURRENT_DATE';
  } else {
    if (videoTimeRanges.has(filters.timeRange)) {
      where += ' AND v.published_at >= NOW() - $' + params.push(videoTimeRanges.get(filters.timeRange)) + " * INTERVAL '1 day'";
    }
  }
  if (filters.keyword) {
    const keyword = '$' + params.push('%' + filters.keyword + '%');
    where += ' AND (v.title ILIKE ' + keyword + ' OR a.nickname ILIKE ' + keyword + ')';
  }
  return { where, params };
}

const database = {
  async getAllAccounts(filters = {}) {
    let sql = 'SELECT a.*, p.name AS platform_name, p.color AS platform_color FROM accounts a LEFT JOIN platforms p ON a.platform_code = p.code WHERE TRUE';
    const params = [];
    if (filters.platform) sql += ' AND a.platform_code = $' + params.push(filters.platform);
    if (filters.status) sql += ' AND a.status = $' + params.push(filters.status);
    if (filters.groupId) sql += ' AND a.group_id = $' + params.push(filters.groupId);
    const { rows } = await pool.query(sql + ' ORDER BY a.created_at DESC', params);
    return rows;
  },

  async createAccount(account) {
    const id = uuidv4();
    await pool.query(
      'INSERT INTO accounts (id, platform_code, unique_id, sec_uid, nickname, avatar, signature, follower_count, following_count, like_count, video_count, verified, status, remark, cookie_data, group_id, last_fetch_at) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())',
      [id, account.platform || 'douyin', account.unique_id || '', account.sec_uid || null, account.nickname || '',
        account.avatar || '', account.signature || '', account.follower_count || 0, account.following_count || 0,
        account.like_count || 0, account.video_count || 0, Number(account.verified || 0), account.status || 'active',
        account.remark || null, account.cookie_data || null, account.group_id || null]
    );
    return { id, ...account };
  },

  async updateAccount(id, updates, connection = pool) {
    const fields = ['avatar', 'nickname', 'unique_id', 'sec_uid', 'follower_count', 'following_count',
      'like_count', 'video_count', 'signature', 'cookie_data', 'status', 'last_fetch_at'];
    const params = [];
    const assignments = [];
    for (const field of fields) {
      if (updates[field] !== undefined) assignments.push(field + ' = $' + params.push(updates[field]));
    }
    if (!assignments.length) return null;
    const { rows } = await connection.query(
      'UPDATE accounts SET ' + assignments.join(', ') + ', updated_at = NOW() WHERE id = $' + params.push(id) + ' RETURNING *',
      params
    );
    return rows[0] || null;
  },

  async deleteAccount(id) {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const counts = { accounts: 0, videos: 0, sync_logs: 0, alerts: 0, daily_stats: 0 };
      const account = await connection.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [id]);
      if (account.rowCount) {
        for (const table of ['videos', 'sync_logs', 'alerts', 'daily_stats']) {
          const result = await connection.query('DELETE FROM ' + table + ' WHERE account_id = $1', [id]);
          counts[table] = result.rowCount;
        }
        const result = await connection.query('DELETE FROM accounts WHERE id = $1', [id]);
        counts.accounts = result.rowCount;
      }
      await connection.query('COMMIT');
      return { deleted: counts.accounts > 0, counts };
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  },

  async getVideos(filters = {}) {
    const { where, params } = buildVideoFilter(filters);
    const sortBy = videoSortColumns.has(filters.sortBy) ? filters.sortBy : 'published_at';
    const sortOrder = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const page = Number.parseInt(filters.page, 10) || 1;
    const pageSize = Number.parseInt(filters.pageSize, 10) || 20;
    const sql = 'SELECT v.*, a.nickname AS account_nickname, a.avatar AS account_avatar, a.status AS account_status, ' +
      'p.name AS platform_name, p.color AS platform_color FROM videos v LEFT JOIN accounts a ON v.account_id = a.id ' +
      'LEFT JOIN platforms p ON v.platform_code = p.code ' + where + ' ORDER BY v.' + sortBy + ' ' + sortOrder +
      ' NULLS LAST LIMIT $' + params.push(pageSize) + ' OFFSET $' + params.push((page - 1) * pageSize);
    const { rows } = await pool.query(sql, params);
    return rows;
  },

  async getVideosCount(filters = {}) {
    const { where, params } = buildVideoFilter(filters);
    const { rows } = await pool.query(
      'SELECT COUNT(*)::integer AS total FROM videos v LEFT JOIN accounts a ON v.account_id = a.id ' + where, params
    );
    return rows[0].total;
  },

  async upsertVideo(video, { requireSameAccount = false, connection = pool } = {}) {
    const accountId = video.account_id || video.accountId;
    if (!accountId) throw new Error('视频缺少 account_id，已拒绝入库');
    const publishedAt = Object.hasOwn(video, 'published_at') ? video.published_at :
      (Object.hasOwn(video, 'publishedAt') ? video.publishedAt : new Date());
    const sql = [
      'WITH owner AS (SELECT id FROM accounts WHERE id = $2 FOR KEY SHARE)',
      'INSERT INTO videos (id, account_id, platform_code, video_id, content_type, title, description, cover_url, video_url,',
      'duration, topic_tags, play_count, like_count, comment_count, share_count, collect_count, published_at, is_deleted)',
      'SELECT $1, owner.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18 FROM owner',
      'ON CONFLICT (platform_code, video_id) DO UPDATE SET account_id = EXCLUDED.account_id,',
      'content_type = EXCLUDED.content_type, title = EXCLUDED.title, description = EXCLUDED.description,',
      'cover_url = EXCLUDED.cover_url, video_url = EXCLUDED.video_url, duration = EXCLUDED.duration, topic_tags = EXCLUDED.topic_tags,',
      'play_count = EXCLUDED.play_count, like_count = EXCLUDED.like_count, comment_count = EXCLUDED.comment_count,',
      'share_count = EXCLUDED.share_count, collect_count = EXCLUDED.collect_count, published_at = EXCLUDED.published_at,',
      'fetched_at = NOW(), is_deleted = EXCLUDED.is_deleted, updated_at = NOW()',
      requireSameAccount ? 'WHERE videos.account_id = EXCLUDED.account_id' : '',
      'RETURNING id'
    ].join(' ');
    const { rows } = await connection.query(sql, [
      uuidv4(), accountId, video.platform || video.platform_code || 'douyin', video.video_id || video.videoId || '',
      video.content_type || video.contentType || 'video', video.title || '', video.description || '',
      video.cover_url || video.coverUrl || '', video.video_url || video.videoUrl || '', video.duration || 0,
      video.topic_tags || '', video.play_count || video.playCount || 0, video.like_count || video.likeCount || 0,
      video.comment_count || video.commentCount || 0, video.share_count || video.shareCount || 0,
      video.collect_count || video.collectCount || 0, publishedAt, Number(video.is_deleted ?? 0)
    ]);
    if (!rows.length) {
      throw new Error(requireSameAccount ? '作品已归属其他账号或目标账号不存在：' + (video.video_id || video.videoId) :
        '视频所属账号不存在，已拒绝入库: ' + accountId);
    }
    return { ...video, id: rows[0].id };
  },

  async getStatistics() {
    const { rows } = await pool.query(
      "SELECT COUNT(*) AS total_videos, COALESCE(SUM(play_count), 0) AS total_plays, " +
      "COALESCE(SUM(like_count), 0) AS total_likes, COALESCE(SUM(comment_count), 0) AS total_comments, " +
      "COALESCE(SUM(share_count), 0) AS total_shares, COALESCE(SUM(collect_count), 0) AS total_collects " +
      "FROM videos WHERE COALESCE(content_type, 'video') <> 'video_media'"
    );
    return rows[0];
  },

  async getPlatformDistribution() {
    const { rows } = await pool.query(
      "SELECT p.code AS platform, COUNT(v.id)::integer AS video_count, COALESCE(SUM(v.play_count), 0)::double precision AS total_plays " +
      "FROM platforms p LEFT JOIN videos v ON v.platform_code = p.code AND COALESCE(v.content_type, 'video') <> 'video_media' " +
      "WHERE p.enabled = 1 GROUP BY p.id ORDER BY p.sort_order"
    );
    return rows;
  },

  async getTrendData(days = 7) {
    const { rows } = await pool.query(
      "SELECT (published_at::date)::text AS date, COALESCE(SUM(play_count), 0) AS plays, " +
      "COALESCE(SUM(like_count), 0) AS likes, COALESCE(SUM(comment_count), 0) AS comments " +
      "FROM videos WHERE published_at >= CURRENT_DATE - $1::integer AND COALESCE(content_type, 'video') <> 'video_media' " +
      "GROUP BY published_at::date ORDER BY published_at::date",
      [days]
    );
    return rows;
  },

  async getVideoById(videoId, platformCode, connection = pool) {
    const { rows } = await connection.query('SELECT * FROM videos WHERE video_id = $1 AND platform_code = $2', [videoId, platformCode]);
    return rows[0] || null;
  },

  async getVideosByAccount(accountId) {
    const { rows } = await pool.query('SELECT * FROM videos WHERE account_id = $1', [accountId]);
    return rows;
  },

  async markVideoDeleted(videoId, platformCode) {
    await pool.query('UPDATE videos SET is_deleted = 1, updated_at = NOW() WHERE video_id = $1 AND platform_code = $2', [videoId, platformCode]);
  },

  async getGlobalCookies(ids) {
    const { rows } = await pool.query('SELECT * FROM global_cookies WHERE id = ANY($1::int[])', [ids]);
    return rows;
  },

  async saveGlobalCookie(id, platform, cookieData) {
    await pool.query(
      'INSERT INTO global_cookies (id, platform, cookie_data, is_valid) VALUES ($1, $2, $3, TRUE) ' +
      'ON CONFLICT (id) DO UPDATE SET platform = EXCLUDED.platform, cookie_data = EXCLUDED.cookie_data, is_valid = TRUE, updated_at = NOW()',
      [id, platform, cookieData]
    );
  },

  async invalidateGlobalCookie(id) {
    await pool.query('UPDATE global_cookies SET is_valid = FALSE WHERE id = $1 AND is_valid IS DISTINCT FROM FALSE', [id]);
  },

  async deleteGlobalCookie(id) {
    await pool.query('DELETE FROM global_cookies WHERE id = $1', [id]);
  },

  async deleteVideosByExternalId(videoId) {
    const result = await pool.query('DELETE FROM videos WHERE video_id = $1', [videoId]);
    return result.rowCount;
  }
};

module.exports = { database, initDatabase, checkDatabase, closeDatabase, withTransaction };
