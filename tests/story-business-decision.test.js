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
  const bridges = {4:['小口現金を精算・補給','現金過不足'], 6:['収入印紙','預り金'], 7:['固定資産台帳','元帳'], 11:['支払手形','消費税']};
  for (const phrase of bridges[chapter] || []) assert(flat(casePanel).includes(phrase), 'chapter '+chapter+' BOSS-to-story bridge: '+phrase);
  if (chapter === 11) {
    assert.equal(context.window.QuestionData.J149.category, '支払手形', 'use final runtime override, not initial literal');
    assert(context.window.QuestionData.J149.question.includes('約束手形を振り出した'));
  }
  assert(flat(casePanel).includes('採点や報酬に影響しません'),'explicit non-authority');
  if (chapter === 4) {
    assert(!casePanel.children[4].textContent.includes('どちら'),'three options do not use two-choice prompt');
    assert(casePanel.children[4].textContent.includes('最初に何を確認'),'chapter 4 question');
    assert(flat(casePanel).includes('J120')&&flat(casePanel).includes('森'),'J120/Mori bridge');
  } else assert(casePanel.children[4].textContent.includes('どちら'),'other chapters retain original binary prompt');
  const choices=casePanel.children[5];
  assert.equal(choices.children.length,chapter===4?3:2,'chapter 4 has three investigation routes; other chapters retain two choices');
  const buttons=choices.children;
  assert.notEqual(buttons[0].textContent,buttons[1].textContent,'options differ');
  assert.equal(flat(casePanel).includes('根拠を優先した判断です'),false,'feedback not leaked before selection');
  const positive=buttons[chapter%2===1?1:0];
  const negative=buttons[chapter===4?2:chapter%2===1?0:1];
  if(chapter===4){
    assert.equal(buttons.length,3);
    assert(buttons[0].textContent.includes('現金出納帳'));
    assert(buttons[1].textContent.includes('領収証'));
    assert(buttons[2].textContent.includes('雑費'));
  }
  positive.listeners.click();
  assert(flat(casePanel).includes(chapter===4?'調査の入口として合理的です。':'根拠を優先した判断です'),'reasoned decision explains why');
  assert(flat(casePanel).includes('仕事の成果：'),'visible positive work outcome');
  if(chapter===4){
    assert(flat(casePanel).includes('確認できること：'),'evidence finding shown');
    assert(flat(casePanel).includes('まだ分からないこと：'),'uncertainty shown');
    assert(flat(casePanel).includes('次に行うこと：'),'followup shown');
    assert(!flat(casePanel).includes('原因を解決しました'),'no invented resolution');
    assert(flat(casePanel).includes('森「出納帳と実査記録'),'Mori reacts to first evidence');
    const evidenceBox=casePanel.children[6];
    const inspect=evidenceBox.children.find(n=>n.tagName==='button'&&n.textContent.includes('もう一方'));
    assert(inspect,'optional second evidence review button appears');
    inspect.listeners.click();
    assert(inspect.disabled&&flat(casePanel).includes('追加照合の視点：'),'second document checked');
    const detailsBefore=evidenceBox.children.length;inspect.listeners.click();
    assert.equal(evidenceBox.children.length,detailsBefore,'no duplicate second inspection');
    view.storyDecisionRenderedForQuestionId=null;view.storyDecisionPreviousBox=null;
    explanation.replaceChildren();
    assert.equal(view.renderStoryCaseDecision(question,{correct:true}),true);
    const second=explanation.children[0].children[5].children[1];
    second.listeners.click();
    assert(flat(explanation).includes('未記帳の取引を調べられます'),'second legitimate path has a distinct evidence finding');
    assert(flat(explanation).includes('帳簿との照合なしには確定しません'),'second path retains unknowns');
    explanation.replaceChildren();
    view.storyDecisionRenderedForQuestionId=null;view.storyDecisionPreviousBox=null;
    assert.equal(view.renderStoryCaseDecision(question,{correct:true}),true);
    explanation.replaceChildren();
    view.storyDecisionRenderedForQuestionId=null;view.storyDecisionPreviousBox=null;
    assert.equal(view.renderStoryCaseDecision(question,{correct:true}),true);
    // Restore original first-option decision card for shared regression assertions.
    explanation.replaceChildren();
    explanation.append(casePanel);
    view.storyDecisionRenderedForQuestionId=question.id;view.storyDecisionPreviousBox=casePanel;
  }
  assert(buttons.every(b=>b.disabled),'selection frozen without storing score');
  explanation.replaceChildren();
  assert.equal(view.renderStoryCaseDecision(question,{correct:true}),true,'revealed result can attach preserved card');
  assert.equal(explanation.children[0],casePanel,'same card instance and original feedback preserved');
  assert(flat(explanation).includes('仕事の成果：'),'selected feedback survives explanation re-render');
  assert.equal(positive.attrs['aria-pressed'],'true');
  assert.equal(negative.attrs['aria-pressed'],'false');
  // Separate independent attempt fixture; the real controller resets at the next start().
  view.storyDecisionRenderedForQuestionId=null;view.storyDecisionPreviousBox=null;
  explanation.replaceChildren();
  assert.equal(view.renderStoryCaseDecision(question,{correct:false}),true,'wrong answer still allows non-punitive case reflection');
  assert(flat(explanation).includes('報告を確定せず'),'wrong answer does not imply business success');
  const another=explanation.children[0].children[5].children[chapter===4?2:chapter%2===1?0:1];
  another.listeners.click();
  assert(flat(explanation).includes('根拠が不足しています'),'unsafe option is explained');
  assert(flat(explanation).includes('報告は保留です'),'unsafe outcome cannot be misreported as success');
  if(chapter===4){
    assert(flat(explanation).includes('現金過不足として仮処理'),'unsafe path states correct accounting boundary');
    assert(!flat(explanation).includes('仕事の成果：'),'unsafe path never grants success');
    assert(!explanation.children[0].children[6].children.some(n=>n.tagName==='button'),'unsafe choice cannot request optional evidence');
  }
  const errorBox=explanation.children[0];explanation.replaceChildren();
  assert.equal(view.renderStoryCaseDecision(question,{correct:false}),true,'wrong-answer reveal restores prior judgement');
  assert.equal(explanation.children[0],errorBox,'wrong-answer original feedback is not recreated or lost');
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
