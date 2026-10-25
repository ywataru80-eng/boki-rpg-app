'use strict';
// Post-answer learning contract. Live runtime canonical questions, never a raw
// initial declaration that may be overridden by subsequent QuestionData edits.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const sources=['data/accounting-domain.js','data/questions.js','js/view.js'];
const sandbox={window:{},console};
for(const file of sources){
  vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file,timeout:15000});
  // In browsers globalThis === window; vm's host and window are distinct objects.
  if(file==='data/accounting-domain.js')sandbox.AccountingDomain=sandbox.window.AccountingDomain;
}
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
    // A closing entry can continue as 「借方に記入し、…」 before the next
    // posting; both complete-sentence and compound-sentence forms assert the
    // actual debit/credit side rather than a punctuation-specific suffix.
    assert(type==='closing'
      ? (row.includes(side+'に記入し') || row.includes(side+'に記入します'))
      : row.includes(side+'に記入します'),q.id+' '+entry.account+' posting side');
    if(normalDebit.has(type)||normalCredit.has(type)){
      const increase=(normalDebit.has(type)&&entry.side==='debit')||(normalCredit.has(type)&&entry.side==='credit');
      assert(row.includes(increase?'増加':'減少'),q.id+' '+entry.account+' movement direction');
    }
    if(type==='contraAsset')assert(row.includes('資産を減額する控除額が'),q.id+' contra-asset distinction');
    if(type==='temporary'||type==='closing') {
      assert(!row.includes('通常の五要素の増減則だけでは判断せず'),q.id+' not generic special account explanation');
      assert(row.includes(type==='temporary'?'現金':'損益'),q.id+' special account purpose');
    }
  });
  assert(!readText(card).includes('未分類'),q.id+' no fabricated category');
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

for(const id of ['J017','J067','J117']){
  check(id,'debit','現金過不足',['実際有高','少ない','貸方で減らし','原因未判明','借方に記入します']);
}
for(const id of ['J018','J068','J118']){
  check(id,'credit','現金過不足',['先に借方へ仮記録','振り替え','貸方に記入します','重ねて増減させません']);
}
for(const id of ['J050','J100']){
  check(id,'debit','損益',['収益が費用を上回り','当期純利益','ゼロ','借方に記入し','繰越利益剰余金']);
}
// Negative/transfer cases: the same side cannot imply the same event in every
// context. Exercise surplus, clearing, loss, expense and revenue transfers.
const checkSynthetic=(name,answer,side,account,required,forbidden=[])=>{
  const surface=createElement('div');
  view.renderAccountNature({type:'journal',answer},surface);
  const entries=['debit','credit'].flatMap(s=>answer[s].map(item=>({...item,side:s})));
  const i=entries.findIndex(item=>item.side===side&&item.account===account);
  assert(i>=0,name+' selected synthetic account');
  const line=readText(surface.children[0].children[1].children[i]);
  for(const word of required)assert(line.includes(word),name+' must explain '+word);
  for(const word of forbidden)assert(!line.includes(word),name+' must not claim '+word);
};
checkSynthetic('cash surplus', {debit:[{account:'現金',amount:300}],credit:[{account:'現金過不足',amount:300}]},
  'credit','現金過不足',['多い','借方で増やし','過剰額','貸方に記入します'],['先に借方へ仮記録']);
checkSynthetic('cash surplus clearing',{debit:[{account:'現金過不足',amount:300}],credit:[{account:'雑益',amount:300}]},
  'debit','現金過不足',['先に貸方へ仮記録','仮記録を減らす','借方に記入します'],['原因未判明の不足額']);
checkSynthetic('net loss',{debit:[{account:'繰越利益剰余金',amount:700}],credit:[{account:'損益',amount:700}]},
  'credit','損益',['当期純損失','借方残高','貸方に記入し'],['当期純利益']);
checkSynthetic('expense close',{debit:[{account:'損益',amount:800}],credit:[{account:'給料',amount:800}]},
  'debit','損益',['費用勘定','損益の借方に記入します'],['当期純利益']);
checkSynthetic('revenue close',{debit:[{account:'売上',amount:900}],credit:[{account:'損益',amount:900}]},
  'credit','損益',['収益勘定','損益の貸方に記入します'],['当期純損失']);

console.log('PASS account-nature explanations: 300 formats, 150 journals / '+journalEntries+' postings, '+corrections+' corrections, no unknowns or data mutation');
