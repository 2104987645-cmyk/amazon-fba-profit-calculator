'use strict';
const assert=require('node:assert/strict'),L=require('../knowledge-answer-limitations');
const claims=new Map([
 ['c',{requiresCurrentVerification:true,authorityRequirement:{mustInclude:['amazon-official']}}],
 ['r',{authorityRequirement:{mustInclude:['regulator']}}],['g',{authorityRequirement:{mustInclude:['custom-authority']}}],['a',{claimType:'account-fact'}]
]);
const bundles=[
 {claimId:'c',sufficiency:{status:'insufficient'},assessments:[{scopeStatus:'partial',temporalStatus:'future',freshnessStatus:'stale',authorityStatus:'fails'}]},
 {claimId:'r',sufficiency:{status:'insufficient'},assessments:[{authorityStatus:'fails'}]},
 {claimId:'g',sufficiency:{status:'insufficient'},assessments:[{authorityStatus:'fails',scopeStatus:'mismatch',temporalStatus:'historical-match'},{temporalStatus:'expired'},{temporalStatus:'unknown'}]},
 {claimId:'a',sufficiency:{status:'insufficient'},assessments:[]}
];
const all=L.buildLimitations({},bundles,claims),types=new Set(all.map(x=>x.type));
for(const type of ['insufficient-evidence','partial-scope','scope-mismatch','stale-evidence','historical-evidence','future-evidence','expired-evidence','unknown-time-validity','missing-current-verification','missing-official-evidence','missing-regulator-evidence','missing-authority','missing-account-data'])assert.ok(types.has(type),type);
assert.ok(all.every(x=>x.statementType==='limitation'&&x.text===x.message));
console.log('limitations passed');
