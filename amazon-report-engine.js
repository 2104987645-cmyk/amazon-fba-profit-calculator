(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AmazonReportEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ALIASES = Object.freeze({
    business: { sku:['SKU','Merchant SKU','seller-sku'], asin:['ASIN','(Child) ASIN','Child ASIN'], unitsSold:['Units Ordered','Units Ordered - B2B','units ordered'], totalSales:['Ordered Product Sales','Ordered Product Sales - B2B','ordered product sales'], currency:['Currency','Currency Code'], periodStart:['Start Date','start-date'], periodEnd:['End Date','end-date'] },
    ads: { sku:['SKU','Advertised SKU','advertised-sku'], asin:['ASIN','Advertised ASIN','advertised-asin'], adSpend:['Spend','Cost','spend'], adSales:['Sales','7 Day Total Sales','14 Day Total Sales','Attributed Sales'], adOrders:['Orders','7 Day Total Orders','14 Day Total Orders'], clicks:['Clicks'], impressions:['Impressions'], currency:['Currency','Currency Code'], periodStart:['Start Date','start-date'], periodEnd:['End Date','end-date'] },
    payments: { sku:['sku','SKU','seller-sku'], asin:['asin','ASIN'], type:['type','transaction-type','Transaction Type'], description:['description','amount-description','Amount Description'], amountType:['amount-type','Amount Type'], amount:['amount','Amount','total'], productSales:['product sales','Product Sales'], referralFees:['selling fees','Selling Fees','referral fees','Referral Fees'], fbaFees:['fba fees','FBA Fees','fulfillment fees'], storageFees:['storage fees','Storage Fees'], refunds:['refunds','Refunds','refund'], otherFees:['other transaction fees','Other Transaction Fees','other fees'], currency:['currency','Currency'], periodStart:['start date','Start Date'], periodEnd:['end date','End Date'] },
    cost: { sku:['SKU','sku','seller-sku'], asin:['ASIN','asin'], unitCost:['Unit Cost','unit-cost','Unit Cost CNY','Unit Cost Local'], currency:['Currency','Unit Cost Currency','currency'] }
  });
  const canonical = value => String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_]+/g,' ');
  const clean = value => String(value ?? '').replace(/^\uFEFF/, '').trim();
  const headerSet = headers => new Set(headers.map(canonical));
  const hasAny = (set, values) => values.some(v => set.has(canonical(v)));
  function detectReportType(headers=[]) {
    const set=headerSet(headers);
    if (hasAny(set,ALIASES.business.asin)&&hasAny(set,ALIASES.business.unitsSold)&&hasAny(set,ALIASES.business.totalSales)) return 'business-report';
    if (hasAny(set,ALIASES.ads.adSpend)&&hasAny(set,ALIASES.ads.adSales)&&hasAny(set,[...ALIASES.ads.sku,...ALIASES.ads.asin])) return 'ads-advertised-product';
    if ((hasAny(set,ALIASES.payments.type)||hasAny(set,ALIASES.payments.amountType)||hasAny(set,ALIASES.payments.referralFees))&&hasAny(set,[...ALIASES.payments.sku,...ALIASES.payments.asin])) return 'payments';
    if (hasAny(set,ALIASES.cost.unitCost)&&hasAny(set,[...ALIASES.cost.sku,...ALIASES.cost.asin])) return 'product-cost';
    return 'unknown';
  }
  function mappingFor(headers, schema, overrides={}) {
    const index=new Map(headers.map(h=>[canonical(h),h])), mapping={};
    Object.keys(ALIASES[schema]).forEach(field=>{mapping[field]=overrides[field]&&headers.includes(overrides[field])?overrides[field]:ALIASES[schema][field].map(canonical).map(a=>index.get(a)).find(Boolean)||null;});
    return mapping;
  }
  function number(raw, field, row, warnings) {
    if(raw===''||raw==null)return null;
    const n=Number(String(raw).replace(/[$£€¥,\s]/g,''));
    if(!Number.isFinite(n)){warnings.push(`第 ${row} 行 ${field} 不是有效数字。`);return null;} return n;
  }
  function keyOf(x,i){return x.sku?`sku:${x.sku}`:x.asin?`asin:${x.asin}`:`unmatched:${i}`;}
  function aggregate(records, fields) {
    const map=new Map(); records.forEach((r,i)=>{const key=keyOf(r,i);if(!map.has(key))map.set(key,{...r});else{const t=map.get(key);fields.forEach(f=>t[f]=(t[f]||0)+(r[f]||0));if(!t.sku)t.sku=r.sku;if(!t.asin)t.asin=r.asin;}});return [...map.values()];
  }
  function commonMeta(rows,mapping){const currencies=new Set(),starts=new Set(),ends=new Set();rows.forEach(r=>{if(mapping.currency&&clean(r[mapping.currency]))currencies.add(clean(r[mapping.currency]));if(mapping.periodStart&&clean(r[mapping.periodStart]))starts.add(clean(r[mapping.periodStart]));if(mapping.periodEnd&&clean(r[mapping.periodEnd]))ends.add(clean(r[mapping.periodEnd]));});return{currencies:[...currencies],periodStarts:[...starts],periodEnds:[...ends]};}
  function normalizeBusinessReport(rows=[],overrides={}) {
    const headers=rows[0]?Object.keys(rows[0]):[],mapping=mappingFor(headers,'business',overrides),warnings=[];
    const missing=['asin','unitsSold','totalSales'].filter(f=>!mapping[f]&&(f!=='asin'||!mapping.sku));
    if(missing.length)return{ok:false,type:'business-report',headers,mapping,missing,warnings,items:[]};
    const items=rows.map((r,i)=>({sku:mapping.sku?clean(r[mapping.sku]):'',asin:mapping.asin?clean(r[mapping.asin]):'',unitsSold:number(r[mapping.unitsSold],'Units Ordered',i+2,warnings),totalSales:number(r[mapping.totalSales],'Ordered Product Sales',i+2,warnings)})).filter(x=>x.sku||x.asin);
    return{ok:true,type:'business-report',headers,mapping,missing:[],warnings,items:aggregate(items,['unitsSold','totalSales']),meta:commonMeta(rows,mapping)};
  }
  function attributionWindow(headers){const joined=headers.join(' ').toLowerCase();return joined.includes('14 day')?'14d':joined.includes('7 day')?'7d':null;}
  function normalizeAdsReport(rows=[],overrides={}) {
    const headers=rows[0]?Object.keys(rows[0]):[],mapping=mappingFor(headers,'ads',overrides),warnings=[];
    const missing=['adSpend','adSales'].filter(f=>!mapping[f]);if(!mapping.sku&&!mapping.asin)missing.unshift('sku/asin');
    if(missing.length)return{ok:false,type:'ads-advertised-product',headers,mapping,missing,warnings,items:[]};
    const items=rows.map((r,i)=>({sku:mapping.sku?clean(r[mapping.sku]):'',asin:mapping.asin?clean(r[mapping.asin]):'',adSpend:number(r[mapping.adSpend],'Ad Spend',i+2,warnings),adSales:number(r[mapping.adSales],'Ad Sales',i+2,warnings),adOrders:mapping.adOrders?number(r[mapping.adOrders],'Ad Orders',i+2,warnings):null,clicks:mapping.clicks?number(r[mapping.clicks],'Clicks',i+2,warnings):null,impressions:mapping.impressions?number(r[mapping.impressions],'Impressions',i+2,warnings):null})).filter(x=>x.sku||x.asin);
    return{ok:true,type:'ads-advertised-product',headers,mapping,missing:[],warnings,items:aggregate(items,['adSpend','adSales','adOrders','clicks','impressions']),attributionWindow:attributionWindow(headers),meta:commonMeta(rows,mapping)};
  }
  function feeBucket(type,description,amountType){const v=`${type} ${description} ${amountType}`.toLowerCase();if(/referral|commission|selling fee/.test(v))return'referralFees';if(/fba|fulfillment|fulfilment/.test(v))return'fbaFees';if(/storage/.test(v))return'storageFees';if(/refund|return|reimbursement reversal/.test(v))return'returnCost';return'otherAmazonFees';}
  function costAmount(value){return value==null?0:value<0?-value:value;}
  function normalizePaymentsReport(rows=[],overrides={}) {
    const headers=rows[0]?Object.keys(rows[0]):[],mapping=mappingFor(headers,'payments',overrides),warnings=[];
    const missing=[];if(!mapping.sku&&!mapping.asin)missing.push('sku/asin');if(!mapping.amount&&!['referralFees','fbaFees','storageFees','refunds','otherFees'].some(f=>mapping[f]))missing.push('amount/fee columns');
    if(missing.length)return{ok:false,type:'payments',headers,mapping,missing,warnings,items:[]};
    const items=rows.map((r,i)=>{const out={sku:mapping.sku?clean(r[mapping.sku]):'',asin:mapping.asin?clean(r[mapping.asin]):'',referralFees:0,fbaFees:0,storageFees:0,returnCost:0,otherAmazonFees:0};
      if(mapping.amount){const amt=number(r[mapping.amount],'Amount',i+2,warnings);const bucket=feeBucket(mapping.type?r[mapping.type]:'',mapping.description?r[mapping.description]:'',mapping.amountType?r[mapping.amountType]:'');out[bucket]+=costAmount(amt);}
      [['referralFees','referralFees'],['fbaFees','fbaFees'],['storageFees','storageFees'],['refunds','returnCost'],['otherFees','otherAmazonFees']].forEach(([src,dst])=>{if(mapping[src])out[dst]+=costAmount(number(r[mapping[src]],src,i+2,warnings));});return out;}).filter(x=>x.sku||x.asin);
    return{ok:true,type:'payments',headers,mapping,missing:[],warnings,items:aggregate(items,['referralFees','fbaFees','storageFees','returnCost','otherAmazonFees']),meta:commonMeta(rows,mapping)};
  }
  function normalizeCostReport(rows=[],overrides={}) {
    const headers=rows[0]?Object.keys(rows[0]):[],mapping=mappingFor(headers,'cost',overrides),warnings=[],missing=[];if(!mapping.sku&&!mapping.asin)missing.push('sku/asin');if(!mapping.unitCost)missing.push('unitCost');if(missing.length)return{ok:false,type:'product-cost',headers,mapping,missing,warnings,items:[]};
    const items=rows.map((r,i)=>({sku:mapping.sku?clean(r[mapping.sku]):'',asin:mapping.asin?clean(r[mapping.asin]):'',unitCost:number(r[mapping.unitCost],'Unit Cost',i+2,warnings),costCurrency:mapping.currency?clean(r[mapping.currency]).toUpperCase():''})).filter(x=>x.sku||x.asin);return{ok:true,type:'product-cost',headers,mapping,missing:[],warnings,items:aggregate(items,[])};
  }
  function buildSkuAsinMap(sources=[]) {const skuToAsin=new Map(),asinToSku=new Map();sources.flat().forEach(x=>{if(x.sku&&x.asin){skuToAsin.set(x.sku,x.asin);if(!asinToSku.has(x.asin))asinToSku.set(x.asin,x.sku);}});return{skuToAsin,asinToSku};}
  function periodWarnings(reports,manualPeriod={}){const warnings=[];const starts=new Set(),ends=new Set();Object.values(reports).filter(Boolean).forEach(r=>{r.meta?.periodStarts?.forEach(x=>starts.add(x));r.meta?.periodEnds?.forEach(x=>ends.add(x));});if(starts.size>1||ends.size>1)warnings.push('报表周期可能不一致，请确认所有报表使用相同日期范围。');if(!manualPeriod.start||!manualPeriod.end)warnings.push('请在顶部设置 Analysis Period，并确保所有上传报表使用相同日期范围。');return warnings;}
  function mergeAmazonReports({business,ads,payments,costs,marketplace='',marketplaceCurrency='',exchangeRates={},period={}}={}) {
    const valid=[business,ads,payments,costs].filter(r=>r?.ok), map=buildSkuAsinMap(valid.map(r=>r.items)), merged=new Map(), unmatched={sales:0,ads:0,fees:0,costs:0};
    function resolve(item,index,source){let sku=item.sku||'',asin=item.asin||'';if(!asin&&sku)asin=map.skuToAsin.get(sku)||'';if(!sku&&asin)sku=map.asinToSku.get(asin)||'';const key=sku?`sku:${sku}`:asin?`asin:${asin}`:`${source}:${index}`;if(!merged.has(key))merged.set(key,{sku,asin,productName:'',marketplace,unitsSold:null,totalSales:null,adSales:null,adSpend:null,adOrders:null,clicks:null,impressions:null,productCost:null,fbaFees:null,referralFees:null,storageFees:null,returnCost:null,otherCosts:null,sourceFlags:{sales:false,ads:false,fees:false,cost:false},warnings:[]});const t=merged.get(key);if(!t.sku)t.sku=sku;if(!t.asin)t.asin=asin;return t;}
    business?.items?.forEach((x,i)=>{const t=resolve(x,i,'sales');t.unitsSold=(t.unitsSold||0)+(x.unitsSold||0);t.totalSales=(t.totalSales||0)+(x.totalSales||0);t.sourceFlags.sales=true;});
    ads?.items?.forEach((x,i)=>{const t=resolve(x,i,'ads');t.adSales=(t.adSales||0)+(x.adSales||0);t.adSpend=(t.adSpend||0)+(x.adSpend||0);t.adOrders=(t.adOrders||0)+(x.adOrders||0);t.clicks=(t.clicks||0)+(x.clicks||0);t.impressions=(t.impressions||0)+(x.impressions||0);t.sourceFlags.ads=true;});
    payments?.items?.forEach((x,i)=>{const t=resolve(x,i,'fees');['fbaFees','referralFees','storageFees','returnCost'].forEach(f=>t[f]=(t[f]||0)+(x[f]||0));t.otherCosts=(t.otherCosts||0)+(x.otherAmazonFees||0);t.sourceFlags.fees=true;});
    costs?.items?.forEach((x,i)=>{const t=resolve(x,i,'cost');let local=x.unitCost;if(x.costCurrency&&marketplaceCurrency&&x.costCurrency!==marketplaceCurrency){const rate=exchangeRates[`${marketplaceCurrency}/${x.costCurrency}`]||exchangeRates[x.costCurrency];if(x.costCurrency==='CNY'&&rate>0)local=x.unitCost/rate;else{t.warnings.push(`成本币种 ${x.costCurrency} 无可用汇率，产品成本未计入。`);local=null;}}t.unitCost=x.unitCost;t.unitCostCurrency=x.costCurrency;t.unitCostLocal=local;t.productCost=local!=null&&t.unitsSold!=null?local*t.unitsSold:null;t.sourceFlags.cost=true;});
    const items=[...merged.values()].map(t=>{if(t.adSales!=null&&t.totalSales!=null&&t.adSales>t.totalSales)t.warnings.push('广告归因销售高于同周期总销售额，可能存在归因窗口或报告周期不一致。');const salesComplete=t.sourceFlags.sales,adsComplete=t.sourceFlags.ads,feesComplete=t.sourceFlags.fees,costComplete=t.sourceFlags.cost&&t.productCost!=null;let dataCompleteness=salesComplete&&adsComplete&&feesComplete&&costComplete?'full':salesComplete&&(feesComplete||costComplete)?'profit-partial':adsComplete&&!salesComplete?'ads-only':'sales-only';return{...t,salesComplete,adsComplete,feesComplete,costComplete,dataCompleteness};});
    items.forEach(i=>{if(i.sourceFlags.sales&&!i.sourceFlags.ads&&!i.sourceFlags.fees&&!i.sourceFlags.cost)unmatched.sales++;if(i.sourceFlags.ads&&!i.sourceFlags.sales)unmatched.ads++;if(i.sourceFlags.fees&&!i.sourceFlags.sales)unmatched.fees++;if(i.sourceFlags.cost&&!i.sourceFlags.sales)unmatched.costs++;});
    const quality={businessSkus:business?.items?.length||0,adsSkus:ads?.items?.length||0,paymentsSkus:payments?.items?.length||0,costSkus:costs?.items?.length||0,matchedSkus:items.filter(i=>Object.values(i.sourceFlags).filter(Boolean).length>1).length,unmatchedSales:unmatched.sales,unmatchedAds:unmatched.ads,unmatchedFees:unmatched.fees,missingCosts:items.filter(i=>!i.costComplete).length};
    const currencies=new Set(valid.flatMap(r=>r.meta?.currencies||[]));const warnings=periodWarnings({business,ads,payments,costs},period);if(currencies.size>1)warnings.push(`检测到币种冲突：${[...currencies].join('、')}。`);
    return{items,quality,warnings,skuAsinMap:map,attributionWindow:ads?.attributionWindow||null,marketplace,marketplaceCurrency};
  }
  return Object.freeze({ALIASES,detectReportType,mappingFor,normalizeBusinessReport,normalizeAdsReport,normalizePaymentsReport,normalizeCostReport,buildSkuAsinMap,mergeAmazonReports});
});
