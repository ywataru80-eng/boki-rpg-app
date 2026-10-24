'use strict';
// Guard the pre-answer category/task display: account-name category must not
// disclose any correct debit or credit entry before the learner responds.
// The renderer's first display writes are exercised with materials isolated;
// a browser integration gate must additionally cover the full DOM and clicks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sandboxWindow = {};
vm.runInNewContext(fs.readFileSync(path.join(root,'data/questions.js'),'utf8'),{window:sandboxWindow});
vm.runInNewContext(fs.readFileSync(path.join(root,'js/view.js'),'utf8'),{window:sandboxWindow});
assert.equal(Object.keys(sandboxWindow.QuestionData).length,300,'300 canonical questions required');
assert.equal(typeof sandboxWindow.AppView,'function');
const questions = Object.values(sandboxWindow.QuestionData);
const before=JSON.stringify(sandboxWindow.QuestionData);
const STOP={reason:'stop after pre-answer labels; materials tested in normal suites'};
let attempts=0,spoilerIds=[],unmasked=0;
for(const q of questions){
  const matches=q.type==='journal'
    && [...(q.answer?.debit||[]),...(q.answer?.credit||[])]
       .some(item=>item.account===q.category);
  if(matches)spoilerIds.push(q.id); else unmasked++;
  const visible=matches?'仕訳問題':q.category;
  for(const mode of ['story','training','exam','review']){
    const elements=new Map();
    const doc={getElementById:id=>{
      if(!elements.has(id)) elements.set(id,{textContent:'',hidden:false});
      return elements.get(id);
    }};
    const view=new sandboxWindow.AppView(doc);
    // Stop at the first expensive DOM/material construction; the labels are
    // produced immediately beforehand and are inspected on every mode.
    view.renderMaterials=()=>{throw STOP};
    try{view.renderQuestion(q,{},mode);assert.fail('renderer did not reach material gate '+q.id);}
    catch(err){if(err!==STOP)throw err;}
    assert.equal(elements.get('q-category').textContent,
      `第${q.chapter}章｜${visible}`,q.id+' '+mode+' preanswer category');
    if(mode==='story'){
      assert.equal(elements.get('q-task').textContent,
        `今回の仕事：${visible}`,q.id+' story task');
      const narrative=elements.get('q-context').textContent;
      if(matches){
        assert(!narrative.includes(q.category),q.id+' category/account leaked through story');
        assert(narrative.includes('証憑') || !q.story.includes('証憑'),
          q.id+' narrative retains learner task');
      }else assert.equal(narrative,q.story,q.id+' unrelated narrative unchanged');
    }else{
      assert.equal(elements.get('q-task')?.textContent||'','',
        q.id+' '+mode+' must not render a Story task');
      assert.equal(elements.get('q-context')?.textContent||'','',
        q.id+' '+mode+' must not render a Story narrative');
    }
    attempts++;
  }
}
assert.equal(spoilerIds.length,56,'protected account-name category cases');
assert.equal(unmasked,244,'non-spoiler categories unchanged');
assert.equal(attempts,1200,'300 questions x four modes');
assert.equal(JSON.stringify(sandboxWindow.QuestionData),before,
  'display logic must not mutate authored questions/answers');
assert(spoilerIds.includes('J148')&&spoilerIds.includes('J149'),'known note disclosures');
assert(!spoilerIds.includes('J038'),'A3 journal pilot control remains unmasked');
console.log('PASS preanswer category account protection: '+spoilerIds.length+
  ' journal IDs masked, '+unmasked+' questions preserved, '+attempts+' renderer paths');
