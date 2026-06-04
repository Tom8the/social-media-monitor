const database = require('./database');
const { v4: uuidv4 } = require('uuid');

// 测试账号数据
const testAccounts = [
  {
    platform: 'douyin',
    uniqueId: 'douyin_user_001',
    nickname: '抖音达人',
    avatar: 'https://via.placeholder.com/100/FF0050/FFFFFF?text=DY',
    followerCount: 125000,
    followingCount: 500,
    likeCount: 850000,
    signature: '分享生活，记录美好',
    verified: true,
    remark: '主要账号'
  },
  {
    platform: 'douyin',
    uniqueId: 'douyin_user_002',
    nickname: '美食探店',
    avatar: 'https://via.placeholder.com/100/FF0050/FFFFFF?text=MS',
    followerCount: 89000,
    followingCount: 300,
    likeCount: 520000,
    signature: '发现城市美食',
    verified: false,
    remark: '美食类'
  },
  {
    platform: 'videohao',
    uniqueId: 'video_user_001',
    nickname: '视频号创作者',
    avatar: 'https://via.placeholder.com/100/07C160/FFFFFF?text=SP',
    followerCount: 67000,
    followingCount: 200,
    likeCount: 380000,
    signature: '原创内容分享',
    verified: true,
    remark: '视频号主号'
  },
  {
    platform: 'xiaohongshu',
    uniqueId: 'xhs_user_001',
    nickname: '小红书博主',
    avatar: 'https://via.placeholder.com/100/FF2442/FFFFFF?text=XHS',
    followerCount: 45000,
    followingCount: 150,
    likeCount: 280000,
    signature: '生活方式分享',
    verified: false,
    remark: '小红书账号'
  },
  {
    platform: 'xiaohongshu',
    uniqueId: 'xhs_user_002',
    nickname: '旅行日记',
    avatar: 'https://via.placeholder.com/100/FF2442/FFFFFF?text=LX',
    followerCount: 32000,
    followingCount: 100,
    likeCount: 190000,
    signature: '走遍世界的每一个角落',
    verified: false,
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

// 生成测试视频数据
async function generateTestVideos(accountId, platform, count = 10) {
  const titles = videoTitles[platform] || videoTitles.douyin;
  const videos = [];

  for (let i = 0; i < count; i++) {
    const title = titles[Math.floor(Math.random() * titles.length)];
    const publishedAt = getRandomDate();
    
    // 模拟数据增长（越新的视频数据越多）
    const daysSincePublished = Math.floor((new Date() - new Date(publishedAt)) / (1000 * 60 * 60 * 24));
    const growthFactor = Math.max(0.1, 1 - daysSincePublished / 30);
    
    const basePlay = Math.floor(Math.random() * 50000) + 10000;
    const playCount = Math.floor(basePlay * (1 + growthFactor * 2));
    const likeCount = Math.floor(playCount * (0.02 + Math.random() * 0.03));
    const commentCount = Math.floor(playCount * (0.005 + Math.random() * 0.01));
    const shareCount = Math.floor(playCount * (0.003 + Math.random() * 0.005));
    const collectCount = Math.floor(playCount * (0.01 + Math.random() * 0.02));
    
    videos.push({
      id: uuidv4(),
      account_id: accountId,
      platform: platform,
      video_id: `${platform}_video_${Date.now()}_${i}`,
      title: `${title} #${i + 1}`,
      description: `这是一个${platform === 'douyin' ? '抖音' : platform === 'videohao' ? '视频号' : '小红书'}测试视频描述`,
      cover_url: `https://via.placeholder.com/300x400/${platform === 'douyin' ? 'FF0050' : platform === 'videohao' ? '07C160' : 'FF2442'}/FFFFFF?text=${platform.toUpperCase()}`,
      video_url: '',
      play_count: playCount,
      like_count: likeCount,
      comment_count: commentCount,
      share_count: shareCount,
      collect_count: collectCount,
      duration: Math.floor(Math.random() * 180) + 15,
      topic_tags: '#热门 #推荐 #测试',
      published_at: publishedAt
    });
  }

  return videos;
}

// 初始化测试数据
async function seedData() {
  console.log('开始生成测试数据...');

  try {
    // 1. 创建测试账号
    console.log('创建测试账号...');
    const createdAccounts = [];
    
    for (const account of testAccounts) {
      try {
        const result = await database.createAccount({
          id: uuidv4(),
          ...account
        });
        createdAccounts.push(result);
        console.log(`✓ 创建账号: ${account.nickname} (${account.platform})`);
      } catch (err) {
        console.error(`✗ 创建账号失败: ${account.nickname}`, err.message);
      }
    }

    // 2. 为每个账号创建测试视频
    console.log('创建测试视频...');
    let totalVideos = 0;
    
    for (const account of createdAccounts) {
      const videoCount = Math.floor(Math.random() * 15) + 5; // 5-20个视频
      const videos = await generateTestVideos(account.id, account.platform, videoCount);
      
      for (const video of videos) {
        try {
          await database.createVideo(video);
          totalVideos++;
        } catch (err) {
          console.error(`✗ 创建视频失败: ${video.title}`, err.message);
        }
      }
      
      console.log(`✓ 为 ${account.nickname} 创建了 ${videoCount} 个视频`);
    }

    console.log('\n测试数据生成完成！');
    console.log(`- 账号数量: ${createdAccounts.length}`);
    console.log(`- 视频数量: ${totalVideos}`);
    
    // 3. 显示统计信息
    const stats = await database.getStatistics();
    console.log('\n数据统计:');
    console.log(`- 总播放量: ${stats.total_plays?.toLocaleString() || 0}`);
    console.log(`- 总点赞数: ${stats.total_likes?.toLocaleString() || 0}`);
    console.log(`- 总评论数: ${stats.total_comments?.toLocaleString() || 0}`);

  } catch (error) {
    console.error('生成测试数据失败:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  seedData().then(() => {
    console.log('\n按 Ctrl+C 退出');
    process.exit(0);
  });
}

module.exports = { seedData };
