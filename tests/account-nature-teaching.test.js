'use strict';
// Post-answer learning contract. Live runtime canonical questions, never a raw
// initial declaration that may be overridden by subsequent QuestionData edits.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const sources=['data/accounting-domain.js','data/questions.js','js/view.js'];
const sandbox={window:{},console};
for(const file of sources)vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file,timeout:15000});
const data=sandbox.window.QuestionData,domain=sandbox.window.AccountingDomain;
assert.equal(Object.keys(data).length,300,'all canonical 300 loaded');
const before=JSON.stringify(data);
const createElement=tag=>({
  tagName:tag,children:[],className:'',textContent:'',
  append(...nodes){this.children.push(...nodes);}
});
const document={createElement};
const view=new sandbox.window.AppView(document);
const readText=node=>[node.textContent||'',...(node.children||[]).map(readText)].join('');
const expectedType={asset:'資産',contraAsset:'資産の控除',liability:'負債',equity:'純資産',revenue:'収益',expense:'費用',temporary:'仮勘定',closing:'決算勘定'};
const normalDebit=new Set(['asset','expense']);
const normalCredit=new Set(['liability','equity','revenue']);
let journalEntries=0,corrections=0,unclassified=[];
for(const q of Object.values(data)){
  const surface=createElement('div');
  view.renderAccountNature(q,surface);
  if(q.type!=='journal'&&q.type!=='correction'){
    assert.equal(surface.children.length,0,q.id+' unrelated answer format unchanged');
    continue;
  }
  if(q.type==='correction')corrections++;
  const answer=q.type==='journal'?q.answer:view.correctionJournal(q.answer);
  const entries=['debit','credit'].flatMap(side=>(answer?.[side]||[]).filter(x=>x.account).map(x=>({...x,side})));
  if(q.type==='journal')journalEntries+=entries.length;
  assert.equal(surface.children.length,entries.length?1:0,q.id+' one dedicated section');
  if(!entries.length)continue;
  const [card]=surface.children;
  assert.equal(card.children[1].children.length,entries.length,q.id+' all answer accounts annotated');
  entries.forEach((entry,index)=>{
    const type=domain.accountType(entry.account);
    if(type==='unknown')unclassified.push(q.id+':'+entry.account);
    const row=readText(card.children[1].children[index]);
    const side=entry.side==='debit'?'借方':'貸方';
    assert(row.includes(entry.account+'（'+(expectedType[type]||'未分類')+'）'),q.id+' '+entry.account+' category');
    assert(row.includes(side+'に記入します'),q.id+' '+entry.account+' posting side');
    if(normalDebit.has(type)||normalCredit.has(type)){
      const increase=(normalDebit.has(type)&&entry.side==='debit')||(normalCredit.has(type)&&entry.side==='credit');
      assert(row.includes(increase?'増加':'減少'),q.id+' '+entry.account+' movement direction');
    }
    if(type==='contraAsset')assert(row.includes('資産を減額する控除額が'),q.id+' contra-asset distinction');
    if(type==='temporary'||type==='closing')assert(row.includes('通常の五要素の増減則だけでは判断せず'),q.id+' special account distinction');
  });
  assert(!readText(card).includes('未分類'),q.id+' no fabricated category: '+JSON.stringify(entries.map(e=>({account:e.account,type:domain.accountType(e.account)}))));
}
assert.deepEqual(unclassified,[],'no unsupported canonical answer account');
assert.equal(journalEntries,349,'349 journal account postings explicitly explained');
assert.equal(corrections,20,'20 correction items covered');
assert.equal(JSON.stringify(data),before,'no authored question/answer/explanation mutation');
const resultSource=fs.readFileSync(path.join(root,'js/view.js'),'utf8');
assert(resultSource.includes('this.renderAccountNature(question, container);'),'post-score feedback integration');
assert(resultSource.includes('this.renderAccountNature(question, details);'),'post-exam review integration');
const check=(id,side,account,words)=>{
  const q=data[id],card=createElement('div');view.renderAccountNature(q,card);
  const answer=q.type==='journal'?q.answer:view.correctionJournal(q.answer);
  const ix=['debit','credit'].flatMap(s=>(answer[s]||[]).map(x=>({side:s,...x}))).findIndex(x=>x.side===side&&x.account===account);
  assert(ix>=0,id+' selected account exists');
  const line=readText(card.children[0].children[1].children[ix]);
  for(const word of words)assert(line.includes(word),id+' '+account+' '+word);
};
check('J001','debit','現金',['資産','増加','借方']);
check('J001','credit','資本金',['純資産','増加','貸方']);
check('J149','credit','支払手形',['負債','増加','貸方']);
check('J150','debit','支払手形',['負債','減少','借方']);
console.log('PASS account-nature explanations: 300 formats, 150 journals / '+journalEntries+' postings, '+corrections+' corrections, no unknowns or data mutation');
