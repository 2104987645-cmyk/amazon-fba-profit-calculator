'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Preparation = require('../knowledge-query-preparation');

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.parentNode = null;
    this.classList = {
      add: name => { if (!this.className.split(/\s+/).includes(name)) this.className = `${this.className} ${name}`.trim(); },
      remove: name => { this.className = this.className.split(/\s+/).filter(value => value && value !== name).join(' '); }
    };
  }

  append(...nodes) {
    nodes.forEach(node => {
      node.parentNode = this;
      this.children.push(node);
    });
  }

  replaceChildren(...nodes) {
    this.children.forEach(node => { node.parentNode = null; });
    this.children = [];
    this.append(...nodes);
  }

  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  async trigger(name) { return this.listeners[name]({ preventDefault() {} }); }

  querySelectorAll(selector) {
    const output = [];
    const match = node => selector.startsWith('.') ? node.className.split(/\s+/).includes(selector.slice(1)) : selector.startsWith('#') ? node.id === selector.slice(1) : node.tagName === selector.toUpperCase();
    const visit = node => node.children.forEach(child => { if (match(child)) output.push(child); visit(child); });
    visit(this);
    return output;
  }
}

function text(node) {
  return [node.textContent, ...node.children.map(text)].filter(Boolean).join(' ');
}

function find(host, selector) {
  const node = host.querySelectorAll(selector)[0];
  assert.ok(node, `missing ${selector}`);
  return node;
}

global.document = { createElement: tag => new FakeElement(tag) };
const Page = require('../knowledge-page');

function claim(id) {
  return { claimId: id, text: '英国站 SIPP 当前参与要求。', claimType: 'eligibility', topic: 'fba-logistics', intent: 'eligibility', marketplaces: ['UK'], regions: [], requestedYear: '2026', freshness: 'current', authorityRequirement: { mustInclude: ['amazon-official'] }, temporalRequirement: { mode: 'current', maxAgeDays: 30 }, metadata: {} };
}

function registry() {
  return Preparation.createTemplateRegistry([{
    templateId: 'sipp', title: '英国站 SIPP 当前要求', question: '英国站 SIPP 现在有什么要求？', aliases: ['英国SIPP有什么要求'], marketplaces: ['UK'], regions: [], claims: [claim('sipp')], metadata: {}
  }]);
}

function result(queryId, status = 'success') {
  return {
    queryId,
    status,
    answer: {
      shortAnswer: '已基于证据完成回答。',
      officialFacts: [{ text: '英国站 SIPP 当前参与要求。', citationIds: ['c1'], confidence: 'high' }],
      derivedConclusions: [], operationalAdvice: [], accountSpecificFindings: [], conflictNotes: [], limitations: [],
      citations: [{ citationId: 'c1', title: 'Original English title', url: null, publisher: 'Amazon', author: null, retrievedAt: '2026-01-01', usageRole: 'factual-support' }]
    }
  };
}

async function flush() { await Promise.resolve(); await Promise.resolve(); }

