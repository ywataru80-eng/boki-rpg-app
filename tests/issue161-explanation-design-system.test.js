'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const sandbox={window:{},console};vm.createContext(sandbox);
for(const file of ['data/questions.js','js/explanation-design-system.js'])vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
const q=sandbox.window.QuestionData,ds=sandbox.window.ExplanationDesignSystem,ids=Object.keys(q);
assert.strictEqual(ids.length,300,'Gate 4 must cover the complete 300-question corpus');
assert.strictEqual(Object.keys(ds.MATRIX).length,27,'all 27 concrete type/format combinations are explicit, including the 17 Release236 decisions');
assert.strictEqual(ds.MATRIX['worksheet/decision-worksheet-v2'],'closingDecision','new decision format must not use the legacy eight-column worksheet procedure');
const formats=new Set(),profiles=new Set(),componentUse=new Set();
for(const id of ids){
  const item=q[id],key=item.type+'/'+(item.format||'default'),plan=ds.planFor(item);
  formats.add(key);profiles.add(plan.profileId);plan.components.forEach(component=>componentUse.add(component.id));
  assert(ds.MATRIX[key],id+': explicit format mapping');
  assert(plan.path.length>=5,id+': visible procedure has at least five meaningful stages');
  assert(plan.path.every(label=>typeof label==='string'&&label.trim()),id+': no empty visual stage');
  assert(plan.components.some(component=>component.id==='goal'),id+': question-goal component');
  assert(plan.components.some(component=>component.id==='source'),id+': source-highlight component');
  assert(plan.components.some(component=>component.id==='decision'),id+': decision-map component');
  assert(plan.components.some(component=>component.id==='transfer'),id+': transfer-map component');
  assert(plan.components.some(component=>component.id==='check'),id+': check component');
  assert(plan.components.some(component=>component.id==='takeaway'),id+': takeaway component');
}
assert.strictEqual(formats.size,26,'runtime corpus has 26 active formats and one explicitly retained historical worksheet mapping');
assert.deepStrictEqual(Object.keys(ds.MATRIX).filter(key=>!formats.has(key)),['worksheet/default'],'historical default worksheet remains supported but unused by Release236');
assert.deepStrictEqual([...componentUse].sort(),Object.keys(ds.COMPONENTS).sort(),'the shared system exercises every required Gate 4 component');
for(const id of ['L005','L010','L015','L020','L025','L030','L033','L040']){
  const plan=ds.planFor(q[id]);
  assert.strictEqual(plan.profileId,'fixedAsset',id+': fixed asset route');
  assert(plan.components.some(x=>x.id==='timeline')&&plan.components.some(x=>x.id==='formula'),id+': timeline and formula components');
}
assert(ds.planFor(q.C001).components.some(x=>x.id==='beforeAfter'),'correction uses before/after');
assert(ds.planFor(q.J001).components.some(x=>x.id==='journalTable'),'journal uses journal-table');
const evidenceModel={
  sources:[{focus:'請求書の取得原価を確認する'}],
  summary:[{text:'目標'},{text:'資産の取得として判断する'}],
  calculation:[{expression:'360,000÷5=72,000'}],
  checks:[{label:'取得原価－累計額＝帳簿価額'}]
};
const incorrect=ds.planFor(q.L005,{model:evidenceModel,correct:false});
assert(incorrect.evidence.some(x=>x.id==='source'&&x.text==='請求書の取得原価を確認する'),'route reuses model source evidence');
assert(incorrect.evidence.some(x=>x.id==='formula'&&x.text==='360,000÷5=72,000'),'route reuses formula evidence');
assert(incorrect.components.some(x=>x.id==='misconception'),'wrong result keeps misconception component');
const correct=ds.planFor(q.L005,{model:evidenceModel,correct:true});
assert(!correct.components.some(x=>x.id==='misconception'),'correct result does not force misconception component');
assert.throws(()=>ds.planFor({type:'unknown'}),/EXPLANATION_FORMAT_NOT_CLASSIFIED/,'new formats fail closed instead of silently using a generic layout');

const viewSource=fs.readFileSync('js/view.js','utf8');
const css=fs.readFileSync('css/style.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const worker=fs.readFileSync('service-worker.js','utf8');
assert(viewSource.includes('ExplanationDesignSystem?.planFor'),'result view calls the shared design system');
assert(viewSource.includes('ExplanationDesignSystem.render(this.document, route)'),'result view renders the shared route');
assert(html.indexOf('js/explanation-model.js')<html.indexOf('js/explanation-design-system.js'),'design system loads after ExplanationModel');
assert(html.indexOf('js/explanation-design-system.js')<html.indexOf('js/view.js'),'design system loads before AppView');
assert(worker.includes("'./js/explanation-design-system.js'"),'PWA cache contains the design-system module');
assert(/\.explanation-route-list\s*\{[^}]*display:\s*grid/s.test(css),'route is a structured visual grid');
assert(/@media\s*\(max-width:\s*600px\)[\s\S]*?\.explanation-route-list\s*\{[^}]*grid-template-columns:\s*1fr/s.test(css),'mobile route becomes a vertical procedure without horizontal scroll');

class FakeNode{
  constructor(tag){this.tagName=tag;this.className='';this.children=[];this.dataset={};this.attributes={};this._text='';}
  append(...nodes){this.children.push(...nodes);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  set textContent(value){this._text=String(value??'');}
  get textContent(){return this._text+this.children.map(child=>child.textContent||'').join('');}
}
const fakeDoc={createElement(tag){return new FakeNode(tag);}};
const routeNode=ds.render(fakeDoc,incorrect);
assert.strictEqual(routeNode.className,'explanation-route');
assert.strictEqual(routeNode.attributes['aria-label'],'解答までの道筋');
assert(routeNode.textContent.includes('固定資産台帳')&&routeNode.textContent.includes('取得日・取得原価'),'rendered route exposes the solving sequence as text, not an image');
assert(!routeNode.textContent.includes('[object Object]'),'route renderer never exposes raw objects');

console.log('ISSUE161_GATE4_DESIGN_SYSTEM_PASS');
