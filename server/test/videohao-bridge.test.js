const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const test = require('node:test');
const { createBridge } = require('../src/videohao-bridge');

const username = 'v2_test_account@finder';
const contact = { username, nickname: '测试账号' };
const cursor = 'next+/=';
const firstId = '14444444444444444444';
const secondId = '14444444444444444445';

async function fixture(t, { mode = 'connected' } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('/status')) {
      res.end(JSON.stringify({ code: 0, data: { available: mode !== 'disconnected' } }));
      return;
    }
    if (url.pathname.endsWith('/search')) {
      res.end(JSON.stringify({ code: 0, data: { errCode: 0, data: { infoList: [{ contact }, { contact }] } } }));
      return;
    }

    const marker = url.searchParams.get('next_marker');
    requests.push({ username: url.searchParams.get('username'), marker });
    const object = { id: 'LARGE_ID', contact, objectDesc: { description: '首条作品' }, likeCount: 0, createtime: 1764000000 };
    const data = {
      contact,
      BaseResponse: { Ret: mode === 'failed' && marker ? -1 : 0 },
      object: marker ? [object, { ...object, id: secondId }] : [object],
      continueFlag: marker && mode !== 'repeat' ? 0 : 1,
      lastBuffer: cursor
    };
    if (mode === 'wrong-owner') data.contact = { username: 'v2_different@finder' };
    res.end(JSON.stringify({ code: 0, data: { errCode: 0, data } }).replaceAll('"LARGE_ID"', firstId));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { bridge: createBridge('http://127.0.0.1:' + server.address().port), requests };
}

test('downloads distinct pages without rounding video IDs or inventing missing metrics', async t => {
  const { bridge, requests } = await fixture(t);
  assert.equal((await bridge.search('测试账号')).length, 1);
  const result = await bridge.fetchAccount(username, { maxPages: 5 });
  assert.deepEqual(requests, [{ username, marker: null }, { username, marker: cursor }]);
  assert.deepEqual(result.posts.map(post => post.video_id), [firstId, secondId]);
  assert.equal(result.posts[0].published_at, '2025-11-24T16:00:00.000Z');
  assert.equal(result.posts[0].like_count, 0);
  assert.equal(result.posts[0].play_count, undefined);
  assert.equal(result.hasMore, false);
});

test('exposes the page limit without reporting a complete list', async t => {
  const { bridge } = await fixture(t);
  const result = await bridge.fetchAccount(username, { maxPages: 1 });
  assert.equal(result.pages, 1);
  assert.equal(result.hasMore, true);
});

test('rejects disconnected sessions, mismatched accounts, failed pages and repeated cursors', async t => {
  for (const [mode, message] of [
    ['disconnected', /尚未连接/],
    ['wrong-owner', /不匹配/],
    ['failed', /没有返回可用/],
    ['repeat', /游标/]
  ]) {
    await t.test(mode, async subtest => {
      const { bridge } = await fixture(subtest, { mode });
      await assert.rejects(bridge.fetchAccount(username, { maxPages: 5 }), message);
    });
  }
});
