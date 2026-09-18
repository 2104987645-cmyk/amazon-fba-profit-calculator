'use strict';
const assert = require('assert');
const Engine = require('../profitability-engine.js');

const base = Engine.calculate({ sku: 'A', totalSales: 10000, adSales: 4000, adSpend: 1200, productCost: 3000, fbaFees: 1000, referralFees: 1200, storageFees: 100, returnCost: 100, otherCosts: 100 });
assert.strictEqual(base.acos, 30);
assert.strictEqual(base.tacos, 12);
assert.strictEqual(base.organicSales, 6000);
assert.strictEqual(base.profitBeforeAds, 4500);
assert.strictEqual(base.netProfit, 3300);
assert.strictEqual(base.breakEvenAcos, 112.5);

const noAttributedSales = Engine.calculate({ sku: 'B', totalSales: 1000, adSales: 0, adSpend: 100 });
assert.strictEqual(noAttributedSales.acos, null);
assert.strictEqual(noAttributedSales.advertisingHealth, 'no-data');
const noAds = Engine.calculate({ sku: 'C', totalSales: 1000, adSales: 0, adSpend: 0 });
assert.strictEqual(noAds.advertisingHealth, 'no-ads');

const rows = [
  { sku: 'A', 'total-sales': '1000', 'ad-sales': '100', 'ad-spend': '30', 'product-cost': '300', 'fba-fees': '100', 'referral-fees': '100', 'return-cost': '10' },
  { sku: 'B', 'total-sales': '1000', 'ad-sales': '900', 'ad-spend': '450', 'product-cost': '500', 'fba-fees': '150', 'referral-fees': '150', 'return-cost': '20' }
];
const portfolio = Engine.analyze({ rows });
assert.strictEqual(portfolio.ok, true);
assert.strictEqual(portfolio.summary.acos, 48); // 480 / 1000, not average of 30% and 50%.
assert.strictEqual(portfolio.summary.tacos, 24);
assert.strictEqual(portfolio.items[1].advertisingHealth, 'critical');
assert.ok(portfolio.items[1].advertisingLeak > 0);
assert.strictEqual(portfolio.items[1].profitabilityStatus, 'loss');

const duplicate = Engine.analyze({ rows: [
  { sku: 'D', 'total-sales': '500', 'ad-sales': '100', 'ad-spend': '20' },
  { sku: 'D', 'total-sales': '500', 'ad-sales': '400', 'ad-spend': '180' }
] });
assert.strictEqual(duplicate.items.length, 1);
assert.strictEqual(duplicate.items[0].acos, 40);
assert.strictEqual(duplicate.quality.duplicateSkusMerged, 1);

const missingCost = Engine.analyze({ rows: [{ sku: 'E', 'total-sales': '1000', 'ad-sales': '', 'ad-spend': '' }] });
assert.strictEqual(missingCost.items[0].adSales, null);
assert.strictEqual(missingCost.items[0].acos, null);
assert.strictEqual(missingCost.items[0].dataCompleteness, 'sales-only');

const mapped = Engine.analyze({ rows: [{ Code: 'X', RevenueX: '99' }], mapping: { sku: 'Code', totalSales: 'RevenueX' } });
assert.strictEqual(mapped.ok, true);
assert.strictEqual(mapped.items[0].totalSales, 99);

const mixedMarkets = Engine.analyze({ rows: [{ sku: 'US-1', marketplace: 'US', sales: '100' }, { sku: 'UK-1', marketplace: 'UK', sales: '80' }] });
assert.strictEqual(mixedMarkets.mixedMarketplaces, true);
assert.strictEqual(mixedMarkets.summary, null);
assert.strictEqual(mixedMarkets.summaryByMarketplace.length, 2);

const xss = Engine.analyze({ rows: [{ sku: 'XSS', title: '<script>alert(1)</script>', sales: '10' }] });
assert.strictEqual(xss.items[0].productName, '<script>alert(1)</script>');

const largeRows = Array.from({ length: 5000 }, (_, i) => ({ sku: `SKU-${i}`, sales: '100', 'ad-sales': '40', 'ad-spend': '10', cogs: '20' }));
const started = Date.now();
const large = Engine.analyze({ rows: largeRows });
const elapsed = Date.now() - started;
assert.strictEqual(large.items.length, 5000);
assert.ok(elapsed < 2000, `5,000 SKUs took ${elapsed} ms`);

console.log(`All profitability engine tests passed; 5,000 SKUs analyzed in ${elapsed} ms.`);
