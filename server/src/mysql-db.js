// MySQL 数据库适配器
// 将内存数据库替换为 MySQL 持久化存储
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

function getEnvInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// MySQL 连接配置
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: getEnvInt('DB_PORT', 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'social_media_monitor',
  waitForConnections: true,
  connectionLimit: getEnvInt('DB_POOL_LIMIT', 10),
  queueLimit: 0,
  namedPlaceholders: true,
  // Windows Named Pipe
  socketPath: process.env.DB_SOCKET_PATH || undefined
};

let pool = null;

// 初始化数据库连接池
async function initDatabase() {
  try {
    const attempts = [
      {
        label: process.env.DB_PASSWORD ? 'environment password' : 'configured settings',
        config: { ...dbConfig }
      }
    ];

    if (dbConfig.password !== '') {
      attempts.push({
        label: 'empty password fallback',
        config: { ...dbConfig, password: '' }
      });
    }

    if (dbConfig.password !== 'root123456') {
      attempts.push({
        label: 'legacy local password fallback',
        config: { ...dbConfig, password: 'root123456' }
      });
    }

    for (const attempt of attempts) {
      try {
        pool = mysql.createPool(attempt.config);
        const connection = await pool.getConnection();
        console.log(`MySQL connected successfully (${attempt.label})`);
        connection.release();
        return;
      } catch (error) {
        console.log(`MySQL connection attempt failed (${attempt.label}): ${error.message}`);
        if (pool) {
          await pool.end().catch(() => {});
          pool = null;
        }
      }
    }

    throw new Error('All MySQL connection attempts failed');
  } catch (error) {
    console.error('MySQL connection failed:', error.message);
    console.log('Falling back to in-memory database...');
    pool = null;
  }
}

// 获取连接池
function getPool() {
  return pool;
}

// 检查是否有 MySQL 连接
function isConnected() {
  return pool !== null;
}

