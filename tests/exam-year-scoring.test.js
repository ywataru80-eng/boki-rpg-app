'use strict';
const assert = require('node:assert/strict');
const {YEAR_SCHEMES,getScheme,verifyScheme,newExamContract,pointsForSession,scoreExam} = require('../scripts/exam-year-scoring.cjs');
const ids=Array.from({length:15},(_,i)=>'P'+(i+1));
const session=(ratio,meta={})=>({ids,scores:Object.fromEntries(ids.map(id=>[id,{ratio}])),...meta});
let checked=0;
const check=(name,fn)=>{fn();checked++;};
check('official group totals are preserved and internal weights sum to 100',()=>{
  for(const year of ['2026','2027'])assert(verifyScheme(year));
  assert.deepEqual([...YEAR_SCHEMES['2026'].sectionPoints],[45,20,35]);
  assert.deepEqual([...YEAR_SCHEMES['2027'].sectionPoints],[45,25,30]);
});
check('old sessions without metadata retain 2026 weights',()=>{
  const old=session(1);assert.deepEqual([...pointsForSession(old)],[9,9,9,9,9,5,5,5,5,6,6,6,6,6,5]);
  assert.equal(scoreExam(old).points,100);assert.equal(scoreExam(old).examYear,'2026');
});
check('new 2027 sessions use their own immutable contract',()=>{
  const original = newExamContract('2027');const saved=JSON.parse(JSON.stringify(session(1,original)));
  assert.equal(scoreExam(saved).points,100);assert.equal(scoreExam(saved).examYear,'2027');
  assert.deepEqual(scoreExam(saved).items.map(i=>i.points),[9,9,9,9,9,7,6,6,6,5,5,5,5,5,5]);
  assert.equal(getScheme('2026').itemPoints[5],5);
});
check('70-point threshold is year-independent, 69 fails',()=>{
  for(const year of ['2026','2027']){
    const s=session(0.7,newExamContract(year));assert.equal(scoreExam(s).points,70);assert.equal(scoreExam(s).passed,true);
    const t=session(0.69,newExamContract(year));assert.equal(scoreExam(t).points,69);assert.equal(scoreExam(t).passed,false);
  }
});
check('unanswered is zero-weight and does not imply a wrong answer receipt',()=>{
  const s=session(1,newExamContract('2027'));delete s.scores.P15;
  assert.equal(scoreExam(s).points,95);assert.equal(scoreExam(s).unansweredCount,1);
  assert.equal(scoreExam(s).items[14].unanswered,true);
});
check('unrecognized year, partial year metadata and silent weight drift fail closed',()=>{
  assert.throws(()=>getScheme(2028),RangeError);
  assert.throws(()=>pointsForSession({examYear:'2027'}));
  assert.throws(()=>pointsForSession({examYear:'2027',examPointsVersion:1}));
  assert.throws(()=>pointsForSession({examYear:'2027',examPointsVersion:1,pointsByPosition:[]}));
  const tampered=newExamContract('2027');tampered.pointsByPosition[5]=20;
  assert.throws(()=>pointsForSession(tampered));
  const future={...newExamContract('2027'),examYear:'2028'};
  assert.throws(()=>pointsForSession(future),RangeError);
  assert.throws(()=>scoreExam(session(1.1,newExamContract('2027'))),RangeError);
});
check('score legacy total rounds once, not as individual rounded items',()=>{
  const s=session(0.15);
  const out=scoreExam(s);
  assert.equal(out.points,15);
  assert.equal(out.displayRoundingDelta,15-out.items.reduce((n,i)=>n+i.earned,0));
});
check('incomplete and duplicated session IDs cannot be graded',()=>{
  assert.throws(()=>scoreExam({ids:['P1'],scores:{}}));
  const s=session(1);s.ids[1]=s.ids[0];assert.throws(()=>scoreExam(s));
});
console.log('EXAM_YEAR_SCORING_CONTRACT_PASS '+checked+' independent cases; no production integration');
