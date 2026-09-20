(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SellerProfile = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STORAGE_KEY = 'sellerWorkbench.profile';
  const MARKETPLACES = Object.freeze(['US', 'CA', 'MX', 'UK', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'PL', 'BE', 'AU', 'JP']);
  const MARKETPLACE_SET = new Set(MARKETPLACES);

  function cloneMarketplaces(values) { return Array.isArray(values) ? values.slice() : []; }

  function normalizeProfile(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input.marketplaces : [];
    const marketplaces = [];
    if (Array.isArray(source)) {
      source.forEach(value => {
        const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
        if (MARKETPLACE_SET.has(code) && !marketplaces.includes(code)) marketplaces.push(code);
      });
    }
    return { marketplaces };
  }

  function validateProfile(input) {
    const errors = [];
    const validShape = Boolean(input && typeof input === 'object' && !Array.isArray(input) && Array.isArray(input.marketplaces));
    if (!validShape) errors.push('MARKETPLACES_INVALID');
    const raw = validShape ? input.marketplaces : [];
    raw.forEach(value => {
      const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
      if (!MARKETPLACE_SET.has(code)) errors.push(code === 'GLOBAL' ? 'GLOBAL_NOT_ALLOWED' : code === 'EU' ? 'EU_NOT_ALLOWED' : 'MARKETPLACE_INVALID');
    });
    const normalized = normalizeProfile(input);
    const unchanged = validShape && raw.length === normalized.marketplaces.length && raw.every((value, index) => value === normalized.marketplaces[index]);
    return { valid: validShape && errors.length === 0 && unchanged, repaired: !unchanged || errors.length > 0, errors: [...new Set(errors)], profile: normalized };
  }

  function getDefaultStorage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; }
  }

  function makeResult(profile, overrides) {
    const marketplaces = cloneMarketplaces(profile && profile.marketplaces);
    const base = { marketplaces, configured: marketplaces.length > 0, valid: true, repaired: false, unavailable: false, status: 'valid' };
    return Object.assign(base, overrides || {});
  }

  function create(storage) {
    const target = storage === undefined ? getDefaultStorage() : storage;

    function unavailable() { return makeResult({ marketplaces: [] }, { configured: false, valid: false, unavailable: true, status: 'unavailable' }); }

    function getProfile() {
      if (!target || typeof target.getItem !== 'function') return unavailable();
      let raw;
      try { raw = target.getItem(STORAGE_KEY); } catch (_) { return unavailable(); }
      if (raw == null || raw === '') return makeResult({ marketplaces: [] }, { configured: false });
      let parsed;
      try { parsed = JSON.parse(raw); } catch (_) { return makeResult({ marketplaces: [] }, { configured: false, valid: false, repaired: true, status: 'repaired' }); }
      const check = validateProfile(parsed);
      if (!check.repaired) return makeResult(check.profile);
      try { target.setItem(STORAGE_KEY, JSON.stringify(check.profile)); }
      catch (_) { return makeResult(check.profile, { valid: false, repaired: true, unavailable: true, status: 'unavailable' }); }
      return makeResult(check.profile, { valid: false, repaired: true, status: 'repaired' });
    }

    function saveProfile(input) {
      if (!target || typeof target.setItem !== 'function') return unavailable();
      const check = validateProfile(input);
      try { target.setItem(STORAGE_KEY, JSON.stringify(check.profile)); }
      catch (_) { return makeResult(check.profile, { valid: false, repaired: check.repaired, unavailable: true, status: 'unavailable' }); }
      return makeResult(check.profile, { valid: check.valid, repaired: check.repaired, status: check.repaired ? 'repaired' : 'configured' });
    }

    function clearProfile() {
      if (!target || typeof target.removeItem !== 'function') return unavailable();
      try { target.removeItem(STORAGE_KEY); }
      catch (_) { return makeResult({ marketplaces: [] }, { configured: false, valid: false, unavailable: true, status: 'unavailable' }); }
      return makeResult({ marketplaces: [] }, { configured: false, status: 'valid' });
    }

    return { getProfile, saveProfile, clearProfile, normalizeProfile, validateProfile, STORAGE_KEY, MARKETPLACES: MARKETPLACES.slice() };
  }

  const api = create();
  api.create = create;
  return api;
});
