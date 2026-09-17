(function (root, factory) {
  const api = factory(root.MarketplaceConfig);
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketplace-config.js'));
  root.ExchangeRateService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (marketplaceConfig) {
  'use strict';

  const CACHE_KEY = 'amazonSellerWorkbench.fxRates.v1';
  const TTL_MS = 6 * 60 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 5000;
  const API_BASE_URL = 'https://api.frankfurter.dev/v2/rate';
  const SUPPORTED_CURRENCIES = new Set(['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'JPY', 'CNY']);

  function createService(options = {}) {
    const config = options.config || marketplaceConfig;
    const storage = options.storage !== undefined ? options.storage : getStorage();
    const fetchImpl = options.fetchImpl !== undefined ? options.fetchImpl : getFetch();
    const now = options.now || (() => Date.now());
    const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
    const inFlight = new Map();

    function getStorage() {
      try { return typeof localStorage !== 'undefined' ? localStorage : null; }
      catch (_) { return null; }
    }
    function getFetch() { return typeof fetch === 'function' ? fetch.bind(globalThis) : null; }
    function normalizeCurrency(currency) {
      const value = String(currency || '').toUpperCase();
      if (!SUPPORTED_CURRENCIES.has(value)) throw new Error(`Unsupported currency: ${value || 'empty'}`);
      return value;
    }
    function readCacheMap() {
      if (!storage) return {};
      try {
        const parsed = JSON.parse(storage.getItem(CACHE_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_) { return {}; }
    }
    function writeCacheMap(cache) {
      if (!storage) return;
      try { storage.setItem(CACHE_KEY, JSON.stringify(cache)); }
      catch (_) { /* The fetched rate remains usable when storage is unavailable. */ }
    }
    function normalizeResult(currency, data, overrides = {}) {
      return {
        currency, quote: 'CNY', rate: Number(data.rate), source: data.source || 'Frankfurter',
        sourceType: overrides.sourceType || 'api', rateDate: data.rateDate || data.date || null,
        fetchedAt: data.fetchedAt || new Date(now()).toISOString(),
        fromCache: Boolean(overrides.fromCache), isFallback: Boolean(overrides.isFallback),
        ...(overrides.error ? { error: overrides.error } : {})
      };
    }
    function getCachedRate(currency) {
      let code;
      try { code = normalizeCurrency(currency); } catch (_) { return null; }
      if (code === 'CNY') return normalizeResult(code, { rate: 1, source: 'Identity' }, { sourceType: 'identity' });
      const cached = readCacheMap()[code];
      const rate = Number(cached?.rate);
      if (!Number.isFinite(rate) || rate <= 0) return null;
      return normalizeResult(code, cached, { fromCache: true, sourceType: 'api' });
    }
    function fallbackRate(currency, error) {
      const rate = Number(config?.getDefaultExchangeRate?.(currency));
      if (!Number.isFinite(rate) || rate <= 0) throw new Error(`No valid fallback rate for ${currency}`);
      return normalizeResult(currency, { rate, source: 'Fallback' }, {
        sourceType: 'fallback', isFallback: true, error: error?.message || String(error || '')
      });
    }
    async function requestRate(currency) {
      if (!fetchImpl) throw new Error('Fetch is unavailable');
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const response = await fetchImpl(`${API_BASE_URL}/${currency.toLowerCase()}/cny`, controller ? { signal: controller.signal } : {});
        if (!response?.ok) throw new Error(`HTTP ${response?.status || 'error'}`);
        let payload;
        try { payload = await response.json(); } catch (_) { throw new Error('Invalid JSON response'); }
        const rate = Number(payload?.rate);
        if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid exchange rate');
        const result = normalizeResult(currency, { rate, source: 'Frankfurter', rateDate: payload.date, fetchedAt: new Date(now()).toISOString() });
        const cache = readCacheMap();
        cache[currency] = { rate: result.rate, rateDate: result.rateDate, fetchedAt: result.fetchedAt, source: result.source };
        writeCacheMap(cache);
        return result;
      } finally { if (timer) clearTimeout(timer); }
    }
    async function refreshRate(currency) {
      const code = normalizeCurrency(currency);
      if (code === 'CNY') return normalizeResult(code, { rate: 1, source: 'Identity' }, { sourceType: 'identity' });
      if (inFlight.has(code)) return inFlight.get(code);
      const request = requestRate(code).catch(error => {
        console.warn(`[FX] ${code}/CNY update failed; using a safe existing value.`, error?.message || error);
        const cached = getCachedRate(code);
        return cached ? { ...cached, error: error?.message || String(error) } : fallbackRate(code, error);
      }).finally(() => inFlight.delete(code));
      inFlight.set(code, request);
      return request;
    }
    async function getLatestRate(currency) {
      const code = normalizeCurrency(currency);
      if (code === 'CNY') return refreshRate(code);
      const cached = getCachedRate(code);
      if (cached) {
        const age = now() - Date.parse(cached.fetchedAt || 0);
        if (Number.isFinite(age) && age > TTL_MS) refreshRate(code).catch(() => {});
        return cached;
      }
      return refreshRate(code);
    }
    function clearCache(currency) {
      if (!storage) return;
      if (!currency) { try { storage.removeItem(CACHE_KEY); } catch (_) {} return; }
      const code = normalizeCurrency(currency);
      const cache = readCacheMap(); delete cache[code]; writeCacheMap(cache);
    }
    return { getLatestRate, refreshRate, getCachedRate, clearCache };
  }

  const service = createService();
  return Object.freeze({ CACHE_KEY, TTL_MS, REQUEST_TIMEOUT_MS, API_BASE_URL, createService,
    getLatestRate: service.getLatestRate, refreshRate: service.refreshRate,
    getCachedRate: service.getCachedRate, clearCache: service.clearCache });
});
