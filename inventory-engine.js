(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InventoryEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FIELD_ALIASES = Object.freeze({
    sku: ['sku', 'merchant sku', 'merchant-sku', 'seller sku', 'seller-sku'],
    asin: ['asin'],
    productName: ['product-name', 'product name', 'title', 'item-name', 'item name'],
    fbaAvailable: ['available', 'fulfillable-quantity', 'afn-fulfillable-quantity', 'fba available', 'available in fba (units)'],
    fbaInbound: ['inbound-quantity', 'inbound quantity', 'afn-inbound-working-quantity', 'afn-inbound-shipped-quantity', 'afn-inbound-receiving-quantity'],
    daysOfSupply: ['days-of-supply', 'days of supply', 'days of supply (days)'],
    awdAvailable: ['available in awd (units)', 'awd available', 'awd-available']
  });
  const DEFAULT_THRESHOLDS = Object.freeze({ criticalMax: 30, lowMax: 60, healthyMax: 120, highMax: 180 });
  const NUMERIC_FIELDS = new Set(['fbaAvailable', 'fbaInbound', 'awdAvailable']);

  const canonicalHeader = value => String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_]+/g, ' ');
  const cleanText = value => String(value ?? '').replace(/^\uFEFF/, '').trim();

  function detectMapping(headers = [], source, overrides = {}) {
    const normalized = new Map(headers.map(header => [canonicalHeader(header), header]));
    const fields = source === 'awd'
      ? ['sku', 'asin', 'productName', 'awdAvailable', 'fbaAvailable', 'daysOfSupply']
      : ['sku', 'asin', 'productName', 'fbaAvailable', 'fbaInbound', 'daysOfSupply'];
    const mapping = {};
    fields.forEach(field => {
      if (overrides[field] && headers.includes(overrides[field])) { mapping[field] = overrides[field]; return; }
      const alias = FIELD_ALIASES[field].map(canonicalHeader).find(name => normalized.has(name));
      mapping[field] = alias ? normalized.get(alias) : null;
    });
    const required = source === 'awd' ? ['sku', 'awdAvailable'] : ['sku', 'fbaAvailable'];
    return { mapping, missing: required.filter(field => !mapping[field]), headers: [...headers] };
  }

  function safeQuantity(value, field, warnings, rowNumber) {
    if (value === '' || value == null) return 0;
    const number = Number(String(value).replace(/,/g, ''));
    if (!Number.isFinite(number)) {
      warnings.push(`第 ${rowNumber} 行 ${field} 不是有效数字，已按 0 处理。`);
      return 0;
    }
    if (number < 0) {
      warnings.push(`第 ${rowNumber} 行 ${field} 小于 0，已按 0 处理。`);
      return 0;
    }
    return number;
  }

  function safeDays(value, warnings, rowNumber) {
    if (value === '' || value == null) return null;
    const number = Number(String(value).replace(/,/g, ''));
    if (!Number.isFinite(number)) { warnings.push(`第 ${rowNumber} 行 Days of Supply 无效，已标记 Unknown。`); return null; }
    if (number < 0) { warnings.push(`第 ${rowNumber} 行 Days of Supply 小于 0，已标记 Unknown。`); return null; }
    return number;
  }

  function mergeRecord(target, incoming, source) {
    if (source === 'awd') target.awdAvailable += incoming.awdAvailable;
    if (source === 'fba') {
      target.fbaAvailable += incoming.fbaAvailable;
      target.fbaInbound += incoming.fbaInbound;
    }
    if (!target.asin && incoming.asin) target.asin = incoming.asin;
    if (!target.productName && incoming.productName) target.productName = incoming.productName;
    const values = [target.daysOfSupply, incoming.daysOfSupply].filter(Number.isFinite);
    target.daysOfSupply = values.length ? Math.max(...values) : null;
    target.source[source] = true;
    target.duplicateCount += 1;
  }

  function normalizeRows(rows = [], source, mappingOverride = {}) {
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const detected = detectMapping(headers, source, mappingOverride);
    if (detected.missing.length) return { items: [], headers, mapping: detected.mapping, missing: detected.missing, warnings: [], duplicateSkus: 0 };
    const warnings = [];
    const grouped = new Map();
    let anonymousIndex = 0;
    rows.forEach((row, index) => {
      const get = field => detected.mapping[field] ? row[detected.mapping[field]] : null;
      const sku = cleanText(get('sku'));
      const asin = cleanText(get('asin'));
      const key = sku ? `sku:${sku}` : asin ? `asin:${asin}` : `unmatched:${source}:${anonymousIndex++}`;
      const item = {
        sku, asin, productName: cleanText(get('productName')),
        awdAvailable: source === 'awd' ? safeQuantity(get('awdAvailable'), 'AWD Available', warnings, index + 2) : 0,
        fbaAvailable: source === 'fba' ? safeQuantity(get('fbaAvailable'), 'FBA Available', warnings, index + 2) : 0,
        fbaInbound: source === 'fba' ? safeQuantity(get('fbaInbound'), 'FBA Inbound', warnings, index + 2) : 0,
        daysOfSupply: safeDays(get('daysOfSupply'), warnings, index + 2), source: { awd: source === 'awd', fba: source === 'fba' }, duplicateCount: 0,
        mergeConfidence: sku ? 'sku' : asin ? 'asin' : 'unmatched'
      };
      if (grouped.has(key)) mergeRecord(grouped.get(key), item, source);
      else grouped.set(key, item);
    });
    const items = [...grouped.values()];
    const duplicateSkus = items.reduce((sum, item) => sum + item.duplicateCount, 0);
    return { items, headers, mapping: detected.mapping, missing: [], warnings, duplicateSkus };
  }

  function statusForDays(days, thresholds = DEFAULT_THRESHOLDS) {
    if (!Number.isFinite(days)) return 'unknown';
    if (days <= thresholds.criticalMax) return 'critical';
    if (days <= thresholds.lowMax) return 'low';
    if (days <= thresholds.healthyMax) return 'healthy';
    if (days <= thresholds.highMax) return 'high';
    return 'overstock';
  }

  function mergeSources(awdItems, fbaItems) {
    const merged = new Map();
    const asinKeys = new Map();
    let unmatched = 0;
    const add = item => {
      const skuKey = item.sku ? `sku:${item.sku}` : null;
      const asinKey = item.asin ? `asin:${item.asin}` : null;
      const asinMatchKey = asinKey ? asinKeys.get(asinKey) : null;
      const asinMatch = asinMatchKey ? merged.get(asinMatchKey) : null;
      let key;
      if (skuKey && merged.has(skuKey)) key = skuKey;
      else if (!skuKey && asinMatchKey) key = asinMatchKey;
      else if (skuKey && asinMatchKey && !asinMatch?.sku) key = asinMatchKey;
      else key = skuKey || asinKey || `unmatched:${unmatched++}`;
      if (merged.has(key)) {
        const target = merged.get(key);
        target.awdAvailable += item.awdAvailable;
        target.fbaAvailable += item.fbaAvailable;
        target.fbaInbound += item.fbaInbound;
        target.source.awd ||= item.source.awd; target.source.fba ||= item.source.fba;
        target.duplicateCount += item.duplicateCount;
        if (!target.sku && item.sku) target.sku = item.sku;
        if (!target.asin && item.asin) target.asin = item.asin;
        if (!target.productName && item.productName) target.productName = item.productName;
        const values = [target.daysOfSupply, item.daysOfSupply].filter(Number.isFinite);
        target.daysOfSupply = values.length ? Math.max(...values) : null;
        if (!skuKey && asinKey) target.mergeConfidence = 'asin';
      } else merged.set(key, { ...item, source: { ...item.source } });
      if (asinKey) asinKeys.set(asinKey, key);
    };
    awdItems.forEach(add); fbaItems.forEach(add);
    return [...merged.values()];
  }

  function analyze({ awdRows = [], fbaRows = [], mappings = {}, thresholds = DEFAULT_THRESHOLDS } = {}) {
    const awd = normalizeRows(awdRows, 'awd', mappings.awd);
    const fba = normalizeRows(fbaRows, 'fba', mappings.fba);
    const missingFields = { awd: awd.missing, fba: fba.missing };
    if ((awdRows.length && awd.missing.length) || (fbaRows.length && fba.missing.length)) {
      return { ok: false, missingFields, detected: { awd, fba }, items: [], quality: null };
    }
    const items = mergeSources(awd.items, fba.items).map((item, index) => {
      const totalAvailable = item.awdAvailable + item.fbaAvailable;
      const totalStockIncludingInbound = totalAvailable + item.fbaInbound;
      const inventoryStatus = statusForDays(item.daysOfSupply, thresholds);
      const sourceMode = item.source.awd && item.source.fba ? 'FBA + AWD' : item.source.fba ? 'FBA Only' : 'AWD Only';
      return { ...item, productId: item.sku || item.asin || `unmatched-${index + 1}`, totalAvailable, totalStockIncludingInbound, inventoryStatus, sourceMode };
    });
    const hasAwd = awdRows.length > 0, hasFba = fbaRows.length > 0;
    const summary = {
      totalSkus: items.length,
      awdAvailable: hasAwd ? items.reduce((s, i) => s + i.awdAvailable, 0) : null,
      fbaAvailable: hasFba ? items.reduce((s, i) => s + i.fbaAvailable, 0) : null,
      fbaInbound: hasFba ? items.reduce((s, i) => s + i.fbaInbound, 0) : null,
      combinedAvailable: items.reduce((s, i) => s + i.totalAvailable, 0),
      totalStock: items.reduce((s, i) => s + i.totalStockIncludingInbound, 0)
    };
    const riskCounts = ['critical', 'low', 'healthy', 'high', 'overstock', 'unknown'].reduce((acc, key) => ({ ...acc, [key]: items.filter(i => i.inventoryStatus === key).length }), {});
    const quality = {
      processed: items.length, duplicateSkus: awd.duplicateSkus + fba.duplicateSkus,
      missingAsin: items.filter(i => !i.asin).length, missingProductName: items.filter(i => !i.productName).length,
      missingDaysOfSupply: items.filter(i => i.daysOfSupply == null).length,
      awdOnly: items.filter(i => i.sourceMode === 'AWD Only').length,
      fbaOnly: items.filter(i => i.sourceMode === 'FBA Only').length,
      warnings: [...awd.warnings, ...fba.warnings]
    };
    return { ok: true, items, summary, riskCounts, quality, sourceMode: hasAwd && hasFba ? 'FBA + AWD' : hasFba ? 'FBA Only' : 'AWD Only', mappings: { awd: awd.mapping, fba: fba.mapping }, missingFields };
  }

  function filterAndSort(items, filters = {}, sort = {}) {
    const query = String(filters.query || '').trim().toLowerCase();
    const filtered = items.filter(item => (!query || [item.sku, item.asin, item.productName].some(v => String(v || '').toLowerCase().includes(query)))
      && (!filters.status || filters.status === 'all' || item.inventoryStatus === filters.status)
      && (!filters.source || filters.source === 'all' || item.sourceMode === filters.source));
    const allowed = new Set(['awdAvailable', 'fbaAvailable', 'fbaInbound', 'totalAvailable', 'totalStockIncludingInbound', 'daysOfSupply']);
    if (!allowed.has(sort.key)) return filtered;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; if (bv == null) return -1;
      return (av - bv) * direction;
    });
  }

  return Object.freeze({ FIELD_ALIASES, DEFAULT_THRESHOLDS, detectMapping, normalizeRows, statusForDays, analyze, filterAndSort });
});