async function run() {
  assert.deepEqual(Object.keys(Page).sort(), ['mount', 'renderResult', 'unmount']);
  const calls = [];
  const dependencies = { adapters: {}, claimVerifier: {}, components: {} };
  const host = new FakeElement('div');
  Page.mount(host, {
    templateRegistry: registry(),
    sellerProfile: { marketplaces: ['UK'] },
    accountContext: { connected: false, metadata: {} },
    queryDependencies: dependencies,
    prepareKnowledgeQuery: Preparation.prepareKnowledgeQuery,
    executeKnowledgeQuery: async (request, receivedDependencies) => {
      calls.push({ request, receivedDependencies });
      return result(request.queryId);
    }
  });
  const label = find(host, 'label');
  const textarea = find(host, 'textarea');
  const button = find(host, 'button');
  const feedback = find(host, '.knowledge-status');
  assert.equal(label.htmlFor, textarea.id);
  assert.equal(textarea.placeholder, '例如：英国站 SIPP 现在有什么要求？');
  assert.equal(button.disabled, false);
  assert.equal(feedback.getAttribute('aria-live'), 'polite');

  textarea.value = '英国站 SIPP 现在有什么要求？';
  const submitting = button.trigger('click');
  assert.equal(button.disabled, true);
  assert.equal(feedback.textContent, '正在查询并验证相关资料……');
  await submitting;
  assert.equal(calls.length, 1);
  assert.strictEqual(calls[0].receivedDependencies, dependencies);
  assert.equal(calls[0].request.question, '英国站 SIPP 现在有什么要求？');
  assert.equal(calls[0].request.metadata.normalizedQuestion, '英国站 sipp 现在有什么要求');
  assert.equal(calls[0].request.metadata.templateId, 'sipp');
  assert.equal(calls[0].request.metadata.preparationVersion, '7.7B');
  assert.deepEqual(calls[0].request.claims, Preparation.prepareKnowledgeQuery(textarea.value, registry()).claims);
  assert.deepEqual(calls[0].request.sellerProfile, { marketplaces: ['UK'] });
  assert.deepEqual(calls[0].request.accountContext, { connected: false, metadata: {} });
  assert.match(text(host), /已完成/);
  assert.match(text(host), /Original English title/);
  assert.equal(host.querySelectorAll('a').length, 0);
  for (const queryStatus of ['partial', 'insufficient', 'blocked', 'error']) {
    Page.renderResult({ queryId: `status-${queryStatus}`, status: queryStatus, answer: { officialFacts: [], derivedConclusions: [], operationalAdvice: [], accountSpecificFindings: [], conflictNotes: [], limitations: [], citations: [] } });
    assert.match(text(host), new RegExp({ partial: '部分信息可用', insufficient: '证据不足', blocked: '当前无法继续', error: '查询失败' }[queryStatus]));
  }
  Page.renderResult({ queryId: 'link', status: 'success', answer: { officialFacts: [], derivedConclusions: [], operationalAdvice: [], accountSpecificFindings: [], conflictNotes: [], limitations: [], citations: [{ citationId: 'linked', title: 'Original title', url: 'https://sellercentral.amazon.com/help', publisher: null, author: null }] } });
  assert.equal(host.querySelectorAll('a').length, 1);

  textarea.value = '英国SIPP有什么要求';
  await button.trigger('click');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].request.metadata.templateId, 'sipp');
  assert.notEqual(calls[0].request.queryId, calls[1].request.queryId);

  textarea.value = '未注册的问题';
  await button.trigger('click');
  assert.equal(calls.length, 2);
  assert.match(feedback.textContent, /暂未覆盖/);

  textarea.value = '';
  await button.trigger('click');
  assert.equal(calls.length, 2);
  assert.equal(feedback.textContent, '请输入一个 Amazon 运营问题。');

  const ambiguousRegistry = Preparation.createTemplateRegistry([
    { templateId: 'a', title: '<img src=x>', question: '重复问题', aliases: [], marketplaces: ['UK'], regions: [], claims: [claim('a')], metadata: {} },
    { templateId: 'b', title: '另一个主题', question: '重复问题', aliases: [], marketplaces: ['UK'], regions: [], claims: [claim('b')], metadata: {} }
  ]);
  Page.mount(host, { templateRegistry: ambiguousRegistry, queryDependencies: dependencies, prepareKnowledgeQuery: Preparation.prepareKnowledgeQuery, executeKnowledgeQuery: async request => { calls.push({ request }); return result(request.queryId); } });
  find(host, 'textarea').value = '重复问题';
  await find(host, 'button').trigger('click');
  assert.equal(calls.length, 2);
  assert.match(text(host), /多个知识主题/);
  assert.match(text(host), /<img src=x>/);

  Page.mount(host, { templateRegistry: registry(), prepareKnowledgeQuery: Preparation.prepareKnowledgeQuery });
  find(host, 'textarea').value = '英国站 SIPP 现在有什么要求？';
  await find(host, 'button').trigger('click');
  assert.match(find(host, '.knowledge-status').textContent, /运行环境尚未准备完成/);

  let firstResolve;
  const delayed = new Promise(resolve => { firstResolve = resolve; });
  let invocation = 0;
  Page.mount(host, { templateRegistry: registry(), queryDependencies: dependencies, prepareKnowledgeQuery: Preparation.prepareKnowledgeQuery, executeKnowledgeQuery: request => { invocation += 1; return invocation === 1 ? delayed : Promise.resolve(result(request.queryId, 'partial')); } });
  const raceTextarea = find(host, 'textarea');
  const raceButton = find(host, 'button');
  raceTextarea.value = '英国站 SIPP 现在有什么要求？';
  const first = raceButton.trigger('click');
  const second = raceButton.trigger('click');
  await second;
  firstResolve(result('obsolete-query', 'success'));
  await first;
  assert.match(text(host), /部分信息可用/);

  Page.mount(host, { templateRegistry: registry(), queryDependencies: dependencies, prepareKnowledgeQuery: Preparation.prepareKnowledgeQuery, executeKnowledgeQuery: async () => { throw new Error('secret failure'); } });
  find(host, 'textarea').value = '英国站 SIPP 现在有什么要求？';
  await find(host, 'button').trigger('click');
  assert.equal(find(host, '.knowledge-status').textContent, '查询执行失败，请稍后重试。');

  const source = fs.readFileSync(require.resolve('../knowledge-page'), 'utf8');
  const workbench = fs.readFileSync(path.join(__dirname, '..', 'workbench.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /textContent/);
  assert.equal(/innerHTML/.test(source), false);
  assert.equal(/buildClaims|inferClaims|extractClaims|generateClaims/.test(source), false);
  assert.equal(/fetch\s*\(|axios|openai|\bllm\b|\bai\b/i.test(source), false);
  assert.match(workbench, /'\/knowledge'/);
  assert.match(workbench, /KnowledgePage\.mount/);
  assert.match(workbench, /即将推出/);
  assert.match(html, /knowledge-query-preparation\.js/);
  assert.match(html, /knowledge-query-orchestrator\.js/);
  assert.match(html, /knowledge-page\.js/);
  console.log('knowledge page passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
