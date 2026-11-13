const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { database } = require('../postgres-db');

// 获取视频列表
router.get('/', async (req, res) => {
  try {
    const {
      accountId,
      platform,
      timeRange,
      startDate,
      endDate,
      keyword,
      sortBy,
      sortOrder,
      page,
      pageSize,
      includeMediaOnly
    } = req.query;

    const filters = {
      accountId,
      platform,
      timeRange,
      startDate,
      endDate,
      keyword,
      sortBy,
      sortOrder,
      page,
      pageSize,
      includeMediaOnly: includeMediaOnly === '1' || includeMediaOnly === 'true'
    };

    const [videos, total] = await Promise.all([
      database.getVideos(filters),
      database.getVideosCount(filters)
    ]);

    res.json({
      code: 0,
      message: 'success',
      data: {
        total,
        page: parseInt(page) || 1,
        pageSize: parseInt(pageSize) || 20,
        list: videos
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 创建视频
router.post('/', async (req, res) => {
  try {
    const video = {
      account_id: req.body.accountId,
      platform: req.body.platform,
      video_id: req.body.videoId,
      title: req.body.title || '',
      description: req.body.description || '',
      cover_url: req.body.coverUrl || '',
      video_url: req.body.videoUrl || '',
      play_count: req.body.playCount || 0,
      like_count: req.body.likeCount || 0,
      comment_count: req.body.commentCount || 0,
      share_count: req.body.shareCount || 0,
      collect_count: req.body.collectCount || 0,
      duration: req.body.duration || 0,
      topic_tags: req.body.topicTags || '',
      published_at: req.body.publishedAt || new Date().toISOString()
    };

    const result = await database.upsertVideo(video);
    res.json({
      code: 0,
      message: '创建成功',
      data: result
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

module.exports = router;
