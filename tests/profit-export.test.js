const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('../calculator.js');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({
  console,
  Date,
  setTimeout,
  clearTimeout,
  document: { querySelector: () => null },
  alert: () => {}
});
vm.runInContext(fs.readFileSync(path.join(root, 'xlsx.bundle.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'profit-export.js'), 'utf8'), context);

const baseInput = Object.freeze({
  marketplace: 'US', currency: 'USD', exchangeRate: 7.12,
  sellingPrice: 30, discountRate: 5, vatRate: 0, includesVat: false,
  productCost: 35.6, packagingCost: 1.2, labelingCost: 0.5,
  inspectionCost: 0.7, toolingAmortization: 0.4, freight: 14.24,
  duty: 2, customsClearance: 1, referralRate: 15, fbaFee: 4,
  storageCost: 0.3, adMode: 'acos', acos: 20, cpc: 0.6, cvr: 10,
  returnRate: 5, averageLossPerReturn: 8, otherVariableCost: 0.2,
  targetAcosInput: 15
});

function snapshotFor(input) {
  const normalized = Engine.normalize(input);
  const generated = Engine.generateScenarioInputs(normalized);
  const names = { base: '基础情景', conservative: '保守情景', stress: '压力情景' };
  const scenarios = Object.fromEntries(Object.entries(generated).map(([key, scenarioInput]) =>
    [key, { name: names[key], input: scenarioInput, result: Engine.calculate(scenarioInput) }]
  ));
  return {
    productInfo: { name: '1:64 Diecast Display Garage', sku: 'DG-001', asin: 'B0TEST123', category: 'Toys & Games', supplier: 'Supplier A', notes: '第一批测试，目标英国站。\n包含中文换行。' },
    input: normalized,
    result: Engine.calculate(normalized),
    scenarios,
    sensitivity: Engine.sensitivity(normalized),
    exchangeRate: { rate: normalized.exchangeRate, source: '测试固定汇率', date: '2026-09-18', fetchedAt: '2026-09-18T07:44:00.000Z', mode: '手动', status: '手动' },
    generatedAt: '2026-09-18T08:00:00.000Z'
  };
}

const requiredSheets = ['利润摘要', '输入参数', '成本明细', '盈亏平衡分析', '情景分析', '敏感性分析', '数据口径', '报告信息'];
for (const [marketplace, currency, exchangeRate] of [['US', 'USD', 7.12], ['UK', 'GBP', 9.36], ['DE', 'EUR', 8.42]]) {
  const snapshot = snapshotFor({ ...baseInput, marketplace, currency, exchangeRate });
  const workbook = context.ProfitExcelExporter.buildWorkbook(snapshot);
  assert.deepEqual(Array.from(workbook.SheetNames), requiredSheets, `${marketplace} sheet names`);
  const serialized = context.XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const reopened = context.XLSX.read(serialized, { type: 'array', cellStyles: true });
  assert.deepEqual(Array.from(reopened.SheetNames), requiredSheets, `${marketplace} serialized workbook opens`);

  const summary = workbook.Sheets['利润摘要'];
  const summaryRows = context.XLSX.utils.sheet_to_json(summary, { header: 1, raw: true, defval: null });
  const row = label => summaryRows.find(item => item[0] === label);
  assert.equal(row('单件净利润')[1], snapshot.result.netProfitLocal, `${marketplace} net profit must match ProfitEngine`);
  assert.equal(row('净利润率')[1], snapshot.result.netMargin / 100, `${marketplace} net margin ratio`);
  assert.equal(row('盈亏平衡 ACoS')[1], snapshot.result.breakEvenAcos / 100, `${marketplace} break-even ACoS ratio`);
  assert.equal(row('单件净利润')[2], snapshot.result.netProfitLocal * exchangeRate, `${marketplace} CNY reference amount`);
  const reportHeaderIndex = summaryRows.findIndex(item => item[0] === '生成时间');
  assert.equal(summaryRows[reportHeaderIndex + 1][1], exchangeRate, `${marketplace} exchange-rate snapshot`);
  const productHeaderIndex = summaryRows.findIndex(item => item[0] === '产品名称');
  assert.equal(summaryRows[productHeaderIndex + 1][1], 'DG-001', `${marketplace} SKU`);
  assert.equal(summaryRows.some(item => item[0] === '供应商' || item[0] === '备注'), false, `${marketplace} summary omits supplier and notes`);
  assert.ok(summaryRows.length <= 36, `${marketplace} executive summary stays compact`);
  assert.equal(row('当前 ACoS')[1], snapshot.result.effectiveAcos / 100, `${marketplace} current ACoS`);
  assert.equal(row('当前 ACoS 盈亏缓冲（百分点）')[1], snapshot.result.breakEvenAcos - snapshot.result.effectiveAcos, `${marketplace} current ACoS buffer`);
  assert.equal(row('目标 ACoS 安全缓冲（百分点）')[1], snapshot.result.advertisingSafetyMargin, `${marketplace} target ACoS buffer`);
  assert.match(context.ProfitExcelExporter.reportId(snapshot), /^FBA-20260918-\d{6}-[A-Z]{2}-DG-001$/);
  assert.equal(context.ProfitExcelExporter.buildFilename(snapshot), `DG-001_1-64-Diecast-Display-Garage_${marketplace}_Profit_Analysis_2026-09-18.xlsx`);

  const scenario = workbook.Sheets['情景分析'];
  assert.equal(scenario.H3.v, snapshot.scenarios.base.result.netProfitLocal, `${marketplace} base scenario`);
  assert.equal(scenario.H4.v, snapshot.scenarios.conservative.result.netProfitLocal, `${marketplace} conservative scenario`);
  assert.equal(scenario.H5.v, snapshot.scenarios.stress.result.netProfitLocal, `${marketplace} stress scenario`);
  assert.equal(scenario.N3.v, exchangeRate, `${marketplace} scenario exchange-rate snapshot`);

  const sensitivity = workbook.Sheets['敏感性分析'];
  assert.equal(sensitivity['!ref'], `A1:F${snapshot.sensitivity.rows.length + 4}`, `${marketplace} sensitivity row count`);
  assert.equal(sensitivity.C5.v, snapshot.sensitivity.rows[0].netProfit, `${marketplace} sensitivity result`);
}

const negativeSnapshot = snapshotFor({ ...baseInput, productCost: 500 });
const negativeSummary = context.ProfitExcelExporter.buildWorkbook(negativeSnapshot).Sheets['利润摘要'];
const negativeRows = context.XLSX.utils.sheet_to_json(negativeSummary, { header: 1, raw: true, defval: null });
const negativeProfitRowIndex = negativeRows.findIndex(item => item[0] === '单件净利润');
assert.ok(negativeRows[negativeProfitRowIndex][1] < 0, 'negative profit must remain a numeric negative value');
assert.equal(negativeSummary[`B${negativeProfitRowIndex + 1}`].t, 'n', 'negative profit cell type');

const emptySnapshot = snapshotFor(baseInput);
emptySnapshot.productInfo = { name: '', sku: '', asin: '', category: '', supplier: '', notes: '' };
assert.equal(context.ProfitExcelExporter.buildFilename(emptySnapshot), 'Amazon_FBA_Profit_Analysis_US_2026-09-18.xlsx');

const bufferSnapshot = snapshotFor({ ...baseInput, acos: 20, targetAcosInput: 10 });
bufferSnapshot.result = { ...bufferSnapshot.result, effectiveAcos: 20, targetAcos: 10, breakEvenAcos: 46.34, advertisingSafetyMargin: 36.34 };
bufferSnapshot.exchangeRate = { ...bufferSnapshot.exchangeRate, mode: '自动', status: '缓存', source: 'Frankfurter', fetchedAt: '2026-09-18T01:44:00.000Z' };
const bufferRows = context.XLSX.utils.sheet_to_json(context.ProfitExcelExporter.buildSummarySheet(bufferSnapshot), { header: 1, raw: true, defval: null });
const bufferRow = label => bufferRows.find(item => item[0] === label);
assert.ok(Math.abs(bufferRow('当前 ACoS 盈亏缓冲（百分点）')[1] - 26.34) < 1e-9, 'current ACoS break-even buffer');
assert.equal(bufferRow('目标 ACoS 安全缓冲（百分点）')[1], 36.34, 'target ACoS safety buffer');
const reportRows = context.XLSX.utils.sheet_to_json(context.ProfitExcelExporter.buildReportInfoSheet(bufferSnapshot), { header: 1, raw: true, defval: null });
const reportRow = label => reportRows.find(item => item[0] === label);
assert.equal(reportRow('汇率模式')[1], '自动', 'automatic exchange-rate mode');
assert.equal(reportRow('汇率状态')[1], '缓存', 'cached exchange-rate status');
assert.equal(reportRow('Generated By')[1], 'Amazon Seller Workbench', 'report generator');

const inputRows = context.XLSX.utils.sheet_to_json(context.ProfitExcelExporter.buildInputsSheet(bufferSnapshot), { header: 1, raw: true, defval: null });
const inputRow = label => inputRows.find(item => item[0] === label);
assert.equal(inputRow('供应商')[1], 'Supplier A', 'supplier remains in input sheet');
assert.equal(inputRow('备注')[1], '第一批测试，目标英国站。\n包含中文换行。', 'notes remain in input sheet');
assert.notEqual(inputRow('Exchange Rate Fetched At')[1], null, 'full exchange-rate archive remains in input sheet');

console.log('Profit Excel export tests passed.');
