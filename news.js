(function (root, factory) {
  const api = factory(root.AmazonNewsData || []);
  if (typeof module === 'object' && module.exports) module.exports = factory;
  root.NewsModule = api;
})(typeof window !== 'undefined' ? window : globalThis, function (initialData) {
  'use strict';

  const OFFICIAL_DOMAINS = ['sell.amazon.com', 'sellercentral.amazon.com', 'advertising.amazon.com', 'developer-docs.amazon.com', 'amazon.com'];
  const REQUIRED_FIELDS = ['id', 'title', 'publishedAt', 'marketplaces', 'category', 'importance', 'officialUrl', 'sourceType', 'summary'];
  const labels = {
    importance: { high: '高', medium: '中', low: '低' },
    action: { required: '必须行动', review: '建议检查', none: '无需操作', info: '仅供了解' },
    category: { fees: '费用', fba: 'FBA', fbm: 'FBM', 'account-health': '账户健康', listing: 'Listing', advertising: '广告', brand: '品牌', compliance: '合规', promotion: '促销', 'seller-central': 'Seller Central', developer: 'API / 开发者' },
    source: { 'amazon-blog': 'Amazon Blog', 'seller-news': 'Seller News', 'news-amazon': 'News_Amazon', 'seller-university': 'Seller University', 'amazon-ads': 'Amazon Ads', 'sp-api': 'SP-API' },
    status: { active: '当前有效', upcoming: '即将生效', expired: '已过期' },
    module: { profit: 'FBA真实利润模拟器', profitability: '广告与利润分析', inventory: '库存与补货分析', news: '政策与运营动态', knowledge: 'Amazon运营知识库' }
  };

  let data = Array.isArray(initialData) ? initialData.slice() : [];
  let host = null;
  let state = { marketplace: 'all', category: 'all', importance: 'all', action: 'all', source: 'all', status: 'all', query: '', sort: 'latest' };

  function isOfficialUrl(value) {
    try {
      const hostName = new URL(value).hostname.toLowerCase();
      return OFFICIAL_DOMAINS.some(domain => hostName === domain || hostName.endsWith('.' + domain));
    } catch (_) { return false; }
  }

  function validateNewsItem(item) {
    const missing = REQUIRED_FIELDS.filter(key => item[key] === undefined || item[key] === null || item[key] === '' || (Array.isArray(item[key]) && !item[key].length));
    const valid = missing.length === 0;
    if (!valid && typeof console !== 'undefined') console.warn('[NewsModule] 资讯缺少字段：', item && item.id, missing);
    if (item && item.officialUrl && !isOfficialUrl(item.officialUrl) && typeof console !== 'undefined') console.warn('[NewsModule] 非白名单官方域名：', item.officialUrl);
    return { valid, missing, official: Boolean(item && isOfficialUrl(item.officialUrl)) };
  }

  function daysSince(date, now) {
    const then = Date.parse(date + 'T00:00:00Z');
    const today = now ? new Date(now).getTime() : Date.now();
    return Number.isFinite(then) ? Math.floor((today - then) / 86400000) : 0;
  }

  function isStale(item, now) { return daysSince(item.lastVerifiedAt, now) > 180; }

  function computedStatus(item, now) {
    if (item.status === 'expired') return 'expired';
    if (item.effectiveAt && Date.parse(item.effectiveAt + 'T23:59:59Z') > (now ? new Date(now).getTime() : Date.now())) return 'upcoming';
    return item.status || 'active';
  }

  function searchableText(item) {
    return [item.title, item.summary, ...(item.tags || []), ...(item.marketplaces || []), labels.category[item.category] || item.category].join(' ').toLowerCase();
  }

  function filterNews(items, filters) {
    const f = Object.assign({}, state, filters || {});
    const q = String(f.query || '').trim().toLowerCase();
    return (items || []).filter(item => {
      const markets = item.marketplaces || [];
      const marketMatch = f.marketplace === 'all' || markets.includes(f.marketplace) || (f.marketplace !== 'Global' && markets.includes('Global'));
      return marketMatch && (f.category === 'all' || item.category === f.category) &&
        (f.importance === 'all' || item.importance === f.importance) &&
        (f.action === 'all' || item.actionRequired === f.action) &&
        (f.source === 'all' || item.sourceType === f.source) &&
        (f.status === 'all' || computedStatus(item) === f.status) && (!q || searchableText(item).includes(q));
    });
  }

  function sortNews(items, sort) {
    const weights = { high: 3, medium: 2, low: 1 };
    return (items || []).slice().sort((a, b) => sort === 'importance'
      ? (weights[b.importance] - weights[a.importance]) || b.publishedAt.localeCompare(a.publishedAt)
      : b.publishedAt.localeCompare(a.publishedAt));
  }

  function getLatestNews(limit) { return sortNews(data, 'latest').slice(0, Math.max(0, Number(limit) || 0)); }
  function getHighPriorityNews(limit) { return sortNews(data.filter(item => item.importance === 'high'), 'latest').slice(0, Math.max(0, Number(limit) || 0)); }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function addOption(select, value, text) { const option = el('option', '', text); option.value = value; select.append(option); }
  function addList(parent, title, values) {
    const block = el('div', 'news-detail-block'); block.append(el('h4', '', title));
    const list = el('ul'); (values || []).forEach(value => list.append(el('li', '', value))); block.append(list); parent.append(block);
  }

  function buildCard(item) {
    const card = el('article', 'news-card importance-' + item.importance);
    const top = el('div', 'news-card-top');
    top.append(el('span', 'news-badge importance', labels.importance[item.importance] + '优先级'));
    (item.marketplaces || []).forEach(m => top.append(el('span', 'news-badge marketplace', m)));
    top.append(el('span', 'news-badge category', labels.category[item.category] || item.category));
    top.append(el('span', 'news-badge action action-' + item.actionRequired, labels.action[item.actionRequired] || item.actionRequired));
    card.append(top, el('h3', '', item.title));
    const date = el('p', 'news-date', '发布：' + item.publishedAt + '　最后核验：' + item.lastVerifiedAt);
    card.append(date, el('p', 'news-summary', item.summary));
    if (isStale(item)) card.append(el('p', 'news-stale', '该条信息建议重新核验'));
    const quick = el('div', 'news-quick');
    quick.append(el('span', '', '影响对象：' + (item.sellerImpact || []).join('、')), el('span', '', '影响模块：' + (item.affectedModules || []).map(key => labels.module[key] || key).join('、')));
    card.append(quick);
    const footer = el('div', 'news-card-footer');
    footer.append(el('span', 'official-source', '✓ Amazon官方 · ' + item.sourceName));
    const link = el('a', 'news-official-link', '查看官方原文 ↗'); link.href = item.officialUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; footer.append(link); card.append(footer);
    const details = el('details', 'news-details'); details.append(el('summary', '', '查看影响分析'));
    const content = el('div', 'news-details-content'); content.append(el('p', '', item.summary));
    addList(content, '卖家影响', item.sellerImpact); addList(content, '建议动作', item.recommendedActions);
    content.append(el('p', 'news-detail-meta', '状态：' + labels.status[computedStatus(item)] + '　·　最后核验：' + item.lastVerifiedAt)); details.append(content); card.append(details);
    return card;
  }

  function statsMarkup() {
    const now = new Date(); const month = now.toISOString().slice(0, 7);
    const markets = [...new Set(data.flatMap(item => item.marketplaces || []))];
    return [{ label: '最新更新数', value: data.length }, { label: '高优先级更新', value: data.filter(i => i.importance === 'high').length }, { label: '本月更新', value: data.filter(i => i.publishedAt.startsWith(month)).length }, { label: '涉及站点', value: markets.join(' / ') || '—' }];
  }

  function renderResults() {
    if (!host) return;
    const list = host.querySelector('[data-news-list]'); const count = host.querySelector('[data-news-count]'); list.replaceChildren();
    const result = sortNews(filterNews(data, state), state.sort); count.textContent = '共 ' + result.length + ' 条官方动态';
    if (!result.length) {
      const empty = el('div', 'news-empty'); empty.append(el('h3', '', '没有找到符合条件的 Amazon 官方更新。'));
      const button = el('button', 'news-clear-button', '清除筛选'); button.type = 'button'; button.addEventListener('click', resetFilters); empty.append(button); list.append(empty); return;
    }
    result.forEach(item => list.append(buildCard(item)));
  }

  function resetFilters() {
    state = { marketplace: 'all', category: 'all', importance: 'all', action: 'all', source: 'all', status: 'all', query: '', sort: 'latest' };
    host.querySelectorAll('[data-news-filter]').forEach(input => { input.value = state[input.dataset.newsFilter]; }); renderResults();
  }

  function mount(target) {
    host = target; host.classList.add('news-page'); host.replaceChildren();
    if (!data.length) { host.append(el('div', 'news-load-error', '官方动态数据暂时无法加载。')); return; }
    data.forEach(validateNewsItem);
    const header = el('header', 'news-header'); header.append(el('p', 'news-eyebrow', 'KNOWLEDGE & INTELLIGENCE'), el('h1', '', 'Amazon政策与运营动态'), el('span', 'news-en-title', 'Amazon Policy & Seller Updates'), el('p', 'news-subtitle', '聚合 Amazon 官方卖家政策、费用、履约、账户健康、广告与平台功能更新。'), el('div', 'news-official-note', '✓ 本模块仅收录 Amazon 官方来源，不使用社区或第三方信息。')); host.append(header);
    const stats = el('section', 'news-stats'); statsMarkup().forEach(stat => { const box = el('article'); box.append(el('span', '', stat.label), el('strong', '', String(stat.value))); stats.append(box); }); host.append(stats);
    const filters = el('section', 'news-filters');
    const filterDefs = [
      ['marketplace', 'Marketplace', [['all','全部'],['Global','Global'],['US','US'],['UK','UK'],['EU','EU'],['DE','DE'],['FR','FR'],['IT','IT'],['ES','ES'],['CA','CA'],['AU','AU'],['JP','JP']]],
      ['category', '类别', [['all','全部'], ...Object.entries(labels.category)]],
      ['importance', '重要程度', [['all','全部'],['high','高'],['medium','中'],['low','低']]],
      ['action', '行动状态', [['all','全部'], ...Object.entries(labels.action)]],
      ['source', '来源', [['all','全部'], ...Object.entries(labels.source)]],
      ['status', '状态', [['all','全部'], ...Object.entries(labels.status)]],
      ['sort', '排序', [['latest','发布时间倒序'],['importance','重要程度']]]
    ];
    filterDefs.forEach(def => { const label = el('label'); label.append(el('span', '', def[1])); const select = el('select'); select.dataset.newsFilter = def[0]; def[2].forEach(option => addOption(select, option[0], option[1])); label.append(select); filters.append(label); });
    const searchLabel = el('label', 'news-search'); searchLabel.append(el('span', '', '搜索')); const input = el('input'); input.type = 'search'; input.placeholder = '搜索 FBA fee、标题、Featured Offer…'; input.dataset.newsFilter = 'query'; searchLabel.append(input); filters.prepend(searchLabel); host.append(filters);
    filters.addEventListener('input', event => { const key = event.target.dataset.newsFilter; if (!key) return; state[key] = event.target.value; renderResults(); });
    const bar = el('div', 'news-result-bar'); bar.append(el('strong', '', '官方动态'), el('span', '', '')); bar.lastChild.dataset.newsCount = ''; host.append(bar);
    const list = el('section', 'news-list'); list.dataset.newsList = ''; host.append(list);
    host.append(el('p', 'news-disclaimer', '本模块整理 Amazon 官方卖家动态用于运营参考。政策、费用与功能可能持续调整，最终以对应 Amazon 官方页面和 Seller Central 实际通知为准。'));
    renderResults();
  }

  function unmount() { host = null; }
  function setData(items) { data = Array.isArray(items) ? items.slice() : []; }
  return { mount, unmount, setData, validateNewsItem, isOfficialUrl, filterNews, sortNews, isStale, computedStatus, getLatestNews, getHighPriorityNews, OFFICIAL_DOMAINS: OFFICIAL_DOMAINS.slice() };
});
