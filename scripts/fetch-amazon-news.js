'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sources = require('./news-sources');
const { normalizeCandidate } = require('./normalize-amazon-news');
const { mergeCandidates } = require('./dedupe-news');

const USER_AGENT = 'AmazonSellerWorkbench-NewsMonitor/1.0 (+https://github.com/2104987645-cmyk/amazon-fba-profit-calculator)';
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';

function decodeHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function parseDate(context) {
  const iso = context.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso && Number.isFinite(Date.parse(iso[1]))) return iso[1];
  const named = context.match(new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2},?\\s+20\\d{2}\\b`, 'i'));
  if (!named) return null;
  const parsed = new Date(named[0]);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function extractLinks(html, source) {
  const found = []; const seen = new Set();
  const anchor = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(html))) {
    let url;
    try { url = new URL(match[1], source.url); } catch (_) { continue; }
    if (url.hostname.toLowerCase() !== source.allowedHost || !source.linkPattern.test(url.pathname)) continue;
    const title = decodeHtml(match[2]);
    if (title.length < 12 || title.length > 240 || /^(learn more|read more|view all)$/i.test(title)) continue;
    const cleanUrl = url.origin + url.pathname.replace(/\/+$/, '');
    if (seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);
    const context = decodeHtml(html.slice(Math.max(0, match.index - 500), Math.min(html.length, anchor.lastIndex + 500)));
    const publishedAt = parseDate(context);
    if (source.requireDate && !publishedAt) continue;
    found.push({
      source: { id: source.id, name: source.name, type: source.sourceType, url: source.url },
      officialUrl: cleanUrl, externalId: url.pathname.split('/').filter(Boolean).pop(), title,
      summary: '', publishedAt
    });
    if (found.length >= 40) break;
  }
  return found;
}

async function fetchSource(source, fetchImpl, timeoutMs) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(source.url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const items = extractLinks(html, source);
    if (!items.length) throw new Error('页面未发现符合规则的官方内容链接');
    return items;
  } finally { clearTimeout(timer); }
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

async function run(options = {}) {
  const root = options.root || path.resolve(__dirname, '..');
  const candidateFile = options.candidateFile || path.join(root, 'data', 'incoming-news.json');
  const stateFile = options.stateFile || path.join(root, 'data', 'news-source-state.json');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const clock = options.clock || (() => new Date());
  const configuredSources = options.sources || sources;
  const timeoutMs = options.timeoutMs || 15000;
  const existing = readJson(candidateFile, []); const priorState = readJson(stateFile, {});
  if (!Array.isArray(existing)) throw new Error('候选池必须是 JSON 数组');
  const now = clock().toISOString(); const discovered = []; const results = []; const failures = [];

  for (const source of configuredSources) {
    try {
      const rawItems = await fetchSource(source, fetchImpl, timeoutMs);
      discovered.push(...rawItems.map(item => normalizeCandidate(Object.assign(item, { discoveredAt: now, lastCheckedAt: now }), now)));
      results.push({ source: source.id, ok: true, found: rawItems.length });
    } catch (error) {
      failures.push({ source: source.id, error: error && error.message || String(error) });
      results.push({ source: source.id, ok: false, found: 0, error: error && error.message || String(error) });
    }
  }
  if (!results.some(item => item.ok)) throw new Error('所有官方来源均抓取失败；候选池与来源状态未修改');

  const merged = mergeCandidates(existing, discovered);
  const nextState = Object.assign({}, priorState);
  results.forEach(result => {
    const previous = priorState[result.source] || {};
    if (result.ok) {
      const meaningfulSuccess = merged.added > 0 || previous.failureCount > 0 || !previous.lastSuccessAt;
      nextState[result.source] = {
        lastSuccessAt: meaningfulSuccess ? now : previous.lastSuccessAt,
        lastFailureAt: previous.lastFailureAt || null, failureCount: 0, lastError: null
      };
    } else {
      nextState[result.source] = {
        lastSuccessAt: previous.lastSuccessAt || null, lastFailureAt: now,
        failureCount: Number(previous.failureCount || 0) + 1, lastError: result.error
      };
    }
  });
  if (JSON.stringify(merged.candidates) !== JSON.stringify(existing)) atomicWrite(candidateFile, merged.candidates);
  if (JSON.stringify(nextState) !== JSON.stringify(priorState)) atomicWrite(stateFile, nextState);
  return { checkedAt: now, sources: results, totalDiscovered: discovered.length, totalCandidates: merged.candidates.length, added: merged.added, exactDuplicates: merged.exactDuplicates, possibleDuplicates: merged.possibleDuplicates, failures: failures.length };
}

if (require.main === module) {
  run().then(summary => console.log(JSON.stringify(summary, null, 2))).catch(error => { console.error('[auto-news]', error.message); process.exitCode = 1; });
}

module.exports = { USER_AGENT, decodeHtml, parseDate, extractLinks, fetchSource, readJson, atomicWrite, run };
