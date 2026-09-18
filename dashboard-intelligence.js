(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DashboardIntelligence = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const categoryLabels = { fees: '费用', fba: 'FBA', fbm: 'FBM', 'account-health': '账户健康', listing: 'Listing', advertising: '广告', brand: '品牌', compliance: '合规', promotion: '促销', 'seller-central': 'Seller Central', developer: 'API / 开发者' };
  const actionLabels = { required: '必须行动', review: '建议检查', none: '无需操作', info: '仅供了解' };
  const importanceLabels = { high: '高', medium: '中', low: '低' };
  const moduleLabels = { profit: 'FBA利润模拟', profitability: '广告与利润', inventory: '库存与补货', news: '政策动态', knowledge: '运营知识库' };
  const moduleRoutes = { profit: '#/profit', profitability: '#/profitability', inventory: '#/inventory', news: '#/news' };

  function getModel(newsModule) {
    if (!newsModule || typeof newsModule.getHighPriorityNews !== 'function' || typeof newsModule.getLatestNews !== 'function') {
      return { available: false, highPriority: [], latest: [] };
    }
    return {
      available: true,
      highPriority: (newsModule.getHighPriorityNews(3) || []).filter(item => item.importance === 'high').slice(0, 3),
      latest: (newsModule.getLatestNews(5) || []).slice(0, 5)
    };
  }

  function effectiveLabel(item, newsModule, now) {
    if (!item.effectiveAt) return '';
    const status = newsModule && typeof newsModule.computedStatus === 'function'
      ? newsModule.computedStatus(item, now)
      : '';
    const state = status === 'upcoming' ? '即将生效' : '已生效';
    return `${state} · ${item.effectiveAt}`;
  }

  function truncate(text, max) {
    const value = String(text || '').trim();
    return value.length > max ? value.slice(0, max - 1) + '…' : value;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function badge(text, className) { return el('span', `intel-badge ${className || ''}`.trim(), text); }

  function createHeader(title, english) {
    const header = el('header', 'intel-column-header');
    const copy = el('div'); copy.append(el('h3', '', title), el('small', '', english));
    const link = el('a', 'intel-view-all', '查看全部'); link.href = '#/news';
    header.append(copy, link); return header;
  }

  function createEmpty(message) { return el('div', 'intel-empty', message); }

  function createHighCard(item, newsModule) {
    const card = el('article', 'intel-priority-card');
    const tags = el('div', 'intel-tags');
    (item.marketplaces || []).forEach(market => tags.append(badge(market, 'market')));
    tags.append(badge(categoryLabels[item.category] || item.category, 'category'));
    const action = badge(actionLabels[item.actionRequired] || item.actionRequired, `action-${item.actionRequired}`);
    tags.append(action); card.append(tags, el('h4', '', item.title), el('p', 'intel-summary', truncate(item.summary, 68)));
    const dates = el('p', 'intel-dates');
    const effective = effectiveLabel(item, newsModule);
    dates.textContent = effective ? `${effective}　发布：${item.publishedAt}` : `发布：${item.publishedAt}`;
    card.append(dates);
    const relevant = (item.affectedModules || []).filter(key => moduleLabels[key]);
    if (relevant.length) {
      const impact = el('div', 'intel-impact'); impact.append(el('span', '', '影响：'));
      relevant.forEach(key => {
        const route = moduleRoutes[key];
        if (route) { const link = el('a', '', moduleLabels[key]); link.href = route; impact.append(link); }
        else impact.append(el('span', '', moduleLabels[key]));
      }); card.append(impact);
    }
    const detail = el('a', 'intel-detail-link', '查看详情'); detail.href = '#/news'; card.append(detail);
    return card;
  }

  function createLatestRow(item) {
    const row = el('article', 'intel-latest-row');
    const date = el('time', '', String(item.publishedAt || '').slice(5)); date.dateTime = item.publishedAt;
    const content = el('div');
    const tags = el('div', 'intel-tags'); (item.marketplaces || []).forEach(market => tags.append(badge(market, 'market')));
    tags.append(badge(importanceLabels[item.importance] || item.importance, `importance-${item.importance}`));
    const title = el('a', '', item.title); title.href = '#/news'; content.append(tags, title); row.append(date, content); return row;
  }

  function mount(host, newsModule) {
    if (!host) return;
    host.replaceChildren();
    const section = el('section', 'intelligence-section');
    const top = el('div', 'intelligence-heading');
    const title = el('div'); title.append(el('p', '', 'SELLER INTELLIGENCE'), el('h2', '', '运营情报'), el('span', '', '及时了解可能影响 Amazon 经营的官方政策与平台更新。'));
    const knowledge = el('span', 'knowledge-soon', '运营知识库 · 即将推出'); top.append(title, knowledge); section.append(top);
    const model = getModel(newsModule);
    if (!model.available) {
      section.append(createEmpty('Amazon官方动态暂不可用'));
    } else {
      const grid = el('div', 'intelligence-grid');
      const high = el('section', 'intel-column intel-high'); high.append(createHeader('高优先级运营提醒', 'High Priority Updates'));
      const highList = el('div', 'intel-list');
      if (model.highPriority.length) model.highPriority.forEach(item => highList.append(createHighCard(item, newsModule)));
      else highList.append(createEmpty('暂无高优先级运营提醒'));
      high.append(highList);
      const latest = el('section', 'intel-column intel-latest'); latest.append(createHeader('最新 Amazon 官方动态', 'Latest Official Updates'));
      const latestList = el('div', 'intel-list');
      if (model.latest.length) model.latest.forEach(item => latestList.append(createLatestRow(item)));
      else latestList.append(createEmpty('暂无最新官方动态'));
      latest.append(latestList); grid.append(high, latest); section.append(grid);
    }
    section.append(el('p', 'intelligence-note', '内容仅来自 Amazon 官方来源。完整信息以 Amazon 官方原文和 Seller Central 实际通知为准。'));
    host.append(section);
  }

  return { mount, getModel, effectiveLabel, truncate };
});
