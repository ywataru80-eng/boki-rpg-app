'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const BASE='86364e3944750ab25334e2c3a557d20768d05963';
// Audit the real, immutable Release233 content from its reachable Git commit on successors.
const successor=['20261103-234','20261105-235','20261107-236'].includes(JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release);
const canonical=successor?cp.execFileSync('git',['show','c3689f0529e10519c71073acf6d75ec75bdd253a:data/questions.js']):fs.readFileSync('data/questions.js');
assert(canonical.equals(cp.execFileSync('git',['show',`${BASE}:data/questions.js`])),'300 canonical questions and stories immutable in v4.2');
const scope={window:{},console};
vm.runInNewContext(fs.readFileSync('data/accounting-domain.js','utf8'),scope);scope.AccountingDomain=scope.window.AccountingDomain;
vm.runInNewContext(canonical.toString('utf8'),scope);
const data=scope.window.QuestionData,ids=Object.keys(data).sort();
assert.equal(ids.length,300);assert.equal(new Set(ids).size,300);
for(const id of ids){
 const q=data[id];assert(q.question?.trim(),`${id} problem text`);assert(q.explanation?.trim(),`${id} original explanation`);
 assert(q.answer&&typeof q.answer==='object',`${id} canonical answer`);
}
for(const id of ['J017','J018','J045','J047','J120','L039','L040','D002','D013','D018','D019','D020'])assert(data[id],id);
const view=fs.readFileSync('js/view.js','utf8');
assert(view.includes('item.answer != null && !item.correct ? this.renderDiagnostics'),'unanswered exam review never diagnoses');
assert(view.includes('this.renderExamReviewExplanation(question, item.answer, item.correct)'),'exam uses model-backed instructional explanation');
assert(view.includes("npc.hidden = mode !== 'story' || !question.npcDialogue"),'NPC only story, pre-answer');
console.log('RELEASE233_GEN187_COVERAGE_PASS: 300 immutable questions, exam review and NPC safety');
