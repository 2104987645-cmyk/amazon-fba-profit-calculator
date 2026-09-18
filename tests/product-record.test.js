const assert = require('node:assert/strict');
require('../marketplace-config.js');
require('../product-record.js');

const normalize = globalThis.WorkbenchModels.normalizeProductRecord;
const legacy = normalize({ marketplace: 'UK', title: '旧产品', asin: 'B0OLD', category: 'Home' });
assert.deepEqual(legacy.productInfo, { name: '旧产品', sku: '', asin: 'B0OLD', category: 'Home', supplier: '', notes: '' });

const current = normalize({ productInfo: { name: '新产品', sku: 'SKU-1', notes: '备注' } });
assert.deepEqual(current.productInfo, { name: '新产品', sku: 'SKU-1', asin: '', category: '', supplier: '', notes: '备注' });
console.log('ProductRecord compatibility tests passed.');
