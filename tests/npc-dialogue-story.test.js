'use strict';
// Source-based preanswer NPC dialogue should be present only in story mode.
// A result-screen-only fallback left all 83 authored lines invisible.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const sandbox={window:{},console};
for(const file of ['data/questions.js','js/view.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file,timeout:15000});
class E {
 constructor(tag){this.tagName=tag;this.id='';this.children=[];this.textContent='';this.className='';this.hidden=false;this.dataset={};this.classList={add(){}};}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(){}
}
const elements={};
const document={
 createElement:tag=>new E(tag),
 getElementById:id=>id==='q-npc-dialogue'?(elements['q-story']?.children.find(x=>x.id===id)||null):(elements[id]||(elements[id]=new E('section')))
};
const view=new sandbox.window.AppView(document);
for(const method of ['renderMaterials','renderJournal','renderCorrection','renderJournalBook','renderBookkeepingForm','renderBalanceSheet','renderFixedAssetLedger','renderTable'])view[method]=()=>{};
const data=sandbox.window.QuestionData,questions=Object.values(data);
assert.equal(questions.length,300);
const before=JSON.stringify(data);
let authored=0,storyChecks=0,examChecks=0,trainingChecks=0;
for(const q of questions){
 view.renderQuestion(q,{},'story');
 const npc=document.getElementById('q-npc-dialogue');
 assert(npc,q.id+': persistent dialogue node');
 assert.equal(npc.hidden,!Boolean(q.npcDialogue),q.id+': dialogue visibility');
 assert.equal(npc.textContent,q.npcDialogue||'',q.id+': source quote unchanged');
 if(q.npcDialogue){authored++;
   if(q.type==='journal')for(const item of [...q.answer.debit,...q.answer.credit]){
     if(item.account.length>=3)assert(!q.npcDialogue.includes(item.account),q.id+': NPC quote must not reveal answer account');
   }
 }
 storyChecks++;
 view.renderQuestion(q,{},'exam');
 assert(npc.hidden&&!npc.textContent,q.id+': no NPC in exam');examChecks++;
 view.renderQuestion(q,{},'training');
 assert(npc.hidden&&!npc.textContent,q.id+': no NPC in training');trainingChecks++;
}
assert.equal(authored,83,'Expected 83 authored mentor lines in Release232 content');
assert.equal(JSON.stringify(data),before,'No canonical data modifications');
console.log('NPC_DIALOGUE_STORY_PASS',storyChecks,'story,',examChecks,'exam,',trainingChecks,'training,',authored,'authored lines');
