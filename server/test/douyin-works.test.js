const assert = require('node:assert/strict');
const test = require('node:test');
const DouyinScraper = require('../src/scraper');

const target = 'target-account';
const endpoint = `https://www.douyin.com/aweme/v1/web/aweme/post/?sec_user_id=${target}`;

function work(id, author = target) {
  return { aweme_id: id, author: { sec_uid: author }, create_time: 1780000000, statistics: { digg_count: 12 } };
}

function runWorks(pages, maxCount = 50) {
  const scraper = new DouyinScraper();
  let onResponse;
  const emitPage = async () => {
    const payload = pages.shift();
    if (payload) await onResponse({ url: () => endpoint, status: () => 200, json: async () => payload });
  };
  const page = {
    on: (_event, callback) => { onResponse = callback; },
    goto: async (_url, options) => {
      assert.equal(options.waitUntil, 'commit');
      await emitPage();
    },
    evaluate: emitPage,
    waitForTimeout: async () => {}
  };
  scraper._openAuthorizedPage = async () => ({ page, close: async () => {} });
  return scraper.getUserVideos(target, maxCount, [{ name: 'session', value: 'fixture', domain: '.douyin.com' }]);
}

test('keeps small pages, excludes other authors and de-duplicates successive responses', async () => {
  const result = await runWorks([
    { status_code: 0, aweme_list: [work('1'), work('2', 'other')], has_more: 1 },
    { status_code: 0, aweme_list: [work('1'), work('3')], has_more: 0 }
  ]);
  assert.equal(result.success, true);
  assert.deepEqual(result.data.map(video => video.video_id), ['1', '3']);
  assert.equal(result.data[0].like_count, 12);
  assert.equal(result.coverage.deletionSafe, false);
});

test('distinguishes a verified empty list from results truncated by the collection limit', async () => {
  const empty = await runWorks([{ status_code: 0, aweme_list: [], has_more: 0 }]);
  assert.equal(empty.success, true);
  assert.deepEqual(empty.data, []);
  assert.equal(empty.coverage.deletionSafe, true);

  const limited = await runWorks([{ status_code: 0, aweme_list: [work('1'), work('2')], has_more: 0 }], 1);
  assert.equal(limited.success, true);
  assert.equal(limited.data.length, 1);
  assert.equal(limited.coverage.deletionSafe, false);
});
