const express = require('express');
const router = express.Router();
const { database } = require('../mysql-db');

// 获取概览统计
router.get('/overview', async (req, res) => {
  try {
    const stats = await database.getStatistics();

    // 计算增长率（模拟数据）
    const growth = {
      videos: { value: 12.5, trend: 'up' },
      plays: { value: 8.3, trend: 'up' },
      likes: { value: 15.2, trend: 'up' },
      comments: { value: 5.8, trend: 'up' },
      shares: { value: 3.2, trend: 'up' },
      collects: { value: 7.1, trend: 'up' }
    };

    res.json({
      code: 0,
      message: 'success',
      data: {
        ...stats,
        growth
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 获取平台分布
router.get('/platform-distribution', async (req, res) => {
  try {
    const distribution = await database.getPlatformDistribution();

    // 计算百分比
    const totalVideos = distribution.reduce((sum, item) => sum + (item.video_count || 0), 0);
    const totalPlays = distribution.reduce((sum, item) => sum + (item.total_plays || 0), 0);

    const videos = distribution.map(item => ({
      platform: item.platform,
      count: item.video_count || 0,
      percentage: totalVideos > 0 ? ((item.video_count / totalVideos) * 100).toFixed(1) : 0
    }));

    const plays = distribution.map(item => ({
      platform: item.platform,
      count: item.total_plays || 0,
      percentage: totalPlays > 0 ? ((item.total_plays / totalPlays) * 100).toFixed(1) : 0
    }));

    res.json({
      code: 0,
      message: 'success',
      data: { videos, plays }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 获取趋势数据
router.get('/trend', async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    const days = period === '30d' ? 30 : 7;

    const trendData = await database.getTrendData(days);

    res.json({
      code: 0,
      message: 'success',
      data: trendData
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 获取TOP榜单
router.get('/top', async (req, res) => {
  try {
    const { type = 'videos', metric = 'play', limit = 10 } = req.query;

    // 从数据库查询TOP视频
    const sortField = metric === 'like' ? 'like_count' : metric === 'comment' ? 'comment_count' : 'play_count';
    const topVideos = await database.getVideos({
      sortBy: sortField,
      sortOrder: 'DESC',
      pageSize: parseInt(limit)
    });

    const result = topVideos.map((video, index) => ({
      rank: index + 1,
      title: video.title,
      account: video.account_nickname || '未知账号',
      value: video[sortField] || 0
    }));

    res.json({
      code: 0,
      message: 'success',
      data: result
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

module.exports = router;
