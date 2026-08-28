(function () {
  'use strict';
  const Engine = window.ProfitEngine;
  const form = document.querySelector('#profit-form');
  const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 });
  const percent = value => `${Number.isFinite(value) ? value.toFixed(2) : '0.00'}%`;
  const amount = value => Number.isFinite(value) ? money.format(value) : '不可计算';
  const inputIds = Object.keys(Engine.DEFAULTS);
  const scenarioFields = ['sellingPrice', 'productCost', 'freight', 'acos', 'returnRate', 'cvr'];
  const scenarioNames = { base: '基础情景', conservative: '保守情景', stress: '压力情景' };
  const scenarioLabels = { sellingPrice: '销售单价', productCost: '产品成本', freight: '国际运费', acos: 'ACoS（%）', returnRate: '退货率（%）', cvr: '转化率（%）' };
  const sensitivityLabels = { sellingPrice: '销售单价', productCost: '产品成本', freight: '国际运费', acos: '广告成本销售比（ACoS）', returnRate: '退货率' };
  const costLabels = {
    productCost: '产品成本', packagingCost: '包装成本', labelingCost: '贴标成本',
    inspectionCost: '验货成本', toolingAmortization: '工具 / 模具摊销',
    freight: '国际运费', duty: '关税', customsClearance: '报关 / 清关费',
    referralFee: '亚马逊销售佣金', fbaFee: 'FBA 配送费', storageCost: '仓储成本',
    advertisingCost: '广告成本', returnLoss: '退货损耗', otherVariableCost: '其他变动成本', vat: '增值税 / 税费'
  };

  const getBase = () => Object.fromEntries(inputIds.map(id => [id, Math.max(0, Number(document.querySelector(`#${id}`).value) || 0)]));
  const out = (id, value) => { const node = document.querySelector(`#${id}`); if (node) node.textContent = value; };

  function scenarioDefaults(base) {
    return {
      base: Object.fromEntries(scenarioFields.map(key => [key, base[key]])),
      conservative: { sellingPrice: base.sellingPrice * .95, productCost: base.productCost * 1.05, freight: base.freight * 1.1, acos: Math.max(base.acos, 20), returnRate: Math.max(base.returnRate, 5), cvr: base.cvr * .9 },
      stress: { sellingPrice: base.sellingPrice * .85, productCost: base.productCost * 1.2, freight: base.freight * 1.3, acos: Math.max(base.acos, 30), returnRate: Math.max(base.returnRate, 10), cvr: base.cvr * .75 }
    };
  }

  function buildScenarios() {
    const defaults = scenarioDefaults(getBase());
    document.querySelector('#scenario-editor').innerHTML = Object.entries(scenarioNames).map(([key, name]) => `
      <article class="scenario-input-card" data-scenario="${key}">
        <h3>${name}</h3>
        <div>${scenarioFields.map(field => `<label><span>${scenarioLabels[field]}</span><input type="number" min="0" step="0.01" data-field="${field}" value="${defaults[key][field].toFixed(2)}"></label>`).join('')}</div>
      </article>`).join('');
  }

  function readScenario(key) {
    const card = document.querySelector(`[data-scenario="${key}"]`);
    return Object.fromEntries(scenarioFields.map(field => [field, Math.max(0, Number(card.querySelector(`[data-field="${field}"]`).value) || 0)]));
  }

  function renderSummary(r) {
    out('netProfit', amount(r.netProfit)); out('netMargin', percent(r.netMargin));
    out('breakEvenAcos', percent(r.breakEvenAcos)); out('breakEvenCpc', amount(r.breakEvenCpc));
    out('revenueBeforeTax', amount(r.revenueBeforeTax)); out('netRevenue', amount(r.netRevenue));
    out('grossProfit', amount(r.grossProfit)); out('grossMargin', percent(r.grossMargin));
    out('profitBeforeAdvertising', amount(r.profitBeforeAdvertising));
    out('advertisingCostPerOrder', amount(r.advertisingCostPerOrder)); out('roi', percent(r.roi));
    out('breakEvenSellingPrice', amount(r.breakEvenSellingPrice)); out('breakEvenProductCost', amount(r.breakEvenProductCost));
    out('breakEvenAdvertisingCost', amount(r.breakEvenAdvertisingCost)); out('targetAcos', percent(r.targetAcos));
    out('advertisingSafetyMargin', `${r.advertisingSafetyMargin.toFixed(2)} 个百分点`);
    const status = document.querySelector('#profitStatus');
    status.textContent = r.netProfit >= 0 ? '盈利' : '亏损';
    status.classList.toggle('loss', r.netProfit < 0);
    document.querySelector('#netProfit').classList.toggle('negative', r.netProfit < 0);
  }

  function renderScenarios(base) {
    document.querySelector('#scenario-results').innerHTML = Object.entries(scenarioNames).map(([key, name]) => {
      const r = Engine.calculateScenario(base, readScenario(key));
      return `<article class="scenario-result-card ${r.netProfit < 0 ? 'loss-card' : ''}">
        <div class="scenario-title"><h3>${name}</h3><span>${r.netProfit < 0 ? '亏损' : '盈利'}</span></div>
        <strong>${amount(r.netProfit)}</strong>
        <dl><div><dt>净利润率</dt><dd>${percent(r.netMargin)}</dd></div><div><dt>投资回报率</dt><dd>${percent(r.roi)}</dd></div><div><dt>盈亏平衡 ACoS</dt><dd>${percent(r.breakEvenAcos)}</dd></div><div><dt>盈亏平衡 CPC</dt><dd>${amount(r.breakEvenCpc)}</dd></div></dl>
      </article>`;
    }).join('');
  }

  function renderSensitivity(base) {
    const analysis = Engine.sensitivity(base);
    document.querySelector('#impact-callout').innerHTML = `<span>利润影响最大变量</span><strong>${sensitivityLabels[analysis.largestImpactVariable]}</strong><p>以测试范围内相对基础情景的最大绝对利润变化判断。</p>`;
    document.querySelector('#sensitivity-body').innerHTML = analysis.rows.map(row => `<tr class="${row.netProfit < 0 ? 'loss-row' : ''}"><td>${sensitivityLabels[row.variable]}</td><td>${row.label}</td><td>${amount(row.netProfit)}</td><td>${percent(row.netMargin)}</td><td class="${row.impact < 0 ? 'down' : 'up'}">${row.impact >= 0 ? '+' : ''}${amount(row.impact)}</td></tr>`).join('');
  }

  function renderCostDetail(r) {
    document.querySelector('#unit-cost-detail').innerHTML = Object.entries(r.unitCosts).map(([key, value]) => `<div><span>${costLabels[key]}</span><strong>${amount(value)}</strong></div>`).join('');
  }

  function calculateAll() {
    const base = getBase();
    const result = Engine.calculate(base);
    renderSummary(result); renderScenarios(base); renderSensitivity(base); renderCostDetail(result);
  }

  buildScenarios();
  form.addEventListener('input', calculateAll);
  form.addEventListener('reset', () => requestAnimationFrame(() => { buildScenarios(); calculateAll(); }));
  document.querySelector('#scenario-editor').addEventListener('input', calculateAll);
  calculateAll();
})();
