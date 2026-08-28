(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ProfitEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const n = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const rate = value => n(value) / 100;
  const safeDivide = (a, b) => b > 0 ? a / b : 0;
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;

  const DEFAULTS = Object.freeze({
    sellingPrice: 299, discountRate: 0, vatRate: 0, includesVat: true,
    productCost: 72, packagingCost: 0, labelingCost: 0, inspectionCost: 0,
    toolingAmortization: 0, freight: 24, duty: 8, customsClearance: 5,
    referralRate: 0, fbaFee: 0, storageCost: 0,
    adMode: 'acos', acos: 0, cpc: 0, cvr: 10,
    returnRate: 3, averageLossPerReturn: 0, otherVariableCost: 0,
    targetAcosInput: 0
  });

  function normalize(input = {}) {
    const normalized = {};
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
      if (key === 'adMode') normalized[key] = input[key] === 'cpc' ? 'cpc' : 'acos';
      else if (key === 'includesVat') normalized[key] = input[key] === undefined ? fallback : input[key] === true || input[key] === 'true' || input[key] === 'yes';
      else normalized[key] = n(input[key] ?? fallback);
    }
    return normalized;
  }

  function calculate(input = {}) {
    const x = normalize(input);
    const discountAmount = x.sellingPrice * rate(x.discountRate);
    const discountedSellingPrice = x.sellingPrice - discountAmount;

    const vat = x.includesVat
      ? discountedSellingPrice * rate(x.vatRate) / (1 + rate(x.vatRate))
      : discountedSellingPrice * rate(x.vatRate);
    const netRevenue = x.includesVat ? discountedSellingPrice - vat : discountedSellingPrice;
    const grossCustomerPrice = x.includesVat ? discountedSellingPrice : discountedSellingPrice + vat;

    // One shared denominator for all advertising metrics.
    const advertisingRevenueBase = grossCustomerPrice;
    const referralFee = advertisingRevenueBase * rate(x.referralRate);
    const acosBasedAdvertisingCost = advertisingRevenueBase * rate(x.acos);
    const cpcModelValid = x.cvr > 0;
    const clicksPerOrder = cpcModelValid ? 1 / rate(x.cvr) : null;
    const cpcCvrAdvertisingCost = cpcModelValid ? x.cpc / rate(x.cvr) : null;
    const impliedAcos = cpcModelValid && advertisingRevenueBase > 0
      ? cpcCvrAdvertisingCost / advertisingRevenueBase * 100
      : null;
    const advertisingCost = x.adMode === 'cpc'
      ? (cpcModelValid ? cpcCvrAdvertisingCost : 0)
      : acosBasedAdvertisingCost;
    const effectiveAcos = x.adMode === 'cpc' ? impliedAcos : x.acos;
    const adParameterDifference = impliedAcos === null ? null : Math.abs(x.acos - impliedAcos);
    const adParameterWarning = x.acos > 0 && x.cpc > 0 && cpcModelValid && adParameterDifference > 1;
    const adModeError = x.adMode === 'cpc' && !cpcModelValid
      ? 'CVR必须大于0才能使用CPC/CVR广告模式。'
      : '';

    const returnLoss = rate(x.returnRate) * x.averageLossPerReturn;
    const returnLossWarning = x.returnRate > 0 && x.averageLossPerReturn === 0
      ? '尚未设置平均每次退货损失。'
      : '';
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

    const breakEvenAdvertisingCost = Math.max(0, profitBeforeAdvertising);
    const breakEvenAcos = safeDivide(breakEvenAdvertisingCost, advertisingRevenueBase) * 100;
    const breakEvenCpc = breakEvenAdvertisingCost * rate(x.cvr);
    const targetAcos = x.targetAcosInput > 0 ? x.targetAcosInput : null;
    const advertisingSafetyMargin = targetAcos === null ? null : breakEvenAcos - targetAcos;

    const discountFactor = Math.max(0, 1 - rate(x.discountRate));
    const netRevenueFactor = x.includesVat ? 1 / (1 + rate(x.vatRate)) : 1;
    const adBaseFactor = x.includesVat ? 1 : 1 + rate(x.vatRate);
    const proportionalBurden = adBaseFactor * (rate(x.referralRate) + (x.adMode === 'acos' ? rate(x.acos) : 0));
    const priceContributionFactor = discountFactor * (netRevenueFactor - proportionalBurden);
    const fixedUnitCost = cogs + x.fbaFee + x.storageCost + x.otherVariableCost + returnLoss +
      (x.adMode === 'cpc' ? advertisingCost : 0);
    const breakEvenSellingPrice = priceContributionFactor > 0 ? fixedUnitCost / priceContributionFactor : null;
    const breakEvenProductCost = Math.max(0, x.productCost + netProfit);

    return {
      input: x, revenue: discountedSellingPrice, revenueBeforeTax: discountedSellingPrice,
      discountedSellingPrice, grossCustomerPrice, advertisingRevenueBase,
      productCost: x.productCost, freight: x.freight, fbaFee: x.fbaFee,
      discountAmount, vat, netRevenue, referralFee,
      advertisingCost, advertisingCostPerOrder: advertisingCost,
      acosBasedAdvertisingCost, cpcCvrAdvertisingCost, clicksPerOrder, impliedAcos,
      effectiveAcos, advertisingCalculationAvailable: x.adMode !== 'cpc' || cpcModelValid,
      adParameterDifference, adParameterWarning, adModeError,
      returnLoss, expectedReturnLoss: returnLoss, returnLossWarning,
      cogs, amazonOperatingCosts, grossProfit, grossMargin,
      profitBeforeAdvertising, profitBeforeAds: profitBeforeAdvertising,
      netProfit, netMargin, totalNonTaxCost, roi, ROI: roi,
      breakEvenAdvertisingCost, breakEvenAcos, targetAcos, breakEvenCpc,
      maximumAffordableCpc: breakEvenCpc, advertisingSafetyMargin,
      breakEvenSellingPrice, breakEvenProductCost,
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
    const merged = { ...normalize(base) };
    for (const key of ['sellingPrice', 'productCost', 'freight', 'acos', 'returnRate', 'cvr']) {
      if (overrides[key] !== undefined) merged[key] = n(overrides[key]);
    }
    return calculate(merged);
  }

  function generateScenarioInputs(base) {
    const clampPercent = value => Math.min(100, n(value));
    const baseCase = { ...normalize(base) };
    baseCase.discountRate = clampPercent(baseCase.discountRate);
    baseCase.returnRate = clampPercent(baseCase.returnRate);
    baseCase.cvr = clampPercent(baseCase.cvr);
    const conservative = {
      ...baseCase,
      sellingPrice: n(baseCase.sellingPrice * 0.95),
      productCost: n(baseCase.productCost * 1.05),
      freight: n(baseCase.freight * 1.10),
      acos: n(baseCase.acos + 10),
      returnRate: clampPercent(baseCase.returnRate + 3),
      cvr: clampPercent(baseCase.cvr * 0.90)
    };
    const stress = {
      ...baseCase,
      sellingPrice: n(baseCase.sellingPrice * 0.85),
      productCost: n(baseCase.productCost * 1.20),
      freight: n(baseCase.freight * 1.30),
      acos: n(baseCase.acos + 20),
      returnRate: clampPercent(baseCase.returnRate + 8),
      cvr: clampPercent(baseCase.cvr * 0.75)
    };
    return { base: baseCase, conservative, stress };
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

  return { DEFAULTS, SENSITIVITY_TESTS, normalize, calculate, calculateScenario, generateScenarioInputs, sensitivity, round };
});
