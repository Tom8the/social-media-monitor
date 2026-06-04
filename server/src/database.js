// 简单的内存数据库 - 用于Demo演示
const { v4: uuidv4 } = require('uuid');

// 内存数据存储
let accounts = [];
let videos = [];

// 测试账号数据
const testAccounts = [
  {
    platform: 'douyin',
    unique_id: 'douyin_user_001',
    nickname: '抖音达人',
    avatar: 'https://via.placeholder.com/100/FF0050/FFFFFF?text=DY',
    follower_count: 125000,
    following_count: 500,
    like_count: 850000,
    signature: '分享生活，记录美好',
    verified: 1,
    remark: '主要账号'
  },
  {
    platform: 'douyin',
    unique_id: 'douyin_user_002',
    nickname: '美食探店',
    avatar: 'https://via.placeholder.com/100/FF0050/FFFFFF?text=MS',
    follower_count: 89000,
    following_count: 300,
    like_count: 520000,
    signature: '发现城市美食',
    verified: 0,
    remark: '美食类'
  },
  {
    platform: 'videohao',
    unique_id: 'video_user_001',
    nickname: '视频号创作者',
    avatar: 'https://via.placeholder.com/100/07C160/FFFFFF?text=SP',
    follower_count: 67000,
    following_count: 200,
    like_count: 380000,
    signature: '原创内容分享',
    verified: 1,
    remark: '视频号主号'
  },
  {
    platform: 'xiaohongshu',
    unique_id: 'xhs_user_001',
    nickname: '小红书博主',
    avatar: 'https://via.placeholder.com/100/FF2442/FFFFFF?text=XHS',
    follower_count: 45000,
    following_count: 150,
    like_count: 280000,
    signature: '生活方式分享',
    verified: 0,
    remark: '小红书账号'
  },
  {
    platform: 'xiaohongshu',
    unique_id: 'xhs_user_002',
    nickname: '旅行日记',
    avatar: 'https://via.placeholder.com/100/FF2442/FFFFFF?text=LX',
    follower_count: 32000,
    following_count: 100,
    like_count: 190000,
    signature: '走遍世界的每一个角落',
    verified: 0,
    remark: '旅行类'
  }
];

// 视频标题模板
const videoTitles = {
  douyin: [
    '这个技巧让我涨粉10万！',
    '2024年最火的美食探店',
    '每天5分钟，轻松学会剪辑',
    '爆款视频的秘密武器',
    '如何打造个人IP',
    '短视频运营必看教程',
    '这个转场太绝了！',
    '我的日常Vlog分享',
    '涨粉秘籍大公开',
    '内容创作的核心逻辑'
  ],
  videohao: [
    '微信视频号运营攻略',
    '私域流量变现方法',
    '视频号直播技巧',
    '内容创作心得分享',
    '如何获得更多推荐',
    '视频号算法解析',
    '我的创作日常',
    '从零开始做视频号',
    '视频号变现案例',
    '创作者成长之路'
  ],
  xiaohongshu: [
    '我的护肤日常分享',
    '旅行必带好物推荐',
    '穿搭灵感合集',
    '美食探店笔记',
    '生活小技巧',
    '好物开箱分享',
    '周末去哪儿玩',
    '我的精致生活',
    '美妆教程分享',
    '读书笔记分享'
  ]
};

// 生成随机日期（最近30天内）
function getRandomDate() {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 30);
  const date = new Date(now.setDate(now.getDate() - daysAgo));
  date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
  return date.toISOString();
}

