(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KnowledgePage = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  let host = null;
  let page = null;
  let queryCounter = 0;

  const marketplaceLabels = { US: '美国', CA: '加拿大', MX: '墨西哥', UK: '英国', DE: '德国', FR: '法国', IT: '意大利', ES: '西班牙', NL: '荷兰', SE: '瑞典', PL: '波兰', BE: '比利时', AU: '澳大利亚', JP: '日本', EU: '欧盟', GLOBAL: '全球' };
  const statusLabels = { success: '已完成', partial: '部分信息可用', insufficient: '证据不足', blocked: '当前无法继续', error: '查询失败' };
  const limitationLabels = { 'missing-account-data': '缺少账户数据', 'insufficient-evidence': '现有证据不足', 'conflicting-evidence': '不同来源存在未解决冲突', 'stale-evidence': '当前证据可能已经过时', 'missing-current-verification': '尚未完成当前时点验证' };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function createQueryId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    queryCounter += 1;
    return `knowledge-${Date.now()}-${queryCounter}`;
  }

  function statusMessage(text, kind) {
    if (!page) return;
    page.feedback.className = `knowledge-status status-${kind || 'info'}`;
    page.feedback.textContent = text;
    page.feedback.setAttribute('aria-live', 'polite');
  }

  function renderCitation(citation) {
    const node = element('article', 'knowledge-citation');
    const title = citation.title || '来源标题未提供';
    if (citation.url) {
      const link = element('a', '', title);
      link.href = citation.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      node.append(link);
    } else {
      node.append(element('span', '', title));
    }
    [citation.publisher, citation.author, citation.publishedAt, citation.effectiveAt, citation.retrievedAt, citation.usageRole]
      .filter(Boolean)
      .forEach(value => node.append(element('small', '', value)));
    return node;
  }

  function renderSection(title, items, citations) {
    if (!items || !items.length) return null;
    const node = element('section', 'knowledge-section');
    node.append(element('h2', '', title));
    items.forEach(item => {
      const statement = element('article', 'knowledge-statement');
      statement.append(element('p', '', item.text || ''));
      if (item.qualification) statement.append(element('p', 'knowledge-qualification', item.qualification));
      if (item.confidence) statement.append(element('small', '', `置信度：${item.confidence}`));
      (item.citationIds || []).forEach(id => {
        const citation = citations.get(id);
        if (citation) statement.append(renderCitation(citation));
      });
      node.append(statement);
    });
    return node;
  }

  function renderResult(result) {
    if (!host) return;
    host.querySelectorAll('.knowledge-result').forEach(node => node.remove());
    if (!result) return;
    const resultRoot = element('div', 'knowledge-result');
    const answer = result.answer || {};
    const state = element('p', `knowledge-status status-${result.status}`, statusLabels[result.status] || '查询状态');
    state.setAttribute('aria-live', 'polite');
    resultRoot.append(state);
    if (answer.shortAnswer) resultRoot.append(element('section', 'knowledge-summary', answer.shortAnswer));
    const citations = new Map((answer.citations || []).map(citation => [citation.citationId, citation]));
    [
      ['官方事实', answer.officialFacts], ['推导结论', answer.derivedConclusions], ['运营建议', answer.operationalAdvice],
      ['账户相关信息', answer.accountSpecificFindings], ['存在信息冲突', answer.conflictNotes]
    ].forEach(([title, items]) => {
      const section = renderSection(title, items, citations);
      if (section) resultRoot.append(section);
    });
    if ((answer.limitations || []).length) {
      const section = element('section', 'knowledge-section');
      const list = element('ul', 'knowledge-limitations');
      section.append(element('h2', '', '需要注意'));
      answer.limitations.forEach(item => list.append(element('li', '', limitationLabels[item.type] || item.message || item.text || item.type)));
      section.append(list);
      resultRoot.append(section);
    }
    if ((answer.citations || []).length) {
      const section = element('section', 'knowledge-section');
      const list = element('div', 'knowledge-sources');
      section.append(element('h2', '', '来源'));
      answer.citations.forEach(citation => list.append(renderCitation(citation)));
      section.append(list);
      resultRoot.append(section);
    }
    const scope = [...(answer.marketplaces || []), ...(answer.regions || [])].map(value => marketplaceLabels[value] || value);
    if (scope.length || answer.verifiedAt || answer.confidence) {
      resultRoot.append(element('p', 'knowledge-metadata', [scope.join('、'), answer.verifiedAt, answer.confidence].filter(Boolean).join(' · ')));
    }
    host.append(resultRoot);
  }

  function defaultSellerProfile() {
    return root.SellerProfile && typeof root.SellerProfile.getProfile === 'function' ? root.SellerProfile.getProfile() : undefined;
  }

  function defaultRegistry() {
    return root.KnowledgeQueryPreparation && typeof root.KnowledgeQueryPreparation.createProductionTemplateRegistry === 'function'
      ? root.KnowledgeQueryPreparation.createProductionTemplateRegistry()
      : null;
  }

  function showCandidates(candidates) {
    const list = element('ul', 'knowledge-suggestions');
    candidates.forEach(candidate => {
      const scope = [...(candidate.marketplaces || []), ...(candidate.regions || [])].map(value => marketplaceLabels[value] || value).join('、');
      list.append(element('li', '', scope ? `${candidate.title}（${scope}）` : candidate.title));
    });
    host.append(list);
  }

  function showSuggestions(registry) {
    const templates = registry && Array.isArray(registry.templates) ? registry.templates : [];
    if (!templates.length) return;
    const section = element('section', 'knowledge-supported-topics');
    const list = element('ul', 'knowledge-suggestions');
    section.append(element('h2', '', '当前支持的问题'));
    templates.forEach(template => list.append(element('li', '', template.question || template.title)));
    section.append(list);
    host.append(section);
  }

  function bridgeRequest(preparation, options) {
    const request = {
      queryId: createQueryId(),
      question: preparation.originalQuestion,
      claims: preparation.claims,
      options: {},
      metadata: { templateId: preparation.matchedTemplateId, normalizedQuestion: preparation.normalizedQuestion, preparationVersion: '7.7B' }
    };
    const sellerProfile = Object.prototype.hasOwnProperty.call(options, 'sellerProfile') ? options.sellerProfile : defaultSellerProfile();
    if (sellerProfile !== undefined) request.sellerProfile = sellerProfile;
    if (Object.prototype.hasOwnProperty.call(options, 'accountContext') && options.accountContext !== undefined) request.accountContext = options.accountContext;
    return request;
  }

  async function submit() {
    if (!page) return;
    const question = page.textarea.value;
    if (!question || !question.trim()) {
      statusMessage('请输入一个 Amazon 运营问题。', 'error');
      return;
    }
    const preparation = page.prepareKnowledgeQuery(question, page.registry);
    if (!preparation || preparation.status === 'invalid') {
      statusMessage('请输入有效问题。', 'error');
      return;
    }
    if (preparation.status === 'unsupported') {
      statusMessage('当前运营知识库暂未覆盖这个问题。', 'blocked');
      showSuggestions(page.registry);
      return;
    }
    if (preparation.status === 'ambiguous') {
      statusMessage('这个问题可能对应多个知识主题，请选择更具体的问题。', 'blocked');
      showCandidates(preparation.candidates || []);
      return;
    }
    if (!page.queryDependencies || typeof page.executeKnowledgeQuery !== 'function') {
      statusMessage('知识查询运行环境尚未准备完成。', 'blocked');
      return;
    }
    const request = bridgeRequest(preparation, page.options);
    page.activeQueryId = request.queryId;
    page.submit.disabled = true;
    renderResult(null);
    statusMessage('正在查询并验证相关资料……', 'submitting');
    try {
      const result = await page.executeKnowledgeQuery(request, page.queryDependencies);
      if (!page || result == null || result.queryId !== page.activeQueryId) return;
      renderResult(result);
    } catch (_) {
      if (page && request.queryId === page.activeQueryId) statusMessage('查询执行失败，请稍后重试。', 'error');
    } finally {
      if (page && request.queryId === page.activeQueryId) page.submit.disabled = false;
    }
  }

  function mount(target, options) {
    host = target;
    const resolvedOptions = options || {};
    const prepare = resolvedOptions.prepareKnowledgeQuery || (root.KnowledgeQueryPreparation && root.KnowledgeQueryPreparation.prepareKnowledgeQuery);
    const registry = resolvedOptions.templateRegistry || defaultRegistry();
    const execute = resolvedOptions.executeKnowledgeQuery || (root.KnowledgeQueryOrchestrator && root.KnowledgeQueryOrchestrator.executeKnowledgeQuery);
    host.classList.add('knowledge-page');
    host.replaceChildren();
    const header = element('header', 'knowledge-header');
    header.append(element('h1', '', 'Amazon运营知识库'), element('p', '', '基于 Amazon 官方资料、运营知识与已验证证据，帮助你理解规则、政策和运营问题。'));
    const composer = element('section', 'knowledge-composer');
    const label = element('label', '', '请输入你的运营问题');
    label.htmlFor = 'knowledgeQuestion';
    const textarea = element('textarea', '');
    textarea.id = 'knowledgeQuestion';
    textarea.placeholder = '例如：英国站 SIPP 现在有什么要求？';
    const button = element('button', '', '查询');
    button.type = 'button';
    const feedback = element('p', 'knowledge-status', '');
    feedback.setAttribute('aria-live', 'polite');
    composer.append(label, textarea, element('p', '', '当前知识库支持已注册的运营知识主题。'), button, feedback);
    host.append(header, composer, element('p', 'knowledge-idle', '你可以输入一个 Amazon 运营问题开始。'));
    page = { options: resolvedOptions, textarea, submit: button, feedback, registry, prepareKnowledgeQuery: prepare, executeKnowledgeQuery: execute, queryDependencies: resolvedOptions.queryDependencies, activeQueryId: null };
    button.addEventListener('click', submit);
    showSuggestions(registry);
    renderResult(resolvedOptions.initialResult);
  }

  function unmount() {
    if (host) {
      host.replaceChildren();
      host.classList.remove('knowledge-page');
    }
    host = null;
    page = null;
  }

  return { mount, unmount, renderResult };
});
