'use strict';

const assert = require('node:assert/strict');
const SellerProfile = require('../seller-profile');

function memoryStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    raw(key) { return values.get(key); }
  };
}

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`✓ ${name}`); }

test('正常保存只持久化 marketplaces', () => {
  const storage = memoryStorage(); const api = SellerProfile.create(storage);
  const result = api.saveProfile({ marketplaces: ['UK'], extra: 'ignored' });
  assert.equal(result.status, 'configured');
  assert.deepEqual(JSON.parse(storage.raw(SellerProfile.STORAGE_KEY)), { marketplaces: ['UK'] });
});
test('正常读取', () => { const api = SellerProfile.create(memoryStorage({ [SellerProfile.STORAGE_KEY]: '{"marketplaces":["UK"]}' })); assert.deepEqual(api.getProfile().marketplaces, ['UK']); });
test('支持多站点', () => assert.deepEqual(SellerProfile.normalizeProfile({ marketplaces: ['UK', 'DE', 'AU'] }).marketplaces, ['UK', 'DE', 'AU']));
test('lowercase 转为大写', () => assert.deepEqual(SellerProfile.normalizeProfile({ marketplaces: ['uk'] }).marketplaces, ['UK']));
test('trim 空格', () => assert.deepEqual(SellerProfile.normalizeProfile({ marketplaces: ['  DE '] }).marketplaces, ['DE']));
test('重复站点去重', () => assert.deepEqual(SellerProfile.normalizeProfile({ marketplaces: ['UK', 'uk', ' UK '] }).marketplaces, ['UK']));
test('非法站点过滤', () => assert.deepEqual(SellerProfile.normalizeProfile({ marketplaces: ['US', 'CN', 3] }).marketplaces, ['US']));
test('GLOBAL 拒绝写入', () => assert.deepEqual(SellerProfile.normalizeProfile({ marketplaces: ['GLOBAL'] }).marketplaces, []));
test('EU 拒绝写入', () => assert.deepEqual(SellerProfile.normalizeProfile({ marketplaces: ['EU'] }).marketplaces, []));
test('JSON 损坏安全修复', () => { const api = SellerProfile.create(memoryStorage({ [SellerProfile.STORAGE_KEY]: '{bad' })); const result = api.getProfile(); assert.equal(result.status, 'repaired'); assert.deepEqual(result.marketplaces, []); });
test('localStorage 不可用', () => { const result = SellerProfile.create(null).getProfile(); assert.equal(result.unavailable, true); assert.equal(result.status, 'unavailable'); });
test('读取失败安全处理', () => { const result = SellerProfile.create({ getItem() { throw new Error('blocked'); } }).getProfile(); assert.equal(result.status, 'unavailable'); });
test('写入失败安全处理', () => { const result = SellerProfile.create({ setItem() { throw new Error('full'); } }).saveProfile({ marketplaces: ['UK'] }); assert.equal(result.status, 'unavailable'); });
test('clearProfile 清除数据', () => { const storage = memoryStorage({ [SellerProfile.STORAGE_KEY]: '{}' }); const result = SellerProfile.create(storage).clearProfile(); assert.equal(storage.raw(SellerProfile.STORAGE_KEY), undefined); assert.equal(result.configured, false); });
test('clearProfile 失败安全处理', () => { const result = SellerProfile.create({ removeItem() { throw new Error('blocked'); } }).clearProfile(); assert.equal(result.status, 'unavailable'); });
test('空 Profile 不猜测站点', () => { const result = SellerProfile.create(memoryStorage()).getProfile(); assert.equal(result.configured, false); assert.deepEqual(result.marketplaces, []); });
test('输入对象不可变', () => { const input = { marketplaces: [' uk ', 'UK', 'EU'] }; const before = JSON.stringify(input); SellerProfile.create(memoryStorage()).saveProfile(input); assert.equal(JSON.stringify(input), before); });
test('白名单覆盖当前站点', () => assert.deepEqual(SellerProfile.MARKETPLACES, ['US','CA','MX','UK','DE','FR','IT','ES','NL','SE','PL','BE','AU','JP']));

console.log(`seller profile tests passed: ${passed}`);
