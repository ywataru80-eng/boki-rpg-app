'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const view=fs.readFileSync('js/view.js','utf8'),css=fs.readFileSync('css/style.css','utf8'),html=fs.readFileSync('index.html','utf8'),worker=fs.readFileSync('service-worker.js','utf8');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),sandbox,{filename:'data/questions.js'});
const q=sandbox.window.QuestionData;
assert(q.L034.explanationModel&&q.L041.explanationModel,'最終runtimeのL034/L041にstructured explanationを持たせる');
assert.strictEqual(q.L034.category,'仕訳帳');
assert.strictEqual(q.L041.category,'仕訳帳');
assert(String(q.L034.explanation).startsWith('仕訳帳は日付、摘要欄の勘定科目、元丁、借方・貸方金額を日付順に記入します。'),'L034のauthored先頭説明を保持する');
assert(String(q.L041.explanation).startsWith('仕訳帳は日付、摘要欄の勘定科目、元丁、借方・貸方金額を日付順に記入します。'),'L041のauthored先頭説明を保持する');
for(const label of ['使う資料を整理する','どういう取引か考える','必要な金額を出す','最後に確認','間違えやすいところ'])assert(view.includes(label),`教材見出し「${label}」を実画面rendererに持つ`);
assert(view.includes("format === 'fixed-asset-ledger'"),'固定資産台帳専用の教育プロファイルを持つ');
assert(view.includes("format === 'bookkeeping-notes-receivable'"),'受取手形記入帳専用の教育プロファイルを持つ');
assert(view.includes("format === 'bookkeeping-inventory-ledger'"),'商品有高帳専用の教育プロファイルを持つ');
assert(view.includes("format === 'bookkeeping-voucher-entry'"),'伝票専用の教育プロファイルを持つ');
assert(view.includes("...(hasMeaningfulCalculation ? [['必要な金額を出す','calculation']] : [])"),'算術計算がない問題では計算セクションを表示しない');
assert(view.includes("].filter(([,key]) => (model[key] || []).length > 0)"),'情報がない解説段階は見出しごと表示しない');
assert(view.indexOf("[teachingProfile.summary,'summary']")<view.indexOf("['使う資料を整理する','sources']"),'判断ルールを資料確認より先に表示する');
assert(!view.includes('explanation-flow-empty'),'空段階の埋め草メッセージを表示しない');
assert(view.includes('journal-review-mobile'),'仕訳の誤答・正解比較にスマホ専用の借方/貸方表示を持つ');
assert(view.includes('answer-comparison-mobile-list'),'C001等の回答比較にスマホ専用カード表示を持つ');
assert(/@media\s*\(max-width:\s*600px\)[\s\S]*?\.journal-table,[\s\S]*?\.answer-comparison-table\s*\{\s*display:\s*none;/s.test(css),'600px以下では横長の比較表を非表示にする');
assert(/@media\s*\(max-width:\s*600px\)[\s\S]*?\.journal-review-mobile\s*\{[^}]*display:\s*grid/s.test(css),'600px以下では仕訳の誤答・正解を4列仕訳票で表示する');
assert(/@media\s*\(max-width:\s*600px\)[\s\S]*?\.answer-comparison-mobile-list\s*\{[^}]*display:\s*grid/s.test(css),'600px以下では表形式問題の比較専用カードを表示する');
assert(/@media\s*\(max-width:\s*600px\)[\s\S]*?\.journal-table-wrap,[\s\S]*?\.answer-comparison-table-wrap\s*\{[^}]*overflow-x:\s*visible/s.test(css),'比較画面ではスマホ横スクロールを発生させない');
assert(view.includes("const structuredAlways = question.teachingPresentation === 'structured-always'"),'指定問題は正解・誤答の両方で構造化解説を表示できる');
assert(view.includes('(score.correct && !structuredAlways) || !question.explanationModel'),'通常問題は従来どおり誤答時だけ構造化し、structured-always指定だけ正解時にも表示する');
assert(view.includes('appendAuthoredExplanation(question, container, authoredOnly = false)'),'authored proseだけを分離表示できる');
assert(view.includes("const markers = ['【この問題への当てはめ】','【使用する資料】']"),'旧生成長文をstructured PoCへ重複表示しない');
assert(view.includes('renderLearningTakeaway(question, container)'),'構造化解説の最後は学習持ち帰りカードにする');
assert(view.includes('この問題で覚えること'),'持ち帰りカードの見出しを持つ');
assert(view.includes('元丁には総勘定元帳の転記先を示す番号'),'仕訳帳の元丁の意味を一般化して説明する');
assert(view.includes('証憑に金額が示されている場合は、その金額をそのまま記入'),'直接記載額と計算問題を見分ける原則を持つ');
assert(!view.includes('this.appendAuthoredExplanation(question, container, true)'),'構造化解説では旧authored解説を重複表示しない');
assert(/\.explanation-formula strong\s*\{[^}]*overflow-wrap:\s*anywhere/s.test(css),'計算ブロックをiPhoneでクリップしない');
assert(view.includes('explanation-source-table-wrap'),'表資料は専用の横スクロール領域で表示する');
assert(view.includes("item.list?.length"),'列挙資料を番号付きリストで表示する');
assert(view.includes("wrap.dataset.tableKind = item.table.kind"),'資料表の種類をDOMへ伝える');
assert(css.includes('.explanation-source-list'),'列挙資料の専用スタイルを持つ');
assert(css.includes('[data-table-kind="trial-balance"]'),'解説試算表の専用モバイルレイアウトを持つ');
assert(/\.explanation-source-table-wrap\s*\{[^}]*overflow-x:\s*auto/s.test(css),'確認表は狭い画面で表だけ横スクロールできる');
assert(/\.explanation-source-table\s*\{[^}]*min-width:\s*520px/s.test(css),'確認表の列幅を潰さない');
assert(view.includes("wrap.dataset.questionType = question.type"),'解説の確認表ラッパーへ問題種別を付与する');
assert(view.includes("table.dataset.questionType = question.type"),'解説の確認表へ問題種別を付与する');
assert(css.includes('.explanation-source-table[data-question-type="trial_balance"]'),'T001解説表に試算表専用のモバイル指定を持つ');
assert(css.includes('overflow-x: hidden;'),'T001解説表は内部横スクロールを発生させない');
assert(css.includes('table-layout: fixed;'),'T001解説表は問題文表と同じ固定レイアウトを使う');
const release=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release;
const feedbackIndex=html.indexOf(`js/feedback.js?v=${release}`),modelIndex=html.indexOf(`js/explanation-model.js?v=${release}`),viewIndex=html.indexOf(`js/view.js?v=${release}`);
assert(feedbackIndex>=0&&feedbackIndex<modelIndex&&modelIndex<viewIndex,'feedback→explanation model→viewの順に読み込む');
assert(worker.includes("'./js/explanation-model.js'"),'PWAキャッシュへexplanation modelを含める');
console.log('explanation integration tests: PASS');

// Exercise the final runtime data (including late editorial overrides), not source markers.
class ExplanationNode {
  constructor(tag) { this.tagName=tag; this.children=[]; this.dataset={}; this.attributes={}; this.className=''; this._text=''; this.classList={add:()=>{}}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=nodes; this._text=''; }
  setAttribute(key,value) { this.attributes[key]=String(value); }
  set textContent(value) { this._text=String(value??''); this.children=[]; }
  get textContent() { return this._text+this.children.map(node=>node.textContent).join(''); }
}
for(const file of ['js/feedback.js','js/explanation-formulas.js','js/explanation-model.js','js/explanation-design-system.js','js/view.js']) vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
const descendants=node=>[node,...node.children.flatMap(descendants)];
const visible=node=>node.tagName==='details'&&!node.open?node.children[0].textContent:node._text+node.children.map(visible).join('');
const before=JSON.stringify(q);
for(const question of Object.values(q)) for(const correct of [false,true]) {
  const container=new ExplanationNode('div'), instance=Object.create(sandbox.window.AppView.prototype);
  instance.document={createElement:tag=>new ExplanationNode(tag)};
  instance.byId=()=>container;
  instance.renderExplanation(question,{correct},correct?question.answer:{});
  const nodes=descendants(container), details=nodes.filter(node=>node.tagName==='details');
  if(question.type==='worksheet'&&/決算整理・計算問題/u.test(question.category))assert(!container.textContent.includes('精算表'),question.id+': supplementary route also follows the actual calculation format');
  const headings=nodes.filter(node=>/^h[1-5]$/.test(node.tagName)).map(node=>node.textContent);
  assert.strictEqual(new Set(headings).size,headings.length,question.id+': primary and supplementary section headings are distinct');
  assert(details.length>0,question.id+': supplements have native disclosure');
  assert(details.every(node=>!node.open&&node.children[0].tagName==='summary'),question.id+': disclosure starts closed and has native accessible summary');
  assert(!visible(container).includes('解答までの道筋'),question.id+': generic route is supplementary');
  assert(!visible(container).includes('この問題で覚えること'),question.id+': generic takeaway is supplementary');
  const model=sandbox.window.ExplanationModel.build(question,correct?question.answer:{},{correct});
  if(question.teachingPresentation==='structured-always'||!correct) {
    const flow=nodes.find(node=>node.className==='explanation-flow');
    assert(flow,question.id+': structured flow remains available');
    const steps=descendants(flow).filter(node=>node.className==='explanation-flow-step').map(node=>Number(node.textContent));
    assert.deepStrictEqual(steps,steps.map((_,index)=>index+1),question.id+': primary steps are sequential');
    const primaryMistakes=flow.children.filter(node=>node.dataset.section==='mistakes').flatMap(node=>node.children.filter(child=>child.className==='explanation-mistake-card'));
    assert.strictEqual(primaryMistakes.length,correct?0:Math.min(1,model.mistakes.length),question.id+': at most one supported correction initially');
    for(const item of model.summary) assert(container.textContent.includes(item.text),question.id+': summary retained');
    for(const item of model.transfer) assert(visible(flow).includes(item.decision),question.id+': placement visible');
    if(model.calculation.some(item=>/[×÷＋+−\-＝=]/u.test(String(item.expression||'')))) for(const item of model.calculation) if(item.derivation!=='direct'&&item.expression) assert(visible(flow).includes(item.expression),question.id+': necessary calculation visible');
    for(const item of model.mistakes) assert(container.textContent.includes(item.correction),question.id+': extra corrections remain reachable');
    const authored=model.summary.filter(item=>item.evidenceRef==='explanation');
    if(authored.length) assert(visible(flow).includes(authored[0].text)&&!visible(flow).includes(model.summary[0].text),question.id+': authored accounting reason precedes generic goal');
  }
}
assert.strictEqual(JSON.stringify(q),before,'rendering all 300 must preserve canonical runtime data');
for(const [id,term] of [['J131','水道光熱費'],['J137','未収入金'],['J147','当座預金'],['L039','再振替']]) assert(JSON.stringify(sandbox.window.ExplanationModel.build(q[id],{},{correct:false})).includes(term),id+': final override evidence retained');
console.log('progressive explanation runtime 300 × correct/wrong: PASS');
// Legacy/unstructured callers still see authored explanations without expanding generic steps.
for(const mode of ['no-question-model','no-runtime-model','ordinary-correct']) {
  const savedModel=sandbox.window.ExplanationModel;
  const question={...q.J001};
  if(mode==='no-question-model') delete question.explanationModel;
  if(mode==='no-runtime-model') sandbox.window.ExplanationModel=undefined;
  if(mode==='ordinary-correct') question.teachingPresentation=undefined;
  try {
    const container=new ExplanationNode('div'),instance=Object.create(sandbox.window.AppView.prototype);
    instance.document={createElement:tag=>new ExplanationNode(tag)}; instance.byId=()=>container;
    instance.renderExplanation(question,{correct:true},question.answer);
    assert(!descendants(container).some(node=>node.className==='explanation-flow'),mode+': fallback used');
    assert(visible(container).includes('株主'),mode+': authored rationale remains visible');
    assert(!visible(container).includes('解き方（この順番で考える）'),mode+': generic steps remain optional');
    assert(container.textContent.includes('解き方（この順番で考える）'),mode+': generic steps retained');
  } finally { sandbox.window.ExplanationModel=savedModel; }
}
console.log('progressive explanation fallback paths: PASS');