// 数据库操作封装
const database = {
  // 查询所有账号
  getAllAccounts: async (filters = {}) => {
    if (!pool) return getInMemoryAccounts(filters);

    let sql = `SELECT a.*, p.name as platform_name, p.color as platform_color
               FROM accounts a
               LEFT JOIN platforms p ON a.platform_code = p.code
               WHERE 1=1`;
    const params = [];

    if (filters.platform) {
      sql += ' AND a.platform_code = ?';
      params.push(filters.platform);
    }
    if (filters.status) {
      sql += ' AND a.status = ?';
      params.push(filters.status);
    }
    if (filters.groupId) {
      sql += ' AND a.group_id = ?';
      params.push(filters.groupId);
    }

    sql += ' ORDER BY a.created_at DESC';

    const [rows] = await pool.query(sql, params);
    return rows;
  },

  // 创建账号
  createAccount: async (account) => {
    if (!pool) return createInMemoryAccount(account);

    const id = uuidv4();
    const sql = `INSERT INTO accounts (id, platform_code, unique_id, sec_uid, nickname, avatar,
                 signature, follower_count, following_count, like_count, video_count, verified,
                 status, remark, cookie_data, group_id, last_fetch_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`;

    const params = [
      id,
      account.platform || 'douyin',
      account.unique_id || '',
      account.sec_uid || null,
      account.nickname || '',
      account.avatar || '',
      account.signature || '',
      account.follower_count || 0,
      account.following_count || 0,
      account.like_count || 0,
      account.video_count || 0,
      account.verified || 0,
      account.status || 'active',
      account.remark || null,
      account.cookie_data || null,
      account.group_id || null
    ];

    await pool.query(sql, params);
    return { id, ...account };
  },

  // 更新账号
  updateAccount: async (id, updates) => {
    if (!pool) return updateInMemoryAccount(id, updates);

    const fields = [];
    const params = [];
    
    if (updates.avatar !== undefined) {
      fields.push('avatar = ?');
      params.push(updates.avatar);
    }
    if (updates.nickname !== undefined) {
      fields.push('nickname = ?');
      params.push(updates.nickname);
    }
    if (updates.unique_id !== undefined) {
      fields.push('unique_id = ?');
      params.push(updates.unique_id);
    }
    if (updates.sec_uid !== undefined) {
      fields.push('sec_uid = ?');
      params.push(updates.sec_uid);
    }
    if (updates.follower_count !== undefined) {
      fields.push('follower_count = ?');
      params.push(updates.follower_count);
    }
    if (updates.following_count !== undefined) {
      fields.push('following_count = ?');
      params.push(updates.following_count);
    }
    if (updates.like_count !== undefined) {
      fields.push('like_count = ?');
      params.push(updates.like_count);
    }
    if (updates.signature !== undefined) {
      fields.push('signature = ?');
      params.push(updates.signature);
    }
    if (updates.cookie_data !== undefined) {
      fields.push('cookie_data = ?');
      params.push(updates.cookie_data);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    if (updates.last_fetch_at !== undefined) {
      fields.push('last_fetch_at = ?');
      params.push(updates.last_fetch_at);
    }
    
    if (fields.length === 0) return null;
    
    fields.push('updated_at = NOW()');
    params.push(id);
    
    const sql = `UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(sql, params);
    
    if (result.affectedRows > 0) {
      const [rows] = await pool.query('SELECT * FROM accounts WHERE id = ?', [id]);
      return rows[0];
    }
    return null;
  },

  // 删除账号
  deleteAccount: async (id) => {
    if (!pool) return deleteInMemoryAccount(id);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [accountRows] = await connection.query(
        'SELECT id FROM accounts WHERE id = ? LIMIT 1',
        [id]
      );
      if (!accountRows[0]) {
        await connection.rollback();
        return {
          deleted: false,
          counts: { accounts: 0, videos: 0, sync_logs: 0, alerts: 0, daily_stats: 0 }
        };
      }

      const [videoResult] = await connection.query('DELETE FROM videos WHERE account_id = ?', [id]);
      const [syncLogResult] = await connection.query('DELETE FROM sync_logs WHERE account_id = ?', [id]);
      const [alertResult] = await connection.query('DELETE FROM alerts WHERE account_id = ?', [id]);
      const [dailyStatsResult] = await connection.query('DELETE FROM daily_stats WHERE account_id = ?', [id]);
      const [accountResult] = await connection.query('DELETE FROM accounts WHERE id = ?', [id]);

      await connection.commit();
      return {
        deleted: accountResult.affectedRows > 0,
        counts: {
          accounts: accountResult.affectedRows || 0,
          videos: videoResult.affectedRows || 0,
          sync_logs: syncLogResult.affectedRows || 0,
          alerts: alertResult.affectedRows || 0,
          daily_stats: dailyStatsResult.affectedRows || 0
        }
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // 查询视频列表
  getVideos: async (filters = {}) => {
    if (!pool) return getInMemoryVideos(filters);

    let sql = `SELECT v.*, a.nickname as account_nickname, a.avatar as account_avatar,
               a.status as account_status,
               p.name as platform_name, p.color as platform_color
               FROM videos v
               LEFT JOIN accounts a ON v.account_id = a.id
               LEFT JOIN platforms p ON v.platform_code = p.code
               WHERE 1=1`;
    const params = [];

    if (filters.accountId) {
      sql += ' AND v.account_id = ?';
      params.push(filters.accountId);
    }
    if (filters.platform) {
      sql += ' AND v.platform_code = ?';
      params.push(filters.platform);
    }
    if (!filters.includeMediaOnly) {
      sql += " AND COALESCE(v.content_type, 'video') <> 'video_media'";
    }
    // 自定义日期范围优先于 timeRange
    if (filters.startDate && filters.endDate) {
      sql += ' AND v.published_at >= ? AND v.published_at <= ?';
      params.push(filters.startDate, filters.endDate + ' 23:59:59');
    } else if (filters.timeRange) {
      const now = new Date();
      let startDate;
      switch (filters.timeRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
        case '7':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case '14':
          startDate = new Date(now.setDate(now.getDate() - 14));
          break;
        case 'month':
        case '30':
          startDate = new Date(now.setDate(now.getDate() - 30));
          break;
      }
      if (startDate) {
        sql += ' AND v.published_at >= ?';
        params.push(startDate);
      }
    }
    if (filters.keyword) {
      sql += ' AND (v.title LIKE ? OR a.nickname LIKE ?)';
      const kw = `%${filters.keyword}%`;
      params.push(kw, kw);
    }

    // 排序（published_at 为 NULL 时排到最后）
    const sortBy = filters.sortBy || 'published_at';
    const sortOrder = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    if (sortBy === 'published_at') {
      sql += ` ORDER BY v.published_at IS NULL, v.published_at ${sortOrder}`;
    } else {
      sql += ` ORDER BY v.${sortBy} ${sortOrder}`;
    }

    // 分页
    const page = parseInt(filters.page) || 1;
    const pageSize = parseInt(filters.pageSize) || 20;
    sql += ' LIMIT ? OFFSET ?';
    params.push(pageSize, (page - 1) * pageSize);

    const [rows] = await pool.query(sql, params);
    return rows;
  },

  // 获取视频总数
  getVideosCount: async (filters = {}) => {
    if (!pool) return getInMemoryVideosCount(filters);

    let sql = `SELECT COUNT(*) as total FROM videos v
               LEFT JOIN accounts a ON v.account_id = a.id
               WHERE 1=1`;
    const params = [];

    if (filters.accountId) {
      sql += ' AND v.account_id = ?';
      params.push(filters.accountId);
    }
    if (filters.platform) {
      sql += ' AND v.platform_code = ?';
      params.push(filters.platform);
    }
    if (!filters.includeMediaOnly) {
      sql += " AND COALESCE(v.content_type, 'video') <> 'video_media'";
    }
    // 自定义日期范围优先于 timeRange
    if (filters.startDate && filters.endDate) {
      sql += ' AND v.published_at >= ? AND v.published_at <= ?';
      params.push(filters.startDate, filters.endDate + ' 23:59:59');
    } else if (filters.timeRange) {
      const now = new Date();
      let startDate;
      switch (filters.timeRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
        case '7':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case '14':
          startDate = new Date(now.setDate(now.getDate() - 14));
          break;
        case 'month':
        case '30':
          startDate = new Date(now.setDate(now.getDate() - 30));
          break;
      }
      if (startDate) {
        sql += ' AND v.published_at >= ?';
        params.push(startDate);
      }
    }
    if (filters.keyword) {
      sql += ' AND (v.title LIKE ? OR a.nickname LIKE ?)';
      const kw = `%${filters.keyword}%`;
      params.push(kw, kw);
    }

    const [rows] = await pool.query(sql, params);
    return rows[0].total;
  },

  // 创建或更新视频（UPSERT）
  upsertVideo: async (video) => {
    if (!pool) return createInMemoryVideo(video);

    const id = uuidv4();
    const accountId = video.account_id || video.accountId;
    if (!accountId) {
      throw new Error('视频缺少 account_id，已拒绝入库');
    }

    const [accountRows] = await pool.query('SELECT id FROM accounts WHERE id = ? LIMIT 1', [accountId]);
    if (!accountRows[0]) {
      throw new Error(`视频所属账号不存在，已拒绝入库: ${accountId}`);
    }

    const hasPublishedAt = Object.prototype.hasOwnProperty.call(video, 'published_at');
    const hasPublishedAtCamel = Object.prototype.hasOwnProperty.call(video, 'publishedAt');
    const publishedAt = hasPublishedAt
      ? video.published_at
      : (hasPublishedAtCamel ? video.publishedAt : new Date());
    const sql = `INSERT INTO videos (id, account_id, platform_code, video_id, content_type, title, description,
                 cover_url, video_url, duration, topic_tags, play_count, like_count, comment_count,
                 share_count, collect_count, published_at, fetched_at, is_deleted, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE
                   account_id = VALUES(account_id),
                   content_type = VALUES(content_type),
                   title = VALUES(title),
                   description = VALUES(description),
                   cover_url = VALUES(cover_url),
                   video_url = VALUES(video_url),
                   duration = VALUES(duration),
                   topic_tags = VALUES(topic_tags),
                   play_count = VALUES(play_count),
                   like_count = VALUES(like_count),
                   comment_count = VALUES(comment_count),
                   share_count = VALUES(share_count),
                   collect_count = VALUES(collect_count),
                   published_at = VALUES(published_at),
                   fetched_at = NOW(),
                   is_deleted = VALUES(is_deleted),
                   updated_at = NOW()`;

    const params = [
      id,
      accountId,
      video.platform || video.platform_code || 'douyin',
      video.video_id || video.videoId || '',
      video.content_type || video.contentType || 'video',
      video.title || '',
      video.description || '',
      video.cover_url || video.coverUrl || '',
      video.video_url || video.videoUrl || '',
      video.duration || 0,
      video.topic_tags || '',
      video.play_count || video.playCount || 0,
      video.like_count || video.likeCount || 0,
      video.comment_count || video.commentCount || 0,
      video.share_count || video.shareCount || 0,
      video.collect_count || video.collectCount || 0,
      publishedAt,
      video.is_deleted !== undefined ? video.is_deleted : 0
    ];

    await pool.query(sql, params);
    return { id, ...video };
  },

  // 获取统计数据
  getStatistics: async () => {
    if (!pool) return getInMemoryStatistics();

    const sql = `SELECT
      COUNT(DISTINCT v.id) as total_videos,
      COALESCE(SUM(v.play_count), 0) as total_plays,
      COALESCE(SUM(v.like_count), 0) as total_likes,
      COALESCE(SUM(v.comment_count), 0) as total_comments,
      COALESCE(SUM(v.share_count), 0) as total_shares,
      COALESCE(SUM(v.collect_count), 0) as total_collects
      FROM videos v
      WHERE COALESCE(v.content_type, 'video') <> 'video_media'`;

    const [rows] = await pool.query(sql);
    return rows[0] || {
      total_videos: 0,
      total_plays: 0,
      total_likes: 0,
      total_comments: 0,
      total_shares: 0,
      total_collects: 0
    };
  },

  // 获取平台分布
  getPlatformDistribution: async () => {
    if (!pool) return getInMemoryPlatformDistribution();

    const sql = `SELECT
      p.code as platform,
      COUNT(DISTINCT v.id) as video_count,
      COALESCE(SUM(v.play_count), 0) as total_plays
      FROM platforms p
      LEFT JOIN videos v ON v.platform_code = p.code
        AND COALESCE(v.content_type, 'video') <> 'video_media'
      WHERE p.enabled = 1
      GROUP BY p.code, p.name, p.color
      ORDER BY p.sort_order`;

    const [rows] = await pool.query(sql);
    return rows;
  },

  // 获取趋势数据
  getTrendData: async (days = 7) => {
    if (!pool) return getInMemoryTrendData(days);

    const sql = `SELECT
      DATE(v.published_at) as date,
      COALESCE(SUM(v.play_count), 0) as plays,
      COALESCE(SUM(v.like_count), 0) as likes,
      COALESCE(SUM(v.comment_count), 0) as comments
      FROM videos v
      WHERE v.published_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND COALESCE(v.content_type, 'video') <> 'video_media'
      GROUP BY DATE(v.published_at)
      ORDER BY date`;

    const [rows] = await pool.query(sql, [days]);
    return rows;
  },

  // 根据视频ID和平台获取视频
  getVideoById: async (videoId, platformCode) => {
    if (!pool) return null;
    const [rows] = await pool.query(
      'SELECT * FROM videos WHERE video_id = ? AND platform_code = ?',
      [videoId, platformCode]
    );
    return rows[0] || null;
  },

  // 获取账号的所有视频
  getVideosByAccount: async (accountId) => {
    if (!pool) return [];
    const [rows] = await pool.query(
      'SELECT * FROM videos WHERE account_id = ?',
      [accountId]
    );
    return rows;
  },

  // 标记视频为已删除
  markVideoDeleted: async (videoId, platformCode) => {
    if (!pool) return;
    await pool.query(
      'UPDATE videos SET is_deleted = 1, updated_at = NOW() WHERE video_id = ? AND platform_code = ?',
      [videoId, platformCode]
    );
  }
};

// ========== 内存数据库备用实现 ==========
let accounts = [];
let videos = [];

function getInMemoryAccounts(filters = {}) {
  let result = [...accounts];
  if (filters.platform) {
    result = result.filter(a => a.platform_code === filters.platform);
  }
  if (filters.status) {
    result = result.filter(a => a.status === filters.status);
  }
  return Promise.resolve(result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
}

function createInMemoryAccount(account) {
  const newAccount = {
    id: uuidv4(),
    ...account,
    last_fetch_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  accounts.push(newAccount);
  return Promise.resolve(newAccount);
}

function updateInMemoryAccount(id, updates) {
  const index = accounts.findIndex(a => a.id === id);
  if (index > -1) {
    accounts[index] = {
      ...accounts[index],
      ...updates,
      updated_at: new Date().toISOString()
    };
    return Promise.resolve(accounts[index]);
  }
  return Promise.resolve(null);
}

function deleteInMemoryAccount(id) {
  const index = accounts.findIndex(a => a.id === id);
  if (index > -1) {
    accounts.splice(index, 1);
    videos = videos.filter(v => v.account_id !== id);
    return Promise.resolve({ deleted: true });
  }
  return Promise.resolve({ deleted: false });
}

function getInMemoryVideos(filters = {}) {
  let result = [...videos];
  if (!filters.includeMediaOnly) {
    result = result.filter(v => (v.content_type || 'video') !== 'video_media');
  }
  if (filters.accountId) {
    result = result.filter(v => v.account_id === filters.accountId);
  }
  if (filters.platform) {
    result = result.filter(v => v.platform_code === filters.platform);
  }
  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    result = result.filter(v =>
      v.title.toLowerCase().includes(kw) ||
      (v.account_nickname && v.account_nickname.toLowerCase().includes(kw))
    );
  }
  return Promise.resolve(result.slice(0, 20));
}

function getInMemoryVideosCount(filters = {}) {
  return getInMemoryVideos(filters).then(result => result.length);
}

function createInMemoryVideo(video) {
  const newVideo = {
    id: uuidv4(),
    ...video,
    fetched_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  videos.push(newVideo);
  return Promise.resolve(newVideo);
}

function getInMemoryStatistics() {
  const visibleVideos = videos.filter(v => (v.content_type || 'video') !== 'video_media');
  return Promise.resolve({
    total_videos: visibleVideos.length,
    total_plays: visibleVideos.reduce((sum, v) => sum + (v.play_count || 0), 0),
    total_likes: visibleVideos.reduce((sum, v) => sum + (v.like_count || 0), 0),
    total_comments: visibleVideos.reduce((sum, v) => sum + (v.comment_count || 0), 0),
    total_shares: visibleVideos.reduce((sum, v) => sum + (v.share_count || 0), 0),
    total_collects: visibleVideos.reduce((sum, v) => sum + (v.collect_count || 0), 0)
  });
}

function getInMemoryPlatformDistribution() {
  const platforms = ['douyin', 'xiaohongshu', 'videohao'];
  return Promise.resolve(
    platforms.map(platform => {
      const platformVideos = videos.filter(v =>
        v.platform_code === platform && (v.content_type || 'video') !== 'video_media'
      );
      return {
        platform,
        video_count: platformVideos.length,
        total_plays: platformVideos.reduce((sum, v) => sum + (v.play_count || 0), 0)
      };
    })
  );
}

function getInMemoryTrendData(days = 7) {
  const now = new Date();
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayVideos = videos.filter(v => v.published_at && v.published_at.startsWith(dateStr));
    result.push({
      date: dateStr,
      plays: dayVideos.reduce((sum, v) => sum + (v.play_count || 0), 0),
      likes: dayVideos.reduce((sum, v) => sum + (v.like_count || 0), 0),
      comments: dayVideos.reduce((sum, v) => sum + (v.comment_count || 0), 0)
    });
  }
  return Promise.resolve(result);
}

module.exports = {
  initDatabase,
  getPool,
  isConnected,
  database
};
