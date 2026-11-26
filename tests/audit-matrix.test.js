'use strict';

const assert = require('assert');
const fs = require('fs');
const { evidenceStamp, loadQuestions, verifyMatrix } = require('../scripts/audit-matrix');

const matrix = JSON.parse(fs.readFileSync('reports/question-audit-matrix.json', 'utf8'));
const questions = loadQuestions();
// The original matrix is historical evidence, not rewritten to fit repaired content.
const cp=require('node:child_process'),vm=require('node:vm'),baseline='37086c6ae6511a249218533375bf6f19dac231d1',old={window:{}};
assert(fs.readFileSync('reports/question-audit-matrix.json').equals(cp.execFileSync('git',['show',baseline+':reports/question-audit-matrix.json'],{maxBuffer:8*1024*1024})),'historical matrix bytes unchanged');
vm.runInNewContext(cp.execFileSync('git',['show',baseline+':data/questions.js'],{encoding:'utf8',maxBuffer:8*1024*1024}),old);
assert.strictEqual(verifyMatrix(matrix,old.window.QuestionData).ok,true,'historical matrix matches its fixed source');
// The historical matrix remains immutable. Release230 changes eleven story
// surfaces, which must be reported STALE rather than silently recertified.
const baselineStale=['J148','L044','L045'];
const reviewedStoryChanges=['D012','E014','J032','J044','J103','J109','J116','J120','J127','J149','L030'];
const successorStories=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261103-234'||JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261105-235'||JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261107-236'||JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261115-237'||JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261116-238'||JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261119-239'||JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261123-240'||JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261123-241'||JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261126-242'||JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261126-243'||JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261126-244'?['D004','D013','D014','D015','D016','D017','D018','D019','D020']:[];
const release236=['20261107-236','20261115-237','20261116-238','20261119-239','20261123-240','20261123-241','20261126-242','20261126-243','20261126-244'].includes(JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release);
const successorChanges=release236?Array.from({length:17},(_,i)=>'D'+String(i+2).padStart(3,'0')):[];
// Release236 Gen193 only removes obsolete learner-visible 〔評価資料 n〕 stamps.
// Derive this finite source-delta from the immutable *pre-change* Git object,
// never from the modified candidate or from the stale-matrix findings themselves.
const preGen193='702d723e0a00c8a2c0a8f9d4fd8dac6a068d2f36';
const approvedPreStory={window:{}};
vm.runInNewContext(cp.execFileSync('git',['show',preGen193+':data/questions.js'],{encoding:'utf8',maxBuffer:8*1024*1024}),approvedPreStory);
const obsoleteSupplementalLabels=release236
 ? Object.values(approvedPreStory.window.QuestionData).filter(q=>/〔評価資料 \d+〕$/u.test(q.story)).map(q=>q.id).sort()
 : [];
if(release236)assert.strictEqual(obsoleteSupplementalLabels.length,126,'approved historical supplemental story labels must stay fixed at 126');
const chronologySourceChanges=release236?['J030','J079','J080','J081','J129','J130']:[];
const e011EvidenceClarification=release236?['E011']:[];
// Gen200 prose changes invalidate the historical source fingerprint, never the answer or the historical evidence.
const gen200StoryChanges=release236?Object.keys(JSON.parse(fs.readFileSync('data/story-gen200-contract.json','utf8'))):[];
if(release236)assert.strictEqual(gen200StoryChanges.length,34,'Gen200 historical evidence staleness is exact and finite');
const expectedStale=[...new Set([...baselineStale,...reviewedStoryChanges,...successorStories,...successorChanges,...obsoleteSupplementalLabels,...chronologySourceChanges,...e011EvidenceClarification,...gen200StoryChanges])].sort().map(id=>({id,status:'STALE',reasons:successorChanges.includes(id)?['SOURCE_CHANGED','ANSWER_SCHEMA_CHANGED']:['SOURCE_CHANGED']}));
const actualStale=verifyMatrix(matrix,questions).stale.slice().sort((a,b)=>a.id.localeCompare(b.id));
assert.deepStrictEqual(actualStale,expectedStale,'historical evidence must explicitly mark superseded stories and original three stale sources');
assert.deepStrictEqual(JSON.parse(JSON.stringify(questions.J148.answer)),JSON.parse(JSON.stringify(old.window.QuestionData.J148.answer)),'J148 accepted accounting answer is unchanged');
const approvedValidators=Object.freeze({
  '20261024-219':'scripts/validate-category-successor.cjs',
  '20261025-220':'scripts/validate-account-nature-successor.cjs',
  '20261025-221':'scripts/validate-special-account-reason-successor.cjs',
  '20261025-222':'scripts/validate-story-case-successor.cjs',
  '20261025-223':'scripts/validate-story-milestone-successor.cjs',
  '20261025-224':'scripts/validate-story-bridge-successor.cjs',
  '20261026-225':'scripts/validate-editorial-successor.cjs',
  '20261027-226':'scripts/validate-gameplay-successor.cjs',
  '20261028-227':'scripts/validate-investigation-successor.cjs',
  '20261029-228':'scripts/validate-copy-successor.cjs',
  '20261029-229':'scripts/validate-all300-copy-successor.cjs',
  '20261101-230':'scripts/validate-reader-editorial-successor.cjs',
  '20261102-231':'scripts/validate-reader-editorial-successor-231.cjs',
  '20261102-232':'scripts/validate-reader-editorial-successor-232.cjs',
  '20261103-233':'scripts/validate-reader-editorial-successor-233.cjs',
  '20261103-234':'scripts/validate-editorial-successor-234.cjs',
  '20261105-235':'scripts/validate-worksheet-successor-235.cjs',
  '20261107-236':'scripts/validate-issue256-successor-236.cjs',
  '20261115-237':'scripts/validate-story-order-category-successor-237.cjs',
  '20261116-238':'scripts/validate-editorial-successor-238.cjs',
  '20261119-239':'scripts/validate-fy2027-account-successor-239.cjs',
  '20261123-240':'scripts/validate-issue259-score-successor-240.cjs',
  '20261123-241':'scripts/validate-issue259-profile-guard-successor-241.cjs',
  '20261126-242':'scripts/validate-j147-successor-242.cjs',
  '20261126-243':'scripts/validate-fy2027-draft-successor-243.cjs',
  '20261126-244':'scripts/validate-exam-start-successor-244.cjs'
});
const release=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release;
assert(approvedValidators[release],'unsupported release validator: '+release);
cp.execFileSync(process.execPath,[approvedValidators[release]],{stdio:'inherit'});

