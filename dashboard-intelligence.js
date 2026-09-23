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
  let mountedHost = null; let mountedNews = null; let mountedState = null; let showCompleted = false; let profileEditing = false; let profileError = null;
  const marketplaceLabels = Object.freeze({ US:'美国', CA:'加拿大', MX:'墨西哥', UK:'英国', DE:'德国', FR:'法国', IT:'意大利', ES:'西班牙', NL:'荷兰', SE:'瑞典', PL:'波兰', BE:'比利时', AU:'澳大利亚', JP:'日本' });
  const marketplaceGroups = Object.freeze({ US:'north-america', CA:'north-america', MX:'north-america', UK:'europe', DE:'europe', FR:'europe', IT:'europe', ES:'europe', NL:'europe', SE:'europe', PL:'europe', BE:'europe', AU:'asia-pacific', JP:'asia-pacific' });

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
    return [...(brief.actions || []), ...(brief.risks || []), ...(brief.monitor || [])];
  }
  function sellerProfileDependency(dependencies) { return dependencies && dependencies.SellerProfile || globalThis.SellerProfile; }
  function buildSellerProfileViewModel(dependencies, editing, error) {
    const SellerProfile = sellerProfileDependency(dependencies);
    if (!SellerProfile || typeof SellerProfile.getProfile !== 'function' || !Array.isArray(SellerProfile.MARKETPLACES)) return { available:false, configured:false, marketplaces:[], marketplaceOptions:[], editing:Boolean(editing), error:error || '站点配置暂时无法保存，请稍后重试。' };
    const profile = SellerProfile.getProfile(); const marketplaces = Array.isArray(profile.marketplaces) ? profile.marketplaces.slice() : [];
    return { available:!profile.unavailable, configured:Boolean(profile.configured), marketplaces, marketplaceOptions:SellerProfile.MARKETPLACES.map(code => ({ code, label:marketplaceLabels[code] || code, group:marketplaceGroups[code] || 'other', selected:marketplaces.includes(code) })), editing:Boolean(editing), error:error || (profile.unavailable ? '站点配置暂时无法保存，请稍后重试。' : null) };
  }
  function saveSellerProfileSelection(marketplaces, dependencies) {
    const SellerProfile = sellerProfileDependency(dependencies);
    if (!Array.isArray(marketplaces) || !marketplaces.length) return { ok:false, error:'请至少选择一个 Amazon 站点。' };
    if (!SellerProfile || typeof SellerProfile.saveProfile !== 'function') return { ok:false, error:'站点配置暂时无法保存，请稍后重试。' };
    const result = SellerProfile.saveProfile({ marketplaces });
    return { ok:Boolean(result && result.configured && !result.unavailable && result.status !== 'unavailable'), result, error:result && result.unavailable ? '站点配置暂时无法保存，请稍后重试。' : null };
  }
  function clearSellerProfile(dependencies) {
    const SellerProfile = sellerProfileDependency(dependencies);
    if (!SellerProfile || typeof SellerProfile.clearProfile !== 'function') return { ok:false, error:'站点配置暂时无法保存，请稍后重试。' };
    const result = SellerProfile.clearProfile();
    return { ok:Boolean(result && !result.unavailable), result, error:result && result.unavailable ? '站点配置暂时无法保存，请稍后重试。' : null };
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
      const summary = decisions.reduce((counts, item) => { if (item.category === 'action') counts.actions += 1; else if (item.category === 'risk') counts.risks += 1; else if (item.category === 'monitor') counts.monitor += 1; return counts; }, { total: decisions.length, actions: 0, risks: 0, monitor: 0 });
      return { available: true, generatedAt: dailyBrief.generatedAt, profileConfigured, summary, decisions, dailyBrief, diagnostics: dailyBrief.diagnostics || {}, emptyState: decisions.length ? null : { message: '今天暂无需要优先处理的 Amazon 变化。', detail: '系统仍会继续检查与你站点相关的政策和运营变化。' } };
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
  function canCompleteDecision(item) { return Boolean(item && item.category === 'action' && Array.isArray(item.sourceNewsIds) && item.sourceNewsIds.length === 1); }
  function completeDecision(item, actionState) {
    if (!canCompleteDecision(item) || !actionState || typeof actionState.complete !== 'function') return false;
    return actionState.complete(item.sourceNewsIds[0]) === true;
  }

  function createDecisionCard(item, actionState, suppressProfileCompatibility) {
    const card = el('article', `decision-card priority-${item.priority || 'low'}`); const tags = el('div', 'intel-tags');
    const decisionLabels = { action: '需要行动', risk: '风险关注', monitor: '持续关注' };
    tags.append(badge(String(item.priority || 'low').toUpperCase(), `decision-priority ${item.priority || 'low'}`), badge(decisionLabels[item.category] || item.category || 'monitor', 'category'), badge(categoryLabels[item.newsCategory] || item.newsCategory || 'general', 'topic'));
    card.append(tags, el('h4', '', item.title || 'Amazon 更新'));
    if (item.whyItMatters && !(suppressProfileCompatibility && item.whyItMatters.includes('尚未配置卖家站点'))) { const why = el('p', 'decision-why'); why.append(el('span', '', '为什么与你有关'), document.createTextNode(item.whyItMatters)); card.append(why); }
    const marketplaces = item.marketplaces || []; if (marketplaces.length) { const markets = el('div', 'intel-tags decision-markets'); marketplaces.forEach(market => markets.append(badge(market, 'market'))); card.append(markets); }
    if (item.recommendedAction) { const action = el('p', 'decision-action'); action.append(el('span', '', '建议动作'), el('strong', '', item.recommendedAction)); card.append(action); }
    const meta = []; if (item.urgency && item.urgency !== 'none' && item.urgency !== 'unknown') meta.push(item.urgency); if (item.daysRemaining !== null && item.daysRemaining !== undefined) meta.push(item.daysRemaining < 0 ? '已逾期' : `${item.daysRemaining} 天`); if (meta.length) card.append(el('p', 'decision-meta', meta.join(' · ')));
    const sourceCount = item.sourceCount || (item.sourceNewsIds || []).length; if (sourceCount) card.append(el('p', 'decision-sources', `来自 ${sourceCount} 条 Amazon 官方更新`));
    const source = el('a', 'decision-source-link', item.recommendedAction ? '查看官方来源' : '查看政策详情'); source.href = item.sourceUrls && item.sourceUrls[0] || '#/news'; card.append(source);
    if (canCompleteDecision(item)) { const complete = el('button', 'decision-complete-button', '标记已处理'); complete.type = 'button'; complete.addEventListener('click', () => { if (completeDecision(item, actionState)) render(); }); card.append(complete); }
    return card;
  }
  function createIntelligenceLink() {
    const section = el('section', 'intelligence-link'); section.append(el('h3', '', 'Amazon 政策与运营动态'), el('p', '', '完整查看 Amazon 官方政策、费用、FBA、Listing、账户健康及平台更新。'));
    const link = el('a', 'decision-source-link', '查看完整政策动态'); link.href = '#/news'; section.append(link); return section;
  }
  function createSellerProfilePanel(model) {
    const panel = el('section', 'seller-profile-panel'); const heading = el('header', 'seller-profile-heading'); heading.append(el('h3', '', '我的 Amazon 站点')); panel.append(heading);
    if (!model.available) { panel.append(el('p', 'seller-profile-error', model.error)); return panel; }
    if (!model.configured && !model.editing) {
      panel.append(el('p', '', '尚未配置经营站点。配置后，系统会优先展示与你实际站点相关的 Amazon 政策和运营变化。'));
      const configure = el('button', 'seller-profile-button', '配置站点'); configure.type = 'button'; configure.addEventListener('click', () => { profileEditing = true; profileError = null; render(); }); panel.append(configure, el('small', 'seller-profile-note', '配置仅保存在当前浏览器，不连接 Amazon 账户。')); return panel;
    }
    if (model.editing) {
      const form = el('form', 'seller-profile-form'); const groupLabels = { 'north-america':'北美', europe:'欧洲', 'asia-pacific':'亚太' };
      ['north-america','europe','asia-pacific'].forEach(group => { const fieldset = el('fieldset', 'seller-profile-group'); fieldset.append(el('legend', '', groupLabels[group])); model.marketplaceOptions.filter(option => option.group === group).forEach(option => { const label = el('label', 'seller-profile-option'); const input = document.createElement('input'); input.type = 'checkbox'; input.name = 'marketplace'; input.value = option.code; input.checked = option.selected; label.append(input, document.createTextNode(` ${option.code} ${option.label}`)); fieldset.append(label); }); form.append(fieldset); });
      if (model.error) form.append(el('p', 'seller-profile-error', model.error)); const controls = el('div', 'seller-profile-controls'); const save = el('button', 'seller-profile-button', '保存站点'); save.type = 'submit'; const cancel = el('button', 'seller-profile-button secondary', '取消'); cancel.type = 'button'; cancel.addEventListener('click', () => { profileEditing = false; profileError = null; render(); }); controls.append(save, cancel); form.append(controls); form.addEventListener('submit', event => { event.preventDefault(); const selected = [...form.querySelectorAll('input[name="marketplace"]:checked')].map(input => input.value); const saved = saveSellerProfileSelection(selected); if (saved.ok) { profileEditing = false; profileError = null; } else profileError = saved.error; render(); }); panel.append(form); return panel;
    }
    const badges = el('div', 'seller-profile-badges'); model.marketplaces.forEach(code => badges.append(badge(code, 'market'))); const edit = el('button', 'seller-profile-button', '编辑站点'); edit.type = 'button'; edit.addEventListener('click', () => { profileEditing = true; profileError = null; render(); }); const clear = el('button', 'seller-profile-button secondary', '清除站点配置'); clear.type = 'button'; clear.addEventListener('click', () => { const cleared = clearSellerProfile(); if (cleared.ok) { profileEditing = false; profileError = null; } else profileError = cleared.error; render(); }); panel.append(badges, edit, clear); return panel;
  }
  function createDecisionExperience(model) {
    const section = el('section', 'decision-experience'); const heading = el('header', 'decision-heading'); const copy = el('div'); copy.append(el('p', '', "TODAY'S DECISIONS"), el('h2', '', '今日经营决策'), el('span', '', '根据你的站点和 Amazon 最新变化整理')); heading.append(copy); section.append(heading);
    if (!model.available) { section.append(createEmpty('今日经营决策暂不可用'), createIntelligenceLink()); return section; }
    if (model.emptyState) { section.append(createEmpty(model.emptyState.message, model.emptyState.detail), createIntelligenceLink()); return section; }
    const summary = el('div', 'decision-summary'); [['需要处理', model.summary.actions], ['风险', model.summary.risks], ['关注', model.summary.monitor]].forEach(value => { const box = el('div'); box.append(el('strong', '', String(value[1])), el('span', '', value[0])); summary.append(box); }); section.append(summary);
    const list = el('div', 'decision-list'); model.decisions.forEach(item => list.append(createDecisionCard(item, mountedState, !model.profileConfigured))); section.append(list, createIntelligenceLink()); return section;
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
    const top = el('div', 'intelligence-heading'); const title = el('div');
    title.append(el('p', '', 'SELLER INTELLIGENCE'), el('h2', '', '运营情报'), el('span', '', '及时了解可能影响 Amazon 经营的官方政策与平台更新。'));
    top.append(title, el('span', 'knowledge-soon', '运营知识库 · 即将推出')); section.append(top);
    section.append(createSellerProfilePanel(buildSellerProfileViewModel(undefined, profileEditing, profileError)), createDecisionExperience(buildDecisionDashboardModel(mountedNews)));
    section.append(el('p', 'intelligence-note', '内容仅来自 Amazon 官方来源。完整信息以 Amazon 官方原文和 Seller Central 实际通知为准。')); mountedHost.append(section);
  }

  function mount(host, newsModule, actionState) { mountedHost = host; mountedNews = newsModule; mountedState = actionState; showCompleted = false; profileEditing = false; profileError = null; render(); }
  return { mount, getModel, buildDecisionDashboardModel, buildSellerProfileViewModel, saveSellerProfileSelection, clearSellerProfile, canCompleteDecision, completeDecision, effectiveLabel, truncate, actionConfig, isActionRequired, newsHref };
});
