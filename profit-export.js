(function (root) {
  'use strict';
  const XLSX = root.XLSX;
  const REPORT_VERSION = 'Seller Workbench Profit Report v1.1';
  const titleStyle = { font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E5A45' } }, alignment: { horizontal: 'center' } };
  const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '36745B' } }, alignment: { horizontal: 'center' } };
  const sectionStyle = { font: { bold: true, color: { rgb: '244B3D' } }, fill: { fgColor: { rgb: 'DDEBE3' } } };
  const labelStyle = { font: { bold: true, color: { rgb: '244B3D' } }, fill: { fgColor: { rgb: 'EEF5F1' } } };
  const profitStyle = { font: { bold: true, color: { rgb: '185E3E' } }, fill: { fgColor: { rgb: 'DDF2E6' } } };
  const lossStyle = { font: { bold: true, color: { rgb: '9D2E26' } }, fill: { fgColor: { rgb: 'FBE3E0' } } };
  const percentFmt = '0.00%';
  const moneyFmt = '#,##0.00;[Red]-#,##0.00';
  const rateFmt = '0.0000';
  const pointFmt = '0.00 "个百分点"';

  function aoa(rows, widths, freezeRows = 2) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map(w => ({ wch: w }));
    if (freezeRows) ws['!freeze'] = { xSplit: 0, ySplit: freezeRows };
    return ws;
  }
  function cell(ws, r, c) { return ws[XLSX.utils.encode_cell({ r, c })]; }
  function styleRow(ws, row, start, end, style) { for (let c = start; c <= end; c++) if (cell(ws, row, c)) cell(ws, row, c).s = style; }
  function formatRows(ws, rows, percentCols = [], moneyCols = []) {
    rows.forEach((_, r) => {
      percentCols.forEach(c => { if (cell(ws, r, c)?.t === 'n') cell(ws, r, c).z = percentFmt; });
      moneyCols.forEach(c => { if (cell(ws, r, c)?.t === 'n') cell(ws, r, c).z = moneyFmt; });
    });
  }
  function show(value) { return value === null || value === undefined || value === '' ? '—' : value; }
  function localAndCny(value, result) { return [value, value == null ? null : value * result.exchangeRate]; }
  function fmtDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d;
  }
  function reportId(snapshot) {
    const d = new Date(snapshot.generatedAt);
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const sku = cleanPart(snapshot.productInfo?.sku || '', 24);
    return `FBA-${stamp}-${snapshot.result.marketplace}${sku ? `-${sku}` : ''}`;
  }
  function currentAcosBuffer(r) { return r.effectiveAcos == null || r.breakEvenAcos == null ? null : r.breakEvenAcos - r.effectiveAcos; }
  function adStatus(r) {
    if (r.effectiveAcos == null || r.breakEvenAcos == null) return '无法判断';
    if (r.effectiveAcos <= r.breakEvenAcos * 0.75) return '广告盈利安全';
    if (r.effectiveAcos <= r.breakEvenAcos) return '接近盈亏线';
    return '广告已超过盈亏线';
  }
  function productRows(info) {
    return [['产品名称', show(info?.name)], ['SKU', show(info?.sku)], ['ASIN', show(info?.asin)], ['类目', show(info?.category)], ['供应商', show(info?.supplier)], ['备注', show(info?.notes)]];
  }

  function summaryRows(s) {
    const r = s.result, fx = s.exchangeRate, dual = r.currency !== 'CNY';
    const rows = [['Amazon FBA 产品利润分析报告'], ['产品信息'], ...productRows(s.productInfo), ['报告信息'],
      ['报告编号', reportId(s)], ['报告版本', REPORT_VERSION], ['生成来源', 'Amazon Seller Workbench'], ['生成时间', new Date(s.generatedAt)],
      ['Amazon站点', r.marketplace], ['Marketplace Currency', r.currency], ['Exchange Rate', r.exchangeRate], ['Exchange Rate Source', show(fx.source)],
      ['Exchange Rate Date', show(fx.date)], ['Exchange Rate Mode', show(fx.mode)], ['Exchange Rate Fetched At', fmtDateTime(fx.fetchedAt)], ['Exchange Rate Status', show(fx.status)],
      [], dual ? ['核心结果', r.currency, 'CNY参考值'] : ['核心结果', 'CNY']];
    const push = (label, value) => rows.push(dual ? [label, ...localAndCny(value, r)] : [label, value]);
    push('销售单价', r.input.sellingPrice);
    push('实际成交价（折后）', r.discountedSellingPrice);
    push('不含VAT销售收入', r.netRevenue);
    push('VAT / 销售税预估', r.vat);
    push('净销售收入', r.netRevenue);
    push('毛利润', r.grossProfitLocal);
    rows.push(['毛利率', r.grossMargin / 100]);
    push('广告前利润', r.profitBeforeAdvertising);
    push('广告成本', r.advertisingCost);
    push('单件净利润', r.netProfitLocal);
    rows.push(['净利润率', r.netMargin / 100]);
    rows.push(['全成本投资回报率（ROI）', r.roi / 100]);
    rows.push(['当前 ACoS', r.effectiveAcos == null ? null : r.effectiveAcos / 100]);
    rows.push(['目标 ACoS', r.targetAcos == null ? null : r.targetAcos / 100]);
    rows.push(['盈亏平衡 ACoS', r.breakEvenAcos / 100]);
    rows.push(['当前 ACoS 盈亏缓冲（百分点）', currentAcosBuffer(r)]);
    rows.push(['目标 ACoS 安全缓冲（百分点）', r.advertisingSafetyMargin]);
    rows.push(['当前广告状态', adStatus(r)]);
    push('盈亏平衡 CPC', r.breakEvenCpc);
    push('盈亏平衡售价', r.breakEvenSellingPrice);
    rows.push(dual ? ['最大可承受单件采购成本', r.breakEvenProductCostLocal, r.breakEvenProductCostCny] : ['最大可承受单件采购成本', r.breakEvenProductCostCny]);
    push('最大可承受单笔广告成本', r.breakEvenAdvertisingCost);
    rows.push([], ['数据完整性', '结果基于当前用户输入参数。'], ['测算说明', '本报告基于导出时页面参数生成，仅供经营测算参考。Amazon实际费用、税费、汇率、退货与广告表现可能变化。']);
    return rows;
  }

  function buildSummarySheet(s) {
    const rows = summaryRows(s), dual = s.result.currency !== 'CNY', end = dual ? 2 : 1;
    const ws = aoa(rows, dual ? [35, 22, 22] : [35, 24], 0);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: end } }];
    styleRow(ws, 0, 0, end, titleStyle);
    rows.forEach((row, r) => {
      if (row.length === 1 && ['产品信息', '报告信息'].includes(row[0])) styleRow(ws, r, 0, end, sectionStyle);
      if (row[0] === '核心结果') styleRow(ws, r, 0, end, headerStyle);
      if (['单件净利润', '净利润率', '全成本投资回报率（ROI）'].includes(row[0])) styleRow(ws, r, 0, end, s.result.netProfitLocal >= 0 ? profitStyle : lossStyle);
      for (let c = 1; c < row.length; c++) {
        const x = cell(ws, r, c); if (!x || x.t !== 'n') continue;
        if (['毛利率', '净利润率', '全成本投资回报率（ROI）', '当前 ACoS', '目标 ACoS', '盈亏平衡 ACoS'].includes(row[0])) x.z = percentFmt;
        else if (row[0].includes('百分点')) x.z = pointFmt;
        else if (row[0] === 'Exchange Rate') x.z = rateFmt;
        else x.z = moneyFmt;
      }
      if (row[0] === '备注' && cell(ws, r, 1)) cell(ws, r, 1).s = { alignment: { wrapText: true, vertical: 'top' }, fill: { fgColor: { rgb: 'F3F6F4' } } };
      if (['生成时间', 'Exchange Rate Fetched At'].includes(row[0]) && cell(ws, r, 1)?.t === 'd') cell(ws, r, 1).z = 'yyyy-mm-dd hh:mm';
    });
    return ws;
  }

  function buildInputsSheet(s) {
    const i = s.input, r = s.result, fx = s.exchangeRate;
    const rows = [['输入参数'], ['A. 产品信息'], ['字段', '数值', '单位/币种', '说明'], ...productRows(s.productInfo).map(x => [x[0], x[1], '', '']),
      ['B. 站点与汇率'], ['Amazon站点', i.marketplace, '', ''], ['站点币种', r.currency, '', ''], ['汇率', i.exchangeRate, `1 ${r.currency} = X CNY`, fx.mode], ['汇率来源', show(fx.source), '', ''], ['汇率日期', show(fx.date), '', ''], ['汇率状态', show(fx.status), '', ''],
      ['C. 收入与税费'], ['销售单价', i.sellingPrice, r.currency, 'Marketplace Currency'], ['折扣率', i.discountRate / 100, '%', ''], ['VAT / 销售税率', i.vatRate / 100, '%', '仅用于经营测算'], ['销售价格是否含VAT', i.includesVat ? '是' : '否', '', ''], ['Amazon销售佣金率', i.referralRate / 100, '%', ''],
      ['D. 中国端成本'], ['单件采购成本', i.productCost, 'CNY', ''], ['包装成本', i.packagingCost, 'CNY', ''], ['贴标成本', i.labelingCost, 'CNY', ''], ['验货成本', i.inspectionCost, 'CNY', ''], ['工具 / 模具摊销', i.toolingAmortization, 'CNY', ''], ['国际运费', i.freight, 'CNY', ''], ['关税', i.duty, 'CNY', ''], ['报关 / 清关费', i.customsClearance, 'CNY', ''],
      ['E. Amazon端成本'], ['FBA配送费', i.fbaFee, r.currency, '手动输入'], ['单件仓储成本', i.storageCost, r.currency, ''], ['其他变动成本', i.otherVariableCost, r.currency, ''],
      ['F. 广告'], ['广告计算模式', i.adMode, '', ''], ['广告成本销售比（ACoS）', i.acos / 100, '%', ''], ['单次点击成本（CPC）', i.cpc, r.currency, ''], ['转化率（CVR）', i.cvr / 100, '%', ''], ['目标 ACoS', i.targetAcosInput ? i.targetAcosInput / 100 : null, '%', ''],
      ['G. 退货'], ['退货率', i.returnRate / 100, '%', ''], ['平均单次退货损失', i.averageLossPerReturn, r.currency, '']];
    const ws = aoa(rows, [31, 28, 24, 34], 3);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    styleRow(ws, 0, 0, 3, titleStyle);
    rows.forEach((row, rr) => {
      if (/^[A-G]\./.test(row[0])) styleRow(ws, rr, 0, 3, sectionStyle);
      if (row[0] === '字段') styleRow(ws, rr, 0, 3, headerStyle);
      if (row[2] === '%' && cell(ws, rr, 1)?.t === 'n') cell(ws, rr, 1).z = percentFmt;
      else if (cell(ws, rr, 1)?.t === 'n') cell(ws, rr, 1).z = moneyFmt;
      if (row[0] === '备注' && cell(ws, rr, 1)) cell(ws, rr, 1).s = { alignment: { wrapText: true, vertical: 'top' } };
    });
    return ws;
  }

  function buildCostSheet(s) {
    const r = s.result;
    const items = [
      ['productCost', '单件采购成本', '采购'], ['packagingCost', '包装成本', '供应链'], ['labelingCost', '贴标成本', '供应链'], ['inspectionCost', '验货成本', '供应链'], ['toolingAmortization', '工具 / 模具摊销', '供应链'], ['freight', '国际运费', '供应链'], ['duty', '关税', '供应链'], ['customsClearance', '报关 / 清关费', '供应链'],
      ['referralFee', 'Amazon销售佣金', 'Amazon'], ['fbaFee', 'FBA配送费', 'Amazon'], ['storageCost', '单件仓储成本', 'Amazon'], ['advertisingCost', '广告成本', '广告'], ['returnLoss', '预估退货损失', '退货'], ['otherVariableCost', '其他变动成本', '其他'], ['vat', 'VAT / 销售税预估', '税费']
    ];
    const rows = [['成本明细'], ['成本项目', '成本类别', `${r.currency}金额`, 'CNY金额', '占销售额比例']];
    items.forEach(([key, label, category]) => { const local = r.unitCosts[key]; rows.push([label, category, local, r.unitCostsCny[key], r.revenueBeforeTax > 0 ? local / r.revenueBeforeTax : 0]); });
    const total = r.totalNonTaxCostLocal + r.vat;
    rows.push(['总成本', '合计', total, total * r.exchangeRate, r.revenueBeforeTax > 0 ? total / r.revenueBeforeTax : 0]);
    rows.push(['单件净利润', '结果', r.netProfitLocal, r.netProfitCny, r.revenueBeforeTax > 0 ? r.netProfitLocal / r.revenueBeforeTax : 0]);
    const ws = aoa(rows, [31, 16, 18, 18, 18], 2);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    styleRow(ws, 0, 0, 4, titleStyle); styleRow(ws, 1, 0, 4, headerStyle); formatRows(ws, rows, [4], [2, 3]);
    styleRow(ws, rows.length - 1, 0, 4, r.netProfitLocal >= 0 ? profitStyle : lossStyle);
    ws['!autofilter'] = { ref: `A2:E${rows.length}` };
    return ws;
  }

  function buildBreakEvenSheet(s) {
    const r = s.result, currentBuffer = currentAcosBuffer(r);
    const rows = [['盈亏平衡分析'], ['指标', '当前值', '盈亏平衡值', '安全缓冲', '状态'],
      ['ACoS', r.effectiveAcos == null ? null : r.effectiveAcos / 100, r.breakEvenAcos / 100, currentBuffer, adStatus(r)],
      ['目标 ACoS', r.targetAcos == null ? null : r.targetAcos / 100, r.breakEvenAcos / 100, r.advertisingSafetyMargin, r.targetAcos == null ? '未设置' : '目标缓冲'],
      ['盈亏平衡 CPC', r.input.cpc, r.breakEvenCpc, r.breakEvenCpc - r.input.cpc, '在当前CVR下可承受的最高单次点击成本'],
      ['盈亏平衡售价', r.input.sellingPrice, r.breakEvenSellingPrice, r.input.sellingPrice - r.breakEvenSellingPrice, ''],
      ['最大可承受单件采购成本', r.productCostLocal, r.breakEvenProductCostLocal, r.breakEvenProductCostLocal - r.productCostLocal, ''],
      ['最大可承受单笔广告成本', r.advertisingCost, r.breakEvenAdvertisingCost, r.breakEvenAdvertisingCost - r.advertisingCost, '']];
    const ws = aoa(rows, [34, 20, 20, 22, 38], 2);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }]; styleRow(ws, 0, 0, 4, titleStyle); styleRow(ws, 1, 0, 4, headerStyle);
    [2, 3].forEach(rr => { [1, 2].forEach(cc => { if (cell(ws, rr, cc)?.t === 'n') cell(ws, rr, cc).z = percentFmt; }); if (cell(ws, rr, 3)?.t === 'n') cell(ws, rr, 3).z = pointFmt; });
    [4, 5, 6, 7].forEach(rr => [1, 2, 3].forEach(cc => { if (cell(ws, rr, cc)?.t === 'n') cell(ws, rr, cc).z = moneyFmt; }));
    return ws;
  }

  function buildScenarioSheet(s) {
    const base = s.scenarios.base.result;
    const rows = [['情景分析'], ['情景', '销售单价', '单件采购成本 (CNY)', '国际运费 (CNY)', 'ACoS', '退货率', 'CVR', '单件净利润', '净利润率', '全成本投资回报率（ROI）', '盈亏平衡 ACoS', '盈亏平衡 CPC', '相对基础情景利润变化', '汇率快照']];
    Object.values(s.scenarios).forEach(x => rows.push([x.name, x.input.sellingPrice, x.input.productCost, x.input.freight, x.input.acos / 100, x.input.returnRate / 100, x.input.cvr / 100, x.result.netProfitLocal, x.result.netMargin / 100, x.result.roi / 100, x.result.breakEvenAcos / 100, x.result.breakEvenCpc, x.result.netProfitLocal - base.netProfitLocal, x.input.exchangeRate]));
    const ws = aoa(rows, [16, 16, 20, 18, 13, 13, 13, 18, 14, 22, 18, 18, 24, 14], 2);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }]; styleRow(ws, 0, 0, 13, titleStyle); styleRow(ws, 1, 0, 13, headerStyle); formatRows(ws, rows, [4, 5, 6, 8, 9, 10], [1, 2, 3, 7, 11, 12]);
    for (let rr = 2; rr < rows.length; rr++) styleRow(ws, rr, 7, 9, rows[rr][7] >= 0 ? profitStyle : lossStyle);
    return ws;
  }

  function buildSensitivitySheet(s) {
    const a = s.sensitivity, labels = { sellingPrice: '销售单价', productCost: '单件采购成本', freight: '国际运费', acos: '广告成本销售比（ACoS）', returnRate: '退货率' };
    const rows = [['敏感性分析'], ['利润影响最大变量', labels[a.largestImpactVariable] || a.largestImpactVariable], [], ['变量', '变化', '单件净利润', '净利润率', '利润变化', '影响方向']];
    a.rows.forEach(x => rows.push([labels[x.variable] || x.variable, x.label, x.netProfit, x.netMargin / 100, x.impact, x.impact < 0 ? '负向' : x.impact > 0 ? '正向' : '无变化']));
    const ws = aoa(rows, [31, 18, 18, 16, 18, 14], 4);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }]; styleRow(ws, 0, 0, 5, titleStyle); styleRow(ws, 3, 0, 5, headerStyle); formatRows(ws, rows, [3], [2, 4]);
    ws['!autofilter'] = { ref: `A4:F${rows.length}` };
    return ws;
  }

  function buildDefinitionsSheet(s) {
    const r = s.result;
    const rows = [['数据口径'], ['项目', '定义'], ['汇率定义', `1单位${r.currency} = ${r.exchangeRate} CNY`], ['实际成交价（折后）', '销售单价 ×（1 − 折扣率）'], ['VAT / 销售税预估', '含税：成交额 × VAT率 ÷ (1 + VAT率)；未税：成交额 × VAT率'], ['毛利润公式', '不含VAT销售收入 − 产品及到岸成本'], ['单件净利润公式', '广告前利润 − 广告成本'], ['ACoS定义', '广告花费 ÷ 广告归因销售额'], ['盈亏平衡 ACoS定义', '广告前利润 ÷ 广告销售额计算基数'], ['当前ACoS盈亏缓冲', '盈亏平衡 ACoS − 当前 ACoS，单位为百分点'], ['目标ACoS安全缓冲', '盈亏平衡 ACoS − 目标 ACoS，单位为百分点'], ['CPC/CVR公式', '单笔广告成本 = CPC ÷ CVR'], ['全成本投资回报率（ROI）', '单件净利润 ÷ 全部非税投入成本（含广告）'], ['最大可承受单件采购成本', '其他条件不变时，使单件净利润降至0的最高productCost'], ['退货损失公式', '退货率 × 平均单次退货损失'], [], ['免责声明', '本报告为经营测算工具，不替代Amazon官方费用账单、财务会计或税务申报。']];
    const ws = aoa(rows, [34, 92], 2); ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]; styleRow(ws, 0, 0, 1, titleStyle); styleRow(ws, 1, 0, 1, headerStyle); for (let rr = 2; rr < rows.length; rr++) styleRow(ws, rr, 0, 0, labelStyle); return ws;
  }

  function buildWorkbook(snapshot) {
    if (!XLSX) throw new Error('Excel组件未加载');
    const wb = XLSX.utils.book_new();
    wb.Props = { Title: 'Amazon FBA 产品利润分析报告', Subject: reportId(snapshot), Author: 'Amazon Seller Workbench', CreatedDate: new Date(snapshot.generatedAt) };
    [['利润摘要', buildSummarySheet(snapshot)], ['输入参数', buildInputsSheet(snapshot)], ['成本明细', buildCostSheet(snapshot)], ['盈亏平衡分析', buildBreakEvenSheet(snapshot)], ['情景分析', buildScenarioSheet(snapshot)], ['敏感性分析', buildSensitivitySheet(snapshot)], ['数据口径', buildDefinitionsSheet(snapshot)]].forEach(([name, ws]) => XLSX.utils.book_append_sheet(wb, ws, name));
    return wb;
  }
  function cleanPart(value, max = 40) { return String(value || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, max); }
  function buildFilename(snapshot) {
    const d = new Date(snapshot.generatedAt), date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const sku = cleanPart(snapshot.productInfo?.sku, 30), name = cleanPart(snapshot.productInfo?.name, 40), market = cleanPart(snapshot.result.marketplace, 12);
    if (sku) return `${sku}${name ? `_${name}` : ''}_${market}_Profit_Analysis_${date}.xlsx`;
    if (name) return `${name}_${market}_Profit_Analysis_${date}.xlsx`;
    return `Amazon_FBA_Profit_Analysis_${market}_${date}.xlsx`;
  }
  function exportProfitWorkbook() {
    const snapshot = root.ProfitExportData?.getSnapshot?.();
    if (!snapshot || !Number.isFinite(snapshot.result?.netProfitLocal)) throw new Error('当前没有有效计算结果');
    const filename = buildFilename(snapshot);
    XLSX.writeFile(buildWorkbook(snapshot), filename, { compression: true, cellStyles: true });
    return filename;
  }
  function updateButton(button) { try { const s = root.ProfitExportData?.getSnapshot?.(); button.disabled = !s || !Number.isFinite(s.result?.netProfitLocal); } catch (_) { button.disabled = true; } }
  function setButtonState(button, label, disabled) { button.textContent = label; button.disabled = disabled; }
  function initialize() {
    const meta = document.querySelector('#profitToolHeader .tool-header-meta');
    if (!meta || document.querySelector('#exportProfitExcel')) return;
    const button = document.createElement('button');
    button.id = 'exportProfitExcel'; button.type = 'button'; button.className = 'export-excel-button'; button.textContent = '导出 Excel 报告';
    button.onclick = () => {
      if (button.disabled) return;
      setButtonState(button, '正在生成...', true);
      try {
        exportProfitWorkbook(); setButtonState(button, '已导出', true);
        setTimeout(() => { button.textContent = '导出 Excel 报告'; updateButton(button); }, 1600);
      } catch (error) {
        setButtonState(button, '导出失败，请重试', true);
        setTimeout(() => { button.textContent = '导出 Excel 报告'; updateButton(button); }, 2200);
        console.error('[Profit Excel Export]', error);
      }
    };
    meta.append(button);
    document.querySelector('#profit-form')?.addEventListener('input', () => updateButton(button));
    updateButton(button);
  }
  root.ProfitExcelExporter = Object.freeze({ buildWorkbook, buildSummarySheet, buildInputsSheet, buildCostSheet, buildBreakEvenSheet, buildScenarioSheet, buildSensitivitySheet, buildDefinitionsSheet, buildFilename, reportId, exportProfitWorkbook });
  initialize();
})(typeof globalThis !== 'undefined' ? globalThis : this);