const sourceMutation = structuredClone(questions);
sourceMutation.L033.question += ' 改ざん';
let finding = verifyMatrix(matrix, sourceMutation).findings.find(item => item.id === 'L033');
assert.deepStrictEqual(finding, { id: 'L033', status: 'STALE', reasons: ['SOURCE_CHANGED'] });

const schemaMutation = structuredClone(questions);
schemaMutation.L034.table.inputTypes.date1 = 'amount';
finding = verifyMatrix(matrix, schemaMutation).findings.find(item => item.id === 'L034');
assert.ok(finding.reasons.includes('SOURCE_CHANGED'));
assert.ok(finding.reasons.includes('ANSWER_SCHEMA_CHANGED'));

assert.notStrictEqual(evidenceStamp(questions.L033).sourceHash, evidenceStamp(sourceMutation.L033).sourceHash);
console.log('audit matrix freshness tests passed');

// Issue #259: prepare and freeze the *separate* 2027 scoring contract without
// changing Release238's assessed 2026 controller or immutable release evidence.
// JCCI prescribes three *section* totals, not this application's 15 item weights.
{
  const source=fs.readFileSync('js/controller.js','utf8');
  const match=source.match(/const EXAM_POINTS = Object\.freeze\(\[([0-9,\s]+)\]\);/u);
  assert(match,'Release238 must still expose the legacy 2026 scoring baseline');
  const oldWeights=match[1].split(',').map(value=>Number(value.trim()));
  const intended2026=[9,9,9,9,9,5,5,5,5,6,6,6,6,6,5];
  const proposed2027=[9,9,9,9,9,7,6,6,6,5,5,5,5,5,5];
  assert.deepStrictEqual(oldWeights,intended2026,'2026 scoring must not be silently reweighted');
  const groups=values=>[
    values.slice(0,5).reduce((n,x)=>n+x,0),
    values.slice(5,9).reduce((n,x)=>n+x,0),
    values.slice(9).reduce((n,x)=>n+x,0)
  ];
  assert.deepStrictEqual(groups(intended2026),[45,20,35]);
  assert.deepStrictEqual(groups(proposed2027),[45,25,30]);
  const score=(values,ratios)=>Math.round(values.reduce((sum,points,index)=>sum+points*(ratios[index]||0),0));
  for(const weights of [intended2026,proposed2027]){
    assert.strictEqual(weights.length,15);
    assert.strictEqual(score(weights,Array(15).fill(1)),100);
    assert.strictEqual(score(weights,Array(15).fill(0.7)),70);
    assert.strictEqual(score(weights,Array(15).fill(0.69)),69);
    assert.strictEqual(score(weights,Array(15).fill(0)),0);
  }
  console.log('ISSUE259_2026_LEGACY_2027_POINT_CONTRACT_PASS (no production 2027 mode)');
}
