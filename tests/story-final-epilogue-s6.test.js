'use strict';

const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const viewSource=fs.readFileSync('js/view.js','utf8');
const controllerSource=fs.readFileSync('js/controller.js','utf8');
const dataSource=fs.readFileSync('data/questions.js','utf8');
const css=fs.readFileSync('css/style.css','utf8');

const sandbox={window:{matchMedia(){return{matches:false};}},console};
vm.createContext(sandbox);
vm.runInContext(viewSource,sandbox,{filename:'js/view.js'});
vm.runInContext(dataSource,sandbox,{filename:'data/questions.js'});
vm.runInContext(controllerSource,sandbox,{filename:'js/controller.js'});

const questions=sandbox.window.QuestionData;
const anchors=sandbox.window.AnchorScenes||[];
const workCases=sandbox.window.WorkCaseNarratives||{};
const examIds=new Set(sandbox.window.ExamPoolDefinition||[]);
const story=Object.values(questions).filter(q=>q.learningRole!=='review'&&!examIds.has(q.id));

assert.strictEqual(story.length,166,'S6 must preserve accepted Story population');
assert.strictEqual(anchors.length,36,'S6 must preserve 36 AnchorScenes');
assert.strictEqual(Object.keys(workCases).length,131,'S6 must preserve completed 131 non-anchor WorkCaseNarratives');

const finale=anchors.find(scene=>scene.sceneId==='CH12-BOSS');
assert(finale,'S6 requires CH12-BOSS authority');
assert.strictEqual(finale.referenceQuestionId,'C005','S6 final boss must remain C005');
assert.strictEqual(finale.epilogue,true,'S6 final boss must remain the epilogue');
assert.strictEqual(finale.mizunoRelationshipStage,'Silent witness','Mizuno must remain a silent witness in the finale');
assert(/やっと、うちの会社が見えた/u.test(finale.after),'S6 must preserve the company-visibility payoff');
assert(/入社初日|追加出資/u.test(finale.hook),'S6 epilogue must call back to Chapter 1');
assert(/新人|渡す側/u.test(finale.hook),'S6 epilogue must complete the mentor-role handoff');

assert(
  typeof finale.protagonistStatement==='string' &&
  /あなた/u.test(finale.protagonistStatement) &&
  /現金/u.test(finale.protagonistStatement) &&
  /利益/u.test(finale.protagonistStatement) &&
  /成果|財政状態/u.test(finale.protagonistStatement),
  'S6 final boss must carry a protagonist-owned final explanation'
);

const facts=JSON.parse(JSON.stringify(finale.epilogueFacts||[]));
assert.deepStrictEqual(
  facts,
  [
    {label:'当期純利益',questionId:'J050',answerPath:['credit',0,'amount']},
    {label:'年度末資産合計',questionId:'F005',answerPath:['cells','assetsTotal']},
    {label:'3月末現金',questionId:'C005',answerPath:['cells','endingCash']},
    {label:'3月利益',questionId:'C005',answerPath:['cells','profit']}
  ],
  'S6 epilogue facts must reference accepted final-chapter answers instead of duplicating invented amounts'
);

const resolvePath=(value,path)=>path.reduce((current,key)=>current?.[key],value);
for(const fact of facts){
  const value=resolvePath(questions[fact.questionId]?.answer,fact.answerPath);
  assert(Number.isFinite(value),`${fact.label}: epilogue fact source must resolve to an accepted numeric answer`);
}

assert.deepStrictEqual(JSON.parse(JSON.stringify(questions.J050.answer)),{
  debit:[{account:'損益',amount:420000}],
  credit:[{account:'繰越利益剰余金',amount:420000}]
},'S6 must not change J050 accounting answer');
assert.deepStrictEqual(JSON.parse(JSON.stringify(questions.F005.answer)),{
  cells:{retainedEarnings:260000,assetsTotal:1280000,liabilitiesEquityTotal:1280000}
},'S6 must not change F005 accounting answer');
assert.deepStrictEqual(JSON.parse(JSON.stringify(questions.C005.answer)),{
  cells:{endingCash:275000,profit:45000}
},'S6 must not change C005 accounting answer');

assert(
  String(questions.C005.story||'').startsWith(finale.before),
  'S6 final question must use the authored final-boss Before instead of the generic chapter template'
);
assert(String(questions.C005.story||'').includes('〔最終報告〕'),'S6 final question must carry a final-report marker');
assert(!String(questions.C005.story||'').includes('〔調査'),'S6 final question must not end as an ordinary investigation counter');
assert.strictEqual(String(questions.C005.npcDialogue||''),'','S6 final question must not inject generic Mizuno guidance');

