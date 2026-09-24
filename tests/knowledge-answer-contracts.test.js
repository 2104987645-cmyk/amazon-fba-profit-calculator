'use strict';
const assert=require('node:assert/strict');
const C=require('../knowledge-answer-contracts');
const E=require('../knowledge-answer-engine');
const valid={evidenceRole:'supporting',admissible:true},conf={evidenceRole:'conflicting'},bad={evidenceRole:'inadmissible'};
function v(statementType,groundingRefs,citationIds=['cite']){const x={statementType,text:'x',groundingRefs,citationIds},before=JSON.stringify(x);const r=C.validateStatement(x);assert.equal(JSON.stringify(x),before);return r.valid;}
assert.deepEqual(C.LIMITATION_TYPES,['insufficient-evidence','conflicting-evidence','partial-scope','scope-mismatch','stale-evidence','historical-evidence','future-evidence','expired-evidence','unknown-time-validity','snippet-only','missing-authority','missing-official-evidence','missing-regulator-evidence','missing-account-data','missing-current-verification','missing-claim-text','other']);
assert.equal(v('official-fact',[]),false);assert.equal(v('official-fact',[valid]),true);assert.equal(v('official-fact',[conf,bad]),false);assert.equal(v('conflict-note',[valid]),false);assert.equal(v('conflict-note',[conf]),true);assert.equal(v('account-finding',[{sourceId:'amazon-seller-help'}]),false);assert.equal(v('account-finding',[{sourceId:'user-account',admissible:true,evidenceRole:'supporting'}]),true);
const plan={answerType:'direct',question:'q',primaryClaimIds:['c'],supportingClaimIds:[],conflictedClaimIds:[],insufficientClaimIds:[],includeLimitations:true,includeSources:true,includeOperationalAdvice:true,includeAccountFindings:true,metadata:{}};assert.equal(C.validateAnswerPlan(plan).valid,true);assert.equal(C.validateAnswerPlan({...plan,conflictedClaimIds:['c']}).valid,false);
const clone=x=>JSON.parse(JSON.stringify(x)),q={question:'q',normalizedQuestion:'q',scope:{resolvedMarketplaces:[],regions:[]}},claims=[{claimId:'c',text:'Real claim'}];
const bundle={claimId:'c',candidates:[{candidateId:'candidate-c',retrievalItemId:'retrieval-c',sourceId:'amazon',providerId:'p',url:null}],verifications:[{status:'supports'}],assessments:[{assessmentId:'assessment-c',claimId:'c',candidateId:'candidate-c',admissible:true,evidenceRole:'supporting'}],conflicts:[{conflictId:'conflict-c',type:'none',assessmentIds:['assessment-c']}],sufficiency:{status:'sufficient'},diagnostics:{}};
assert.equal(bundle.claim,undefined);assert.notEqual(bundle.candidates[0].candidateId,bundle.candidates[0].retrievalItemId);
const answer=E.answer(q,claims,[bundle],{}),ctx={evidenceBundles:[bundle],claims};assert.equal(C.validateStructuredAnswer(answer,ctx).valid,true);
function invalid(editAnswer,editBundle){const a=clone(answer),b=clone(bundle);if(editAnswer)editAnswer(a);if(editBundle)editBundle(b);assert.equal(C.validateStructuredAnswer(a,{evidenceBundles:[b],claims}).valid,false);}
invalid(a=>a.officialFacts[0].groundingRefs[0].assessmentId='missing');
invalid(null,b=>b.assessments[0].candidateId='missing');
const mismatchAnswer=clone(answer),mismatchBundle=clone(bundle);mismatchBundle.candidates.push({candidateId:'candidate-b',retrievalItemId:'retrieval-b'});mismatchBundle.assessments[0].candidateId='candidate-b';assert.equal(C.validateStructuredAnswer(mismatchAnswer,{evidenceBundles:[mismatchBundle],claims}).valid,false);
invalid(a=>a.officialFacts[0].citationIds=['missing']);
invalid(a=>a.citations[0].candidateIds=[]);invalid(a=>a.citations[0].assessmentIds=[]);invalid(a=>a.citations[0].claimIds=[]);
invalid(null,b=>b.assessments[0].evidenceRole='contextual');invalid(null,b=>b.assessments[0].evidenceRole='conflicting');invalid(null,b=>b.assessments[0].admissible=false);
invalid(null,b=>b.sufficiency.status='insufficient');invalid(a=>a.officialFacts[0].text='c');invalid(null,b=>b.sufficiency.status='partially-supported');
const floating=clone(answer);floating.citations.push({citationId:'floating'});assert.equal(C.validateStructuredAnswer(floating,ctx).valid,false);
const conflictBundle={claimId:'x',candidates:[{candidateId:'ca',retrievalItemId:'ra'},{candidateId:'cb',retrievalItemId:'rb'}],verifications:[],assessments:[{assessmentId:'aa',candidateId:'ca',admissible:true,evidenceRole:'supporting'},{assessmentId:'ab',candidateId:'cb',evidenceRole:'conflicting'}],conflicts:[{conflictId:'conflict-x',type:'support-vs-contradiction',assessmentIds:['aa','ab']}],sufficiency:{status:'conflicted'},diagnostics:{}};
const conflictAnswer=E.answer(q,[{claimId:'x',text:'x'}],[conflictBundle],{});assert.equal(C.validateStructuredAnswer(conflictAnswer,{evidenceBundles:[conflictBundle],claims:[]}).valid,true);conflictAnswer.conflictNotes=[];assert.equal(C.validateStructuredAnswer(conflictAnswer,{evidenceBundles:[conflictBundle],claims:[]}).valid,false);
console.log('answer contracts passed');
