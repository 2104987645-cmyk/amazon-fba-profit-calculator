'use strict';

const crypto = require('node:crypto');

const MARKET_RULES = [
  ['UK', /\b(?:uk|united kingdom|britain|british)\b/i], ['US', /\b(?:us|usa|united states)\b/i],
  ['DE', /\b(?:germany|german|deutschland)\b/i], ['FR', /\b(?:france|french)\b/i],
  ['IT', /\b(?:italy|italian)\b/i], ['ES', /\b(?:spain|spanish)\b/i],
  ['CA', /\b(?:canada|canadian)\b/i], ['AU', /\b(?:australia|australian)\b/i],
  ['JP', /\b(?:japan|japanese)\b/i], ['EU', /\b(?:eu|europe|european union)\b/i]
];

const CATEGORY_RULES = [
  ['fees', /\b(?:fee|fees|pricing|commission|surcharge)\b/i],
  ['fba', /\b(?:fba|fulfilment by amazon|fulfillment by amazon)\b/i],
  ['advertising', /\b(?:advertis|sponsored|campaign|acos|amazon ads)\b/i],
  ['compliance', /\b(?:compliance|regulation|tax|vat|safety|policy)\b/i],
  ['listing', /\b(?:listing|catalog|detail page|product title)\b/i],
  ['brand', /\b(?:brand registry|brand protection|counterfeit)\b/i],
  ['account-health', /\b(?:account health|deactivation|suspension)\b/i],
  ['promotion', /\b(?:promotion|coupon|deal|discount)\b/i],
  ['developer', /\b(?:api|developer|integration)\b/i]
];

function normalizeTitle(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/&(?:amp|nbsp|quot|#39);/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function fingerprintFor(item) {
  return crypto.createHash('sha256').update([
    item.source && item.source.id || '', normalizeTitle(item.title), item.publishedAt || ''
  ].join('|')).digest('hex');
}

function inferMarketplaces(text) {
  const found = MARKET_RULES.filter(([, rule]) => rule.test(text || '')).map(([market]) => market);
  return found.length ? [...new Set(found)] : ['Global'];
}

function inferCategory(text) {
  const match = CATEGORY_RULES.find(([, rule]) => rule.test(text || ''));
  return match ? match[0] : 'general';
}

function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = '';
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref'].forEach(key => url.searchParams.delete(key));
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

function normalizeCandidate(raw, now) {
  const discoveredAt = raw.discoveredAt || now || new Date().toISOString();
  const officialUrl = normalizeUrl(raw.officialUrl);
  const pathname = new URL(officialUrl).pathname;
  const externalId = raw.externalId || pathname.split('/').filter(Boolean).pop() || '';
  const source = { id: raw.source.id, name: raw.source.name, type: raw.source.type, url: raw.source.url };
  const text = [raw.title, raw.summary].filter(Boolean).join(' ');
  const base = {
    id: raw.id || `${source.id}-${externalId}`,
    source, externalId, officialUrl,
    title: String(raw.title || '').trim(),
    summary: String(raw.summary || '').trim(),
    publishedAt: raw.publishedAt || null,
    discoveredAt,
    lastCheckedAt: raw.lastCheckedAt || discoveredAt,
    marketplaces: raw.marketplaces || inferMarketplaces(text),
    category: raw.category || inferCategory(text),
    importance: raw.importance == null ? null : raw.importance,
    affectedModules: Array.isArray(raw.affectedModules) ? raw.affectedModules : [],
    actionRequired: raw.actionRequired === true,
    actionText: raw.actionText || '',
    actionType: raw.actionType || null,
    effectiveAt: raw.effectiveAt || null,
    reviewStatus: raw.reviewStatus || 'pending',
    duplicateOf: raw.duplicateOf || null,
    possibleDuplicateOf: raw.possibleDuplicateOf || null
  };
  base.fingerprint = raw.fingerprint || fingerprintFor(base);
  return base;
}

module.exports = { normalizeTitle, fingerprintFor, inferMarketplaces, inferCategory, normalizeUrl, normalizeCandidate };