// 生成测试数据
function generateTestData() {
  console.log('生成测试数据...');
  
  // 生成账号
  testAccounts.forEach(account => {
    accounts.push({
      id: uuidv4(),
      ...account,
      group_id: null,
      status: 'active',
      last_fetch_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  });
  
  console.log(`✓ 创建 ${accounts.length} 个测试账号`);
  
  // 为每个账号生成视频
  const titles = videoTitles;
  
  accounts.forEach(account => {
    const videoCount = Math.floor(Math.random() * 15) + 5;
    
    for (let i = 0; i < videoCount; i++) {
      const platformTitles = titles[account.platform] || titles.douyin;
      const title = platformTitles[Math.floor(Math.random() * platformTitles.length)];
      const publishedAt = getRandomDate();
      
      const basePlay = Math.floor(Math.random() * 50000) + 10000;
      const playCount = Math.floor(basePlay * (1 + Math.random() * 2));
      const likeCount = Math.floor(playCount * (0.02 + Math.random() * 0.03));
      const commentCount = Math.floor(playCount * (0.005 + Math.random() * 0.01));
      const shareCount = Math.floor(playCount * (0.003 + Math.random() * 0.005));
      const collectCount = Math.floor(playCount * (0.01 + Math.random() * 0.02));
      
      videos.push({
        id: uuidv4(),
        account_id: account.id,
        platform: account.platform,
        video_id: `${account.platform}_video_${Date.now()}_${i}`,
        title: `${title} #${i + 1}`,
        description: `这是一个${account.platform === 'douyin' ? '抖音' : account.platform === 'videohao' ? '视频号' : '小红书'}测试视频描述`,
        cover_url: `https://via.placeholder.com/300x400/${account.platform === 'douyin' ? 'FF0050' : account.platform === 'videohao' ? '07C160' : 'FF2442'}/FFFFFF?text=${account.platform.toUpperCase()}`,
        video_url: '',
        play_count: playCount,
        like_count: likeCount,
        comment_count: commentCount,
        share_count: shareCount,
        collect_count: collectCount,
        duration: Math.floor(Math.random() * 180) + 15,
        topic_tags: '#热门 #推荐 #测试',
        published_at: publishedAt,
        fetched_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        account_nickname: account.nickname,
        account_avatar: account.avatar
      });
    }
  });
  
  console.log(`✓ 创建 ${videos.length} 个测试视频`);
  console.log('测试数据生成完成！');
}

// 初始化数据
generateTestData();

// 数据库操作封装
const database = {
  // 查询所有账号
  getAllAccounts: (filters = {}) => {
    let result = [...accounts];
    
    if (filters.platform) {
      result = result.filter(a => a.platform === filters.platform);
    }
    if (filters.status) {
      result = result.filter(a => a.status === filters.status);
    }
    if (filters.groupId) {
      result = result.filter(a => a.group_id === filters.groupId);
    }
    
    return Promise.resolve(result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  },

  // 创建账号
  createAccount: (account) => {
    const newAccount = {
      id: uuidv4(),
      ...account,
      last_fetch_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    accounts.push(newAccount);
    return Promise.resolve(newAccount);
  },

  // 更新账号
  updateAccount: (id, updates) => {
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
  },

  // 删除账号
  deleteAccount: (id) => {
    const index = accounts.findIndex(a => a.id === id);
    if (index > -1) {
      accounts.splice(index, 1);
      // 同时删除该账号的视频
      videos = videos.filter(v => v.account_id !== id);
      return Promise.resolve({ deleted: true });
    }
    return Promise.resolve({ deleted: false });
  },

  // 查询视频列表
  getVideos: (filters = {}) => {
    let result = [...videos];
    
    if (filters.accountId) {
      result = result.filter(v => v.account_id === filters.accountId);
    }
    if (filters.platform) {
      result = result.filter(v => v.platform === filters.platform);
    }
    if (filters.timeRange) {
      const now = new Date();
      let startDate;
      
      switch (filters.timeRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setDate(now.getDate() - 30));
          break;
      }
      
      if (startDate) {
        result = result.filter(v => new Date(v.published_at) >= startDate);
      }
    }
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      result = result.filter(v => 
        v.title.toLowerCase().includes(kw) || 
        v.account_nickname.toLowerCase().includes(kw)
      );
    }

    // 排序
    const sortBy = filters.sortBy || 'published_at';
    const sortOrder = filters.sortOrder === 'ASC' ? 1 : -1;
    result.sort((a, b) => {
      if (sortBy === 'published_at') {
        return (new Date(a.published_at) - new Date(b.published_at)) * sortOrder;
      }
      return ((a[sortBy] || 0) - (b[sortBy] || 0)) * sortOrder;
    });

    // 分页
    const page = parseInt(filters.page) || 1;
    const pageSize = parseInt(filters.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    
    return Promise.resolve(result.slice(offset, offset + pageSize));
  },

  // 获取视频总数
  getVideosCount: (filters = {}) => {
    let result = [...videos];
    
    if (filters.accountId) {
      result = result.filter(v => v.account_id === filters.accountId);
    }
    if (filters.platform) {
      result = result.filter(v => v.platform === filters.platform);
    }
    if (filters.timeRange) {
      const now = new Date();
      let startDate;
      
      switch (filters.timeRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setDate(now.getDate() - 30));
          break;
      }
      
      if (startDate) {
        result = result.filter(v => new Date(v.published_at) >= startDate);
      }
    }
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      result = result.filter(v => 
        v.title.toLowerCase().includes(kw) || 
        v.account_nickname.toLowerCase().includes(kw)
      );
    }
    
    return Promise.resolve(result.length);
  },

  // 创建视频
  createVideo: (video) => {
    const newVideo = {
      id: uuidv4(),
      ...video,
      fetched_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    videos.push(newVideo);
    return Promise.resolve(newVideo);
  },

  // 获取统计数据
  getStatistics: () => {
    const stats = {
      total_videos: videos.length,
      total_plays: videos.reduce((sum, v) => sum + (v.play_count || 0), 0),
      total_likes: videos.reduce((sum, v) => sum + (v.like_count || 0), 0),
      total_comments: videos.reduce((sum, v) => sum + (v.comment_count || 0), 0),
      total_shares: videos.reduce((sum, v) => sum + (v.share_count || 0), 0),
      total_collects: videos.reduce((sum, v) => sum + (v.collect_count || 0), 0)
    };
    return Promise.resolve(stats);
  },

  // 获取平台分布
  getPlatformDistribution: () => {
    const platforms = ['douyin', 'videohao', 'xiaohongshu'];
    return Promise.resolve(
      platforms.map(platform => {
        const platformVideos = videos.filter(v => v.platform === platform);
        return {
          platform,
          video_count: platformVideos.length,
          total_plays: platformVideos.reduce((sum, v) => sum + (v.play_count || 0), 0)
        };
      })
    );
  },

  // 获取趋势数据
  getTrendData: (days = 7) => {
    const now = new Date();
    const result = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayVideos = videos.filter(v => v.published_at.startsWith(dateStr));
      
      result.push({
        date: dateStr,
        plays: dayVideos.reduce((sum, v) => sum + (v.play_count || 0), 0),
        likes: dayVideos.reduce((sum, v) => sum + (v.like_count || 0), 0),
        comments: dayVideos.reduce((sum, v) => sum + (v.comment_count || 0), 0)
      });
    }
    
    return Promise.resolve(result);
  }
};

module.exports = database;
