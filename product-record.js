(function (root) {
  'use strict';

  /**
   * ProductRecord is the shared contract reserved for future Workbench modules.
   * This file defines structure only; it does not create, persist, or fake product data.
   *
   * @typedef {Object} ProductRecord
   * @property {string} id
   * @property {string} asin
   * @property {string} marketplace
   * @property {string} currency
   * @property {number} exchangeRate
   * @property {string=} exchangeRateSource
   * @property {string=} exchangeRateDate
   * @property {string=} exchangeRateFetchedAt
   * @property {boolean=} manualExchangeRate
   * @property {string} title
   * @property {string} brand
   * @property {string} category
   * @property {string} mainKeyword
   * @property {{price:number|null,monthlySales:number|null,monthlyRevenue:number|null,bsr:number|null,rating:number|null,reviewCount:number|null}} marketData
   * @property {{length:number|null,width:number|null,height:number|null,weight:number|null}} physical
   * @property {{productCost:number|null,packagingCost:number|null,inspectionCost:number|null,freight:number|null,duty:number|null,fbaFee:number|null,storageCost:number|null,returnRate:number|null,averageReturnLoss:number|null,referralFeeRate:number|null,vatRate:number|null,acos:number|null,cpc:number|null,cvr:number|null}} profitInputs
   * @property {{competitionScore:number|null,demandScore:number|null,vocScore:number|null,riskScore:number|null,opportunityScore:number|null}} analysis
   */
  const ProductRecordSchema = Object.freeze({
    identity: Object.freeze(['id', 'asin', 'marketplace', 'currency', 'exchangeRate', 'exchangeRateSource', 'exchangeRateDate', 'exchangeRateFetchedAt', 'manualExchangeRate', 'title', 'brand', 'category', 'mainKeyword']),
    marketData: Object.freeze(['price', 'monthlySales', 'monthlyRevenue', 'bsr', 'rating', 'reviewCount']),
    physical: Object.freeze(['length', 'width', 'height', 'weight']),
    profitInputs: Object.freeze(['productCost', 'packagingCost', 'inspectionCost', 'freight', 'duty', 'fbaFee', 'storageCost', 'returnRate', 'averageReturnLoss', 'referralFeeRate', 'vatRate', 'acos', 'cpc', 'cvr']),
    analysis: Object.freeze(['competitionScore', 'demandScore', 'vocScore', 'riskScore', 'opportunityScore'])
  });

  function normalizeProductRecord(record = {}) {
    const config = root.MarketplaceConfig;
    const marketplace = config?.MARKETPLACES?.[record.marketplace] ? record.marketplace : 'UK';
    const marketplaceData = config?.getMarketplace?.(marketplace) || { currency: 'GBP' };
    const currency = record.currency || marketplaceData.currency;
    const exchangeRate = Number(record.exchangeRate) > 0
      ? Number(record.exchangeRate)
      : (config?.getDefaultExchangeRate?.(currency) || 9.6);
    return {
      ...record, marketplace, currency, exchangeRate,
      exchangeRateSource: record.exchangeRateSource || null,
      exchangeRateDate: record.exchangeRateDate || null,
      exchangeRateFetchedAt: record.exchangeRateFetchedAt || null,
      manualExchangeRate: Boolean(record.manualExchangeRate)
    };
  }

  root.WorkbenchModels = Object.freeze({ ProductRecordSchema, normalizeProductRecord });
})(typeof globalThis !== 'undefined' ? globalThis : this);
