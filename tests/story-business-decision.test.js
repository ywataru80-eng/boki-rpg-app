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
const AppView=context.window.AppView;const view=new AppView(document);
const flat=node=>[node.textContent,...node.children.flatMap(flat)].filter(Boolean).join(' ');
assert.equal(typeof view.renderStoryCaseDecision,'function');
assert.equal(view.renderStoryCaseDecision({chapter:1},{correct:true}),false,'only Story can show optional cases');
assert.equal(explanation.children.length,0);
view.questionMode='story';
for(let chapter=1;chapter<=12;chapter++){
  explanation.replaceChildren();
  assert.equal(view.renderStoryCaseDecision({chapter},{correct:true}),true,'chapter '+chapter+' renders');
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
  assert(buttons.every(b=>b.disabled),'selection frozen without storing score');
  assert.equal(positive.attrs['aria-pressed'],'true');
  assert.equal(negative.attrs['aria-pressed'],'false');
  explanation.replaceChildren();
  assert.equal(view.renderStoryCaseDecision({chapter},{correct:false}),true,'wrong answer still allows non-punitive case reflection');
  assert(flat(explanation).includes('報告を確定せず'),'wrong answer does not imply business success');
  const another=explanation.children[0].children[5].children[chapter%2===1?0:1];
  another.listeners.click();
  assert(flat(explanation).includes('根拠が不足しています'),'unsafe option is explained');
}
for(const invalid of [0,13,-1,1.5,'invalid',null]){
  explanation.replaceChildren();
  assert.equal(view.renderStoryCaseDecision({chapter:invalid},{correct:true}),false);
  assert.equal(explanation.children.length,0);
}
for(const mode of ['training','review','exam','desk']){
  view.questionMode=mode;explanation.replaceChildren();
  assert.equal(view.renderStoryCaseDecision({chapter:1},{correct:true}),false,'isolated from '+mode);
  assert.equal(explanation.children.length,0);
}
view.questionMode='story';assert.equal(view.renderStoryCaseDecision({chapter:1},{ratio:1}),false,'cannot infer success from percentage');
assert.equal(view.renderStoryCaseDecision({chapter:1},null),false,'not before answer');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('id="explanation"'),'post-answer authority display exists');
const css=fs.readFileSync('css/style.css','utf8');
assert(css.includes('.story-case-decision')&&css.includes(':focus-visible'),'mobile accessibility style');
assert(source.includes('this.renderStoryCaseDecision(question, score);'),'actual result calls option after explanation');
assert(!source.includes('this.rpg.reward('),'new Story microchoice must not give XP in View');
console.log('PASS Story optional 12-chapter business-judgement cards: correct/incorrect, choice, accessibility, isolated modes, no reward mutation');
