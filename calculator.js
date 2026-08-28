(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ProfitEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const n = value => Math.max(0, Number(value) || 0);
  const rate = value => n(value) / 100;
  const safeDivide = (a, b) => b ? a / b : 0;
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;

  const DEFAULTS = Object.freeze({
    sellingPrice: 299, discountRate: 0, vatRate: 0, productCost: 72,
    packagingCost: 0, labelingCost: 0, inspectionCost: 0, toolingAmortization: 0,
    freight: 24, duty: 8, customsClearance: 5, referralRate: 0,
    fbaFee: 0, storageCost: 0, acos: 0, cpc: 0, cvr: 10,
    returnRate: 3, otherVariableCost: 0, targetAcosBuffer: 5
  });

  function normalize(input = {}) {
    return Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, n(input[key] ?? DEFAULTS[key])]));
  }

  function calculate(input = {}) {
    const x = normalize(input);
    const discountAmount = x.sellingPrice * rate(x.discountRate);
    const revenueBeforeTax = x.sellingPrice - discountAmount;
    const vat = x.vatRate ? revenueBeforeTax * rate(x.vatRate) / (1 + rate(x.vatRate)) : 0;
    const netRevenue = revenueBeforeTax - vat;
    const referralFee = revenueBeforeTax * rate(x.referralRate);
    const advertisingCost = revenueBeforeTax * rate(x.acos);
    const returnLoss = revenueBeforeTax * rate(x.returnRate);
    const cogs = x.productCost + x.packagingCost + x.labelingCost + x.inspectionCost +
      x.toolingAmortization + x.freight + x.duty + x.customsClearance;
    const amazonOperatingCosts = referralFee + x.fbaFee + x.storageCost;
    const grossProfit = netRevenue - cogs;
    const grossMargin = safeDivide(grossProfit, netRevenue) * 100;
    const profitBeforeAdvertising = grossProfit - amazonOperatingCosts - returnLoss - x.otherVariableCost;
    const netProfit = profitBeforeAdvertising - advertisingCost;
    const netMargin = safeDivide(netProfit, netRevenue) * 100;
    const totalNonTaxCost = cogs + amazonOperatingCosts + returnLoss + x.otherVariableCost + advertisingCost;
    const roi = safeDivide(netProfit, totalNonTaxCost) * 100;
    const impliedAdCostPerOrder = x.cvr ? x.cpc / rate(x.cvr) : 0;
    const breakEvenAdvertisingCost = Math.max(0, profitBeforeAdvertising);
    const breakEvenAcos = safeDivide(breakEvenAdvertisingCost, revenueBeforeTax) * 100;
    const targetAcos = Math.max(0, breakEvenAcos - x.targetAcosBuffer);
    const breakEvenCpc = breakEvenAdvertisingCost * rate(x.cvr);
    const maximumAffordableCpc = breakEvenCpc;
    const advertisingSafetyMargin = breakEvenAcos - x.acos;

    const variableBurden = rate(x.referralRate) + rate(x.acos) + rate(x.returnRate) +
      (x.vatRate ? rate(x.vatRate) / (1 + rate(x.vatRate)) : 0);
    const fixedUnitCost = cogs + x.fbaFee + x.storageCost + x.otherVariableCost;
    const breakEvenTransactionRevenue = variableBurden < 1 ? fixedUnitCost / (1 - variableBurden) : Infinity;
    const breakEvenSellingPrice = rate(x.discountRate) < 1 ? breakEvenTransactionRevenue / (1 - rate(x.discountRate)) : Infinity;
    const breakEvenProductCost = Math.max(0, x.productCost + netProfit);

    return {
      input: x,
      discountAmount, revenueBeforeTax, vat, netRevenue, referralFee,
      advertisingCost, advertisingCostPerOrder: advertisingCost, impliedAdCostPerOrder,
      returnLoss, cogs, amazonOperatingCosts, grossProfit, grossMargin,
      profitBeforeAdvertising, netProfit, netMargin, totalNonTaxCost, roi,
      breakEvenAdvertisingCost, breakEvenAcos, targetAcos, breakEvenCpc,
      maximumAffordableCpc, advertisingSafetyMargin, breakEvenSellingPrice,
      breakEvenProductCost,
      unitCosts: {
        productCost: x.productCost, packagingCost: x.packagingCost,
        labelingCost: x.labelingCost, inspectionCost: x.inspectionCost,
        toolingAmortization: x.toolingAmortization, freight: x.freight,
        duty: x.duty, customsClearance: x.customsClearance,
        referralFee, fbaFee: x.fbaFee, storageCost: x.storageCost,
        advertisingCost, returnLoss, otherVariableCost: x.otherVariableCost, vat
      }
    };
  }

  function calculateScenario(base, overrides = {}) {
    const mapping = {
      sellingPrice: 'sellingPrice', productCost: 'productCost', freight: 'freight',
      acos: 'acos', returnRate: 'returnRate', cvr: 'cvr'
    };
    const merged = { ...normalize(base) };
    Object.keys(mapping).forEach(key => {
      if (overrides[key] !== undefined) merged[mapping[key]] = n(overrides[key]);
    });
    return calculate(merged);
  }

  const SENSITIVITY_TESTS = Object.freeze({
    sellingPrice: [-5, -10, -15], productCost: [5, 10, 20], freight: [10, 20, 30],
    acos: [15, 20, 25, 30, 40], returnRate: [3, 5, 8, 10, 15]
  });

  function sensitivity(base) {
    const normalized = normalize(base);
    const baseResult = calculate(normalized);
    const rows = [];
    const groups = {};
    for (const [variable, tests] of Object.entries(SENSITIVITY_TESTS)) {
      groups[variable] = tests.map(test => {
        const changed = { ...normalized };
        let label;
        if (variable === 'sellingPrice') {
          changed.sellingPrice *= 1 + test / 100;
          label = `${test}%`;
        } else if (variable === 'productCost' || variable === 'freight') {
          changed[variable] *= 1 + test / 100;
          label = `+${test}%`;
        } else {
          changed[variable] = test;
          label = `${test}%`;
        }
        const result = calculate(changed);
        const row = { variable, label, test, netProfit: result.netProfit, netMargin: result.netMargin, impact: result.netProfit - baseResult.netProfit };
        rows.push(row);
        return row;
      });
    }
    const impactScores = Object.fromEntries(Object.entries(groups).map(([key, values]) =>
      [key, Math.max(...values.map(item => Math.abs(item.impact))) ]));
    const largestImpactVariable = Object.entries(impactScores).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    return { base: baseResult, rows, groups, impactScores, largestImpactVariable };
  }

  return { DEFAULTS, SENSITIVITY_TESTS, normalize, calculate, calculateScenario, sensitivity, round };
});
