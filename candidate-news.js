(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CandidateNewsModule = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STORAGE_KEY = 'sellerWorkbench.candidateReviews';
  const MARKETPLACES = ['Global', 'US', 'UK', 'EU', 'DE', 'FR', 'IT', 'ES', 'CA', 'AU', 'JP'];
  const CATEGORIES = ['general', 'fees', 'fba', 'fbm', 'account-health', 'listing', 'advertising', 'brand', 'compliance', 'promotion', 'seller-central', 'developer'];
  const IMPORTANCE = ['', 'high', 'medium', 'low'];
  const MODULES = ['profit', 'profitability', 'inventory', 'news', 'knowledge'];
  const ACTION_TYPES = ['', 'review-cost', 'review-advertising', 'review-inventory', 'review-compliance', 'read-update'];

  function readReviews(storage) {
    try { const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; }
    catch (_) { return {}; }
  }
  function saveReviews(storage, value) { storage.setItem(STORAGE_KEY, JSON.stringify(value)); }
  function overlayCandidate(item, reviews) { return Object.assign({}, item, reviews[item.id] || {}); }

  function toFormalNews(item) {
    return {
      id: item.id, title: item.title, publishedAt: item.publishedAt || item.discoveredAt.slice(0, 10),
      effectiveAt: item.effectiveAt || null, marketplaces: item.marketplaces, category: item.category,
      importance: item.importance || 'low', officialUrl: item.officialUrl,
      sourceType: item.source.type, sourceName: item.source.name, summary: item.summary,
      affectedModules: item.affectedModules || [], actionRequired: item.actionRequired === true,
      actionLevel: item.actionRequired ? 'required' : 'info', actionText: item.actionText || '',
      actionType: item.actionType || null, status: 'active', lastVerifiedAt: new Date().toISOString().slice(0, 10),
      sellerImpact: [], recommendedActions: [], tags: []
    };
  }

  function exportApproved(candidates, reviews) {
    return candidates.map(item => overlayCandidate(item, reviews)).filter(item => item.reviewStatus === 'approved').map(toFormalNews);
  }

  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function field(labelText, control) { const label = el('label', 'candidate-field'); label.append(el('span', '', labelText), control); return label; }
  function select(values, current) { const node = el('select'); values.forEach(value => { const option = el('option', '', value || '未设定'); option.value = value; node.append(option); }); node.value = current == null ? '' : current; return node; }

  function downloadJson(value) {
    const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `approved-news-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function loadJson(url, fallback) { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json().catch(() => fallback); }

  function buildCard(raw, storage, rerender) {
    const reviews = readReviews(storage); const item = overlayCandidate(raw, reviews);
    const card = el('article', `candidate-card status-${item.reviewStatus}`);
    const badges = el('div', 'candidate-badges');
    badges.append(el('span', 'candidate-status', item.reviewStatus === 'approved' ? '已审核，待发布' : item.reviewStatus === 'rejected' ? '已忽略' : '待审核'));
    (item.marketplaces || []).forEach(m => badges.append(el('span', '', m)));
    card.append(badges, el('h3', '', item.title));
    card.append(el('p', 'candidate-meta', `来源：${item.source.name}　发现：${item.discoveredAt || '—'}　发布：${item.publishedAt || '未识别'}`));
    const link = el('a', 'candidate-link', '查看 Amazon 官方原文 →'); link.href = item.officialUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
    if (item.possibleDuplicateOf) card.append(el('p', 'candidate-warning', `可能与 ${item.possibleDuplicateOf} 重复，请人工确认。`));

    const details = el('details', 'candidate-review'); details.open = item.reviewStatus === 'pending'; details.append(el('summary', '', '审核与编辑'));
    const form = el('form', 'candidate-form');
    const marketplace = select(MARKETPLACES, (item.marketplaces || ['Global'])[0]);
    const category = select(CATEGORIES, item.category); const importance = select(IMPORTANCE, item.importance || '');
    const summary = el('textarea'); summary.value = item.summary || ''; summary.rows = 3;
    const affected = el('div', 'candidate-checks'); MODULES.forEach(value => { const label = el('label'); const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.value = value; checkbox.checked = (item.affectedModules || []).includes(value); label.append(checkbox, document.createTextNode(value)); affected.append(label); });
    const actionRequired = el('input'); actionRequired.type = 'checkbox'; actionRequired.checked = item.actionRequired === true;
    const actionText = el('input'); actionText.value = item.actionText || '';
    const actionType = select(ACTION_TYPES, item.actionType || '');
    const effectiveAt = el('input'); effectiveAt.type = 'date'; effectiveAt.value = item.effectiveAt || '';
    form.append(field('Marketplace', marketplace), field('Category', category), field('Importance', importance), field('Summary', summary), field('Affected Modules', affected), field('Action Required', actionRequired), field('Action Text', actionText), field('Action Type', actionType), field('Effective Date', effectiveAt));
    const actions = el('div', 'candidate-actions'); const approve = el('button', 'candidate-approve', '保存为“已审核，待发布”'); approve.type = 'submit';
    const reject = el('button', 'candidate-reject', '忽略候选'); reject.type = 'button'; actions.append(approve, reject); form.append(actions);
    form.addEventListener('submit', event => { event.preventDefault(); const next = readReviews(storage); next[item.id] = { reviewStatus: 'approved', marketplaces: [marketplace.value], category: category.value, importance: importance.value || null, summary: summary.value.trim(), affectedModules: [...affected.querySelectorAll('input:checked')].map(input => input.value), actionRequired: actionRequired.checked, actionText: actionText.value.trim(), actionType: actionType.value || null, effectiveAt: effectiveAt.value || null }; saveReviews(storage, next); rerender(); });
    reject.addEventListener('click', () => { const next = readReviews(storage); next[item.id] = Object.assign({}, next[item.id], { reviewStatus: 'rejected' }); saveReviews(storage, next); rerender(); });
    details.append(form); card.append(details); return card;
  }

  async function mount(target) {
    const storage = window.localStorage; target.replaceChildren(); target.className = 'candidate-news-panel';
    const header = el('div', 'candidate-heading'); header.append(el('div', '', ''), el('button', 'candidate-export', '导出已审核 JSON'));
    header.firstChild.append(el('h2', '', '待审核情报'), el('p', '', '自动发现只进入候选池。审核状态仅保存在本浏览器；“已审核”不等于“已发布”。'));
    target.append(header); const body = el('div', 'candidate-body'); target.append(body);
    try {
      const [candidates, sourceState] = await Promise.all([loadJson('data/incoming-news.json', []), loadJson('data/news-source-state.json', {})]);
      const render = () => { body.replaceChildren(); const reviews = readReviews(storage); const pending = candidates.filter(item => overlayCandidate(item, reviews).reviewStatus !== 'rejected');
        const successTimes = Object.values(sourceState).map(item => item.lastSuccessAt).filter(Boolean).sort();
        body.append(el('p', 'candidate-run-status', `候选 ${candidates.length} 条 · 来源 ${Object.keys(sourceState).length} 个 · 最近成功检查 ${successTimes.at(-1) || '尚无记录'}`));
        if (!pending.length) body.append(el('p', 'candidate-empty', '当前没有待显示的候选情报。'));
        pending.forEach(item => body.append(buildCard(item, storage, render)));
      };
      header.lastChild.addEventListener('click', () => { const approved = exportApproved(candidates, readReviews(storage)); if (!approved.length) { window.alert('当前没有“已审核，待发布”的候选。'); return; } downloadJson(approved); });
      render();
    } catch (error) { body.append(el('p', 'candidate-error', `候选情报加载失败：${error.message}`)); }
  }

  return { mount, readReviews, overlayCandidate, toFormalNews, exportApproved, STORAGE_KEY };
});
