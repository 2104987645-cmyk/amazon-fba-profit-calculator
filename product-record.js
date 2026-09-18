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
   * @property {{name:string,sku:string,asin:string,category:string,supplier:string,notes:string}} productInfo
   * @property {{price:number|null,monthlySales:number|null,monthlyRevenue:number|null,bsr:number|null,rating:number|null,reviewCount:number|null}} marketData
   * @property {{length:number|null,width:number|null,height:number|null,weight:number|null}} physical
   * @property {{productCost:number|null,packagingCost:number|null,inspectionCost:number|null,freight:number|null,duty:number|null,fbaFee:number|null,storageCost:number|null,returnRate:number|null,averageReturnLoss:number|null,referralFeeRate:number|null,vatRate:number|null,acos:number|null,cpc:number|null,cvr:number|null}} profitInputs
   * @property {{competitionScore:number|null,demandScore:number|null,vocScore:number|null,riskScore:number|null,opportunityScore:number|null}} analysis
   * @property {{awdAvailable:number,fbaAvailable:number,fbaInbound:number,totalAvailable:number,totalStockIncludingInbound:number,daysOfSupply:number|null,inventoryStatus:string,updatedAt:string}=} inventory
   * @property {{periodStart:string|null,periodEnd:string|null,unitsSold:number|null,totalSales:number|null,adSales:number|null,organicSales:number|null,adSpend:number|null,adOrders:number|null,clicks:number|null,impressions:number|null,unitCost:number|null,unitCostCurrency:string|null,unitCostLocal:number|null,salesComplete:boolean,adsComplete:boolean,feesComplete:boolean,costComplete:boolean,dataCompleteness:string,acos:number|null,tacos:number|null,breakEvenAcos:number|null,netProfit:number|null,netMargin:number|null,profitLeakAmount:number|null,status:string|null,updatedAt:string|null}=} profitability
   */
  const ProductRecordSchema = Object.freeze({
    identity: Object.freeze(['id', 'asin', 'marketplace', 'currency', 'exchangeRate', 'exchangeRateSource', 'exchangeRateDate', 'exchangeRateFetchedAt', 'manualExchangeRate', 'title', 'brand', 'category', 'mainKeyword']),
    productInfo: Object.freeze(['name', 'sku', 'asin', 'category', 'supplier', 'notes']),
    marketData: Object.freeze(['price', 'monthlySales', 'monthlyRevenue', 'bsr', 'rating', 'reviewCount']),
    physical: Object.freeze(['length', 'width', 'height', 'weight']),
    profitInputs: Object.freeze(['productCost', 'packagingCost', 'inspectionCost', 'freight', 'duty', 'fbaFee', 'storageCost', 'returnRate', 'averageReturnLoss', 'referralFeeRate', 'vatRate', 'acos', 'cpc', 'cvr']),
    analysis: Object.freeze(['competitionScore', 'demandScore', 'vocScore', 'riskScore', 'opportunityScore']),
    inventory: Object.freeze(['awdAvailable', 'fbaAvailable', 'fbaInbound', 'totalAvailable', 'totalStockIncludingInbound', 'daysOfSupply', 'inventoryStatus', 'updatedAt']),
    profitability: Object.freeze(['periodStart', 'periodEnd', 'unitsSold', 'totalSales', 'adSales', 'organicSales', 'adSpend', 'adOrders', 'clicks', 'impressions', 'unitCost', 'unitCostCurrency', 'unitCostLocal', 'salesComplete', 'adsComplete', 'feesComplete', 'costComplete', 'dataCompleteness', 'acos', 'tacos', 'breakEvenAcos', 'netProfit', 'netMargin', 'profitLeakAmount', 'status', 'updatedAt'])
  });

  function normalizeProductRecord(record = {}) {
    const config = root.MarketplaceConfig;
    const marketplace = config?.MARKETPLACES?.[record.marketplace] ? record.marketplace : 'UK';
    const marketplaceData = config?.getMarketplace?.(marketplace) || { currency: 'GBP' };
    const currency = record.currency || marketplaceData.currency;
    const exchangeRate = Number(record.exchangeRate) > 0
      ? Number(record.exchangeRate)
      : (config?.getDefaultExchangeRate?.(currency) || 9.6);
    const sourceProductInfo = record.productInfo && typeof record.productInfo === 'object' ? record.productInfo : {};
    const productInfo = {
      name: String(sourceProductInfo.name ?? record.title ?? ''),
      sku: String(sourceProductInfo.sku ?? record.sku ?? ''),
      asin: String(sourceProductInfo.asin ?? record.asin ?? ''),
      category: String(sourceProductInfo.category ?? record.category ?? ''),
      supplier: String(sourceProductInfo.supplier ?? record.supplier ?? ''),
      notes: String(sourceProductInfo.notes ?? record.notes ?? '')
    };
    return {
      ...record, marketplace, currency, exchangeRate,
      productInfo,
      exchangeRateSource: record.exchangeRateSource || null,
      exchangeRateDate: record.exchangeRateDate || null,
      exchangeRateFetchedAt: record.exchangeRateFetchedAt || null,
      manualExchangeRate: Boolean(record.manualExchangeRate)
    };
  }

  root.WorkbenchModels = Object.freeze({ ProductRecordSchema, normalizeProductRecord });
})(typeof globalThis !== 'undefined' ? globalThis : this);
