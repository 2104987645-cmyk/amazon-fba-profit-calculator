'use strict';const assert=require('node:assert/strict');const R=require('../knowledge-source-router');let n=0;function p(a){return R.resolve(a);}function t(fn){fn();n++;}
t(()=>assert.equal(p({intent:'definition'}).retrievalMode,'knowledge-only'));
t(()=>assert.equal(p({intent:'how-to',topic:'fba-logistics'}).retrievalMode,'official-plus-knowledge'));
t(()=>assert.equal(p({intent:'how-to',topic:'api-developer'}).sourcePriority[0].sourceId,'amazon-sp-api'));
t(()=>['eligibility','policy','fee'].forEach(intent=>assert.equal(p({intent,topic:'fees-profit',freshness:'current'}).retrievalMode,'official-live')));
t(()=>{const x=p({intent:'metric',topic:'advertising'});assert.equal(x.retrievalMode,'official-plus-calculation');assert.deepEqual(x.relatedTools,['profitability']);});
t(()=>assert.deepEqual(p({intent:'calculation',topic:'fees-profit'}).relatedTools,['profit']));
t(()=>assert.deepEqual(p({intent:'calculation',topic:'inventory'}).relatedTools,['inventory']));
t(()=>{const x=p({intent:'compliance',topic:'compliance-regulatory',freshness:'current'});assert.equal(x.sourcePriority[0].sourceId,'government');assert.ok(x.authorityRequirement.mustInclude.includes('regulator'));});
t(()=>{const x=p({intent:'calculation',topic:'cross-border-tax'});assert.equal(x.sourcePriority[0].sourceId,'government');});
t(()=>{const x=p({intent:'account-specific'});assert.equal(x.retrievalMode,'account-required');assert.equal(x.sourcePriority[0].sourceId,'user-account');assert.equal(x.publicKnowledgeCanFullyAnswer,false);});
t(()=>{const x=p({intent:'policy',topic:'listing'});assert.ok(x.authorityRequirement.mustInclude.includes('amazon-official'));assert.equal(x.sourcePriority.some(item=>item.sourceId==='community'),false);});
t(()=>{const input={intent:'fee',topic:'fees-profit',freshness:'current'};const before=JSON.stringify(input);const x=p(input);assert.equal(x.requiresFreshVerification,true);assert.ok(x.maxAgeDays<=14);assert.equal(x.conflictPolicy,'do-not-silently-reconcile');assert.equal(x.insufficientEvidencePolicy,'return-insufficient');assert.equal(JSON.stringify(input),before);});
console.log(`knowledge source router tests passed: ${n}`);
