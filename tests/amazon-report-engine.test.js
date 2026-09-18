'use strict';
const assert=require('assert');
const R=require('../amazon-report-engine.js');
const P=require('../profitability-engine.js');

const sales=R.normalizeBusinessReport([{ '(Child) ASIN':'B0A','Units Ordered':'100','Ordered Product Sales':'10000','Start Date':'2026-08-01','End Date':'2026-08-31'}]);
const ads=R.normalizeAdsReport([{ 'Advertised SKU':'SKU-A','Advertised ASIN':'B0A',Spend:'1200','14 Day Total Sales':'4000',Clicks:'80'}]);
const fees=R.normalizePaymentsReport([
  {sku:'SKU-A',asin:'B0A','transaction-type':'Order','amount-description':'Referral Fee',amount:'-1000'},
  {sku:'SKU-A',asin:'B0A','transaction-type':'Refund','amount-description':'Refund',amount:'-200'}
]);
const costs=R.normalizeCostReport([{SKU:'SKU-A',ASIN:'B0A','Unit Cost':'40',Currency:'CNY'}]);
assert.strictEqual(R.detectReportType(Object.keys({'(Child) ASIN':'','Units Ordered':'','Ordered Product Sales':''})),'business-report');
assert.strictEqual(R.detectReportType(Object.keys({'Advertised SKU':'',Spend:'',Sales:'',Clicks:''})),'ads-advertised-product');
assert.strictEqual(ads.attributionWindow,'14d');
const merged=R.mergeAmazonReports({business:sales,ads,payments:fees,costs,marketplace:'US',marketplaceCurrency:'USD',exchangeRates:{'USD/CNY':6.7},period:{start:'2026-08-01',end:'2026-08-31'}});
assert.strictEqual(merged.items.length,1);
const item=merged.items[0];
assert.strictEqual(item.sku,'SKU-A');
assert.strictEqual(item.asin,'B0A');
assert.ok(Math.abs(item.productCost-(4000/6.7))<1e-9);
assert.strictEqual(item.referralFees,1000);
assert.strictEqual(item.returnCost,200);
assert.strictEqual(item.dataCompleteness,'full');
const result=P.calculate(item);
assert.strictEqual(result.acos,30);
assert.strictEqual(result.tacos,12);

const asinOnly=R.mergeAmazonReports({business:R.normalizeBusinessReport([{'Child ASIN':'B1','Units Ordered':'2','Ordered Product Sales':'100'}]),ads:R.normalizeAdsReport([{'Advertised ASIN':'B1',Spend:'10',Sales:'30'}]),marketplace:'US',marketplaceCurrency:'USD',period:{start:'x',end:'y'}});
assert.strictEqual(asinOnly.items.length,1);
assert.strictEqual(asinOnly.items[0].adsComplete,true);

const mismatch=R.mergeAmazonReports({business:R.normalizeBusinessReport([{'Child ASIN':'B2','Units Ordered':'1','Ordered Product Sales':'100'}]),ads:R.normalizeAdsReport([{'Advertised SKU':'S2','Advertised ASIN':'B2',Spend:'30',Sales:'120'}]),period:{start:'x',end:'y'}});
assert.strictEqual(mismatch.items[0].warnings.length,1);
assert.strictEqual(P.calculate(mismatch.items[0]).organicSales,null);

const partial=R.mergeAmazonReports({business:sales,ads,period:{start:'x',end:'y'}}).items[0];
assert.notStrictEqual(partial.dataCompleteness,'full');
assert.strictEqual(P.calculate(partial).netProfit,null);

const periodMismatch=R.mergeAmazonReports({business:sales,ads:R.normalizeAdsReport([{'Advertised ASIN':'B0A',Spend:'1',Sales:'2','Start Date':'2026-09-01','End Date':'2026-09-30'}]),period:{start:'2026-08-01',end:'2026-08-31'}});
assert.ok(periodMismatch.warnings.some(w=>w.includes('周期')));

const largePayments=Array.from({length:100000},(_,i)=>({sku:`SKU-${i%5000}`,'amount-description':'FBA Fee',amount:'-1'}));
const started=Date.now();
const large=R.normalizePaymentsReport(largePayments);
const elapsed=Date.now()-started;
assert.strictEqual(large.items.length,5000);
assert.ok(elapsed<5000,`100,000 payments rows took ${elapsed}ms`);
assert.strictEqual(large.items[0].fbaFees,20);
console.log(`All Amazon report engine tests passed; 100,000 Payments rows normalized in ${elapsed} ms.`);
