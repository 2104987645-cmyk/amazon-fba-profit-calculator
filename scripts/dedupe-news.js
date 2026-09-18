'use strict';

const { normalizeTitle, normalizeUrl } = require('./normalize-amazon-news');

function mergeCandidates(existing, incoming) {
  const result = existing.slice();
  const byUrl = new Map(); const byExternal = new Map(); const byFingerprint = new Map(); const byTitle = new Map();
  result.forEach(item => {
    byUrl.set(normalizeUrl(item.officialUrl), item);
    if (item.externalId) byExternal.set(`${item.source.id}|${item.externalId}`, item);
    if (item.fingerprint) byFingerprint.set(item.fingerprint, item);
    const title = normalizeTitle(item.title); if (title) byTitle.set(title, item);
  });
  let added = 0; let exactDuplicates = 0; let possibleDuplicates = 0;
  incoming.forEach(item => {
    const exact = byUrl.get(normalizeUrl(item.officialUrl)) ||
      (item.externalId && byExternal.get(`${item.source.id}|${item.externalId}`)) || byFingerprint.get(item.fingerprint);
    if (exact) { exactDuplicates += 1; return; }
    const similar = byTitle.get(normalizeTitle(item.title));
    if (similar) { item.possibleDuplicateOf = similar.id; possibleDuplicates += 1; }
    result.push(item); added += 1;
    byUrl.set(normalizeUrl(item.officialUrl), item);
    if (item.externalId) byExternal.set(`${item.source.id}|${item.externalId}`, item);
    byFingerprint.set(item.fingerprint, item); byTitle.set(normalizeTitle(item.title), item);
  });
  return { candidates: result, added, exactDuplicates, possibleDuplicates };
}

module.exports = { mergeCandidates };
