const assert = require('assert');
const state = require('../news-action-state.js');

function memoryStorage(initial) {
  const values = Object.assign({}, initial);
  return { getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = value; }, values };
}

const storage = memoryStorage();
assert.deepStrictEqual(state.read(storage), {});
assert.strictEqual(state.get('news-1', storage), 'pending');
assert.strictEqual(state.complete('news-1', storage), true);
assert.strictEqual(state.get('news-1', storage), 'completed', '标记已处理写入存储');
assert.strictEqual(state.get('news-1', storage), 'completed', '刷新式重新读取仍为 completed');
assert.strictEqual(state.restore('news-1', storage), true);
assert.strictEqual(state.get('news-1', storage), 'pending', '恢复为待处理');
const damaged = memoryStorage({ [state.STORAGE_KEY]: '{broken' });
assert.deepStrictEqual(state.read(damaged), {}, '损坏 JSON 安全回退');
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
assert.deepStrictEqual(state.read(throwing), {}, 'localStorage 不可用时安全回退');
assert.strictEqual(state.complete('x', throwing), false);
const combined = state.combine([{ id: 'legacy', title: '旧数据' }], storage);
assert.strictEqual(combined[0].userStatus, 'pending', '缺少行动字段的旧数据保持兼容');
console.log('news action state tests passed: 10');
