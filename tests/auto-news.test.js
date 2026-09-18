'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sources = require('../scripts/news-sources');
const normalize = require('../scripts/normalize-amazon-news');
const { mergeCandidates } = require('../scripts/dedupe-news');
const fetcher = require('../scripts/fetch-amazon-news');
const candidateUi = require('../candidate-news');

let count = 0;
function test(name, fn) { return Promise.resolve().then(fn).then(() => { count += 1; console.log(`✓ ${name}`); }); }
function response(html, status = 200) { return { ok: status >= 200 && status < 300, status, text: async () => html }; }
function fixture(source, slug, title, publishedAt) { const prefix = source.id === 'amazon-ads-newsroom' ? '/library/news/' : source.id === 'amazon-small-business-news' ? '/news/small-business/' : '/blog/'; return normalize.normalizeCandidate({ source: { id: source.id, name: source.name, type: source.sourceType, url: source.url }, officialUrl: new URL(prefix + slug, source.url).toString(), title, summary: '', publishedAt }, '2026-09-18T00:00:00.000Z'); }

(async () => {
  await test('配置 3 个官方公开来源', () => assert.equal(sources.length, 3));
  await test('所有来源使用 HTTPS', () => sources.forEach(source => assert.equal(new URL(source.url).protocol, 'https:')));
  await test('标题会统一大小写、标点与空格', () => assert.equal(normalize.normalizeTitle('  FBA—Fee  UPDATE! '), 'fba fee update'));
  await test('同一内容指纹稳定', () => { const a = fixture(sources[0], 'fba-fee', 'FBA fee update', '2026-01-01'); assert.equal(normalize.fingerprintFor(a), normalize.fingerprintFor(a)); });
  await test('不同发布日期产生不同指纹', () => { const a = fixture(sources[0], 'one', 'Same title', '2026-01-01'); const b = fixture(sources[0], 'two', 'Same title', '2026-01-02'); assert.notEqual(a.fingerprint, b.fingerprint); });
  await test('可保守识别美国站', () => assert.deepEqual(normalize.inferMarketplaces('Update for United States sellers'), ['US']));
  await test('无法识别站点时回退 Global', () => assert.deepEqual(normalize.inferMarketplaces('New seller feature'), ['Global']));
  await test('可识别广告分类', () => assert.equal(normalize.inferCategory('Sponsored Products campaign update'), 'advertising'));
  await test('无法识别分类时回退 general', () => assert.equal(normalize.inferCategory('A new experience'), 'general'));
  await test('默认不推断重要性与行动', () => { const item = fixture(sources[0], 'new-feature', 'New feature', null); assert.equal(item.importance, null); assert.equal(item.actionRequired, false); assert.equal(item.reviewStatus, 'pending'); });
  await test('URL 去除追踪参数与尾斜杠', () => assert.equal(normalize.normalizeUrl('https://sell.amazon.com/blog/test/?utm_source=x'), 'https://sell.amazon.com/blog/test'));
  await test('URL 精确去重', () => { const a = fixture(sources[0], 'same', 'Title A', null); const b = Object.assign({}, a, { title: 'Title B', fingerprint: 'different' }); assert.equal(mergeCandidates([a], [b]).added, 0); });
  await test('外部 ID 精确去重', () => { const a = fixture(sources[0], 'same-id', 'A title long enough', null); const b = Object.assign({}, fixture(sources[0], 'other', 'Other title long enough', null), { externalId: a.externalId }); assert.equal(mergeCandidates([a], [b]).added, 0); });
  await test('指纹精确去重', () => { const a = fixture(sources[0], 'a', 'Same stable title', '2026-01-01'); const b = Object.assign({}, fixture(sources[0], 'b', 'Different title text', null), { fingerprint: a.fingerprint }); assert.equal(mergeCandidates([a], [b]).added, 0); });
  await test('相同标题仅标为可能重复而不删除', () => { const a = fixture(sources[0], 'a', 'Repeated title', '2026-01-01'); const b = fixture(sources[1], 'b', 'Repeated title', '2026-01-02'); const merged = mergeCandidates([a], [b]); assert.equal(merged.added, 1); assert.equal(merged.candidates[1].possibleDuplicateOf, a.id); });
  await test('HTML 只提取来源规则允许的链接', () => { const html = '2026-09-18 <a href="/blog/good-update">A valid official update</a><a href="https://evil.example/x">A malicious external update</a>'; assert.equal(fetcher.extractLinks(html, sources[0]).length, 1); });
  await test('HTML 实体会被安全解码', () => assert.equal(fetcher.decodeHtml('<b>Fees &amp; FBA</b>'), 'Fees & FBA'));
  await test('十六进制 HTML 实体会被解码', () => assert.equal(fetcher.decodeHtml('seller&#x27;s update'), "seller's update"));
  await test('识别 ISO 日期', () => assert.equal(fetcher.parseDate('Published 2026-09-18 today'), '2026-09-18'));
  await test('候选审核覆盖不改原对象', () => { const raw = fixture(sources[0], 'x', 'An update title', null); const overlaid = candidateUi.overlayCandidate(raw, { [raw.id]: { importance: 'high' } }); assert.equal(overlaid.importance, 'high'); assert.equal(raw.importance, null); });
  await test('仅导出已审核候选', () => { const a = fixture(sources[0], 'a', 'Approved update', null); const b = fixture(sources[0], 'b', 'Pending update', null); const output = candidateUi.exportApproved([a, b], { [a.id]: { reviewStatus: 'approved' } }); assert.equal(output.length, 1); assert.equal(output[0].id, a.id); });
  await test('导出结果转为正式 News 结构', () => { const item = fixture(sources[0], 'a', 'Approved update', null); const formal = candidateUi.toFormalNews(item); assert.equal(formal.status, 'active'); assert.ok(Array.isArray(formal.affectedModules)); });
  await test('部分来源失败仍写入成功来源候选', async () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'news-partial-')); fs.mkdirSync(path.join(root, 'data')); fs.writeFileSync(path.join(root, 'data/incoming-news.json'), '[]'); fs.writeFileSync(path.join(root, 'data/news-source-state.json'), '{}'); const okHtml = '2026-09-18 <a href="/blog/good-update">A valid official news update</a>'; const result = await fetcher.run({ root, sources: sources.slice(0, 2), fetchImpl: async url => url.includes('aboutamazon') ? response('', 500) : response(okHtml), clock: () => new Date('2026-09-18T00:00:00Z') }); assert.equal(result.failures, 1); assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data/incoming-news.json'))).length, 1); });
  await test('所有来源失败时不修改数据文件', async () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'news-all-fail-')); fs.mkdirSync(path.join(root, 'data')); const candidates = path.join(root, 'data/incoming-news.json'); const state = path.join(root, 'data/news-source-state.json'); fs.writeFileSync(candidates, '[]\n'); fs.writeFileSync(state, '{}\n'); await assert.rejects(fetcher.run({ root, sources: sources.slice(0, 2), fetchImpl: async () => response('', 503) }), /所有官方来源/); assert.equal(fs.readFileSync(candidates, 'utf8'), '[]\n'); assert.equal(fs.readFileSync(state, 'utf8'), '{}\n'); });
  await test('重复抓取不会增加候选', async () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'news-repeat-')); fs.mkdirSync(path.join(root, 'data')); fs.writeFileSync(path.join(root, 'data/incoming-news.json'), '[]'); fs.writeFileSync(path.join(root, 'data/news-source-state.json'), '{}'); const html = '2026-09-18 <a href="/blog/repeat-update">A repeatable official update</a>'; const options = { root, sources: [sources[0]], fetchImpl: async () => response(html), clock: () => new Date('2026-09-18T00:00:00Z') }; assert.equal((await fetcher.run(options)).added, 1); assert.equal((await fetcher.run(options)).added, 0); });
  console.log(`\n自动新闻测试通过：${count} 个场景`);
})().catch(error => { console.error(error); process.exitCode = 1; });
