'use strict';const assert=require('node:assert/strict');const A=require('../knowledge-question-analyzer');let n=0;function t(fn){fn();n++;}
t(()=>{const x=A.analyze('ACoS what is it?');assert.equal(x.topic,'advertising');assert.equal(x.intent,'definition');});
t(()=>{const x=A.analyze('ACoS \u591a\u5c11\u7b97\u6b63\u5e38\uff1f');assert.equal(x.topic,'advertising');assert.equal(x.intent,'metric');assert.equal(x.requiresCalculationHint,true);});
t(()=>{const x=A.analyze('2026 US Vine eligibility',{sellerMarketplaces:['CA']},{now:'2026-01-01'});assert.equal(x.intent,'eligibility');assert.deepEqual(x.scope.explicitMarketplaces,['US']);assert.deepEqual(x.scope.resolvedMarketplaces,['US']);assert.equal(x.requestedYear,'2026');assert.equal(x.freshness,'current');});
t(()=>{const x=A.analyze('FBA fee',{sellerMarketplaces:['US','CA']});assert.equal(x.topic,'fees-profit');assert.equal(x.intent,'fee');assert.deepEqual(x.scope.resolvedMarketplaces,['US','CA']);assert.equal(x.scope.scopeSource,'seller-profile');});
t(()=>{const x=A.analyze('DE EPR',{sellerMarketplaces:['US']});assert.equal(x.topic,'compliance-regulatory');assert.equal(x.intent,'compliance');assert.deepEqual(x.scope.resolvedMarketplaces,['DE']);});
t(()=>{const x=A.analyze('UK VAT calculation');assert.equal(x.topic,'cross-border-tax');assert.equal(x.intent,'compliance');assert.deepEqual(x.scope.explicitMarketplaces,['UK']);});
t(()=>{const x=A.analyze('SP-API how to create a report');assert.equal(x.topic,'api-developer');assert.equal(x.intent,'how-to');});
t(()=>{const x=A.analyze('EU policy',{sellerMarketplaces:['US']});assert.deepEqual(x.scope.regions,['EU']);assert.deepEqual(x.scope.explicitMarketplaces,[]);});
t(()=>{const x=A.analyze('GLOBAL policy',{sellerMarketplaces:['US']});assert.deepEqual(x.scope.regions,['GLOBAL']);assert.deepEqual(x.scope.explicitMarketplaces,[]);});
t(()=>{const x=A.analyze('unrelated words');assert.equal(x.topic,'unknown');assert.equal(x.intent,'unknown');});
t(()=>{const x=A.analyze('how to create FBA Shipment');assert.equal(x.topic,'fba-logistics');assert.equal(x.intent,'how-to');});
t(()=>{const x=A.analyze('why is my ASIN suppressed');assert.equal(x.intent,'account-specific');assert.equal(x.requiresAccountDataHint,true);assert.equal(x.freshness,'account-live');});
t(()=>{const x=A.analyze('2023 US FBA fee',null,{now:'2026-01-01'});assert.equal(x.intent,'fee');assert.equal(x.freshness,'historical');});
t(()=>{const context={sellerMarketplaces:['US']};const before=JSON.stringify(context);const first=A.analyze('FBA fee',context);const second=A.analyze('FBA fee',context);assert.equal(JSON.stringify(context),before);assert.deepEqual(first,second);});
console.log(`knowledge question analyzer tests passed: ${n}`);
