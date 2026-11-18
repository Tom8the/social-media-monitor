const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const XiaohongshuScraper = require('../src/xhs-scraper');

const userId = '0123456789abcdef01234567';
const profileUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;

function setup(interactions, resolvedUrl = profileUrl) {
  const scraper = new XiaohongshuScraper();
  const page = {
    goto: async () => {},
    waitForTimeout: async () => {},
    url: () => resolvedUrl,
    close: async () => {},
    evaluate: async (callback, argument) => vm.runInNewContext(`(${callback})(argument)`, {
      argument,
      document: { title: '', querySelectorAll: () => [] },
      window: {
        __INITIAL_STATE__: {
          user: {
            userPageData: {
              basicInfo: { redId: 'distinct-display-id', nickname: '测试账号', imageb: 'https://example.test/avatar' },
              interactions
            }
          }
        }
      }
    })
  };
  scraper.createContext = async () => ({ newPage: async () => page });
  scraper._getPageState = async () => 'ok';
  return { scraper, page };
}

test('public profile and content collection keep counts when redId differs from the URL ID', async () => {
  const { scraper, page } = setup([
    { type: 'follows', name: '关注', count: 0 },
    { type: 'fans', name: '粉丝', count: '149' },
    { type: 'interaction', name: '获赞与收藏', count: '189' }
  ]);
  const result = await scraper.fetchFromLink(profileUrl, null, { useCreatorProfile: false, requireFollowerCount: true });
  assert.equal(result.success, true);
  const { profile } = await scraper._extractProfileAndRawNotes(page, userId);
  for (const data of [result.data, profile]) {
    assert.equal(data.unique_id, userId);
    assert.equal(data.follower_count, 149);
    assert.equal(data.following_count, 0);
    assert.equal(data.like_count, 189);
  }
});

test('profile refresh accepts zero and reports missing counts separately', async () => {
  const options = { useCreatorProfile: false, requireFollowerCount: true };
  const zero = await setup([{ type: 'fans', count: 0 }]).scraper.fetchFromLink(profileUrl, null, options);
  assert.equal(zero.data.follower_count, 0);

  const { scraper, page } = setup([{ type: 'fans', count: '-' }]);
  const missing = await scraper.fetchFromLink(profileUrl, null, options);
  assert.equal(missing.success, false);
  assert.match(missing.error, /未返回粉丝数/);
  const { profile } = await scraper._extractProfileAndRawNotes(page, userId);
  assert.equal(profile.follower_count, undefined);
});

test('profile refresh rejects a redirect to a different profile', async () => {
  const otherUrl = 'https://www.xiaohongshu.com/user/profile/0123456789abcdef01234568';
  const { scraper } = setup([{ type: 'fans', count: 999 }], otherUrl);
  const result = await scraper.fetchFromLink(profileUrl, null, { useCreatorProfile: false });
  assert.equal(result.success, false);
  assert.match(result.error, /目标账号不匹配/);
});
