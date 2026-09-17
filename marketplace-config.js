(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MarketplaceConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_EXCHANGE_RATES = Object.freeze({
    USD: 7.10, GBP: 9.60, EUR: 8.30, CAD: 5.20,
    AUD: 4.70, JPY: 0.048, CNY: 1
  });

  const MARKETPLACES = Object.freeze({
    US: Object.freeze({ code: 'US', name: 'Amazon 美国站', domain: 'Amazon.com', currency: 'USD', currencySymbol: '$', defaultVatRate: 0 }),
    UK: Object.freeze({ code: 'UK', name: 'Amazon 英国站', domain: 'Amazon.co.uk', currency: 'GBP', currencySymbol: '£', defaultVatRate: 20 }),
    DE: Object.freeze({ code: 'DE', name: 'Amazon 德国站', domain: 'Amazon.de', currency: 'EUR', currencySymbol: '€', defaultVatRate: 19 }),
    FR: Object.freeze({ code: 'FR', name: 'Amazon 法国站', domain: 'Amazon.fr', currency: 'EUR', currencySymbol: '€', defaultVatRate: 20 }),
    IT: Object.freeze({ code: 'IT', name: 'Amazon 意大利站', domain: 'Amazon.it', currency: 'EUR', currencySymbol: '€', defaultVatRate: 22 }),
    ES: Object.freeze({ code: 'ES', name: 'Amazon 西班牙站', domain: 'Amazon.es', currency: 'EUR', currencySymbol: '€', defaultVatRate: 21 }),
    CA: Object.freeze({ code: 'CA', name: 'Amazon 加拿大站', domain: 'Amazon.ca', currency: 'CAD', currencySymbol: 'C$', defaultVatRate: 0 }),
    AU: Object.freeze({ code: 'AU', name: 'Amazon 澳大利亚站', domain: 'Amazon.com.au', currency: 'AUD', currencySymbol: 'A$', defaultVatRate: 10 }),
    JP: Object.freeze({ code: 'JP', name: 'Amazon 日本站', domain: 'Amazon.co.jp', currency: 'JPY', currencySymbol: '¥', defaultVatRate: 10 })
  });

  const getMarketplace = code => MARKETPLACES[code] || MARKETPLACES.UK;
  const getDefaultExchangeRate = currency => DEFAULT_EXCHANGE_RATES[currency] || 1;

  return { MARKETPLACES, DEFAULT_EXCHANGE_RATES, getMarketplace, getDefaultExchangeRate };
});
