(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NewsActionState = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const STORAGE_KEY = 'sellerWorkbench.newsStatus';

  function safeStorage(storage) {
    if (storage) return storage;
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; }
  }

  function read(storage) {
    const target = safeStorage(storage);
    if (!target) return {};
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value === 'pending' || value === 'completed'));
    } catch (_) { return {}; }
  }

  function write(state, storage) {
    const target = safeStorage(storage);
    if (!target) return false;
    try { target.setItem(STORAGE_KEY, JSON.stringify(state || {})); return true; } catch (_) { return false; }
  }

  function get(newsId, storage) { return read(storage)[newsId] === 'completed' ? 'completed' : 'pending'; }
  function set(newsId, status, storage) {
    if (!newsId || !['pending', 'completed'].includes(status)) return false;
    const state = read(storage); state[newsId] = status; return write(state, storage);
  }
  function complete(newsId, storage) { return set(newsId, 'completed', storage); }
  function restore(newsId, storage) { return set(newsId, 'pending', storage); }
  function combine(items, storage) { return (items || []).map(item => Object.assign({}, item, { userStatus: get(item.id, storage) })); }

  return { STORAGE_KEY, read, write, get, set, complete, restore, combine };
});