const AppView=sandbox.window.AppView;
const AppController=sandbox.window.AppController;
class FakeNode{
  constructor(tagName='div'){
    this.tagName=tagName;
    this.children=[];
    this.hidden=true;
    this.className='';
    this.textContent='';
    this.dataset={};
    this.attributes={};
    this.id='';
  }
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(name,value){this.attributes[name]=String(value);}
}
const flatten=node=>[node.textContent,...node.children.flatMap(flatten)].filter(Boolean).join(' ');
const narrative=new FakeNode('section');
narrative.id='narrative-result';
const documentStub={
  createElement(tag){return new FakeNode(tag);},
  getElementById(id){return id==='narrative-result'?narrative:null;}
};
const view=new AppView(documentStub);

const runtimeController=Object.create(AppController.prototype);
runtimeController.questions=questions;
runtimeController.model={state:{mode:'story',correctIds:['J050','F005','C005']},verifiedCorrectIds(){return this.state.correctIds;},isUnverified(){return false;}};

assert.strictEqual(
  typeof runtimeController.epilogueFactsForScene,
  'function',
  'S6 requires a controller resolver for source-backed epilogue facts'
);
const resolvedFacts=AppController.prototype.epilogueFactsForScene.call(runtimeController,finale);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(resolvedFacts)),
  [
    {label:'当期純利益',value:420000,sourceQuestionId:'J050'},
    {label:'年度末資産合計',value:1280000,sourceQuestionId:'F005'},
    {label:'3月末現金',value:275000,sourceQuestionId:'C005'},
    {label:'3月利益',value:45000,sourceQuestionId:'C005'}
  ],
  'S6 epilogue values must be resolved from accepted answers'
);

runtimeController.model.state.correctIds=['C005'];
assert.deepStrictEqual(JSON.parse(JSON.stringify(AppController.prototype.epilogueFactsForScene.call(runtimeController,finale))),[
  {label:'3月末現金',value:275000,sourceQuestionId:'C005'},
  {label:'3月利益',value:45000,sourceQuestionId:'C005'}
],'unanswered J050 and F005 must never be shown as established learner results');
runtimeController.model.state.correctIds=['J050','F005','C005'];
runtimeController.model.isUnverified=(_field,id)=>id==='F005';
assert.deepStrictEqual(JSON.parse(JSON.stringify(AppController.prototype.epilogueFactsForScene.call(runtimeController,finale))).map(x=>x.sourceQuestionId),['J050','C005','C005'],'unverified legacy F005 cannot be described as confirmed');
runtimeController.model.isUnverified=()=>false;
assert.strictEqual(
  view.renderNarrativeResult([finale],{mode:'story',resolved:true,epilogueFacts:resolvedFacts}),
  true,
  'resolved S6 finale must render'
);
const finaleText=flatten(narrative);
assert(finaleText.includes('一年の結末'),'S6 epilogue needs a unique final heading');
assert(finaleText.includes(finale.protagonistStatement),'S6 must render the protagonist final explanation');
assert(finaleText.includes('最終章で確定した数字'),'S6 must label the source-backed accounting results');
for(const expected of ['420,000円','1,280,000円','275,000円','45,000円']){
  assert(finaleText.includes(expected),`S6 epilogue must render ${expected}`);
}
assert(finaleText.includes('エピローグ'),'S6 must render a dedicated epilogue label');
assert(!finaleText.includes('次の展開'),'S6 finale must not reuse the ordinary next-hook label');
assert(narrative.className.includes('narrative-result-epilogue'),'S6 finale must keep dedicated epilogue styling');

const regular={sceneId:'CH01-BOSS',chapter:1,beat:'BOSS',after:'結果',hook:'次へ'};
assert.strictEqual(view.renderNarrativeResult([regular],{mode:'story',resolved:true}),true);
assert(flatten(narrative).includes('次の展開'),'ordinary anchors must retain the normal hook label');

assert.strictEqual(view.renderNarrativeResult([finale],{mode:'training',resolved:true,epilogueFacts:resolvedFacts}),false,'Training must stay isolated from S6 epilogue');
assert.strictEqual(view.renderNarrativeResult([finale],{mode:'review',resolved:true,epilogueFacts:resolvedFacts}),false,'Review must stay isolated from S6 epilogue');
assert.strictEqual(view.renderNarrativeResult([finale],{mode:'exam',resolved:true,epilogueFacts:resolvedFacts}),false,'Exam must stay isolated from S6 epilogue');

assert(css.includes('.narrative-result-epilogue-summary'),'S6 epilogue facts require dedicated responsive styling');
assert(css.includes('.narrative-result-epilogue-statement'),'S6 protagonist final explanation requires dedicated styling');
assert(!/簿記\s*2級|二級/u.test([finale.after,finale.hook,finale.protagonistStatement].join(' ')),'S6 must not add next-learning promotion without a separate Design Lock');

console.log('ISSUE179_S6_FINAL_EPILOGUE_PASS');
