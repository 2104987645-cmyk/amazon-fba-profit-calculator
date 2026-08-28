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
    identity: Object.freeze(['id', 'asin', 'marketplace', 'title', 'brand', 'category', 'mainKeyword']),
    marketData: Object.freeze(['price', 'monthlySales', 'monthlyRevenue', 'bsr', 'rating', 'reviewCount']),
    physical: Object.freeze(['length', 'width', 'height', 'weight']),
    profitInputs: Object.freeze(['productCost', 'packagingCost', 'inspectionCost', 'freight', 'duty', 'fbaFee', 'storageCost', 'returnRate', 'averageReturnLoss', 'referralFeeRate', 'vatRate', 'acos', 'cpc', 'cvr']),
    analysis: Object.freeze(['competitionScore', 'demandScore', 'vocScore', 'riskScore', 'opportunityScore'])
  });

  root.WorkbenchModels = Object.freeze({ ProductRecordSchema });
})(typeof globalThis !== 'undefined' ? globalThis : this);
