'use strict';

const assert = require('node:assert/strict');
const NewsRelevance = require('../news-relevance');

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`✓ ${name}`); }
function status(profile, news) { return NewsRelevance.evaluate(profile, news).status; }

test('UK + UK = relevant', () => assert.equal(status({ marketplaces:['UK'] }, { marketplaces:['UK'] }), 'relevant'));
test('UK + US = irrelevant', () => assert.equal(status({ marketplaces:['UK'] }, { marketplaces:['US'] }), 'irrelevant'));
test('UK + GLOBAL = relevant', () => assert.equal(status({ marketplaces:['UK'] }, { marketplaces:['GLOBAL'] }), 'relevant'));
test('UK+DE + DE = relevant', () => assert.equal(status({ marketplaces:['UK','DE'] }, { marketplaces:['DE'] }), 'relevant'));
test('DE + EU = relevant', () => { const result=NewsRelevance.evaluate({ marketplaces:['DE'] }, { marketplaces:['EU'] }); assert.equal(result.status,'relevant'); assert.deepEqual(result.matchedMarketplaces,['DE']); assert.ok(result.reasonCodes.includes('REGIONAL_MARKETPLACE_MATCH')); });
test('UK + EU = irrelevant', () => assert.equal(status({ marketplaces:['UK'] }, { marketplaces:['EU'] }), 'irrelevant'));
test('缺失 Marketplace = unknown', () => { const result=NewsRelevance.evaluate({ marketplaces:['UK'] }, {}); assert.equal(result.status,'unknown'); assert.ok(result.reasonCodes.includes('NEWS_MARKETPLACE_MISSING')); });
test('空 marketplaces = unknown', () => assert.equal(status({ marketplaces:['UK'] }, { marketplaces:[] }), 'unknown'));
test('非法 Marketplace = unknown', () => { const result=NewsRelevance.evaluate({ marketplaces:['UK'] }, { marketplaces:['CN'] }); assert.equal(result.status,'unknown'); assert.ok(result.reasonCodes.includes('NEWS_MARKETPLACE_INVALID')); });
test('混合非法 Marketplace 保守返回 unknown', () => assert.equal(status({ marketplaces:['UK'] }, { marketplaces:['UK','CN'] }), 'unknown'));
test('无 Profile = unknown', () => { const result=NewsRelevance.evaluate(null, { marketplaces:['UK'] }); assert.equal(result.status,'unknown'); assert.ok(result.reasonCodes.includes('PROFILE_MISSING')); });
test('空 Profile = unknown', () => assert.equal(status({ marketplaces:[] }, { marketplaces:['UK'] }), 'unknown'));
test('旧 marketplace 字段兼容', () => assert.equal(status({ marketplaces:['UK'] }, { marketplace:'UK' }), 'relevant'));
test('新 marketplaces 字段优先', () => assert.equal(status({ marketplaces:['UK'] }, { marketplace:'UK', marketplaces:['US'] }), 'irrelevant'));
test('Global 大小写标准化', () => { const result=NewsRelevance.evaluate({ marketplaces:['UK'] }, { marketplaces:['Global'] }); assert.equal(result.status,'relevant'); assert.deepEqual(result.newsMarketplaces,['GLOBAL']); });
test('GLOBAL 在无 Profile 时仍与所有卖家相关', () => assert.equal(status(null, { marketplaces:['global'] }), 'relevant'));
test('getRelevance 为 evaluate 别名', () => assert.deepEqual(NewsRelevance.getRelevance({ marketplaces:['AU'] }, { marketplaces:['AU'] }), NewsRelevance.evaluate({ marketplaces:['AU'] }, { marketplaces:['AU'] })));
test('输入对象不可变', () => { const profile={marketplaces:[' uk ']}; const news={marketplace:'Global'}; const before=JSON.stringify([profile,news]); NewsRelevance.evaluate(profile,news); assert.equal(JSON.stringify([profile,news]),before); });

console.log(`news relevance tests passed: ${passed}`);
