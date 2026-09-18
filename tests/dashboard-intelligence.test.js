const assert = require('assert');
require('../news-data.js');
const createNewsModule = require('../news.js');
const dashboard = require('../dashboard-intelligence.js');
const news = createNewsModule(globalThis.AmazonNewsData);

const model = dashboard.getModel(news);
assert.strictEqual(model.available, true);
assert.strictEqual(model.highPriority.length, 3, '最多显示 3 条高优先级动态');
assert.strictEqual(model.highPriority.every(item => item.importance === 'high'), true, '高优先级区域只显示 high');
assert.strictEqual(model.latest.length, 5, '最多显示 5 条最新动态');
assert.strictEqual(dashboard.getModel(null).available, false, 'NewsModule 不存在时安全降级');
const emptyNews = { getHighPriorityNews: () => [], getLatestNews: () => [] };
assert.deepStrictEqual(dashboard.getModel(emptyNews).latest, [], '空数据返回空数组');
assert.strictEqual(dashboard.effectiveLabel({ effectiveAt: '2099-01-01' }, news, '2026-09-18'), '即将生效 · 2099-01-01');
assert.strictEqual(dashboard.effectiveLabel({ effectiveAt: '2026-01-01' }, news, '2026-09-18'), '已生效 · 2026-01-01');
assert.strictEqual(dashboard.truncate('A'.repeat(100), 68).length, 68, '长摘要被安全截断');
console.log('dashboard intelligence tests passed: 9');
