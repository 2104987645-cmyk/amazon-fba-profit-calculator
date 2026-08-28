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
  const scenarioAssumptions = {
    base: '当前主计算器参数',
    conservative: '默认假设：售价 -5%、产品成本 +5%、运费 +10%、ACoS +10个百分点、退货率 +3个百分点、CVR -10%',
    stress: '默认假设：售价 -15%、产品成本 +20%、运费 +30%、ACoS +20个百分点、退货率 +8个百分点、CVR -25%'
  };
  const sensitivityLabels = { sellingPrice: '销售单价', productCost: '产品成本', freight: '国际运费', acos: '广告成本销售比（ACoS）', returnRate: '退货率' };
  const costLabels = {
    productCost: '产品成本', packagingCost: '包装成本', labelingCost: '贴标成本',
    inspectionCost: '验货成本', toolingAmortization: '工具 / 模具摊销',
    freight: '国际运费', duty: '关税', customsClearance: '报关 / 清关费',
    referralFee: '亚马逊销售佣金', fbaFee: 'FBA 配送费', storageCost: '仓储成本',
    advertisingCost: '广告成本', returnLoss: '退货损耗', otherVariableCost: '其他变动成本', vat: '增值税 / 税费'
  };
  let scenarioState;
  let scenarioGenerated = false;
  let scenarioAdjusted = { base: false, conservative: false, stress: false };

  const getBase = () => Object.fromEntries(inputIds.map(id => {
    const value = document.querySelector(`#${id}`).value;
    if (id === 'adMode') return [id, value];
    if (id === 'includesVat') return [id, value === 'true'];
    return [id, Math.max(0, Number(value) || 0)];
  }));
  const out = (id, value) => { const node = document.querySelector(`#${id}`); if (node) node.textContent = value; };
  const clampScenarioValue = (field, value) => {
    const safe = Math.max(0, Number(value) || 0);
    return ['returnRate', 'cvr'].includes(field) ? Math.min(100, safe) : safe;
  };

  function assumptionText(key) {
    return scenarioAdjusted[key] ? `${scenarioAssumptions[key]} · 已手动调整` : scenarioAssumptions[key];
  }

  function buildScenarioEditors() {
    document.querySelector('#scenario-editor').innerHTML = Object.entries(scenarioNames).map(([key, name]) => `
      <article class="scenario-input-card" data-scenario="${key}">
        <h3>${name}</h3>
        <p class="scenario-assumption ${scenarioAdjusted[key] ? 'adjusted' : ''}">${assumptionText(key)}</p>
        <div>${scenarioFields.map(field => `<label><span>${scenarioLabels[field]}</span><input type="number" min="0" ${['returnRate', 'cvr'].includes(field) ? 'max="100"' : ''} step="0.01" data-field="${field}" value="${scenarioState[key][field].toFixed(2)}"></label>`).join('')}</div>
      </article>`).join('');
  }

  function scenarioResultMarkup(key, baseResult) {
    const r = Engine.calculate(scenarioState[key]);
    const profitChange = r.netProfit - baseResult.netProfit;
    const profitChangeRate = baseResult.netProfit === 0 ? null : profitChange / Math.abs(baseResult.netProfit) * 100;
    return `<article class="scenario-result-card ${r.netProfit < 0 ? 'loss-card' : ''}" data-result="${key}">
      <div class="scenario-title"><h3>${scenarioNames[key]}</h3><span>${r.netProfit < 0 ? '亏损' : '盈利'}</span></div>
      <strong>${amount(r.netProfit)}</strong>
      <dl><div><dt>净利润率</dt><dd>${percent(r.netMargin)}</dd></div><div><dt>投资回报率</dt><dd>${percent(r.roi)}</dd></div><div><dt>盈亏平衡 ACoS</dt><dd>${percent(r.breakEvenAcos)}</dd></div><div><dt>盈亏平衡 CPC</dt><dd>${amount(r.breakEvenCpc)}</dd></div><div class="vs-base"><dt>相对基础情景</dt><dd>${key === 'base' ? '—' : `${profitChange >= 0 ? '+' : ''}${amount(profitChange)} / ${profitChangeRate === null ? '—' : `${profitChangeRate >= 0 ? '+' : ''}${percent(profitChangeRate)}`}`}</dd></div></dl>
    </article>`;
  }

  function renderScenarios(keys = Object.keys(scenarioNames)) {
    const baseResult = Engine.calculate(scenarioState.base);
    const container = document.querySelector('#scenario-results');
    if (!container.children.length || keys.length === 3) {
      container.innerHTML = Object.keys(scenarioNames).map(key => scenarioResultMarkup(key, baseResult)).join('');
      return;
    }
    keys.forEach(key => {
      const current = container.querySelector(`[data-result="${key}"]`);
      if (current) current.outerHTML = scenarioResultMarkup(key, baseResult);
    });
  }

  function setScenarioOutdated(outdated) {
    document.querySelector('#scenarioOutdated').hidden = !outdated;
  }

  function generateScenariosFromCurrent() {
    scenarioState = Engine.generateScenarioInputs(getBase());
    scenarioGenerated = true;
    scenarioAdjusted = { base: false, conservative: false, stress: false };
    buildScenarioEditors();
    renderScenarios();
    setScenarioOutdated(false);
  }

  function restoreAutomaticScenarios() {
    const regenerated = Engine.generateScenarioInputs(scenarioState.base);
    scenarioState.conservative = regenerated.conservative;
    scenarioState.stress = regenerated.stress;
    scenarioAdjusted.conservative = false;
    scenarioAdjusted.stress = false;
    buildScenarioEditors();
    renderScenarios();
  }

  function renderSummary(r) {
    out('netProfit', amount(r.netProfit)); out('netMargin', percent(r.netMargin));
    out('breakEvenAcos', percent(r.breakEvenAcos)); out('breakEvenCpc', amount(r.breakEvenCpc));
    out('revenueBeforeTax', amount(r.revenueBeforeTax)); out('vatAmount', amount(r.vat));
    out('netRevenue', amount(r.netRevenue)); out('grossCustomerPrice', amount(r.grossCustomerPrice));
    out('advertisingRevenueBase', amount(r.advertisingRevenueBase));
    out('effectiveAcos', r.effectiveAcos === null ? '不可计算' : percent(r.effectiveAcos));
    out('grossProfit', amount(r.grossProfit)); out('grossMargin', percent(r.grossMargin));
    out('profitBeforeAdvertising', amount(r.profitBeforeAdvertising));
    out('advertisingCostPerOrder', amount(r.advertisingCostPerOrder)); out('roi', percent(r.roi));
    out('breakEvenSellingPrice', amount(r.breakEvenSellingPrice)); out('breakEvenProductCost', amount(r.breakEvenProductCost));
    out('breakEvenAdvertisingCost', amount(r.breakEvenAdvertisingCost));
    out('targetAcos', r.targetAcos === null ? '未设置' : percent(r.targetAcos));
    out('advertisingSafetyMargin', r.advertisingSafetyMargin === null ? '未设置' : `${r.advertisingSafetyMargin.toFixed(2)} 个百分点`);
    const adWarning = document.querySelector('#adParameterWarning');
    adWarning.hidden = !(r.adParameterWarning || r.adModeError);
    adWarning.textContent = r.adModeError || (r.adParameterWarning ? `广告参数不一致：当前输入 ACoS 为 ${percent(r.input.acos)}，但根据 CPC ${amount(r.input.cpc)} 和 CVR ${percent(r.input.cvr)} 推算的 ACoS 为 ${percent(r.impliedAcos)}。请确认应以哪种广告模型计算利润。` : '');
    const returnWarning = document.querySelector('#returnLossWarning');
    const returnModelNeedsInput = r.input.returnRate > 0 && r.input.averageLossPerReturn === 0;
    returnWarning.hidden = !returnModelNeedsInput;
    returnWarning.textContent = returnModelNeedsInput ? '当前平均每次退货损失为 ¥0，因此退货率不会影响利润。若存在退款不可追回、FBA处理费、退货运费、商品折损或不可售损失，请填写平均每次退货损失。' : '';
    const status = document.querySelector('#profitStatus');
    status.textContent = r.netProfit >= 0 ? '盈利' : '亏损';
    status.classList.toggle('loss', r.netProfit < 0);
    document.querySelector('#netProfit').classList.toggle('negative', r.netProfit < 0);
  }

  function renderSensitivity(base) {
    const analysis = Engine.sensitivity(base);
    const returnModelDisabled = Number(base.averageLossPerReturn) === 0;
    const returnSensitivityWarning = document.querySelector('#returnSensitivityWarning');
    returnSensitivityWarning.hidden = !returnModelDisabled;
    returnSensitivityWarning.textContent = returnModelDisabled ? '当前退货损失模型未启用：平均每次退货损失为 ¥0，不同退货率不会改变利润。' : '';
    document.querySelector('#impact-callout').innerHTML = `<span>利润影响最大变量</span><strong>${sensitivityLabels[analysis.largestImpactVariable]}</strong><p>以测试范围内相对基础情景的最大绝对利润变化判断。</p>`;
    document.querySelector('#sensitivity-body').innerHTML = analysis.rows.map(row => {
      const inactiveReturnModel = returnModelDisabled && row.variable === 'returnRate';
      return `<tr class="${row.netProfit < 0 ? 'loss-row ' : ''}${inactiveReturnModel ? 'model-inactive-row' : ''}"><td>${sensitivityLabels[row.variable]}${inactiveReturnModel ? '<small>当前退货损失模型未启用</small>' : ''}</td><td>${row.label}</td><td>${amount(row.netProfit)}</td><td>${percent(row.netMargin)}</td><td class="${row.impact < 0 ? 'down' : 'up'}">${row.impact >= 0 ? '+' : ''}${amount(row.impact)}</td></tr>`;
    }).join('');
  }

  function renderCostDetail(r) {
    document.querySelector('#unit-cost-detail').innerHTML = Object.entries(r.unitCosts).map(([key, value]) => `<div><span>${costLabels[key]}</span><strong>${amount(value)}</strong></div>`).join('');
  }

  function calculateMain() {
    const base = getBase();
    const result = Engine.calculate(base);
    renderSummary(result); renderSensitivity(base); renderCostDetail(result);
  }

  form.addEventListener('input', () => {
    calculateMain();
    if (scenarioGenerated) setScenarioOutdated(true);
  });
  form.addEventListener('reset', () => requestAnimationFrame(() => {
    calculateMain();
    if (scenarioGenerated) setScenarioOutdated(true);
  }));
  document.querySelector('#scenario-editor').addEventListener('input', event => {
    const input = event.target.closest('[data-field]');
    if (!input) return;
    const key = input.closest('[data-scenario]').dataset.scenario;
    const field = input.dataset.field;
    scenarioState[key][field] = clampScenarioValue(field, input.value);
    scenarioAdjusted[key] = true;
    const note = input.closest('.scenario-input-card').querySelector('.scenario-assumption');
    note.textContent = assumptionText(key);
    note.classList.add('adjusted');
    renderScenarios(key === 'base' ? Object.keys(scenarioNames) : [key]);
  });
  document.querySelector('#generateScenarios').addEventListener('click', generateScenariosFromCurrent);
  document.querySelector('#regenerateScenarios').addEventListener('click', generateScenariosFromCurrent);
  document.querySelector('#restoreScenarios').addEventListener('click', restoreAutomaticScenarios);

  calculateMain();
  generateScenariosFromCurrent();
})();
