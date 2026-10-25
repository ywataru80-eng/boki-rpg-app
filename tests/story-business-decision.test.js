'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/view.js','utf8');
class Node {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.textContent='';this.attrs={};this.listeners={};this.disabled=false;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  setAttribute(name,value){this.attrs[name]=String(value);}
  addEventListener(name,callback){this.listeners[name]=callback;}
}
const explanation=new Node('div');
const document={
  createElement(tag){return new Node(tag);},
  getElementById(id){return id==='explanation'?explanation:null;}
};
const context={window:{matchMedia(){return {matches:false};}},console};vm.createContext(context);vm.runInContext(source,context);
vm.runInContext(fs.readFileSync('data/questions.js','utf8'),context);
vm.runInContext(fs.readFileSync('js/controller.js','utf8'),context);
const AppView=context.window.AppView;const view=new AppView(document);
const flat=node=>[node.textContent,...node.children.flatMap(flat)].filter(Boolean).join(' ');
assert.equal(typeof view.renderStoryCaseDecision,'function');
assert.equal(view.renderStoryCaseDecision({chapter:1},{correct:true}),false,'only Story can show optional cases');
assert.equal(explanation.children.length,0);
view.questionMode='story';
for(let chapter=1;chapter<=12;chapter++){
  const climax=context.window.AnchorScenes.find(scene=>scene.chapter===chapter&&scene.beat==='BOSS');
  assert(climax,'chapter '+chapter+' has BOSS anchor');
  const question={chapter,id:climax.referenceQuestionId};
  view.storyDecisionEligible=true;explanation.replaceChildren();
  assert.equal(view.renderStoryCaseDecision(question,{correct:true}),true,'chapter '+chapter+' climax renders');
  assert.equal(view.renderStoryCaseDecision({chapter,id:'NOT_BOSS'},{correct:true}),false,'normal question must not repeat');
  view.storyDecisionEligible=false;
  assert.equal(view.renderStoryCaseDecision(question,{correct:true}),false,'repeated climax must not show');
  view.storyDecisionEligible=true;
  assert.equal(explanation.children.length,1);
  const casePanel=explanation.children[0];
  assert(flat(casePanel).includes('第'+chapter+'章'),'chapter-scoped event');
  assert(flat(casePanel).includes('3分の振り返り目標'),'short opt-in reflection');
  assert(flat(casePanel).includes('採点や報酬に影響しません'),'explicit non-authority');
  const choices=casePanel.children[5];
  assert.equal(choices.children.length,2,'two post-answer decisions');
  const buttons=choices.children;
  assert.notEqual(buttons[0].textContent,buttons[1].textContent,'options differ');
  assert.equal(flat(casePanel).includes('根拠を優先した判断です'),false,'feedback not leaked before selection');
  const positive=buttons[chapter%2===1?1:0];
  const negative=buttons[chapter%2===1?0:1];
  positive.listeners.click();
  assert(flat(casePanel).includes('根拠を優先した判断です'),'reasoned decision explains why');
  assert(flat(casePanel).includes('仕事の成果：'),'visible positive work outcome');
  assert(buttons.every(b=>b.disabled),'selection frozen without storing score');
  assert.equal(positive.attrs['aria-pressed'],'true');
  assert.equal(negative.attrs['aria-pressed'],'false');
  explanation.replaceChildren();
  assert.equal(view.renderStoryCaseDecision(question,{correct:false}),true,'wrong answer still allows non-punitive case reflection');
  assert(flat(explanation).includes('報告を確定せず'),'wrong answer does not imply business success');
  const another=explanation.children[0].children[5].children[chapter%2===1?0:1];
  another.listeners.click();
  assert(flat(explanation).includes('根拠が不足しています'),'unsafe option is explained');
  assert(flat(explanation).includes('報告は保留です'),'unsafe outcome cannot be misreported as success');
}
for(const invalid of [0,13,-1,1.5,'invalid',null]){
  explanation.replaceChildren();
  assert.equal(view.renderStoryCaseDecision({chapter:invalid,id:'MISSING'},{correct:true}),false);
  assert.equal(explanation.children.length,0);
}
for(const mode of ['training','review','exam','desk']){
  view.questionMode=mode;explanation.replaceChildren();
  assert.equal(view.renderStoryCaseDecision({chapter:1,id:'J103'},{correct:true}),false,'isolated from '+mode);
  assert.equal(explanation.children.length,0);
}
view.questionMode='story';assert.equal(view.renderStoryCaseDecision({chapter:1,id:'J103'},{ratio:1}),false,'cannot infer success from percentage');
assert.equal(view.renderStoryCaseDecision({chapter:1,id:'J103'},null),false,'not before answer');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('id="explanation"'),'post-answer authority display exists');
const css=fs.readFileSync('css/style.css','utf8');
assert(css.includes('.story-case-decision')&&css.includes(':focus-visible'),'mobile accessibility style');
assert(source.includes('this.renderStoryCaseDecision(question, score);'),'actual result calls option after explanation');
assert(!source.includes('this.rpg.reward('),'new Story microchoice must not give XP in View');
console.log('PASS Story optional 12-chapter business-judgement cards: correct/incorrect, choice, accessibility, isolated modes, no reward mutation');

const Controller=context.window.AppController;
const board=new Node('section');
const fake=Object.create(Controller.prototype);
fake.document={createElement:tag=>new Node(tag),getElementById:id=>id==='story-work-outcomes'?board:null};
fake.questions={J103:{chapter:1},J109:{chapter:2},J104:{chapter:2}};
fake.model={state:{answeredIds:['J103','J104'],correctIds:['J103']},isUnverified:()=>false};
assert.equal(fake.renderStoryWorkOutcomes(['J103','J104','J109'],2),true);
assert(flat(board).includes('第1章｜処理した資料 1/1件'),'recorded items cannot be claimed from guesses');
assert(flat(board).includes('章の報告課題に正答した記録あり'),'verified response not imaginary account movement');
assert(flat(board).includes('第2章｜処理した資料 1/2件'),'show actual partial progress');
assert(flat(board).includes('章の報告課題はこれから'),'unsubmitted chapter climax must remain pending');
assert(!flat(board).includes('次の仕事：'+context.window.AnchorScenes.find(s=>s.chapter===2&&s.beat==='BOSS').hook),'unanswered chapter must not leak the next beat');
fake.model.state.correctIds=[];fake.renderStoryWorkOutcomes(['J103','J104','J109'],2);
assert(flat(board).includes('正答を再確認'),'no false success when not correct');
assert(!flat(board).includes('次の仕事：'+context.window.AnchorScenes.find(s=>s.chapter===1&&s.beat==='BOSS').hook),'wrong BOSS must never reveal success-only scene hook');
fake.model.state.answeredIds=[];fake.renderStoryWorkOutcomes(['J103','J104','J109'],2);
assert(flat(board).includes('0/2件'),'fresh player state must start at zero');
assert(source.includes('this.storyDecisionEligible')&&fs.readFileSync('js/controller.js','utf8').includes('!(this.model.state.answeredIds || []).includes(id)'),'first BOSS attempt only, using saved evidence');
assert(fs.readFileSync('index.html','utf8').includes('id="story-work-outcomes"'));
console.log('PASS first-visit BOSS-only decision, 12 chapters, record-based work outcomes, no additional storage');
