'use strict';

const assert = require('node:assert/strict');
const SellerIntelligence = require('../seller-intelligence-engine');

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
function news(id, overrides) {
  return Object.assign({ id, title: id, marketplaces: ['US'], importance: 'medium', actionRequired: false, publishedAt: '2026-09-01' }, overrides || {});
}
function engine(options) {
  const opts = options || {};
  const calls = { profile: 0, relevance: 0, impact: 0, action: 0 };
  const profile = opts.profile || { configured: true, marketplaces: ['US'] };
  const api = SellerIntelligence.create({
    SellerProfile: { getProfile() { calls.profile += 1; return profile; } },
    NewsRelevance: { evaluate(currentProfile, item) { calls.relevance += 1; return { status: item.marketplaces.includes(currentProfile.marketplaces[0]) ? 'relevant' : 'irrelevant', reasonCodes: [], matchedMarketplaces: [], profileMarketplaces: currentProfile.marketplaces.slice(), newsMarketplaces: item.marketplaces.slice() }; } },
    NewsImpact: { analyze(item, relevance) { calls.impact += 1; return { newsId: item.id, relevance: relevance.status, impactLevel: relevance.status === 'irrelevant' ? 'none' : item.importance === 'high' && item.actionRequired ? 'critical' : item.importance === 'high' || item.actionRequired ? 'high' : 'medium', actionRequired: Boolean(item.actionRequired) }; } },
    NewsActionState: { get(id) { calls.action += 1; return (opts.completed || []).includes(id) ? 'completed' : 'pending'; } },
    now: () => new Date('2026-09-20T00:00:00Z')
  });
  return { api, calls };
}

test('evaluateNews 返回统一契约', () => {
  const { api } = engine(); const result = api.evaluateNews(news('one'));
  assert.deepEqual(Object.keys(result), ['news', 'relevance', 'impact', 'actionState']);
  assert.equal(result.actionState.status, 'pending');
});
test('单条评估调用完整依赖链', () => { const { api, calls } = engine(); api.evaluateNews(news('one')); assert.deepEqual(calls, { profile:1, relevance:1, impact:1, action:1 }); });
test('批量评估只读取一次 Profile', () => { const { api, calls } = engine(); assert.equal(api.evaluateAll([news('a'), news('b')]).length, 2); assert.equal(calls.profile, 1); assert.equal(calls.relevance, 2); });
test('相关与不相关新闻被正确区分', () => { const { api } = engine(); const items = api.evaluateAll([news('a'), news('b', { marketplaces:['UK'] })]); assert.equal(items[0].relevance.status, 'relevant'); assert.equal(items[1].relevance.status, 'irrelevant'); });
test('getRelevantNews 仅返回相关项', () => { const { api } = engine(); assert.deepEqual(api.getRelevantNews([news('a'), news('b', { marketplaces:['UK'] })]).map(x => x.news.id), ['a']); });
test('getImpactItems 排除 none 与 unknown', () => { const { api } = engine(); assert.deepEqual(api.getImpactItems([news('a'), news('b', { marketplaces:['UK'] })]).map(x => x.news.id), ['a']); });
test('待处理动作包含 pending', () => { const { api } = engine(); assert.deepEqual(api.getPendingActions([news('a', { actionRequired:true })]).map(x => x.news.id), ['a']); });
test('已完成动作不进入 pending actions', () => { const { api } = engine({ completed:['a'] }); assert.equal(api.getPendingActions([news('a', { actionRequired:true })]).length, 0); });
test('无 Profile 时保持全量兼容模式', () => { const { api } = engine({ profile:{ configured:false, marketplaces:[] } }); const model = api.getDashboardModel([news('a'), news('b', { marketplaces:['UK'] })]); assert.equal(model.profileConfigured, false); assert.equal(model.counts.relevant, 2); assert.equal(model.relevantLatest.length, 2); });
test('兼容模式原因码显式可审计', () => { const { api } = engine({ profile:{ configured:false, marketplaces:[] } }); const result = api.evaluateNews(news('a')); assert.deepEqual(result.relevance.reasonCodes, ['PROFILE_NOT_CONFIGURED_COMPATIBILITY']); });
test('Dashboard 只读取一次 Profile', () => { const { api, calls } = engine(); api.getDashboardModel([news('a'), news('b')]); assert.equal(calls.profile, 1); });
test('Dashboard 汇总关键集合和计数', () => { const { api } = engine({ completed:['done'] }); const model = api.getDashboardModel([news('critical',{importance:'high',actionRequired:true}),news('done',{actionRequired:true}),news('other',{marketplaces:['UK']})]); assert.equal(model.counts.total,3); assert.equal(model.counts.relevant,2); assert.equal(model.counts.irrelevant,1); assert.equal(model.counts.critical,1); assert.equal(model.counts.pendingActions,1); assert.equal(model.criticalImpacts[0].news.id,'critical'); });
test('Dashboard 返回 Profile 站点副本', () => { const source={configured:true,marketplaces:['US']}; const { api }=engine({profile:source}); const model=api.getDashboardModel([]); model.marketplaces.push('UK'); assert.deepEqual(source.marketplaces,['US']); });
test('高影响结果按 impact 后按日期排序', () => { const { api }=engine(); const ids=api.getImpactItems([news('old',{importance:'high',publishedAt:'2026-08-01'}),news('critical',{importance:'high',actionRequired:true,publishedAt:'2026-07-01'}),news('new',{importance:'high',publishedAt:'2026-09-01'})]).map(x=>x.news.id); assert.deepEqual(ids,['critical','new','old']); });
test('不修改原始新闻', () => { const input=news('a',{nested:{value:1}}); const before=JSON.stringify(input); const { api }=engine(); api.evaluateNews(input); assert.equal(JSON.stringify(input),before); });
test('输出对象与原始新闻隔离', () => { const input=news('a',{nested:{value:1}}); const { api }=engine(); const result=api.evaluateNews(input); result.news.nested.value=2; result.news.marketplaces.push('UK'); assert.equal(input.nested.value,1); assert.deepEqual(input.marketplaces,['US']); });
test('非法列表输入安全返回空结果', () => { const { api }=engine(); assert.deepEqual(api.evaluateAll(null),[]); assert.equal(api.getDashboardModel(null).counts.total,0); });
test('未知 action 状态安全回退 pending', () => { const { api }=engine(); api.evaluateNews(news('a')); assert.equal(api.evaluateNews(news('a')).actionState.status,'pending'); });

console.log(`seller intelligence engine tests passed: ${passed}`);
