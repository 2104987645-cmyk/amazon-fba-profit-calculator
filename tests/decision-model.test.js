'use strict';
const assert = require('node:assert/strict');
const DecisionModel = require('../decision-model');
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
function input(id, overrides) {
  const base = { news: { id, title: `Title ${id}`, summary: `Summary ${id}`, category: 'fba', marketplaces: ['US'], affectedModules: ['inventory'], officialUrl: `https://example.test/${id}`, publishedAt: '2026-09-01', effectiveAt: null, status: 'active', actionRequired: false, actionText: '' }, relevance: { level: 'high', isRelevant: true, reasons: ['EXACT_MARKETPLACE_MATCH'], matchedMarketplaces: ['US'] }, impact: { impactLevel: 'medium', urgency: 'none', actionRequired: false, reasons: [] }, actionState: { status: 'pending' } };
  return Object.assign(base, overrides || {});
}
function brief(items, options) { return DecisionModel.buildDailyBrief(items, { id: 'seller-1', version: '3.0' }, Object.assign({ briefDate: '2026-09-20', timezone: 'Asia/Shanghai' }, options)); }
function all(result) { return [...result.actions, ...result.risks, ...result.monitor, ...result.information]; }

test('returns a valid empty brief', () => { const result = brief([]); assert.equal(all(result).length, 0); assert.deepEqual(result.opportunities, []); assert.equal(result.summary, 'No decisions require attention today.'); });
test('creates the DecisionItem contract fields', () => { const item = all(brief([input('one')]))[0]; for (const key of ['id','priority','category','title','explanation','whyItMatters','affectedMarketplace','deadline','daysRemaining','relatedModule','supportingModules','recommendedAction','section','impactLevel','urgency','actionRequired','relevance','sourceNewsIds','sourceUrls','mergeCount','rationaleCodes','userStatus']) assert.ok(key in item); });
test('classifies urgent high-impact action as critical action', () => { const value = input('urgent'); value.news.effectiveAt = '2026-09-22'; value.news.actionRequired = true; value.news.actionText = 'Fix it'; value.impact = { impactLevel:'high', urgency:'immediate', actionRequired:true, reasons:[] }; const item = all(brief([value]))[0]; assert.equal(item.priority, 'critical'); assert.equal(item.section, 'actions'); assert.equal(item.daysRemaining, 2); });
test('excludes irrelevant and unknown relevance', () => { const bad = input('bad', { relevance:{ level:'irrelevant', isRelevant:false, reasons:[] } }); const unknown = input('unknown', { relevance:{} }); const result = brief([bad, unknown]); assert.equal(all(result).length, 0); assert.deepEqual(result.diagnostics.hiddenReasonCounts, { IRRELEVANT:1, UNKNOWN_RELEVANCE:1 }); });
test('excludes completed actions from the main brief', () => { const value = input('done'); value.news.actionRequired=true; value.news.actionText='Do'; value.impact.actionRequired=true; value.actionState.status='completed'; const result=brief([value]); assert.equal(all(result).length,0); assert.equal(result.diagnostics.hiddenReasonCounts.COMPLETED,1); });
test('keeps an overdue pending expired action', () => { const value=input('overdue'); value.news.status='expired'; value.news.effectiveAt='2026-09-19'; value.news.actionRequired=true; value.news.actionText='Resolve'; value.impact={impactLevel:'high',urgency:'overdue',actionRequired:true,reasons:[]}; assert.equal(all(brief([value])).length,1); });
test('excludes expired news without overdue pending action', () => { const value=input('expired'); value.news.status='expired'; assert.equal(brief([value]).diagnostics.hiddenReasonCounts.EXPIRED,1); });
test('uses only exact stable-id de-duplication', () => { const first=input('same'); const second=input('same'); second.news.title='Different title'; const result=brief([first,second]); assert.equal(all(result).length,1); assert.equal(result.counts.mergedNews,1); assert.equal(result.diagnostics.hiddenReasonCounts.DUPLICATE,1); });
test('does not merge similar titles with different IDs', () => { const a=input('a'); const b=input('b'); b.news.title=a.news.title; assert.equal(all(brief([a,b])).length,2); });
test('sorts deterministically with final id tie-breaker', () => { const ids=all(brief([input('z'),input('a'),input('m')])).map(item=>item.sourceNewsIds[0]); assert.deepEqual(ids,['a','m','z']); });
test('caps output at five and records lower-priority diagnostics', () => { const result=brief(['a','b','c','d','e','f'].map(input)); assert.equal(all(result).length,5); assert.equal(result.diagnostics.truncated,true); assert.equal(result.diagnostics.hiddenReasonCounts.LOWER_PRIORITY,1); });
test('puts high impact with no safe action in risks', () => { const value=input('risk'); value.impact.impactLevel='high'; const result=brief([value]); assert.equal(result.risks.length,1); });
test('puts 15-45 day item in monitor', () => { const value=input('monitor'); value.news.effectiveAt='2026-10-10'; const result=brief([value]); assert.equal(result.monitor.length,1); });
test('falls back invalid module and deadline conservatively', () => { const value=input('fallback'); value.news.affectedModules=['bad']; value.news.effectiveAt='not-a-date'; const item=all(brief([value]))[0]; assert.equal(item.relatedModule,'news'); assert.equal(item.deadline,null); assert.ok(item.rationaleCodes.includes('INVALID_DEADLINE')); assert.ok(item.rationaleCodes.includes('UNKNOWN_MODULE_FALLBACK')); });
test('is deterministic for the same input and options', () => { const items=[input('b'),input('a')]; assert.deepEqual(brief(items),brief(items)); });
console.log(`decision model tests passed: ${passed}`);
