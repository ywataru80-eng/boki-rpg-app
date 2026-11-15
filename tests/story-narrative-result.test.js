'use strict';

const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const viewSource=fs.readFileSync('js/view.js','utf8');
const controllerSource=fs.readFileSync('js/controller.js','utf8');
const dataSource=fs.readFileSync('data/questions.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('css/style.css','utf8');

const sandbox={window:{matchMedia(){return{matches:false};}},console};
vm.createContext(sandbox);
vm.runInContext(viewSource,sandbox,{filename:'js/view.js'});
vm.runInContext(dataSource,sandbox,{filename:'data/questions.js'});
vm.runInContext(controllerSource,sandbox,{filename:'js/controller.js'});
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

assert.strictEqual(typeof view.renderNarrativeResult,'function','S3A requires View.renderNarrativeResult');

const headlessView=new AppView({});
assert.doesNotThrow(
  ()=>headlessView.renderNarrativeResult([],{mode:'story',resolved:false}),
  'headless View must safely ignore narrative rendering'
);
assert.strictEqual(
  headlessView.renderNarrativeResult([],{mode:'story',resolved:false}),
  false,
  'headless View returns false when narrative DOM is unavailable'
);

const scene={
  sceneId:'CH01-BOSS',
  chapter:1,
  beat:'BOSS',
  after:'空白だった元帳の最初の行が埋まりました。',
  hook:'営業部から新しい資料束が届きます。',
  dialogue:'水野「次へ進もう。」'
};
assert.strictEqual(
  view.renderNarrativeResult([scene],{mode:'story',resolved:true}),
  true,
  'resolved Story anchor renders narrative result'
);
assert.strictEqual(narrative.hidden,false);
assert.strictEqual(narrative.dataset.sceneId,'CH01-BOSS');
let text=flatten(narrative);
assert(text.includes(scene.after),'After reaction must render after resolution');
assert(text.includes(scene.hook),'Hook must render after resolution');

assert.strictEqual(view.renderNarrativeResult([scene],{mode:'story',resolved:false}),false,'wrong/unresolved Story must not reveal consequence');
assert.strictEqual(narrative.hidden,true,'unresolved narrative surface stays hidden');
assert.strictEqual(view.renderNarrativeResult([scene],{mode:'training',resolved:true}),false,'Training mode must stay isolated');
assert.strictEqual(narrative.hidden,true,'Training mode narrative surface stays hidden');
assert.strictEqual(view.renderNarrativeResult([scene],{mode:'review',resolved:true}),false,'Review mode must stay isolated');
assert.strictEqual(view.renderNarrativeResult([scene],{mode:'exam',resolved:true}),false,'Exam mode must stay isolated');

const finale={...scene,sceneId:'CH12-BOSS',chapter:12,epilogue:true,after:'社長は会社の状態を理解しました。',hook:'次は主人公が最初の一枚を渡す側です。'};
assert.strictEqual(view.renderNarrativeResult([finale],{mode:'story',resolved:true}),true);
assert(narrative.className.includes('narrative-result-epilogue'),'Chapter 12 epilogue must receive unique presentation class');
assert(flatten(narrative).includes('一年の結末'),'Chapter 12 epilogue needs unique heading');

assert(html.includes('id="narrative-result"'),'result view must contain Story narrative result region');
assert(html.includes('aria-labelledby="narrative-result-heading"'),'narrative result region must have accessible heading relation');
assert(css.includes('.narrative-result'),'narrative result requires dedicated responsive styling');
assert(css.includes('overflow-wrap: anywhere'),'narrative prose must wrap rather than force horizontal scrolling');

assert(!controllerSource.includes('S3_PILOT_CHAPTERS'),'S3B must remove the representative-chapter rollout limit');

const runtimeController=Object.create(AppController.prototype);
runtimeController.model={state:{mode:'story'}};
const authorityScenes=sandbox.window.AnchorScenes;
const questions=sandbox.window.QuestionData;
assert.strictEqual(authorityScenes.length,36,'S3B runtime rollout consumes all 36 accepted Anchor Scenes');

const coveredChapters=new Set();
for(const authorityScene of authorityScenes){
  const question=questions[authorityScene.referenceQuestionId];
  const matched=AppController.prototype.narrativeScenesForQuestion.call(runtimeController,question);
  assert(
    matched.some(candidate=>candidate.sceneId===authorityScene.sceneId),
    `${authorityScene.sceneId}: runtime lookup must expose the accepted Anchor Scene`
  );
  coveredChapters.add(authorityScene.chapter);
}
assert.deepStrictEqual(
  [...coveredChapters].sort((a,b)=>a-b),
  Array.from({length:12},(_,index)=>index+1),
  'S3B runtime lookup must cover semantic Chapters 1-12'
);

const j049Scenes=AppController.prototype.narrativeScenesForQuestion.call(runtimeController,questions.J049);
assert.deepStrictEqual(
  Array.from(j049Scenes,scene=>scene.sceneId),
  ['CH11-OPEN','CH11-REVERSAL'],
  'Chapter 11 duplicate question reference must preserve both Scene authorities'
);
assert.strictEqual(view.renderNarrativeResult(j049Scenes,{mode:'story',resolved:true}),true);
assert.strictEqual(
  narrative.dataset.sceneId,
  'CH11-REVERSAL',
  'Chapter 11 duplicate reference must resolve to the later REVERSAL beat in one compact result'
);

const anchorReferences=new Set(authorityScenes.map(scene=>scene.referenceQuestionId));
const examIds=new Set(sandbox.window.ExamPoolDefinition||[]);
const nonAnchor=Object.values(questions).find(question=>
  question.learningRole!=='review'&&!examIds.has(question.id)&&!anchorReferences.has(question.id)
);
assert(nonAnchor,'S3B test requires a non-anchor Story question');
assert.deepStrictEqual(
  Array.from(AppController.prototype.narrativeScenesForQuestion.call(runtimeController,nonAnchor)),
  [],
  'non-anchor Story questions must not invent a narrative result'
);

for(const mode of ['training','review','exam']){
  runtimeController.model.state.mode=mode;
  assert.deepStrictEqual(
    Array.from(AppController.prototype.narrativeScenesForQuestion.call(runtimeController,questions.J001)),
    [],
    `${mode} must remain isolated from Anchor Scene result lookup`
  );
}
runtimeController.model.state.mode='story';
assert(controllerSource.includes('narrativeScenesForQuestion(question)'),'Controller needs Story-only anchor lookup');
assert(controllerSource.includes('renderNarrativeResult'),'Controller must connect grading flow to narrative result');
assert(controllerSource.includes('renderNarrativeResolution(question, resolved = false)'),'Controller must centralize safe Story-mode resolution');
assert(controllerSource.includes('Controller.prototype.renderNarrativeResolution.call(this, question, false)'),'wrong path must keep narrative unresolved');
assert(controllerSource.includes('Controller.prototype.renderNarrativeResolution.call(this, question, true)'),'correct path must resolve narrative');
assert(
  /revealAnswer\(\)[\s\S]{0,1200}renderNarrativeResolution\.call\(this, this\.questions\[this\.currentId\], false\)/u.test(controllerSource),
  'answer reveal may explain the solution but must not mark an unsolved Story case completed'
);


// Release236 Gen198: a revealed answer or coached retry must never certify
// Story success; only an independently verified correct attempt can resolve it.
const governed=Object.create(AppController.prototype);
governed.questions=questions;
governed.model={
  state:{mode:'story',correctIds:[]},
  verifiedCorrectIds(){return this.state.correctIds;},
  isUnverified(){return false;},
  recordAssistedRecovery(){return true;}
};
const renderCalls=[];
governed.view={
  renderNarrativeResult(scenes,options){renderCalls.push({scenes,options});return true;},
  hideProtectedResult(){},result(){},show(){},renderAnswerComparison(){}
};
governed.document={
  getElementById(){return {focus(){},append(){}};},
  createElement(){return {className:'',textContent:''};}
};
governed.currentId='C005';
governed.learningFlow={
  phase:'W',authoritativeScore:{correct:false},authoritativeAnswer:{cells:{}},
  confidence:'sure',achievement:{},retryCount:0,gameOverPending:false
};
assert.strictEqual(AppController.prototype.renderNarrativeResolution.call(governed,questions.C005,true),true);
assert.strictEqual(renderCalls.at(-1).options.resolved,false,'unverified success flag cannot resolve a Story scene');
assert.deepStrictEqual(Array.from(renderCalls.at(-1).options.epilogueFacts),[],'unverified finale cannot expose achievements');
assert.strictEqual(AppController.prototype.revealAnswer.call(governed),true);
assert.strictEqual(renderCalls.at(-1).options.resolved,false,'answer reveal never completes a wrong case');
governed.learningFlow.phase='R';
assert.strictEqual(AppController.prototype.finishCoachingRetry.call(governed,questions.C005,{}, {correct:true}),true);
assert.strictEqual(renderCalls.at(-1).options.resolved,false,'guided repair cannot credit the initial wrong attempt');
governed.model.state.correctIds=['C005'];
assert.strictEqual(AppController.prototype.renderNarrativeResolution.call(governed,questions.C005,true),true);
assert.strictEqual(renderCalls.at(-1).options.resolved,true,'genuinely verified correct response resolves finale');
assert.strictEqual(renderCalls.at(-1).options.epilogueFacts.length,2,'only current verified C005 values may be summarized');
governed.model.isUnverified=(_field,id)=>id==='C005';
assert.strictEqual(AppController.prototype.renderNarrativeResolution.call(governed,questions.C005,true),true);
assert.strictEqual(renderCalls.at(-1).options.resolved,false,'unverified legacy record may not certify finale');

console.log('ISSUE179_S3_NARRATIVE_RESULT_PASS');
