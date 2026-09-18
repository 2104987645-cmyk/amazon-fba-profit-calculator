(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ProfitabilityEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FIELD_ALIASES = Object.freeze({
    sku: ['sku', 'merchant sku', 'seller-sku', 'seller sku'], asin: ['asin'],
    productName: ['productName', 'product-name', 'product name', 'title'], marketplace: ['marketplace', 'market', '站点'],
    unitsSold: ['unitsSold', 'units', 'units sold', 'units-sold', 'quantity'],
    totalSales: ['totalSales', 'total-sales', 'total sales', 'sales', 'revenue', 'ordered-product-sales'],
    adSales: ['adSales', 'ad-sales', 'ad sales', 'advertising-sales', 'sales-7d', 'sales-14d'],
    adSpend: ['adSpend', 'ad-spend', 'ad spend', 'spend', 'cost'],
    productCost: ['productCost', 'product-cost', 'product cost', 'cogs'], fbaFees: ['fbaFees', 'fba-fees', 'fba fees', 'fulfillment-fees'],
    referralFees: ['referralFees', 'referral-fees', 'referral fees', 'selling-fees'], storageFees: ['storageFees', 'storage-fees', 'storage fees'],
    returnCost: ['returnCost', 'return-cost', 'return cost'], otherCosts: ['otherCosts', 'other-costs', 'other costs']
  });
  const MONEY_FIELDS = ['totalSales', 'adSales', 'adSpend', 'productCost', 'fbaFees', 'referralFees', 'storageFees', 'returnCost', 'otherCosts'];
  const COST_FIELDS = ['productCost', 'fbaFees', 'referralFees', 'storageFees', 'returnCost', 'otherCosts'];
  const REQUIRED_FIELDS = ['sku', 'totalSales'];
  const DEFAULT_THRESHOLDS = Object.freeze({ healthyRatio: 0.75, highTacos: 20, lowMargin: 10, feeBurden: 25, returnLeak: 5 });
  const canonical = v => String(v ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_]+/g, ' ');
  const text = v => String(v ?? '').replace(/^\uFEFF/, '').trim();

  function detectMapping(headers = [], overrides = {}) {
    const index = new Map(headers.map(h => [canonical(h), h]));
    const mapping = {};
    Object.keys(FIELD_ALIASES).forEach(field => {
      if (overrides[field] && headers.includes(overrides[field])) mapping[field] = overrides[field];
      else mapping[field] = FIELD_ALIASES[field].map(canonical).map(a => index.get(a)).find(Boolean) || null;
    });
    return { mapping, missing: REQUIRED_FIELDS.filter(f => !mapping[f]), headers: [...headers] };
  }

  function parseNumber(raw, field, rowNumber, warnings, options) {
    if (raw === '' || raw == null) return null;
    const value = Number(String(raw).replace(/[$£€¥,\s]/g, ''));
    if (!Number.isFinite(value)) { warnings.push(`第 ${rowNumber} 行 ${field} 不是有效数字，已按缺失处理。`); return null; }
    if (value >= 0) return value;
    if (field === 'totalSales' || field === 'adSales' || field === 'adSpend' || field === 'unitsSold') {
      warnings.push(`第 ${rowNumber} 行 ${field} 为负值，不符合本模块口径，已按缺失处理。`); return null;
    }
    warnings.push(`第 ${rowNumber} 行 ${field} 为负值，已按${options.costMode === 'signed' ? '有符号值' : '正向成本'}口径处理。`);
    return options.costMode === 'signed' ? value : Math.abs(value);
  }

  function addNullable(a, b) { return a == null && b == null ? null : (a || 0) + (b || 0); }
  function calculate(input, thresholds = DEFAULT_THRESHOLDS) {
    const totalSales = input.totalSales;
    const adSales = input.adSales;
    const adSpend = input.adSpend;
    const costs = COST_FIELDS.reduce((sum, f) => sum + (input[f] || 0), 0);
    const amazonFees = (input.fbaFees || 0) + (input.referralFees || 0) + (input.storageFees || 0);
    const canProfit = totalSales != null;
    const organicSales = totalSales == null || adSales == null ? null : Math.max(0, totalSales - adSales);
    const profitBeforeAds = canProfit ? totalSales - costs : null;
    const netProfit = canProfit ? profitBeforeAds - (adSpend || 0) : null;
    const grossProfit = canProfit ? totalSales - (input.productCost || 0) : null;
    const grossMargin = totalSales > 0 ? grossProfit / totalSales * 100 : null;
    const netMargin = totalSales > 0 ? netProfit / totalSales * 100 : null;
    const acos = adSales > 0 && adSpend != null ? adSpend / adSales * 100 : null;
    const tacos = totalSales > 0 && adSpend != null ? adSpend / totalSales * 100 : null;
    const breakEvenAdSpend = profitBeforeAds == null ? null : Math.max(0, profitBeforeAds);
    const breakEvenAcos = adSales > 0 && breakEvenAdSpend != null ? breakEvenAdSpend / adSales * 100 : null;
    const preAdContributionMarginRate = totalSales > 0 && profitBeforeAds != null ? profitBeforeAds / totalSales : null;
    const adRevenueContribution = adSales != null && preAdContributionMarginRate != null ? adSales * preAdContributionMarginRate : null;
    const adProfit = adRevenueContribution != null && adSpend != null ? adRevenueContribution - adSpend : null;
    const adProfitMargin = adSales > 0 && adProfit != null ? adProfit / adSales * 100 : null;
    const organicSalesShare = totalSales > 0 && organicSales != null ? organicSales / totalSales * 100 : null;
    const adSalesShare = totalSales > 0 && adSales != null ? adSales / totalSales * 100 : null;
    const profitabilityStatus = netProfit == null ? 'unknown' : netProfit < 0 ? 'loss' : netMargin >= 20 ? 'strong' : netMargin >= 10 ? 'healthy' : 'low';
    const advertisingHealth = adSpend === 0 ? 'no-ads' : acos == null || breakEvenAcos == null ? 'no-data' : acos <= breakEvenAcos * thresholds.healthyRatio ? 'healthy' : acos <= breakEvenAcos ? 'warning' : 'critical';
    const leaks = [];
    const advertisingLeak = acos != null && breakEvenAcos != null && acos > breakEvenAcos ? Math.max(0, adSpend - adSales * breakEvenAcos / 100) : 0;
    if (advertisingLeak > 0) leaks.push({ type: 'advertising', label: '广告超支', amount: advertisingLeak, level: 'high' });
    const negativeLoss = netProfit != null && netProfit < 0 ? Math.abs(netProfit) : 0;
    if (negativeLoss > 0) leaks.push({ type: 'negative-margin', label: 'SKU当前亏损', amount: negativeLoss, level: 'critical' });
    if (tacos != null && tacos > thresholds.highTacos) leaks.push({ type: 'high-tacos', label: '广告依赖较高', amount: null, level: 'medium' });
    if (netMargin != null && netMargin >= 0 && netMargin < thresholds.lowMargin) leaks.push({ type: 'low-margin', label: '利润缓冲较低', amount: null, level: 'medium' });
    if (totalSales > 0 && amazonFees / totalSales * 100 > thresholds.feeBurden) leaks.push({ type: 'fee-burden', label: '平台费用占比较高', amount: null, level: 'low' });
    if (totalSales > 0 && input.returnCost != null && input.returnCost / totalSales * 100 > thresholds.returnLeak) leaks.push({ type: 'return', label: '退货成本偏高', amount: null, level: 'low' });
    const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
    const profitLeakPriority = leaks.reduce((best, leak) => priorityRank[leak.level] > priorityRank[best] ? leak.level : best, 'low');
    const profitLeakAmount = advertisingLeak + negativeLoss;
    const adsPresent = input.adSales != null || input.adSpend != null;
    const costsComplete = ['productCost', 'fbaFees', 'referralFees', 'returnCost'].every(f => input[f] != null);
    const dataCompleteness = !adsPresent ? 'sales-only' : totalSales == null ? 'ads-only' : costsComplete ? 'complete' : 'partial';
    return { ...input, organicSales, operatingCost: costs, amazonFees, grossProfit, contributionProfit: profitBeforeAds, profitBeforeAds, netProfit, grossMargin, netMargin, acos, tacos, breakEvenAdSpend, breakEvenAcos, preAdContributionMarginRate, adRevenueContribution, adProfit, adProfitMargin, organicSalesShare, adSalesShare, profitabilityStatus, advertisingHealth, leaks, advertisingLeak, negativeMarginLoss: negativeLoss, profitLeakAmount, profitLeakPriority: leaks.length ? profitLeakPriority : 'none', dataCompleteness };
  }

  function analyze({ rows = [], mapping: overrides = {}, costMode = 'positive', thresholds = DEFAULT_THRESHOLDS } = {}) {
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const detected = detectMapping(headers, overrides);
    if (detected.missing.length) return { ok: false, items: [], detected, quality: null };
    const warnings = [], grouped = new Map();
    rows.forEach((row, index) => {
      const get = field => detected.mapping[field] ? row[detected.mapping[field]] : null;
      const sku = text(get('sku'));
      if (!sku) { warnings.push(`第 ${index + 2} 行缺少 SKU，未导入。`); return; }
      const parsed = { sku, asin: text(get('asin')), productName: text(get('productName')), marketplace: text(get('marketplace')) };
      ['unitsSold', ...MONEY_FIELDS].forEach(field => parsed[field] = parseNumber(get(field), field, index + 2, warnings, { costMode }));
      if (!grouped.has(sku)) grouped.set(sku, { ...parsed, duplicateCount: 0 });
      else {
        const target = grouped.get(sku);
        ['unitsSold', ...MONEY_FIELDS].forEach(field => target[field] = addNullable(target[field], parsed[field]));
        if (!target.asin) target.asin = parsed.asin; if (!target.productName) target.productName = parsed.productName; if (!target.marketplace) target.marketplace = parsed.marketplace;
        target.duplicateCount += 1;
      }
    });
    const items = [...grouped.values()].map(item => calculate(item, { ...DEFAULT_THRESHOLDS, ...thresholds }));
    const sum = field => items.reduce((s, i) => s + (i[field] || 0), 0);
    const totalRevenue = sum('totalSales'), totalAdSales = sum('adSales'), totalAdSpend = sum('adSpend'), netProfit = sum('netProfit');
    const summary = { totalRevenue, totalAdSales, organicSales: Math.max(0, totalRevenue - totalAdSales), totalAdSpend, netProfit,
      netMargin: totalRevenue > 0 ? netProfit / totalRevenue * 100 : null,
      acos: totalAdSales > 0 ? totalAdSpend / totalAdSales * 100 : null,
      tacos: totalRevenue > 0 ? totalAdSpend / totalRevenue * 100 : null,
      profitableSkus: items.filter(i => i.netProfit != null && i.netProfit >= 0).length,
      lossMakingSkus: items.filter(i => i.netProfit != null && i.netProfit < 0).length };
    const leakOverview = { totalIdentifiedLeak: sum('profitLeakAmount'), advertisingLeak: sum('advertisingLeak'), negativeMarginLoss: sum('negativeMarginLoss'), affectedSkus: items.filter(i => i.leaks.length).length };
    const health = ['healthy', 'warning', 'critical', 'no-ads', 'no-data'].reduce((a, key) => ({ ...a, [key]: items.filter(i => i.advertisingHealth === key).length }), {});
    const quality = { rowsImported: rows.length, skusProcessed: items.length, missingAdSales: items.filter(i => i.adSales == null).length, missingAdSpend: items.filter(i => i.adSpend == null).length, missingProductCost: items.filter(i => i.productCost == null).length, missingAmazonFees: items.filter(i => i.fbaFees == null || i.referralFees == null).length, duplicateSkusMerged: items.reduce((s, i) => s + i.duplicateCount, 0), warnings };
    return { ok: true, items, summary, leakOverview, health, quality, mapping: detected.mapping };
  }

  function filterAndSort(items, filters = {}, sort = {}) {
    const q = text(filters.query).toLowerCase();
    const result = items.filter(i => (!q || [i.sku, i.asin, i.productName].some(v => text(v).toLowerCase().includes(q))) && (!filters.marketplace || filters.marketplace === 'all' || i.marketplace === filters.marketplace) && (!filters.profitability || filters.profitability === 'all' || i.profitabilityStatus === filters.profitability) && (!filters.health || filters.health === 'all' || i.advertisingHealth === filters.health) && (!filters.leak || filters.leak === 'all' || i.leaks.some(l => l.type === filters.leak)));
    const allowed = new Set(['totalSales', 'adSpend', 'acos', 'tacos', 'netProfit', 'netMargin', 'breakEvenAcos']);
    if (!allowed.has(sort.key)) return result;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...result].sort((a, b) => (a[sort.key] == null ? Infinity : a[sort.key]) === (b[sort.key] == null ? Infinity : b[sort.key]) ? 0 : ((a[sort.key] == null ? Infinity : a[sort.key]) - (b[sort.key] == null ? Infinity : b[sort.key])) * direction);
  }

  return Object.freeze({ FIELD_ALIASES, DEFAULT_THRESHOLDS, detectMapping, calculate, analyze, filterAndSort });
});
