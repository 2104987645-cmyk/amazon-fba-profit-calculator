'use strict';

const assert = require('node:assert/strict');
const NewsImpact = require('../news-impact');
const NOW = '2026-09-20T15:30:00+08:00';
const relevant = { status:'relevant', reasonCodes:[] };

let passed=0;
function test(name,fn){fn();passed+=1;console.log(`✓ ${name}`);}
function analyze(news, rel=relevant){return NewsImpact.analyze(Object.assign({id:'n1'},news),rel,NOW);}

test('irrelevant → none',()=>assert.equal(analyze({importance:'high',actionRequired:true},{status:'irrelevant'}).impactLevel,'none'));
test('unknown relevance → unknown',()=>{const r=analyze({importance:'high'},{status:'unknown'});assert.equal(r.impactLevel,'unknown');assert.ok(r.reasonCodes.includes('UNKNOWN_RELEVANCE'));});
test('high + required + 临近生效 → critical',()=>assert.equal(analyze({importance:'high',actionRequired:true,effectiveAt:'2026-10-01'}).impactLevel,'critical'));
test('high + required + 已生效 → critical',()=>assert.equal(analyze({importance:'high',actionRequired:true,effectiveAt:'2026-09-10'}).impactLevel,'critical'));
test('required action → high',()=>assert.equal(analyze({importance:'medium',actionRequired:true}).impactLevel,'high'));
test('high importance → high',()=>assert.equal(analyze({importance:'high',actionRequired:false}).impactLevel,'high'));
test('affectedModules → medium',()=>assert.equal(analyze({importance:'medium',affectedModules:['profit']}).impactLevel,'medium'));
test('其他 relevant → low',()=>assert.equal(analyze({importance:'low'}).impactLevel,'low'));
test('过去日期且需行动 → overdue',()=>assert.equal(analyze({actionRequired:true,effectiveAt:'2026-09-19'}).urgency,'overdue'));
test('过去日期且无需行动 → active',()=>assert.equal(analyze({actionRequired:false,effectiveAt:'2026-09-19'}).urgency,'active'));
test('当天生效 → active',()=>{const r=analyze({effectiveAt:'2026-09-20'});assert.equal(r.urgency,'active');assert.equal(r.daysUntilEffective,0);});
test('未来 30 天内 → effective-soon',()=>assert.equal(analyze({effectiveAt:'2026-10-20'}).urgency,'effective-soon'));
test('未来超过 30 天 → upcoming',()=>assert.equal(analyze({effectiveAt:'2026-10-21'}).urgency,'upcoming'));
test('无日期 → unknown',()=>{const r=analyze({});assert.equal(r.urgency,'unknown');assert.equal(r.daysUntilEffective,null);});
test('非法日期 → unknown',()=>assert.equal(analyze({effectiveAt:'2026-02-30'}).urgency,'unknown'));
test('使用日历日且不受时区小时影响',()=>assert.equal(NewsImpact.calendarDaysUntil('2026-09-21',NOW),1));
test('旧 actionRequired=required 兼容',()=>assert.equal(analyze({actionRequired:'required'}).actionRequired,true));
test('旧 actionRequired=review 兼容',()=>assert.equal(analyze({actionRequired:'review'}).actionRequired,true));
test('旧 actionRequired=none/info 兼容',()=>{assert.equal(analyze({actionRequired:'none'}).actionRequired,false);assert.equal(analyze({actionRequired:'info'}).actionRequired,false);});
test('未知 actionType 原样保留',()=>assert.equal(analyze({actionType:'future-action'}).actionType,'future-action'));
test('GLOBAL 与相关站点 reasonCodes',()=>{const a=analyze({marketplaces:['Global']});assert.ok(a.reasonCodes.includes('GLOBAL_NEWS'));const b=analyze({marketplaces:['UK']});assert.ok(b.reasonCodes.includes('RELEVANT_MARKETPLACE'));});
test('confidence 仅反映字段完整度',()=>{assert.equal(analyze({importance:'high',actionRequired:true,affectedModules:['profit'],effectiveAt:'2026-09-21'}).confidence,'high');assert.equal(NewsImpact.analyze({}, {status:'unknown'}, NOW).confidence,'low');});
test('assess 为 analyze 别名',()=>assert.deepEqual(NewsImpact.assess({id:'x'},relevant,NOW),NewsImpact.analyze({id:'x'},relevant,NOW)));
test('输入对象不可变',()=>{const news={id:'x',marketplaces:[' global '],affectedModules:['profit'],actionRequired:'review'};const rel={status:'relevant',reasonCodes:['X']};const before=JSON.stringify([news,rel]);NewsImpact.analyze(news,rel,NOW);assert.equal(JSON.stringify([news,rel]),before);});

console.log(`news impact tests passed: ${passed}`);
