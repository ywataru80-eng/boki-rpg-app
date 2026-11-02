'use strict';

const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const source=fs.readFileSync('data/questions.js','utf8');
const marker='const WorkInstructions = Object.freeze({';
assert(source.includes(marker),'Narrative probe marker must remain available');

const instrumented=source.replace(
  marker,
  `if(typeof window!=='undefined') window.__ChapterDrama=ChapterDrama;
${marker}`
);

const sandbox={window:{},console};
vm.createContext(sandbox);
vm.runInContext(instrumented,sandbox,{filename:'data/questions.js'});

const scenes=sandbox.window.AnchorScenes;
const questions=sandbox.window.QuestionData;
const arcs=sandbox.window.__ChapterDrama;
const byId=id=>scenes.find(scene=>scene.sceneId===id);

const ch1Open=byId('CH01-OPEN');
const ch1Boss=byId('CH01-BOSS');
assert(!/創業|会社の開始|会社の出発点/u.test([arcs[1].theme,arcs[1].problem,arcs[1].goal,arcs[1].result,ch1Open.before,ch1Open.learningObjective,ch1Boss.before,ch1Boss.after,ch1Boss.learningObjective].join(' ')),
  'Chapter 1 must not present J001 additional investment as company founding');
assert(/追加出資|追加払込|拡大資金|事業拡大/u.test([arcs[1].theme,arcs[1].problem,arcs[1].goal,ch1Open.before,ch1Open.learningObjective].join(' ')),
  'Chapter 1 must frame the actual additional-investment / expansion transaction');

const ch4Reversal=byId('CH04-REVERSAL');
assert(/一部.*判明/.test(ch4Reversal.before)&&/残る差額.*証明しません/.test(ch4Reversal.before),'Chapter 4 REVERSAL must distinguish partial proof from unresolved variance');
assert(/調査を続けます/.test(ch4Reversal.hook),'Chapter 4 REVERSAL cannot promise the shortage will be resolved by petty cash reimbursement');
const ch4Boss=byId('CH04-BOSS');
assert(/調査中|未判明|推測しない|原因未確定/u.test([ch4Boss.before,ch4Boss.after,ch4Boss.learningObjective].join(' ')),
  'Chapter 4 BOSS must preserve the unresolved 5,000-yen shortage instead of inventing a cause');
assert(!/差額を説明できる状態|調査から確定処理/u.test([ch4Boss.before,ch4Boss.learningObjective].join(' ')),
  'Chapter 4 BOSS must not claim a resolution unsupported by J120');

const ch10Boss=byId('CH10-BOSS');
assert(/予行演習/u.test([arcs[10].theme,arcs[10].problem,arcs[10].goal,ch10Boss.before,ch10Boss.after,ch10Boss.dialogue,ch10Boss.learningObjective].join(' ')),
  'Chapter 10 BOSS must frame D012 as a rehearsal');
assert(!/年度決算を締めよう|一年間の成果をまとめます/u.test([ch10Boss.before,ch10Boss.dialogue].join(' ')),
  'Chapter 10 BOSS must not treat D012 rehearsal as the completed production close');

assert.strictEqual(questions.J149.category,'支払手形','runtime J149 override must be acknowledged by S2 narrative authority');
const ch11Boss=byId('CH11-BOSS');
assert.strictEqual(ch11Boss.referenceQuestionId,'J149','Chapter 11 BOSS remains anchored to the final Story question');
assert(/支払手形|支払義務|決済/u.test([arcs[11].problem,arcs[11].goal,ch11Boss.before,ch11Boss.after,ch11Boss.learningObjective].join(' ')),
  'Chapter 11 BOSS must match runtime J149 promissory-note action');
assert(!/最後の税資料/u.test(ch11Boss.before),
  'Chapter 11 BOSS must not mislabel J149 as tax evidence');

const finale=byId('CH12-BOSS');
assert(!/創業時/u.test(finale.hook),'Epilogue must not call the Chapter 1 additional-investment material founding documents');
assert(/最初の一枚|入社初日|追加出資/u.test(finale.hook),'Epilogue should still pay off the first-work motif');

console.log('ISSUE179_S2_REVIEW_CONTEXT_PASS');
