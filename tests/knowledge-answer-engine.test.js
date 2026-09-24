'use strict';
const assert=require('node:assert/strict'),E=require('../knowledge-answer-engine');
const q={question:'q',normalizedQuestion:'q',scope:{resolvedMarketplaces:[],regions:[]}};
function conflicted(){return{claimId:'claim-c',sufficiency:{status:'conflicted'},candidates:[{candidateId:'candidate-a',retrievalItemId:'retrieval-a',sourceId:'government',url:'https://same.example'},{candidateId:'candidate-b',retrievalItemId:'retrieval-b',sourceId:'amazon-seller-help',url:'https://same.example'}],assessments:[{assessmentId:'assessment-a',candidateId:'candidate-a',supportStatus:'supports',admissible:true,evidenceRole:'supporting'},{assessmentId:'assessment-b',candidateId:'candidate-b',supportStatus:'contradicts',evidenceRole:'conflicting'}]};}
function answer(bundles){return E.answer(q,[{claimId:'claim-c',text:'c'}],bundles,{});}
let bundles=[conflicted()],before=JSON.stringify(bundles),out=answer(bundles),note=out.conflictNotes[0];
assert.equal(JSON.stringify(bundles),before);
assert.ok(note);assert.deepEqual(note.citationIds,['cite-retrieval-a','cite-retrieval-b']);
assert.deepEqual(out.citations.map(c=>c.sourceId),['government','amazon-seller-help']);
assert.deepEqual(out.citations.map(c=>c.assessmentIds),[['assessment-a'],['assessment-b']]);
assert.deepEqual(answer([conflicted()]).conflictNotes[0].citationIds,note.citationIds);
const unrelated={claimId:'claim-x',sufficiency:{status:'sufficient'},candidates:[{candidateId:'candidate-x',retrievalItemId:'retrieval-x',sourceId:'community'}],assessments:[]};
assert.deepEqual(answer([conflicted(),unrelated]).conflictNotes[0].citationIds,['cite-retrieval-a','cite-retrieval-b']);
const supportOnly=conflicted();supportOnly.candidates=supportOnly.candidates.slice(0,1);assert.equal(answer([supportOnly]).conflictNotes.length,1);
const conflictOnly=conflicted();conflictOnly.candidates=conflictOnly.candidates.slice(1);assert.equal(answer([conflictOnly]).conflictNotes.length,1);
function diagnosticBundle(candidates,assessments,assessmentIds){return{claimId:'claim-c',sufficiency:{status:'conflicted'},candidates,assessments,conflicts:[{conflictId:'real-conflict',type:'support-vs-contradiction',assessmentIds}]};}
const mixed=diagnosticBundle([{candidateId:'sa',retrievalItemId:'rs'},{candidateId:'cb',retrievalItemId:'rc'}],[{assessmentId:'support-a',candidateId:'sa',admissible:true,evidenceRole:'supporting'},{assessmentId:'conflict-b',candidateId:'cb',evidenceRole:'conflicting'}],['support-a','conflict-b']);const mixedOut=answer([mixed]);assert.deepEqual(mixedOut.diagnostics.incompleteConflictCitationIds,[]);assert.ok(mixedOut.conflictNotes.length);assert.ok(mixedOut.limitations.some(x=>x.type==='conflicting-evidence'));
const partial=diagnosticBundle([{candidateId:'sa',retrievalItemId:'rs'}],[{assessmentId:'support-a',candidateId:'sa',admissible:true,evidenceRole:'supporting'},{assessmentId:'conflict-b',candidateId:'missing',evidenceRole:'conflicting'}],['support-a','conflict-b']);assert.deepEqual(answer([partial]).diagnostics.incompleteConflictCitationIds,['real-conflict']);
const none=diagnosticBundle([],[{assessmentId:'a',candidateId:'missing',evidenceRole:'conflicting'}],['a']);const noneOut=answer([none]);assert.deepEqual(noneOut.diagnostics.incompleteConflictCitationIds,['real-conflict']);assert.equal(noneOut.conflictNotes[0].citationIds.length,0);
console.log('answer engine passed');
