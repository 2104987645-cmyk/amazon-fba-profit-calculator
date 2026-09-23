(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DashboardIntelligence = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const categoryLabels = { fees: '费用', fba: 'FBA', fbm: 'FBM', 'account-health': '账户健康', listing: 'Listing', advertising: '广告', brand: '品牌', compliance: '合规', promotion: '促销', 'seller-central': 'Seller Central', developer: 'API / 开发者' };
  const actionLabels = { required: '必须行动', review: '建议检查', none: '无需操作', info: '仅供了解' };
  const importanceLabels = { high: '高', medium: '中', low: '低' };
  const moduleLabels = { profit: '利润', profitability: '广告', inventory: '库存', news: '政策动态', knowledge: '运营知识库' };
  const moduleRoutes = { profit: '#/profit', profitability: '#/profitability', inventory: '#/inventory', news: '#/news' };
  const actionRoutes = {
    'recalculate-profit': { label: '重新计算利润', href: '#/profit' },
    'check-inventory': { label: '检查库存', href: '#/inventory' },
    'review-ads': { label: '检查广告', href: '#/profitability' },
    'read-news': { label: '查看政策详情', href: '#/news' }
  };
  let mountedHost = null; let mountedNews = null; let mountedState = null; let showCompleted = false;

  function isActionRequired(item) { return item && item.actionRequired === true; }
  function getActionLevel(item, newsModule) { return newsModule && typeof newsModule.getActionLevel === 'function' ? newsModule.getActionLevel(item) : (item.actionLevel || (typeof item.actionRequired === 'string' ? item.actionRequired : 'info')); }
  function getModel(newsModule, actionState, limit) {
    if (!newsModule || typeof newsModule.getHighPriorityNews !== 'function' || typeof newsModule.getLatestNews !== 'function') return { available: false, highPriority: [], latest: [], pending: [], completed: [] };
    const all = typeof newsModule.getLatestNews === 'function' ? newsModule.getLatestNews(1000) : [];
    const combined = actionState && typeof actionState.combine === 'function' ? actionState.combine(all) : all.map(item => Object.assign({}, item, { userStatus: 'pending' }));
    const actions = combined.filter(isActionRequired);
    return {
      available: true,
      highPriority: (newsModule.getHighPriorityNews(3) || []).filter(item => item.importance === 'high').slice(0, 3),
      latest: (newsModule.getLatestNews(5) || []).slice(0, 5),
      pending: actions.filter(item => item.userStatus !== 'completed').slice(0, limit || 5),
      completed: actions.filter(item => item.userStatus === 'completed')
    };
  }

  function flattenBrief(brief) {
    return [...(brief.actions || []), ...(brief.risks || []), ...(brief.monitor || []), ...(brief.information || [])];
  }
  function buildDecisionDashboardModel(newsModule, dependencies, options) {
    const deps = dependencies || { SellerIntelligence: globalThis.SellerIntelligence, DecisionModel: globalThis.DecisionModel, SellerProfile: globalThis.SellerProfile };
    const empty = { available: false, generatedAt: null, profileConfigured: false, summary: { total: 0, actions: 0, risks: 0, monitor: 0 }, decisions: [], emptyState: { message: '今天暂无需要优先处理的 Amazon 变化。', detail: '系统仍会继续检查与你站点相关的政策和运营变化。' }, diagnostics: {} };
    if (!newsModule || typeof newsModule.getLatestNews !== 'function' || !deps.SellerIntelligence || typeof deps.SellerIntelligence.evaluateAll !== 'function' || !deps.DecisionModel || typeof deps.DecisionModel.buildDailyBrief !== 'function') return empty;
    try {
      const profile = deps.SellerProfile && typeof deps.SellerProfile.getProfile === 'function' ? deps.SellerProfile.getProfile() : {};
      const profileConfigured = Boolean(profile && profile.configured && Array.isArray(profile.marketplaces) && profile.marketplaces.length);
      const intelligence = deps.SellerIntelligence.evaluateAll(newsModule.getLatestNews(1000) || []);
      const briefOptions = Object.assign({ briefDate: new Date().toISOString().slice(0, 10), timezone: 'UTC' }, options || {});
      const dailyBrief = deps.DecisionModel.buildDailyBrief(intelligence, profile, briefOptions);
      const decisions = flattenBrief(dailyBrief).slice(0, 5);
      return { available: true, generatedAt: dailyBrief.generatedAt, profileConfigured, summary: { total: decisions.length, actions: (dailyBrief.actions || []).length, risks: (dailyBrief.risks || []).length, monitor: (dailyBrief.monitor || []).length }, decisions, dailyBrief, diagnostics: dailyBrief.diagnostics || {}, emptyState: decisions.length ? null : { message: '今天暂无需要优先处理的 Amazon 变化。', detail: '系统仍会继续检查与你站点相关的政策和运营变化。' } };
    } catch (_) { return empty; }
  }

  function effectiveLabel(item, newsModule, now) {
    if (!item.effectiveAt) return `发布时间：${String(item.publishedAt || '').slice(5) || '—'}`;
    const status = newsModule && typeof newsModule.computedStatus === 'function' ? newsModule.computedStatus(item, now) : '';
    return status === 'upcoming' ? `${item.effectiveAt.slice(5).replace('-', ' 月 ')} 日生效` : `已生效 · ${item.effectiveAt}`;
  }
  function truncate(text, max) { const value = String(text || '').trim(); return value.length > max ? value.slice(0, max - 1) + '…' : value; }
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function badge(text, className) { return el('span', `intel-badge ${className || ''}`.trim(), text); }
  function createEmpty(message, english) { const node = el('div', 'intel-empty', message); if (english) node.append(el('small', '', english)); return node; }
  function newsHref(params) { const query = new URLSearchParams(params).toString(); return '#/news' + (query ? '?' + query : ''); }
  function actionConfig(type) { return actionRoutes[type] || { label: '查看详情', href: '#/news' }; }

  function createDecisionCard(item) {
    const card = el('article', `decision-card priority-${item.priority || 'low'}`); const tags = el('div', 'intel-tags');
    tags.append(badge(String(item.priority || 'low').toUpperCase(), `decision-priority ${item.priority || 'low'}`), badge(categoryLabels[item.category] || item.category || 'general', 'category'));
    card.append(tags, el('h4', '', item.title || 'Amazon 更新'));
    if (item.whyItMatters) { const why = el('p', 'decision-why'); why.append(el('span', '', '为什么与你有关'), document.createTextNode(item.whyItMatters)); card.append(why); }
    const marketplaces = item.affectedMarketplace || []; if (marketplaces.length) { const markets = el('div', 'intel-tags decision-markets'); marketplaces.forEach(market => markets.append(badge(market, 'market'))); card.append(markets); }
    if (item.recommendedAction) { const action = el('p', 'decision-action'); action.append(el('span', '', '建议动作'), el('strong', '', item.recommendedAction)); card.append(action); }
    const meta = []; if (item.urgency && item.urgency !== 'none' && item.urgency !== 'unknown') meta.push(item.urgency); if (item.daysRemaining !== null && item.daysRemaining !== undefined) meta.push(item.daysRemaining < 0 ? '已逾期' : `${item.daysRemaining} 天`); if (meta.length) card.append(el('p', 'decision-meta', meta.join(' · ')));
    const sourceCount = item.mergeCount || (item.sourceNewsIds || []).length; if (sourceCount) card.append(el('p', 'decision-sources', `来自 ${sourceCount} 条 Amazon 官方更新`));
    const source = el('a', 'decision-source-link', item.recommendedAction ? '查看官方来源' : '查看政策详情'); source.href = item.sourceUrls && item.sourceUrls[0] || '#/news'; card.append(source);
    return card;
  }
  function createDecisionExperience(model) {
    const section = el('section', 'decision-experience'); const heading = el('header', 'decision-heading'); const copy = el('div'); copy.append(el('p', '', "TODAY'S DECISIONS"), el('h2', '', '今日经营决策'), el('span', '', '根据你的站点和 Amazon 最新变化整理')); heading.append(copy); section.append(heading);
    if (!model.available) { section.append(createEmpty('今日经营决策暂不可用')); return section; }
    if (!model.profileConfigured) section.append(el('p', 'decision-profile-note', '完善卖家站点信息后，可以获得更相关的经营决策。'));
    if (model.emptyState) { section.append(createEmpty(model.emptyState.message, model.emptyState.detail)); return section; }
    const summary = el('div', 'decision-summary'); [['需要处理', model.summary.actions], ['风险', model.summary.risks], ['关注', model.summary.monitor]].forEach(value => { const box = el('div'); box.append(el('strong', '', String(value[1])), el('span', '', value[0])); summary.append(box); }); section.append(summary);
    const list = el('div', 'decision-list'); model.decisions.forEach(item => list.append(createDecisionCard(item))); section.append(list); return section;
  }

  function createHeader(title, english, href) {
    const header = el('header', 'intel-column-header'); const copy = el('div'); copy.append(el('h3', '', title), el('small', '', english));
    const link = el('a', 'intel-view-all', '查看全部'); link.href = href || '#/news'; header.append(copy, link); return header;
  }
  function marketBadge(market) { const link = el('a', 'intel-badge market', market); link.href = newsHref({ marketplace: market }); return link; }
  function moduleLinks(item, filterNews) {
    const impact = el('div', 'intel-impact'); impact.append(el('span', '', '影响模块：'));
    (item.affectedModules || []).filter(key => moduleLabels[key]).forEach(key => {
      const link = el('a', 'intel-module-link', moduleLabels[key] + ' →');
      link.href = filterNews ? newsHref({ module: key }) : (moduleRoutes[key] || '#/news'); impact.append(link);
    }); return impact;
  }

  function createHighCard(item, newsModule) {
    const card = el('article', 'intel-priority-card'); const tags = el('div', 'intel-tags');
    (item.marketplaces || []).forEach(market => tags.append(marketBadge(market)));
    tags.append(badge(categoryLabels[item.category] || item.category, 'category'));
    const level = getActionLevel(item, newsModule); tags.append(badge(actionLabels[level] || level, `action-${level}`));
    card.append(tags, el('h4', '', item.title), el('p', 'intel-summary', truncate(item.summary, 68)), el('p', 'intel-dates', effectiveLabel(item, newsModule)));
    card.append(moduleLinks(item, true)); const detail = el('a', 'intel-detail-link', '查看详情'); detail.href = '#/news'; card.append(detail); return card;
  }

  function createLatestRow(item) {
    const row = el('article', 'intel-latest-row'); const date = el('time', '', String(item.publishedAt || '').slice(5)); date.dateTime = item.publishedAt;
    const content = el('div'); const tags = el('div', 'intel-tags'); (item.marketplaces || []).forEach(market => tags.append(marketBadge(market)));
    tags.append(badge(importanceLabels[item.importance] || item.importance, `importance-${item.importance}`));
    const title = el('a', '', item.title); title.href = '#/news'; content.append(tags, title); row.append(date, content); return row;
  }

  function createActionCard(item, newsModule, actionState, completed) {
    const card = el('article', `action-card ${completed ? 'is-completed' : ''}`); const tags = el('div', 'intel-tags');
    (item.marketplaces || []).forEach(market => tags.append(marketBadge(market))); tags.append(badge(categoryLabels[item.category] || item.category, 'category'), badge(completed ? '已处理' : '待处理', completed ? 'status-completed' : 'status-pending'));
    card.append(tags, el('h4', '', item.title)); const advice = el('p', 'action-advice'); advice.append(el('span', '', '建议行动：'), el('strong', '', item.actionText || '查看官方动态并评估对业务的影响')); card.append(advice, el('p', 'intel-dates', effectiveLabel(item, newsModule)), moduleLinks(item, false));
    const buttons = el('div', 'action-buttons'); const primaryConfig = actionConfig(item.actionType); const primary = el('a', 'action-primary', primaryConfig.label); primary.href = primaryConfig.href; buttons.append(primary);
    const statusButton = el('button', 'action-status-button', completed ? '恢复为待处理' : '标记已处理'); statusButton.type = 'button'; statusButton.setAttribute('aria-label', `${completed ? '恢复为待处理' : '标记已处理'}：${item.title}`);
    statusButton.addEventListener('click', () => { if (!actionState) return; completed ? actionState.restore(item.id) : actionState.complete(item.id); render(); });
    buttons.append(statusButton); card.append(buttons); return card;
  }

  function render() {
    if (!mountedHost) return; mountedHost.replaceChildren(); const section = el('section', 'intelligence-section');
    const model = getModel(mountedNews, mountedState, 5); const top = el('div', 'intelligence-heading'); const title = el('div');
    title.append(el('p', '', 'SELLER INTELLIGENCE'), el('h2', '', '运营情报'), el('span', '', '及时了解可能影响 Amazon 经营的官方政策与平台更新。'));
    top.append(title, el('span', 'knowledge-soon', '运营知识库 · 即将推出')); section.append(top);
    section.append(createDecisionExperience(buildDecisionDashboardModel(mountedNews)));
    if (!model.available) section.append(createEmpty('Amazon官方动态暂不可用'));
    else {
      const summary = el('section', 'intelligence-summary');
      [['待处理行动', model.pending.length], ['高优先级', model.highPriority.length], ['最新动态', model.latest.length]].forEach(value => { const box = el('div'); box.append(el('strong', '', String(value[1])), el('span', '', value[0])); summary.append(box); }); section.append(summary);
      const actionSection = el('section', 'action-center'); const actionHeader = el('header', 'action-center-header'); const actionTitle = el('div'); actionTitle.append(el('h3', '', '运营行动中心'), el('small', '', 'Action Center · 需要你处理的运营事项'));
      const controls = el('div', 'action-center-controls'); controls.append(badge(`${model.pending.length} 项待处理`, 'pending-count'));
      const toggle = el('button', 'completed-toggle', showCompleted ? '返回待处理' : `查看已处理（${model.completed.length}）`); toggle.type = 'button'; toggle.addEventListener('click', () => { showCompleted = !showCompleted; render(); }); controls.append(toggle); actionHeader.append(actionTitle, controls); actionSection.append(actionHeader);
      const actionList = el('div', 'action-list'); const visibleActions = showCompleted ? model.completed : model.pending;
      if (visibleActions.length) visibleActions.forEach(item => actionList.append(createActionCard(item, mountedNews, mountedState, showCompleted)));
      else actionList.append(createEmpty(showCompleted ? '暂无已处理运营事项' : '暂无待处理运营事项', showCompleted ? '' : 'No pending actions'));
      actionSection.append(actionList); section.append(actionSection);
      const grid = el('div', 'intelligence-grid'); const high = el('section', 'intel-column intel-high'); high.append(createHeader('高优先级运营提醒', 'High Priority Updates', newsHref({ importance: 'high' })));
      const highList = el('div', 'intel-list'); model.highPriority.length ? model.highPriority.forEach(item => highList.append(createHighCard(item, mountedNews))) : highList.append(createEmpty('暂无高优先级运营提醒')); high.append(highList);
      const latest = el('section', 'intel-column intel-latest'); latest.append(createHeader('最新 Amazon 官方动态', 'Latest Official Updates', '#/news'));
      const latestList = el('div', 'intel-list'); model.latest.length ? model.latest.forEach(item => latestList.append(createLatestRow(item))) : latestList.append(createEmpty('暂无最新官方动态')); latest.append(latestList); grid.append(high, latest); section.append(grid);
    }
    section.append(el('p', 'intelligence-note', '内容仅来自 Amazon 官方来源。完整信息以 Amazon 官方原文和 Seller Central 实际通知为准。')); mountedHost.append(section);
  }

  function mount(host, newsModule, actionState) { mountedHost = host; mountedNews = newsModule; mountedState = actionState; showCompleted = false; render(); }
  return { mount, getModel, buildDecisionDashboardModel, effectiveLabel, truncate, actionConfig, isActionRequired, newsHref };
});
