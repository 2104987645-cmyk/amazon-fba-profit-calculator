'use strict';const assert=require('node:assert/strict');const C=require('../knowledge-contracts');let n=0;function t(fn){fn();n++;}
const knowledge={id:'k',title:'T',slug:'t',knowledgeType:'concept',topic:'advertising',marketplaces:[],regions:[],summary:'s',contentSections:[],keywords:[],relatedTools:[],relatedKnowledgeIds:[],relatedNewsIds:[],sourceRefs:[{sourceId:'amazon-ads'}],verifiedAt:'2026-01-01',freshnessClass:'evergreen',status:'verified'};
const evidence={id:'e',sourceId:'amazon-seller-help',sourceType:'documentation',authorityClass:'amazon-official',title:'T',url:null,claim:'A claim',supports:['answer'],marketplaces:[],regions:[],publishedAt:null,effectiveAt:null,retrievedAt:'2026-01-01',freshness:'current',confidence:'high'};
const plan={retrievalMode:'official-live',sourcePriority:[{sourceId:'amazon-seller-help'}],authorityRequirement:{mustInclude:['amazon-official'],preferred:[]},requiresFreshVerification:true,maxAgeDays:14,requiresCalculation:false,requiresAccountData:false,publicKnowledgeCanFullyAnswer:true,allowCommunitySupplement:false,relatedTools:[],conflictPolicy:'do-not-silently-reconcile',insufficientEvidencePolicy:'return-insufficient'};
const answer={question:'q',answerType:'answer',shortAnswer:'a',officialFacts:[],derivedConclusions:[],operationalAdvice:[],accountSpecificFindings:[],sources:[{evidenceId:'e',sourceId:'amazon-seller-help'}],marketplaces:[],regions:[],verifiedAt:'2026-01-01',effectiveFrom:'2026-01-01',effectiveTo:'2026-01-02',confidence:'medium',limitations:[]};
t(()=>assert.equal(C.validateKnowledgeItem(knowledge).valid,true));
t(()=>assert.equal(C.validateKnowledgeItem({...knowledge,knowledgeType:'bad'}).valid,false));
t(()=>assert.equal(C.validateKnowledgeItem({...knowledge,status:'bad'}).valid,false));
t(()=>assert.equal(C.validateEvidenceItem(evidence).valid,true));
t(()=>assert.equal(C.validateEvidenceItem({...evidence,sourceId:'bad'}).valid,false));
t(()=>assert.equal(C.validateEvidenceItem({...evidence,claim:''}).valid,false));
t(()=>assert.equal(C.validateRetrievalPlan(plan).valid,true));
t(()=>assert.equal(C.validateRetrievalPlan({...plan,retrievalMode:'bad'}).valid,false));
t(()=>assert.equal(C.validateRetrievalPlan({...plan,sourcePriority:[{sourceId:'bad'}]}).valid,false));
t(()=>{assert.equal(C.validateAnswerEnvelope(answer).valid,true);for(const key of ['officialFacts','derivedConclusions','operationalAdvice','accountSpecificFindings'])assert.ok(key in answer);assert.equal(answer.sources[0].sourceId,evidence.sourceId);});
t(()=>assert.equal(C.validateAnswerEnvelope({...answer,confidence:'bad'}).valid,false));
t(()=>assert.equal(C.validateAnswerEnvelope({...answer,limitations:'bad'}).valid,false));
t(()=>{const values=[knowledge,evidence,plan,answer];const before=JSON.stringify(values);C.validateKnowledgeItem(knowledge);C.validateEvidenceItem(evidence);C.validateRetrievalPlan(plan);C.validateAnswerEnvelope(answer);assert.equal(JSON.stringify(values),before);});
console.log(`knowledge contracts tests passed: ${n}`);
