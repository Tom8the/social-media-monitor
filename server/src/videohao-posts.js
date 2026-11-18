const { database } = require('./postgres-db');

const numericFields = ['duration', 'play_count', 'like_count', 'comment_count', 'share_count', 'collect_count'];
const textLimits = { title: 512, cover_url: 512, video_url: 512, topic_tags: 256 };

function isPlaceholderTitle(title) {
  const text = String(title || '').trim();
  return !text || text.includes('待补全') || text.includes('???');
}

async function saveVideohaoPosts(accountId, posts, { sourceUrl = '', connection } = {}) {
  const uniquePosts = new Map();
  for (const post of posts) {
    if (post.video_id && !uniquePosts.has(post.video_id)) uniquePosts.set(post.video_id, post);
  }
  let addedCount = 0;
  let updatedCount = 0;
  for (const post of uniquePosts.values()) {
    const existing = await database.getVideoById(post.video_id, 'videohao', connection);
    if (existing && existing.account_id !== accountId) {
      throw new Error('作品已归属其他账号：' + post.video_id);
    }
    const mediaOnly = post.content_type === 'video_media';
    const preserveMetadata = existing && (
      (mediaOnly && (existing.title || existing.description || existing.cover_url || existing.published_at)) ||
      (isPlaceholderTitle(post.title) && !isPlaceholderTitle(existing.title))
    );
    const record = {
      account_id: accountId,
      platform: 'videohao',
      video_id: post.video_id,
      content_type: mediaOnly && preserveMetadata ? (existing.content_type || 'video') :
        (post.content_type || existing?.content_type || 'video'),
      title: (preserveMetadata && existing.title) || post.title || existing?.title || '',
      description: (preserveMetadata && existing.description) || post.description || existing?.description || '',
      cover_url: (preserveMetadata && existing.cover_url) || post.cover_url || existing?.cover_url || '',
      video_url: post.video_url || existing?.video_url || sourceUrl,
      topic_tags: post.topic_tags || existing?.topic_tags ||
        (post.description?.match(/#[^#\s]+/g) || []).map(tag => tag.slice(1)).join(','),
      published_at: (preserveMetadata && existing.published_at) || post.published_at || existing?.published_at || null,
      is_deleted: 0
    };
    for (const field of numericFields) record[field] = post[field] ?? existing?.[field] ?? 0;
    for (const [field, limit] of Object.entries(textLimits)) {
      if (record[field].length <= limit) continue;
      // Signed media URLs cannot be truncated and still remain usable.
      record[field] = field.endsWith('_url') ? (existing?.[field] || '') : Array.from(record[field]).slice(0, limit).join('');
    }

    await database.upsertVideo(record, { requireSameAccount: true, connection });
    if (existing) updatedCount++;
    else addedCount++;
  }
  return { addedCount, updatedCount, saved: addedCount + updatedCount };
}

module.exports = { saveVideohaoPosts };
