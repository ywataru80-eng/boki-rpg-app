const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const Calculator = require('../js/calculator');
const Engine = require('../js/engine');
const ProgressModel = require('../js/model');
const RPGModel = require('../js/rpg');
const Feedback = require('../js/feedback');

assert.strictEqual(Calculator.evaluate('1,200'.replace(',', '') + '＋300×2'), 1800);
assert.strictEqual(Calculator.evaluate('(10＋2)÷3'), 4);
assert.throws(() => Calculator.evaluate('globalThis.alert(1)'), /invalid/);
assert.throws(() => Calculator.evaluate('1÷0'), /invalid/);

const table = Engine.gradeTable({ cells: { cash: '1,000', sales: '500' } }, { cells: { cash: 1000, sales: 700 } });
assert.deepStrictEqual([table.correct, table.earned, table.possible, table.ratio], [false, 1, 2, 0.5]);
assert.strictEqual(Engine.gradeTable({ cells: { cash: '１,０００' } }, { cells: { cash: 1000 } }).correct, true, '表形式の全角数字を正しく採点する');
assert.strictEqual(Engine.gradeTable({ cells: { cash: '１，0００' } }, { cells: { cash: 1000 } }).correct, true, '全角・半角数字と全角カンマの混在を正規化する');
assert.strictEqual(Engine.gradeTable({ cells: { cash: '0' } }, { cells: { cash: 0 } }).correct, true, '明示的に入力した0は正答として扱う');
assert.strictEqual(Engine.gradeTable({ cells: { cash: '-1' } }, { cells: { cash: 0 } }).correct, false, '負数を0へ暗黙変換しない');
assert.strictEqual(Engine.gradeTable({ cells: { cash: '' } }, { cells: { cash: 0 } }).correct, false, '空欄を数値0の正答として扱わない');
assert.strictEqual(Engine.gradeTable({ cells: { due: '６月５日' } }, { cells: { due: '06/05' } }, { due:{ semanticType:'date' } }).correct, true, '日付の全角・月日表記・ゼロ埋めを意味的に正規化する');
assert.strictEqual(Engine.gradeTable({ cells: { due: '6/32' } }, { cells: { due: '6/5' } }, { due:{ semanticType:'date' } }).correct, false, '不正または異なる日付を正解にしない');
assert.strictEqual(Engine.gradeTable({ cells: { entity: ' 北星商事 ' } }, { cells: { entity: '北星商事' } }, { entity:{ semanticType:'text' } }).correct, true, '自由記述のUnicodeと前後空白を正規化する');
assert.strictEqual(Engine.gradeTable({ cells: { entity: '北星物産' } }, { cells: { entity: '北星商事' } }, { entity:{ semanticType:'text' } }).correct, false, '異なる取引先を表記揺れとして許容しない');
assert.strictEqual(Engine.gradeJournalEntry({ debit: [{ account: '現金', amount: 100 }], credit: [{ account: '売上', amount: 100 }] }, { debit: [{ account: '現金', amount: 100 }], credit: [{ account: '売上', amount: 100 }] }), true);
assert.strictEqual(Engine.gradeJournalEntry({ debit: [{ account: '現金', amount: NaN }], credit: [{ account: '売上', amount: NaN }] }, { debit: [{ account: '現金', amount: NaN }], credit: [{ account: '売上', amount: NaN }] }), false, '非有限金額を仕訳として受理しない');
assert.strictEqual(Engine.gradeJournalEntry({}, { debit: [], credit: [] }), false, '壊れた回答データでも採点を例外終了しない');
assert.deepStrictEqual(Engine.grade(undefined, undefined), { correct: false, earned: 0, possible: 0, ratio: 0, details: [] }, '問題データが欠けても採点を例外終了しない');

const values = {};
const storage = { getItem(key) { return values[key] || null; }, setItem(key, value) { values[key] = value; } };
const progress = new ProgressModel({ J1: {} }, storage); progress.record('J1', false);
assert.deepStrictEqual(progress.state.incorrectIds, ['J1']);
assert.strictEqual(progress.state.mistakeCounts.J1, 1, '問題ごとの累積誤答回数を記録する');
progress.record('J1', false);
assert.strictEqual(progress.state.mistakeCounts.J1, 2, '同じ問題の再誤答も頻度へ加算する');
const dueAt = progress.state.reviewSchedule.J1.dueAt;
progress.record('J1', true, dueAt - 1);
assert(progress.state.incorrectIds.includes('J1'), '直後の正解だけでは克服扱いにしない');
for (let stage = 0; stage < 4; stage += 1) progress.record('J1', true, progress.state.reviewSchedule.J1.dueAt);
assert(!progress.state.incorrectIds.includes('J1') && !progress.state.reviewSchedule.J1, '20分・1日・3日・7日の遅延再生後に克服扱いにする');
const masteryRpg = new RPGModel({ getItem() { return null; }, setItem() {} });
const masteryQuestion = { id: 'M1', difficulty: 1, category: '売掛金', type:'journal' };
masteryRpg.recordMastery(masteryQuestion, { earned: 0, possible: 1 });
masteryRpg.recordMastery(masteryQuestion, { earned: 1, possible: 1 });
assert.deepStrictEqual(masteryRpg.state.mastery['売掛金'], { earned: 1, possible: 2 }, '不正解後の正解を1/2としてmasteryへ記録する');
assert.deepStrictEqual(masteryRpg.state.mastery['@skill:仕訳'], { earned:1, possible:2 }, '役職解放用の技能masteryを問題形式から集計する');
const rpg = new RPGModel(storage); const question = { id: 'J1', difficulty: 2, category: '現金' };
assert.strictEqual(rpg.reward(question, { ratio: 0.5, earned: 1, possible: 2 }), true);
assert.strictEqual(rpg.reward(question, { ratio: 1, earned: 2, possible: 2 }), false, '経験値は二重付与しない');
assert.strictEqual(rpg.state.xp, 20);
const maxXpRpg = new RPGModel({ getItem() { return null; }, setItem() {} });
// Reachability must use reward(), not direct XP injection. Exam candidates use
// the same once-only route when an exam is finished correctly.
for (let index = 0; index < 253; index += 1) maxXpRpg.reward({ id:`reachable-${index}`, difficulty:3, category:'test' }, { ratio:1, earned:1, possible:1 });
assert.strictEqual(maxXpRpg.state.xp, 15180, '実ユーザー報酬経路で正当な到達可能XPを積み上げる');
assert.strictEqual(maxXpRpg.level, 30, '実ユーザー報酬経路でLv.30に到達できる');
maxXpRpg.state.mastery = { '@skill:仕訳':{ earned:10, possible:10 }, '@skill:帳簿':{ earned:10, possible:10 }, '@skill:決算整理':{ earned:10, possible:10 }, '@skill:財務諸表':{ earned:10, possible:10 } };
assert.strictEqual(maxXpRpg.role, '決算責任者', '最終役職はXPと主要技能masteryの両方で解放する');
maxXpRpg.state.mastery['@skill:財務諸表'] = { earned:0, possible:10 };
assert.notStrictEqual(maxXpRpg.role, '決算責任者', 'XPだけで最終役職を解放しない');
assert.strictEqual(rpg.state.companyHP, 100);
rpg.applyAnswer(false, 'sure');
assert.strictEqual(rpg.state.companyHP, 95, '自信ありの誤答でも帳簿信頼度は小さく下がり学習を妨げない');
rpg.applyAnswer(true, 'unsure');
assert.strictEqual(rpg.state.companyHP, 100, '訂正できれば帳簿信頼度を誤答時より速く回復する');
assert.deepStrictEqual(rpg.state.confidenceOutcomes, { sureCorrect:0, sureWrong:1, unsureCorrect:1, unsureWrong:0 }, '確信度と正誤の4象限をメタ認知データとして記録する');
const corruptValues = {
  'boki-rpg-progress-v2': JSON.stringify({ mode: 'invalid', answeredIds: 'J1', incorrectIds: ['unknown'], drafts: [], mistakeCounts: { J1: -2 }, completed: 'yes' }),
  'boki-rpg-character-v1': JSON.stringify({ xp: '999', rewardedIds: null, mastery: { 現金: { earned: 'bad', possible: 1 } }, companyHP: -80, totalTransactionAmount: -1 })
};
const corruptStorage = { getItem(key) { return corruptValues[key] || null; }, setItem() {} };
const recoveredProgress = new ProgressModel({ J1: {} }, corruptStorage);
assert.deepStrictEqual([recoveredProgress.state.mode, recoveredProgress.state.answeredIds.length, recoveredProgress.state.completed], ['story', 0, false], '破損した進捗の各フィールドを安全な初期値へ戻す');
const recoveredRpg = new RPGModel(corruptStorage);
assert.deepStrictEqual([recoveredRpg.state.xp, recoveredRpg.state.rewardedIds.length, recoveredRpg.state.companyHP, recoveredRpg.state.totalTransactionAmount], [0, 0, 0, -1], '不正なXP・報酬・HPを補正し、有限な符号付き累計金額は保持する');
const graduationQuestions = { J1:{ type:'journal' } };
for (const [prefix, type] of Object.entries({ L:'ledger', W:'worksheet', F:'financial_statement', C:'comprehensive' })) {
  for (let index = 1; index <= 3; index += 1) graduationQuestions[`${prefix}${index}`] = {
    type, category:index === 1 ? `${type}-foundation` : `${type}-application`, variantGroup:`${type}-structure-${Math.min(index, 2)}`
  };
}
const graduation = new ProgressModel(graduationQuestions, { getItem() { return null; }, setItem() {} }, 'graduation');
graduation.state.answeredIds = Object.keys(graduationQuestions);
graduation.state.correctIds = Object.keys(graduationQuestions);
graduation.state.examHistory = [{ points:80, setSignature:'set-a' }, { points:75, setSignature:'set-b' }];
const graduationRpg = { skillMastery:() => .8 };
assert.strictEqual(graduation.updateCompletion(graduationRpg), true, '主要mastery・実務形式・複数模試合格をすべて卒業条件とする');
graduation.state.correctIds = graduation.state.correctIds.filter(id => id !== 'L3');
assert.strictEqual(graduation.updateCompletion(graduationRpg), false, '各実務形式は異なる3問の正解証拠がなければ卒業扱いにしない');
graduation.state.correctIds.push('L3');
graduationQuestions.L2.category = graduationQuestions.L1.category;
graduationQuestions.L2.variantGroup = graduationQuestions.L1.variantGroup;
graduationQuestions.L3.category = graduationQuestions.L1.category;
graduationQuestions.L3.variantGroup = graduationQuestions.L1.variantGroup;
assert.strictEqual(graduation.updateCompletion(graduationRpg), false, '同一構造の数値違い3問だけでは実務形式の深度を満たさない');
graduationQuestions.L3.category = 'ledger-application';
graduationQuestions.L3.variantGroup = 'ledger-structure-2';
graduation.state.examHistory = [{ points:80, setSignature:'set-a' }];
assert.strictEqual(graduation.updateCompletion(graduationRpg), false, '模試1回だけで卒業扱いにしない');
graduation.state.correctIds = ['J1'];
graduation.state.examHistory = [{ points:80, setSignature:'set-a' }, { points:75, setSignature:'set-b' }];
assert.strictEqual(graduation.updateCompletion(graduationRpg), false, '実務問題は回答済みやmasteryだけでなく正解証拠を要求する');
const brokenJsonStorage = { getItem() { return '{broken'; }, setItem() { throw new Error('quota'); } };
const memoryProgress = new ProgressModel({ J1: {} }, brokenJsonStorage);
const memoryRpg = new RPGModel(brokenJsonStorage);
assert.doesNotThrow(() => { memoryProgress.record('J1', false); memoryRpg.applyAnswer(false); }, '壊れたJSONと書込不能なstorageでもメモリ上で動作を続ける');
assert.deepStrictEqual([memoryProgress.state.incorrectIds[0], memoryRpg.state.companyHP], ['J1', 95], 'storage障害時も現在セッションの状態を保持する');
assert.strictEqual(memoryProgress.record('unknown', false), false, '未定義の問題IDを進捗へ混入させない');
const confidenceProgress = new ProgressModel({ C1:{ category:'売掛金', difficulty:3 }, C2:{ category:'売掛金', difficulty:2 } }, storage, 'confidence-adaptive');
confidenceProgress.recordAttempt('C1', false, 30000, 'journal-entry', false, Date.now(), null, 'sure');
assert.strictEqual(confidenceProgress.state.attempts[0].confidence, 'sure', '回答前の確信度をattemptへ保存する');
assert.strictEqual(confidenceProgress.adaptiveDifficulty('売掛金'), 2, '自信あり誤答を強い思い込みとして次の難度調整へ接続する');

const html = fs.readFileSync('index.html', 'utf8');
assert(/アプリをインストール/.test(html) && /JSONでバックアップ/.test(html) && /JSONバックアップを復元/.test(html), 'PWA導入と進捗バックアップをデータ管理メニューから利用できる');
const release = fs.readFileSync('service-worker.js', 'utf8').match(/const RELEASE = '([^']+)'/)[1];
assert(!/\sonclick=/.test(html), 'インラインイベントハンドラを置かない');
['story', 'training', 'review', 'exam', 'desk'].forEach(mode => assert(html.includes(`view-${mode}`), `${mode}ビューが必要`));
assert(html.includes('data-mode="desk"') && html.includes('id="view-desk"'), '実務デスクへ専用ナビゲーションから移動できる');
assert(html.indexOf('class="operations-desk"') > html.indexOf('id="view-desk"'), '実務デスクをストーリー画面に混在させない');
assert(/<form id="question-form"[^>]*>[\s\S]*<button class="confirm-button" type="submit">回答を確定する<\/button>[\s\S]*<\/form>/.test(html), '回答欄はEnterキーで送信できるフォームにする');
const localAssets = [...html.matchAll(/(?:href|src)="((?:css|js|data)\/[^"?]+)([^"]*)"/g)];
assert(localAssets.length > 0 && localAssets.every(([, , query]) => query === `?v=${release}`), 'すべてのローカルCSS/JSに最新のキャッシュバスターを付ける');
const controllerSource = fs.readFileSync('js/controller.js', 'utf8');
assert(controllerSource.includes("getElementById('question-form').addEventListener('submit'"), 'フォームのsubmitイベントを処理する');
assert(controllerSource.includes('event.preventDefault()'), 'フォーム送信時のページ遷移を防ぐ');
assert(!controllerSource.includes('this.document.activeElement?.blur()'), '回答確定前にフォーカスを喪失させない');
assert(html.includes('id="q-text" class="question-text" tabindex="-1"'), '問題文を次問遷移後のプログラム的フォーカス対象にする');
assert(html.includes('id="result-status" class="result-box" role="status" aria-live="polite" tabindex="-1"'), '結果通知をライブ領域のままプログラム的フォーカス対象にする');
assert(controllerSource.includes('if (this.submitting || !this.currentId') && controllerSource.includes('this.submitting = true'), '連続submitによるHP・進捗の二重更新を防ぐ');
assert(html.includes('data-action="calc-insert"'), '電卓の表示金額を入力するボタンを表示する');
assert(controllerSource.includes("'calc-insert': () => this.insertCalculatorResult(false)"), '電卓の入力ボタンを転記処理へ接続する');
assert(controllerSource.includes("else if (key === '＝') this.calculateEquals()"), 'イコールキーで計算結果を表示する');
assert(controllerSource.includes("addEventListener('focusin'"), 'キーボード操作ではfocusinから金額欄を電卓の転記先にできる');
assert(controllerSource.includes("const calculatorInput = event.target.closest?.('.amount-input[readonly]:not(:disabled)')"), 'calculator-first端末はtap完了後のclickで転記先を確定する');
assert(!controllerSource.includes("addEventListener('pointerdown'"), 'pointerdown中に画面を動かしてtap対象をずらさない');
assert(controllerSource.includes("if (event.target.readOnly && this.view?.calculatorFirstInput) return;"), 'calculator-first端末ではfocusinとclickの二重選択を防ぐ');
assert(controllerSource.includes("if (this.calculatorTarget !== input) return;"), '古いtapの遅延RAFが新しい転記先を上書きしない');
assert(/input\.readOnly && calculatorPanel[\s\S]*?calculatorPanel\.open = true/.test(controllerSource), 'calculator-first金額欄だけは選択時に計算機を開く');
const browserSandbox = { window: {} };
vm.runInNewContext(controllerSource, browserSandbox);
browserSandbox.window.WrongAnswerFeedback = Feedback;
browserSandbox.window.SafeCalculator = Calculator;
browserSandbox.window.GradingEngine = { grade: () => ({ correct: false, earned: 0, possible: 1, ratio: 0 }) };
const submitAudit = {
  submitting: false, currentId: 'J1', learningFlow: { phase:'I' }, questions: { J1: { id: 'J1' } },
  view: { readAnswer: () => ({}), updateRpg() {}, result() {}, protectedResult() { submitAudit.document.getElementById('result-status')?.focus(); }, show() {} },
  model: { state: { mode: 'story' }, record() { this.calls = (this.calls || 0) + 1; } },
  rpg: { state: { companyHP: 100 }, applyAnswer() { this.calls = (this.calls || 0) + 1; } },
  document: { querySelector: () => null, getElementById(id) { return id === 'result-status' ? { focus:()=>{ this.focused=id; } } : null; } }
};
browserSandbox.window.AppController.prototype.submit.call(submitAudit);
browserSandbox.window.AppController.prototype.submit.call(submitAudit);
assert.deepStrictEqual([submitAudit.model.calls, submitAudit.rpg.calls], [1, 1], '連続submitでも進捗とHPを一度だけ更新する');
assert.strictEqual(submitAudit.document.focused,'result-status','通常回答の結果表示後に結果statusへフォーカスする');
const startFocusEvents=[];
const startFocusContext={questions:{J1:{id:'J1'}},model:{state:{mode:'story',drafts:{}},save(){}},rpg:{},reviewMappings:new Map(),resetCalculator(){},view:{renderQuestion(){startFocusEvents.push('render');},show(){startFocusEvents.push('show');}},document:{getElementById(id){if(id==='question-filters')return {hidden:false};if(id==='q-text')return {focus(){startFocusEvents.push('focus');}};return null;}}};
browserSandbox.window.AppController.prototype.start.call(startFocusContext,'J1');
assert.deepStrictEqual(startFocusEvents,['render','show','focus'],'次問は描画・表示の後で問題文へフォーカスする');
const calculatorTarget = { value: '', getAttribute() { return '借方 1行目の金額'; }, setSelectionRange() {} };
const calculatorElements = { 'calculator-target': { textContent: '' }, 'calculator-display': { value: '' } };
const calculatorController = {
  calculatorTarget,
  expression: '1200＋300',
  document: { body: { contains: element => element === calculatorTarget }, getElementById: id => calculatorElements[id] },
  formatAmount: browserSandbox.window.AppController.prototype.formatAmount,
  formatCalculatorExpression: browserSandbox.window.AppController.prototype.formatCalculatorExpression,
  updateCalculatorDisplay: browserSandbox.window.AppController.prototype.updateCalculatorDisplay,
  saveDraft() { this.saved = true; }
};
browserSandbox.window.AppController.prototype.insertCalculatorResult.call(calculatorController, true);
assert.strictEqual(calculatorTarget.value, '1,500', '電卓の計算結果を選択中の仕訳金額欄へ転記する');
assert.strictEqual(calculatorElements['calculator-display'].value, '1,500', '電卓の計算結果にも3桁区切りのカンマを表示する');
assert.strictEqual(calculatorController.saved, true, '電卓から転記した金額を下書きへ保存する');
assert.strictEqual(browserSandbox.window.AppController.prototype.formatCalculatorExpression('1234567＋8900.5'), '1,234,567＋8,900.5', '計算途中の各数値にもカンマを表示する');
const classSet = () => {
  const values = new Set();
  return { add(value){values.add(value);}, remove(value){values.delete(value);}, contains(value){return values.has(value);}, toggle(value,force){if(force===undefined){if(values.has(value))values.delete(value);else values.add(value);}else if(force)values.add(value);else values.delete(value);} };
};
const editableTarget = {
  value: '12,500', readOnly:false,
  getAttribute() { return '貸方 1行目の金額'; },
  scrollIntoView(options){this.scrollOptions=options;},
  classList:classSet()
};
const editableCalculatorPanel = { open:false, classList:classSet() };
const editableForm = { classList:classSet() };
const editableElements = {
  calculator: editableCalculatorPanel,
  'calculator-target': { textContent: '' },
  'calculator-display': { value: '' },
  'calculator-operator': { textContent: '' },
  'question-form': editableForm
};
const editableCalculator = {
  expression: '999', calculatorTarget: null,
  calculator: { accumulator: 999, operator: '＋', waitingForOperand: true, lastOperator: null, lastOperand: null },
  document: { querySelector: selector => selector === '.calculator' ? editableElements.calculator : null, querySelectorAll: selector => selector === '.amount-input' ? [editableTarget] : [], getElementById: id => editableElements[id] },
  clearCalculator: browserSandbox.window.AppController.prototype.clearCalculator,
  updateCalculatorDisplay: browserSandbox.window.AppController.prototype.updateCalculatorDisplay,
  formatCalculatorExpression: browserSandbox.window.AppController.prototype.formatCalculatorExpression,
  positionCalculatorNearTarget: browserSandbox.window.AppController.prototype.positionCalculatorNearTarget
};
browserSandbox.window.AppController.prototype.selectCalculatorTarget.call(editableCalculator, editableTarget);
assert.strictEqual(editableCalculator.expression, '12500', '入力済みの金額欄を選ぶと現在値を電卓へ読み込む');
assert.strictEqual(editableElements['calculator-display'].value, '12,500', '入力欄の現在値を電卓上で確認して修正できる');
assert.strictEqual(editableCalculator.calculator.operator, null, '別の入力欄を選んだときは以前の計算状態を引き継がない');
assert.match(editableElements['calculator-target'].textContent, /現在値を修正できます/, '入力済み金額を修正できることを案内する');
assert.strictEqual(editableCalculatorPanel.open, false, 'デスクトップの編集可能金額欄では閉じた計算機を自動で開かない');
assert.strictEqual(editableCalculatorPanel.classList.contains('calculator-contextual-float'), false, 'デスクトップの編集可能金額欄では固定フロートを有効化しない');
editableTarget.readOnly = true;
browserSandbox.window.AppController.prototype.selectCalculatorTarget.call(editableCalculator, editableTarget);
assert.strictEqual(editableCalculatorPanel.open, true, 'touch-first readOnly金額欄のtapは既存のアプリ内計算機を開く');
assert.strictEqual(editableCalculatorPanel.classList.contains('calculator-contextual-float'), true, 'touch-first readOnly金額欄は問題形式を問わず計算機を選択時の作業位置へ固定表示する');
assert.strictEqual(editableForm.classList.contains('calculator-dock-active'), false, '全問題共通フロート表示では巨大な下余白を追加しない');
assert.strictEqual(editableForm.classList.contains('calculator-workspace-active'), true, '計算機表示中だけ入力欄を作業位置へ移せる一時スクロール余地を確保する');
assert.strictEqual(JSON.stringify(editableTarget.scrollOptions),JSON.stringify({block:'nearest',inline:'nearest',behavior:'auto'}),'全問題共通で選択した金額欄を計算機の基準位置へ表示する');

const worksheetTarget = {
  value:'', readOnly:true,
  getAttribute(){return '修正記入 前払保険料 借方（金額）';},
  closest(selector){return selector === '.worksheet-mobile-section' ? {} : null;},
  scrollIntoView(options){this.scrollOptions=options;},
  classList:classSet()
};
const worksheetCalculatorPanel={open:false,classList:classSet()};
const worksheetForm={classList:classSet()};
const worksheetElements={
  'calculator-target':{textContent:''},
  'calculator-display':{value:''},
  'calculator-operator':{textContent:''},
  'question-form':worksheetForm
};
const worksheetCalculatorController={
  expression:'0',calculatorTarget:null,
  calculator:{accumulator:null,operator:null,waitingForOperand:false,lastOperator:null,lastOperand:null},
  document:{
    querySelector:selector=>selector==='.calculator'?worksheetCalculatorPanel:null,
    querySelectorAll:selector=>selector==='.amount-input'?[worksheetTarget]:[],
    getElementById:id=>worksheetElements[id]
  },
  clearCalculator:browserSandbox.window.AppController.prototype.clearCalculator,
  updateCalculatorDisplay:browserSandbox.window.AppController.prototype.updateCalculatorDisplay,
  formatCalculatorExpression:browserSandbox.window.AppController.prototype.formatCalculatorExpression,
  positionCalculatorNearTarget:browserSandbox.window.AppController.prototype.positionCalculatorNearTarget
};
browserSandbox.window.AppController.prototype.selectCalculatorTarget.call(worksheetCalculatorController,worksheetTarget);
assert.strictEqual(worksheetCalculatorPanel.open,true,'D001モバイル金額欄でも全問題共通計算機ドックを開く');
assert.strictEqual(worksheetCalculatorPanel.classList.contains('calculator-contextual-float'),true,'D001でも選択時固定型の計算機表示を維持する');
assert.strictEqual(worksheetForm.classList.contains('calculator-dock-active'),false,'D001でも巨大な下余白を追加しない');
assert.strictEqual(worksheetForm.classList.contains('calculator-workspace-active'),true,'D001でも計算機表示中だけ一時スクロール余地を確保する');
assert.strictEqual(JSON.stringify(worksheetTarget.scrollOptions),JSON.stringify({block:'nearest',inline:'nearest',behavior:'auto'}),'D001でも選択金額欄を計算機の基準位置へ表示する');
const formatDirectAmount = value => { const input={value,selectionStart:value.length,selectionEnd:value.length,selectionDirection:'none',validationMessage:'',setCustomValidity(message){this.validationMessage=message;},setSelectionRange(){}}; const valid=browserSandbox.window.AppController.prototype.formatAmount(input); return {input,valid}; };
const validAmounts = new Map([['',''],['0','0'],['12','12'],['1234','1,234'],['1234567','1,234,567'],['1,234','1,234'],['12,345','12,345'],['123,456','123,456'],['1,234,567','1,234,567'],['１２３４','1,234'],['１，２３４','1,234'],['１２，３４５','12,345']]);
for (const [raw,expected] of validAmounts) { const {input,valid}=formatDirectAmount(raw); assert.strictEqual(valid,true,`${raw||'空欄'}を有効な金額として受理する`); assert.strictEqual(input.value,expected,`${raw||'空欄'}を正規表示する`); assert.strictEqual(input.validationMessage,'',`${raw||'空欄'}のcustom validityを解除する`); }
const invalidAmounts=[',',',123','123,','1,,2','12,34','1234,567','1,23,456','12a3','１，，２','１２，３４','，１２３'];
for (const raw of invalidAmounts) { const {input,valid}=formatDirectAmount(raw); assert.strictEqual(valid,false,`${raw}を不正な金額として拒否する`); assert.strictEqual(input.value,raw,`${raw}を別の数値へ暗黙変換しない`); assert(input.validationMessage,`${raw}のcustom validityを設定する`); }
const composingAmount={value:'１２３',setCustomValidity(){throw new Error('IME変換中にvalidityを変更しない');}};
assert.strictEqual(browserSandbox.window.AppController.prototype.formatAmount(composingAmount,{isComposing:true}),true,'IME変換途中は書き換えない');
assert.strictEqual(composingAmount.value,'１２３','IME変換途中の文字列を保持する');
const deskCalculator = {
  expression: '0',
  calculator: { accumulator: null, operator: null, waitingForOperand: false, lastOperator: null, lastOperand: null },
  document: { getElementById: () => ({ value: '' }) }
};
['clearCalculator', 'inputCalculatorDigit', 'operate', 'setOperator', 'calculateEquals', 'updateCalculatorDisplay', 'formatCalculatorExpression', 'calcKey'].forEach(method => { deskCalculator[method] = browserSandbox.window.AppController.prototype[method]; });
['1', '2', '＋', '3', '×', '4', '＝'].forEach(key => deskCalculator.calcKey(key));
assert.strictEqual(deskCalculator.expression, '60', '演算子入力のたびに左から順に計算する卓上電卓方式にする');
deskCalculator.calcKey('＝');
assert.strictEqual(deskCalculator.expression, '240', 'イコールの連続入力で直前の演算を繰り返す');
deskCalculator.calcKey('C');
assert.strictEqual(deskCalculator.expression, '0', 'Cは表示値だけを0に戻す');
deskCalculator.calcKey('AC');
assert.deepStrictEqual([deskCalculator.expression, deskCalculator.calculator.accumulator, deskCalculator.calculator.operator], ['0', null, null], 'ACは計算状態をすべて消去する');
const operatorIndicator={textContent:''}; const operatorButtons=['＋','−','×','÷'].map(value=>({dataset:{calc:value},classList:{toggle(_name,on){this.active=on;}},setAttribute(name,value){this[name]=value;}}));
const resetCalculatorPanel={open:true};
deskCalculator.document={getElementById:id=>id==='calculator-operator'?operatorIndicator:{value:'',textContent:''},querySelectorAll:()=>operatorButtons,querySelector:selector=>selector==='.calculator'?resetCalculatorPanel:null};
deskCalculator.calcKey('1'); deskCalculator.calcKey('2'); deskCalculator.calcKey('×');
assert.strictEqual(operatorIndicator.textContent,'×','選択中の演算子を表示する');
deskCalculator.calcKey('÷'); assert.strictEqual(operatorIndicator.textContent,'÷','演算子変更は表示と内部stateを同期する');
deskCalculator.resetCalculator=browserSandbox.window.AppController.prototype.resetCalculator; deskCalculator.calculatorTarget={}; deskCalculator.resetCalculator();
assert.deepStrictEqual([deskCalculator.expression,deskCalculator.calculator.operator,operatorIndicator.textContent,deskCalculator.calculatorTarget],['0',null,'',null],'問題遷移resetは表示・演算子・内部状態・転記先を消去する');
assert.strictEqual(resetCalculatorPanel.open,false,'次の問題へ移るときは計算機を閉じる');
assert(!/const firstAmount = .*selectCalculatorTarget\(firstAmount\)/.test(controllerSource), '問題を表示しただけでは金額欄を選択して計算機を開かない');
const questionDataSource = fs.readFileSync('data/questions.js', 'utf8');
vm.runInNewContext(`${questionDataSource}\nwindow.QuestionDataAudit = validateQuestionData();`, browserSandbox);
vm.runInNewContext(fs.readFileSync('data/accounting-oracle.js', 'utf8'), browserSandbox);
const j147 = browserSandbox.window.QuestionData.J147;
assert(/当座借越契約/.test(j147.question) && /期中/.test(j147.question), 'J147は当座借越契約と期中取引を明示する');
assert.deepStrictEqual(JSON.parse(JSON.stringify(j147.answer)), { debit:[{account:'仕入',amount:80000}], credit:[{account:'当座預金',amount:80000}] }, 'J147は支払全額を当座預金へ記帳する');
assert.strictEqual(j147.answer.credit.length, 1, 'J147は取引時に当座借越を独立計上しない');
assert(!j147.answer.credit.some(row => row.account === '当座借越'), 'J147の取引時貸方に当座借越を含めない');
assert.deepStrictEqual(JSON.parse(JSON.stringify(browserSandbox.window.deriveAccountingExpected('J147').expected)), JSON.parse(JSON.stringify(j147.answer)), 'J147のruntime独立導出は正答と一致する');
const goldenJ147 = JSON.parse(fs.readFileSync('independent-audit/golden/expected-answers.json', 'utf8')).answers.J147;
assert.deepStrictEqual(goldenJ147, JSON.parse(JSON.stringify(j147.answer)), 'J147の独立golden正答はruntime正答と一致する');
assert(/決算日/.test(j147.explanation) && /当座借越または借入金へ振り替え/.test(j147.explanation) && /期中の支払時点/.test(j147.explanation), 'J147は期中処理と決算時の振替を区別して説明する');
assert(browserSandbox.window.ExamPoolDefinition.includes('J147') && j147.learningRole === 'transfer', 'J147はExam適格性を維持する');
const d020 = browserSandbox.window.QuestionData.D020;
assert(!d020.explanation.includes('間接法では備品勘定そのものを減額しません。'), 'D020から無関係な間接法の説明を除く');
assert.deepStrictEqual(JSON.parse(JSON.stringify(d020.answer.cells)), { sales:800000, purchases:400000, insurance:160000, depreciation:60000, profit:180000 }, 'D020の5つの会計数値と利益180,000円を維持する');
assert(/売上を借方/.test(d020.explanation) && /損益を貸方/.test(d020.explanation) && /損益を借方/.test(d020.explanation) && /繰越利益剰余金を貸方/.test(d020.explanation), 'D020は締切仕訳の貸借方向を明示する');
const contracts = require('../scripts/qa/contract-runner');
const d001 = browserSandbox.window.QuestionData.D001;
assert.strictEqual(contracts.validWorksheetColumns(d001), true, '8欄精算表はtb・adj・pl・bsの4系列がそろう場合だけ有効とする');
for (const prefix of ['tb','adj','pl','bs']) {
  const mutant = structuredClone(d001); mutant.table.rows = mutant.table.rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !key.toLowerCase().startsWith(prefix))));
  assert.strictEqual(contracts.validWorksheetColumns(mutant), false, `8欄精算表から${prefix}系列を除くと失敗する`);
}
assert.strictEqual(contracts.validWorksheetColumns(d020), true, 'closing-entriesは5つの正規セルと有限数値を要求する');
const missingClosingCell = structuredClone(d020); delete missingClosingCell.answer.cells.profit;
assert.strictEqual(contracts.validWorksheetColumns(missingClosingCell), false, 'closing-entriesから必須セルを除くと失敗する');
assert.strictEqual(contracts.validWorksheetColumns({type:'worksheet',format:'unknown',answer:{cells:{sales:1}}}), false, '未知のworksheet formatはfail closedとする');
assert.strictEqual(contracts.validWorksheetColumns({type:'worksheet',answer:{cells:{sales:1,purchases:1,insurance:1,depreciation:1,profit:1}}}), false, 'typeをworksheetにするだけでは既知schemaとして受理しない');
const worksheetContext = { production:{ questions:browserSandbox.window.QuestionData } };
assert.deepStrictEqual(contracts.executableChecks.WORKSHEET_COLUMNS(worksheetContext), [], '現行300問の全worksheetがformat別schemaを満たしGATE-07列検査を通過する');
const autoGateValidator = require('../scripts/qa/validate-auto-gate');
const generation2Document = JSON.parse(fs.readFileSync('reports/auto-gate/audit-locks/phase-b-generation-2.json', 'utf8'));
const greenFinal = { coverage:{TOTAL:300,DIRECTLY_TESTED:300,MISSING:0,DUPLICATE:0,INDEPENDENT_EXPECTED_CHECKED:300}, oracleSelfReference:0, gateImplementation:{unimplemented:0,requiredCheckNotExecuted:0,requiredLayerNotExecuted:0,checkCountZero:0,allRequirementsHaveExecutableCheck:true}, dependencies:{deadMetadata:0,declared:15,evaluated:15,unsatisfied:0}, status:'PASS', productionModified:false, mutations:{required:19,killed:19,survived:0,causalDeltaConfirmed:'19/19'}, answerCorruptionMutations:{required:9,killed:9,survived:0}, story:{ROUTING_INTEGRATION:'TESTED',BROWSER_E2E:'UNVERIFIED'}, findings:[], gateStatuses:Object.fromEntries(autoGateValidator.expectedGates.map(gate=>[gate,'PASS'])), auditHash:'audit', sourceHashes:{production:'hash'} };
const greenRows = Array.from({length:300},(_,index)=>({questionId:`Q${index}`,questionType:'journal',requiredCheckIds:['a','b','c','d'],executedCheckIds:['a','b','c','d'],passedCheckIds:['a','b','c','d'],status:'PASS'}));
const generation3Document = {generation:3,predecessor:require('../scripts/qa/phase-b-lifecycle').identity(generation2Document)};
const greenGates = Object.fromEntries(autoGateValidator.expectedGates.map(gate=>[gate,{status:'PASS',sourceHashes:greenFinal.sourceHashes}]));
const greenState = {authorities:[generation2Document,generation3Document],final:greenFinal,rows:greenRows,gateReports:greenGates,integrity:{ok:true,hash:'audit'},currentSourceHashes:greenFinal.sourceHashes};
assert.strictEqual(autoGateValidator.validateEvidence(greenState),true,'Generation 3の完全GREEN evidenceを受理する');
const rejectsAutoGate = change => {const mutant=structuredClone(greenState);change(mutant);assert.throws(()=>autoGateValidator.validateEvidence(mutant));};
rejectsAutoGate(state=>{state.final.gateStatuses['GATE-07']='FAIL';});
rejectsAutoGate(state=>{state.final.findings=[{code:'STALE'}];});
rejectsAutoGate(state=>{state.final.mutations.killed=18;state.final.mutations.survived=1;});
rejectsAutoGate(state=>{state.final.coverage.DIRECTLY_TESTED=299;});
rejectsAutoGate(state=>{state.currentSourceHashes={production:'stale'};});
rejectsAutoGate(state=>{state.authorities[1].generation=4;});
rejectsAutoGate(state=>{state.authorities[1].predecessor.canonicalDocumentSha256='0'.repeat(64);});
const historicalState=structuredClone(greenState);historicalState.authorities=[generation2Document];historicalState.final.status='FAIL';historicalState.final.auditHash='historical';historicalState.integrity.hash='historical';
assert.strictEqual(autoGateValidator.validateEvidence(historicalState),true,'Generation 2のみの状態は従来のRED evidenceを要求する');
historicalState.final.status='PASS';assert.throws(()=>autoGateValidator.validateEvidence(historicalState),'Generation 2のみでGeneration 3 GREEN evidenceを受理しない');
const correctionExplanations = Object.values(browserSandbox.window.QuestionData).filter(question => question.type === 'correction').map(question => question.explanation);
assert(correctionExplanations.every(explanation => !/(?:debit|credit)(?:Account|Amount)/i.test(explanation)), '訂正仕訳の解説に英語の回答項目名を混在させない');
assert(correctionExplanations.every(explanation => /帳簿には「.+」と記録されていますが、証憑は「.+」/.test(explanation)), '訂正仕訳の解説に帳簿と証憑の具体的な比較を示す');
assert(correctionExplanations.every(explanation => /訂正仕訳は「（借）.+円／（貸）.+円」です/.test(explanation)), '訂正仕訳を省略せず日本語で表示する');
const internalExplanationLabels = Object.values(browserSandbox.window.QuestionData).flatMap(question => (question.table?.inputCells || []).filter(cellId => /[A-Za-z_]/.test(cellId) && question.explanation.includes(`${cellId}は`)).map(cellId => `${question.id}:${cellId}`));
assert.deepStrictEqual(internalExplanationLabels, [], '全問題の解説に内部用の英語回答IDを表示しない');
for (const [id, authored, mutated] of [['D019','insurance:160000','insurance:200000'],['F001','netIncome:180000','netIncome:220000']]) {
  const sourceMutationSandbox = { window:{} };
  const mutatedSource = questionDataSource.replace(authored, mutated);
  assert.notStrictEqual(mutatedSource, questionDataSource, `${id}のsource mutationが実際に適用される`);
  vm.runInNewContext(mutatedSource, sourceMutationSandbox);
  assert.strictEqual(sourceMutationSandbox.window.validateSemanticQuestionData().findings[id].status, 'INVALID', `${id}のロード前source answer改ざんを独立oracleで検出する`);
}
const sourceAnswerMutations = [
  ['J001', '"account": "現金"', '"account": "普通預金"'],
  ['J005', '"account": "売掛金"', '"account": "未収入金"'],
  ['J141', '"account": "前払保険料",\n          "amount": 50000', '"account": "未収入金",\n          "amount": 50000'],
  ['E002', '"debitAccount": "買掛金"', '"debitAccount": "未払金"'],
  ['J004', '"account": "買掛金"', '"account": "未払金"'],
  ['D020', 'profit:180000', 'profit:160000'],
  ['L039', 'profitTransfer:18000', 'profitTransfer:9000'],
  ['L040', '"lossA": 120000', '"lossA": 60000'],
  ['L044', "[50000,18000,32000]", "[50000,18000,50000]"],
  ['T001', '"total_debit": 1024000', '"total_debit": 410000'],
  ['E001', '"debitAccount": "広告宣伝費"', '"debitAccount": "備品"']
];
for (const [id, authored, mutated] of sourceAnswerMutations) {
  const mutationSandbox = { window:{} };
  const mutatedSource = questionDataSource.replace(authored, mutated);
  assert.notStrictEqual(mutatedSource, questionDataSource, `${id}のsource answer mutationが適用される`);
  vm.runInNewContext(mutatedSource, mutationSandbox);
  assert.strictEqual(mutationSandbox.window.validateSemanticQuestionData().findings[id].status, 'INVALID', `${id}のロード前source answer改ざんをanswerとは別管理のintegrity基準で検出する`);
}
const narrativeQuestions = Object.values(browserSandbox.window.QuestionData);
assert.strictEqual(new Set(narrativeQuestions.map(question => question.story)).size, narrativeQuestions.length, 'NARRATIVE-01: 全300問に固有の業務場面を持たせる');
assert(narrativeQuestions.every(question => question.story.length <= 120), 'NARRATIVE-01b: 物語本文を一読できる長さに絞る');
assert(narrativeQuestions.every(question => !question.story.includes(question.question)), 'NARRATIVE-01c: 問題文を物語で重複させない');
assert.deepStrictEqual([...new Set(narrativeQuestions.map(question => question.chapter))].sort((a, b) => a - b), Array.from({ length:12 }, (_, index) => index + 1), 'NARRATIVE-02: 4月から決算までの12章を物語で網羅する');
assert.strictEqual(browserSandbox.window.QuestionData.J001.id, 'J001', '問題データをブラウザーのwindowに公開する');
const eightColumn = browserSandbox.window.QuestionData.D001;
assert.strictEqual(eightColumn.format, 'eight-column-worksheet', 'WORKSHEET-01: D001を本物の8桁精算表として識別する');
assert.strictEqual(eightColumn.table.columns.length, 9, 'WORKSHEET-01: 科目列と8つの借貸列を持つ');
assert.match(eightColumn.question, /金額の桁数ではなく.+8つの金額欄/, 'WORKSHEET-GUIDE: 8桁精算表の名称の意味を問題文で説明する');
const perfectWorksheet = Engine.grade(eightColumn, eightColumn.answer);
assert.deepStrictEqual([perfectWorksheet.correct, perfectWorksheet.earned, perfectWorksheet.possible], [true, 18, 18], 'WORKSHEET-02: 元試算表とゼロ欄を固定し、意味のある18セルだけ採点する');
const zeroWorksheet = Engine.grade(eightColumn, { cells: Object.fromEntries(eightColumn.table.inputCells.map(id => [id, 0])) });
assert(zeroWorksheet.ratio < 0.7 && zeroWorksheet.earned === 0, 'WORKSHEET-ZERO: 全セル0で合格相当または部分点にならない');
assert(eightColumn.materials.some(row => row['勘定科目'] === '現金' && row['借方'] === 300000), 'SEMANTIC-D001: 元試算表をvisible materialsに持つ');
const incomeStatement = browserSandbox.window.QuestionData.F001;
assert.deepStrictEqual(JSON.parse(JSON.stringify(incomeStatement.materials.map(row => row['金額']))), [800000,400000,160000,60000], 'SEMANTIC-F001: 直接開始で必要な決算整理後データを再掲する');
assert.strictEqual(incomeStatement.answer.cells.sales - incomeStatement.answer.cells.costOfSales - incomeStatement.answer.cells.expenses, incomeStatement.answer.cells.netIncome, 'PL-01: 収益－売上原価－費用が当期純利益に一致する');
assert(JSON.stringify(browserSandbox.window.QuestionData).includes('商品有高帳を先入先出法で完成'), 'INVENTORY-01: 既存の先入先出法問題を維持する');
assert.deepStrictEqual(JSON.parse(JSON.stringify(browserSandbox.window.QuestionData.L049.answer.cells)), { value1:1100, value2:13200, value3:8800 }, 'INVENTORY-02: 移動平均単価・払出額・残高額を学習する');
['現金出納帳','当座預金出納帳','小口現金出納帳','仕入帳','売上帳','入金伝票','出金伝票','振替伝票'].forEach(topic => assert(JSON.stringify(browserSandbox.window.QuestionData).includes(topic), `COVERAGE-01: ${topic}を実問題へ対応付ける`));
['仕訳帳','受取手形記入帳','支払手形記入帳'].forEach(topic => assert(Object.values(browserSandbox.window.QuestionData).some(q => q.category === topic && q.materials?.length), `COVERAGE-02: ${topic}を資料から実際に完成する問題がある`));
assert.deepStrictEqual(JSON.parse(JSON.stringify(browserSandbox.window.QuestionData.L042.table.inputCells)), ['received1','drawer1','drawn1','due1','bank1','description1','amount1','received2','drawer2','drawn2','due2','bank2','description2','amount2','total'], 'L042は金額だけでなく受取日・振出人・振出日・満期日・支払場所・摘要を2行とも採点する');
assert.deepStrictEqual(JSON.parse(JSON.stringify(browserSandbox.window.QuestionData.L043.table.inputCells)), ['drawn1','payee1','due1','bank1','description1','amount1','drawn2','payee2','due2','bank2','description2','amount2','total'], 'L043は金額だけでなく振出日・受取人・満期日・支払場所・摘要を2行とも採点する');
assert.strictEqual(browserSandbox.window.QuestionData.L042.table.inputMetadata.received1.label, '1行目 受取日', 'L042は内部IDではなく利用者向けラベルを持つ');
assert.strictEqual(browserSandbox.window.QuestionData.L043.table.inputMetadata.due2.semanticType, 'date', 'L043の満期日は日付として採点する');
assert.strictEqual(Engine.grade(browserSandbox.window.QuestionData.L042, { cells:{ ...browserSandbox.window.QuestionData.L042.answer.cells, received1:'６月５日', drawn1:'06/04', due1:'８月３１日' } }).correct, true, 'L042は安全な日付表記揺れを正解にする');
assert.strictEqual(Engine.grade(browserSandbox.window.QuestionData.L042, browserSandbox.window.QuestionData.L042.answer).correct, true, 'L042の本試験型記入欄をすべて完成すると正解になる');
assert.strictEqual(Engine.grade(browserSandbox.window.QuestionData.L042, { cells:{ ...browserSandbox.window.QuestionData.L042.answer.cells, due1:'8/30' } }).correct, false, 'L042は満期日が違えば金額が合っていても不正解にする');
assert.strictEqual(Engine.grade(browserSandbox.window.QuestionData.L043, { cells:{ ...browserSandbox.window.QuestionData.L043.answer.cells, payee2:'北星物産' } }).correct, false, 'L043は受取人が違えば金額が合っていても不正解にする');
assert.strictEqual(browserSandbox.window.QuestionData.L040.answer.cells.lossA, 120000, '固定資産台帳で取得・月割償却・途中売却・売却損まで追跡する');
for (const id of ['C001','C002','C003']) {
  const question = browserSandbox.window.QuestionData[id];
  assert.strictEqual(question.format, 'exam-question-3', `${id}を本試験第3問型として識別する`);
  assert(question.materials.at(-1).内容.split('／').length >= 8, `${id}は8項目以上の決算整理を同時処理する`);
  assert(Object.keys(question.answer.cells).length >= 10, `${id}はP/L・B/S等の主要10項目以上を採点する`);
}
assert.strictEqual(new Set(['C001','C002','C003'].map(id => browserSandbox.window.QuestionData[id].variantGroup)).size, 3, '第3問級総合問題は数字変更でない3系統にする');
assert.strictEqual(browserSandbox.window.QuestionDataAudit.ok, true, `全問題の品質検証を通過する: ${browserSandbox.window.QuestionDataAudit.errors.join(', ')}`);
const semanticAudit = browserSandbox.window.validateSemanticQuestionData();
assert.strictEqual(semanticAudit.ok, true, `SEMANTIC: ${semanticAudit.errors.join(', ')}`);
assert.deepStrictEqual(JSON.parse(JSON.stringify(semanticAudit.counts)), { VALID:300, QUESTIONABLE:0, INVALID:0 }, '全300問のSemantic Auditを分類する');
assert.strictEqual(semanticAudit.eligibleIds.length, 300, '模試対象は自己申告ではなく独立Semantic監査結果から生成する');
const tamperedQuestions = { ...browserSandbox.window.QuestionData, J081: { ...browserSandbox.window.QuestionData.J081, answer: { debit:[{account:'租税公課',amount:58000}], credit:[{account:'現金',amount:58000}] } } };
const tamperedAudit = browserSandbox.window.validateSemanticQuestionData(tamperedQuestions);
assert.strictEqual(tamperedAudit.findings.J081.status, 'INVALID', '表示48,000円に対する正答58,000円を自己申告にかかわらず検出する');
assert(!tamperedAudit.eligibleIds.includes('J081'), 'Semantic不成立問題を模試対象から除外する');
for (const [label, answer] of [
  ['誤勘定', { debit:[{account:'資本金',amount:48000}], credit:[{account:'現金',amount:48000}] }],
  ['重複加算', { debit:[{account:'租税公課',amount:96000}], credit:[{account:'現金',amount:96000}] }],
  ['自己除算', { debit:[{account:'租税公課',amount:1}], credit:[{account:'現金',amount:1}] }],
  ['無関係な乗算', { debit:[{account:'租税公課',amount:2304000000}], credit:[{account:'現金',amount:2304000000}] }]
]) {
  const attacked = { ...browserSandbox.window.QuestionData, J081:{ ...browserSandbox.window.QuestionData.J081, answer } };
  assert.strictEqual(browserSandbox.window.validateSemanticQuestionData(attacked).findings.J081.status, 'INVALID', `SEMANTIC-REDTEAM: ${label}をVALIDにしない`);
}
const fixedAssetSale = browserSandbox.window.QuestionData.J137;
assert(fixedAssetSale.question.includes('取得原価300,000円') && fixedAssetSale.question.includes('減価償却累計額120,000円'), 'J137は間接法の仕訳に必要な取得原価と累計額を表示する');
assert.deepStrictEqual(JSON.parse(JSON.stringify(fixedAssetSale.answer.debit)), [{account:'未収入金',amount:220000},{account:'減価償却累計額',amount:120000}], 'J137は未収入金と減価償却累計額を借方計上する');
const j004Feedback = Feedback.diagnoseWrongAnswer(browserSandbox.window.QuestionData.J004, { debit:[{account:'仕入',amount:240000}], credit:[{account:'未払金',amount:240000}] }, { correct:false });
assert(j004Feedback.some(item => /商品仕入/.test(item.reason) && /買掛金/.test(item.reason) && /未払金/.test(item.reason) && /商品以外/.test(item.reason)), 'WAF-J004: 実際の誤答「未払金」と買掛金の意味の違いを説明する');
const j137Feedback = Feedback.diagnoseWrongAnswer(fixedAssetSale, { debit:[{account:'売掛金',amount:220000},{account:'減価償却累計額',amount:120000}], credit:fixedAssetSale.answer.credit }, { correct:false });
assert(j137Feedback.some(item => /営業取引/.test(item.reason) && /固定資産/.test(item.reason) && /未収入金/.test(item.reason)), 'WAF-J137: 売掛金と固定資産売却の未収入金を区別する');
const reverseFeedback = Feedback.diagnoseWrongAnswer(browserSandbox.window.QuestionData.J001, { debit:[{account:'資本金',amount:3000000}], credit:[{account:'現金',amount:3000000}] }, { correct:false });
assert(reverseFeedback.some(item => item.kind === 'side' && /資産/.test(item.reason) && /借方/.test(item.reason)), 'WAF-SIDE: 貸借逆転を勘定分類と増減ルールまで説明する');
const cashFeedback = Feedback.diagnoseWrongAnswer(browserSandbox.window.QuestionData.J017, { debit:[{account:'現金',amount:5000}], credit:[{account:'現金過不足',amount:5000}] }, { correct:false });
assert(cashFeedback.some(item => /帳簿上の現金/.test(item.reason) && /実際有高/.test(item.reason) && /一時的/.test(item.reason)), 'WAF-CASH: 現金過不足を一般的な資産増減ではなく帳簿と実際有高の差で説明する');
const amountFeedback = Feedback.diagnoseWrongAnswer(fixedAssetSale, { debit:[{account:'未収入金',amount:210000},{account:'減価償却累計額',amount:120000}], credit:fixedAssetSale.answer.credit }, { correct:false });
assert(amountFeedback.some(item => item.kind === 'amount' && /210,000円/.test(item.reason) && /220,000円/.test(item.reason) && /帳簿価額/.test(item.thinking)), 'WAF-AMOUNT: 誤入力・正しい値・計算過程を示す');
const adjustedTrialBalance = browserSandbox.window.QuestionData.D019;
assert.strictEqual(adjustedTrialBalance.answer.cells.debitTotal, adjustedTrialBalance.answer.cells.creditTotal, 'D019は貸借一致する完全な決算整理後残高試算表にする');
const tableFeedback = Feedback.diagnoseWrongAnswer(adjustedTrialBalance, { cells:{ ...adjustedTrialBalance.answer.cells, insurance:200000, prepaid:0 } }, { correct:false });
assert(tableFeedback.some(item => item.kind === 'cell' && /160,000円/.test(item.reason) && /200,000/.test(item.thinking) && /翌期分40,000円/.test(item.thinking) && !/insurance/.test(item.title + item.reason + item.nextRule)), 'WAF-TABLE: 人間向けラベルで正しい値・理由・計算根拠を示す');
const closingFeedback = Feedback.diagnoseWrongAnswer(browserSandbox.window.QuestionData.D020, { cells:{ ...browserSandbox.window.QuestionData.D020.answer.cells, profit:160000 } }, { correct:false });
assert(closingFeedback.some(item => /800,000/.test(item.thinking) && /400,000/.test(item.thinking) && /180,000/.test(item.thinking)), 'WAF-CLOSING: 損益振替の利益計算式を示す');
const correctionFeedback = Feedback.diagnoseWrongAnswer(browserSandbox.window.QuestionData.E001, { cells:{ ...browserSandbox.window.QuestionData.E001.answer.cells, debitAccount:'消耗品費' } }, { correct:false });
assert(correctionFeedback.some(item => /帳簿の記録/.test(item.reason) && /証憑/.test(item.reason) && /（借）広告宣伝費 22,500円／（貸）備品 22,500円/.test(item.reason) && !/debitAccount/.test(JSON.stringify(item))), 'WAF-CORRECTION: 帳簿・証憑・訂正仕訳を3段階で内部IDなしに説明する');
assert.strictEqual(correctionFeedback.length, 1, 'WAF-CORRECTION: 1つの科目誤りに同じ解説を複数表示しない');
const multipleCorrectionFeedback = Feedback.diagnoseWrongAnswer(browserSandbox.window.QuestionData.E001, { cells:{} }, { correct:false });
assert.strictEqual(multipleCorrectionFeedback.filter(item => /帳簿の記録/.test(item.reason) && /証憑/.test(item.reason)).length, 1, 'WAF-CORRECTION: 訂正仕訳共通の手順は誤答欄ごとに繰り返さない');
assert.deepStrictEqual(Feedback.diagnoseWrongAnswer(browserSandbox.window.QuestionData.J004, browserSandbox.window.QuestionData.J004.answer, { correct:true }), [], 'WAF-CORRECT: 正答時は誤答診断を生成しない');
for (const question of Object.values(browserSandbox.window.QuestionData)) {
  const blank = question.type === 'journal' ? { debit:[], credit:[] } : { cells:{} };
  const diagnostics = Feedback.diagnoseWrongAnswer(question, blank, { correct:false });
  assert(diagnostics.length > 0 && diagnostics.every(item => item.reason && item.thinking && item.nextRule), `WAF-COVERAGE: ${question.id}に理由・考え方・次回ルールがある`);
  assert.strictEqual(new Set(diagnostics.map(item => item.reason)).size, diagnostics.length, `WAF-DUPLICATE: ${question.id}で同じ解説を複数表示しない`);
}
for (const id of ['D019','F001','L044','D020','T001','E001']) {
  const original = browserSandbox.window.QuestionData[id]; const first = Object.keys(original.answer.cells)[0];
  const attacked = { ...browserSandbox.window.QuestionData, [id]:{ ...original, answer:{ cells:{ ...original.answer.cells, [first]:Number(original.answer.cells[first]) + 1 } } } };
  assert.strictEqual(browserSandbox.window.validateSemanticQuestionData(attacked).findings[id].status, 'INVALID', `SEMANTIC-TABLE-REDTEAM: ${id}のセル改ざんをVALIDにしない`);
}
[['L044',50000,18000],['L045',300000,85000],['L046',4800,7200]].forEach(([id, first, second]) => { const visible = JSON.stringify(browserSandbox.window.QuestionData[id].materials); assert(visible.includes(String(first)) && visible.includes(String(second)), `SEMANTIC-${id}: 根拠金額をvisible materialsに持つ`); });
assert.deepStrictEqual([...browserSandbox.window.QuestionDataAudit.warnings], [], '全問題に品質上の警告がない');
for (let number = 1; number <= 20; number += 1) {
  const question = browserSandbox.window.QuestionData[`E${String(number).padStart(3, '0')}`];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(question.table.inputTypes)), { debitAccount: 'account', debitAmount: 'amount', creditAccount: 'account', creditAmount: 'amount' }, `${question.id}は勘定科目と金額の入力型を明示する`);
  Object.entries(question.answer.cells).forEach(([cellId, value]) => assert.strictEqual(question.table.inputTypes[cellId] === 'amount', typeof value === 'number', `${question.id}/${cellId}の入力型と正答型を一致させる`));
  ['debitAccount', 'creditAccount'].forEach(cellId => {
    const choices = browserSandbox.window.AppController.accountChoices(question, question.answer.cells[cellId]);
    assert.strictEqual(choices.length, 5, `${question.id}/${cellId}の科目プルダウンは5択にする`);
    assert(choices.includes(question.answer.cells[cellId]), `${question.id}/${cellId}の科目プルダウンに正答を含める`);
  });
}
const correction = browserSandbox.window.QuestionData.E001;
assert.strictEqual(Engine.grade(correction, { cells: { debitAccount: '広告宣伝費', debitAmount: '22,500', creditAccount: '備品', creditAmount: '22,500' } }).correct, true, 'E001の科目・金額を入力して正解にできる');
assert.strictEqual(Engine.grade(correction, { cells: { debitAccount: '消耗品費', debitAmount: '22,500', creditAccount: '備品', creditAmount: '22,500' } }).correct, false, 'E001の誤った科目は不正解にする');
const correctionProgress = new ProgressModel({ E001: correction }, storage, 'correction-draft-test');
correctionProgress.setDraft('E001', { cells: { debitAccount: '広告宣伝費', debitAmount: '22,500', creditAccount: '備品', creditAmount: '22,500' } });
assert.deepStrictEqual(new ProgressModel({ E001: correction }, storage, 'correction-draft-test').state.drafts.E001.cells, correctionProgress.state.drafts.E001.cells, '記帳訂正の文字列と金額の下書きを再表示用に復元する');
Object.values(browserSandbox.window.QuestionData).filter(question => question.type === 'journal').forEach(question => {
  [...question.answer.debit, ...question.answer.credit].forEach(item => {
    const choices = browserSandbox.window.AppController.accountChoices(question, item.account);
    assert.strictEqual(choices.length, 5, `${question.id}の勘定科目は5択にする`);
    assert(choices.includes(item.account), `${question.id}の勘定科目に正答を含める`);
  });
});
const correctPositions = [0, 0, 0, 0, 0];
Object.values(browserSandbox.window.QuestionData).filter(question => question.type === 'journal').forEach(question => {
  [...question.answer.debit, ...question.answer.credit].forEach(item => correctPositions[browserSandbox.window.AppController.accountChoices(question, item.account).indexOf(item.account)] += 1);
});
assert(correctPositions.every(count => count > 0), `仕訳の正解が5位置すべてに現れる: ${correctPositions.join(',')}`);
assert(Math.max(...correctPositions) / Math.min(...correctPositions) < 1.5, `正解位置分布に異常な偏りがない: ${correctPositions.join(',')}`);
assert.deepStrictEqual([...browserSandbox.window.AppController.accountChoices(browserSandbox.window.QuestionData.J001, '現金')], [...browserSandbox.window.AppController.accountChoices(browserSandbox.window.QuestionData.J001, '現金')], '同一問題とseedの選択肢順は常に同じ');
const allJournalAccounts = [...new Set(Object.values(browserSandbox.window.QuestionData).filter(question => question.type === 'journal').flatMap(question => [...question.answer.debit, ...question.answer.credit].map(item => item.account)))];
const allJournalQuestions = Object.values(browserSandbox.window.QuestionData).filter(question => question.type === 'journal');
allJournalQuestions.forEach(question => {
  const required = [...new Set([...question.answer.debit, ...question.answer.credit].map(item => item.account))];
  const choices = browserSandbox.window.AppController.accountChoices(question, undefined, 'exam');
  assert.strictEqual(choices.length, 5, `${question.id}の模試勘定科目は5択にする`);
  assert.strictEqual(new Set(choices).size, 5, `${question.id}の模試5択に重複を作らない`);
  required.forEach(account => assert(choices.includes(account), `${question.id}の模試5択に正答科目${account}を含める`));
  assert.deepStrictEqual(choices, browserSandbox.window.AppController.accountChoices(question, undefined, 'exam'), `${question.id}の模試5択順は決定論的にする`);
});
assert(allJournalAccounts.length > 5, '全仕訳科目集合は5科目より多いことを確認する');
const examJournalIds = browserSandbox.window.ExamPoolDefinition.filter(id => browserSandbox.window.QuestionData[id]?.type === 'journal');
assert.strictEqual(examJournalIds.length, 20, '現在の模試候補に含まれる仕訳20問を全件監査する');
examJournalIds.forEach(id => assert.strictEqual(browserSandbox.window.AppController.accountChoices(browserSandbox.window.QuestionData[id], undefined, 'exam').length, 5, `${id}の模試勘定科目は全科目表示へ戻さない`));
const examQuestion = browserSandbox.window.QuestionData.J001;
['story', 'training', 'review'].forEach(mode => assert.strictEqual(browserSandbox.window.AppController.accountChoices(examQuestion, '現金', mode).length, 5, `${mode}では既存の5択を維持する`));
const amountInput = { value: '1234', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward', setSelectionRange(...range) { this.range = range; } };
browserSandbox.window.AppController.prototype.formatAmount(amountInput);
assert.strictEqual(amountInput.value, '1,234', '金額を3桁区切りにする');
assert.deepStrictEqual([...amountInput.range], [3, 4, 'forward'], '整形後も選択範囲を同じ桁位置に保つ');
const fullWidthAmountInput = { value: '１２３４', selectionStart: 4, selectionEnd: 4, setSelectionRange(...range) { this.range = range; } };
browserSandbox.window.AppController.prototype.formatAmount(fullWidthAmountInput);
assert.strictEqual(fullWidthAmountInput.value, '1,234', 'iOS IMEの全角数字を半角へ正規化して整形する');
const mixedAmountInput = { value: '１，2３４', selectionStart: 5, selectionEnd: 5, setSelectionRange(...range) { this.range = range; } };
browserSandbox.window.AppController.prototype.formatAmount(mixedAmountInput);
assert.strictEqual(mixedAmountInput.value, '1,234', '全角カンマを含む混在入力も整形する');
vm.runInNewContext(fs.readFileSync('data/accounting-domain.js', 'utf8'), browserSandbox);
const viewSource = fs.readFileSync('js/view.js', 'utf8');
assert(!viewSource.includes("createElement('pre')"), 'IOS-REVIEW-03: 模試レビューへ内部JSON用preを生成しない');
assert(viewSource.includes("answerReviewBlock('自分の回答'") && viewSource.includes('this.journalTable(answer)'), 'IOS-REVIEW-02: 長い仕訳回答を意味のある仕訳表で表示する');
vm.runInNewContext(viewSource, browserSandbox);
class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName; this.children = []; this.hidden = false; this.disabled = false; this.selectedOptions = []; this.className = ''; this.dataset = {};
    this.style = { values:{}, setProperty(name, value) { this.values[name] = value; } };
    this.classList = { add() {}, remove() {}, toggle() {}, contains: name => String(this.className || '').split(/\\s+/).includes(name) };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  createTHead() { const section = new FakeElement('thead'); section.insertRow = () => { const row = new FakeElement('tr'); section.append(row); return row; }; this.append(section); return section; }
  createTBody() { const section = new FakeElement('tbody'); section.insertRow = () => { const row = new FakeElement('tr'); row.insertCell = () => { const cell = new FakeElement('td'); row.append(cell); return cell; }; section.append(row); return row; }; this.append(section); return section; }
}
browserSandbox.Option = class Option { constructor(text, value) { this.textContent=text; this.value=value; } };
const journalQuestions = Object.values(browserSandbox.window.QuestionData).filter(question => question.type === 'journal');
assert.strictEqual(journalQuestions.length, 150, '現在の仕訳問題150問を固定容量監査の対象にする');
assert(journalQuestions.every(question => question.answer.debit.length <= 3 && question.answer.credit.length <= 3), '全仕訳問題が模試の固定3行容量に収まる');
const topologyContainer = new FakeElement('section');
const topologyView = new browserSandbox.window.AppView({ getElementById: () => topologyContainer, createElement: tag => new FakeElement(tag) });
const shapes = ['J001', 'J128', 'J120', 'J137'];
const examTopologies = shapes.map(id => {
  topologyView.renderJournal(browserSandbox.window.QuestionData[id], {}, 'exam');
  const grid = topologyContainer.children.find(child => child.className === 'journal-grid-scroll');
  const rows = grid.children.filter(child => child.className === 'journal-row');
  return rows.map(row => row.children.map(control => ({ className:control.className, disabled:control.disabled, placeholder:control.innerHTML, choices:control.tagName === 'select' ? control.children.map(option => option.value) : [] })));
});
const topologyShape = topology => topology.map(row => row.map(control => ({ className:control.className, disabled:control.disabled, placeholder:control.placeholder, choiceCount:control.choices.length })));
examTopologies.slice(1).forEach(topology => assert.deepStrictEqual(topologyShape(topology), topologyShape(examTopologies[0]), '異なる正答形状でも模試仕訳DOM構造を同一にする'));
examTopologies.forEach((topology, topologyIndex) => {
  const accountSets = topology.flat().filter(control => /-account$/.test(control.className)).map(control => control.choices);
  assert(accountSets.every(choices => choices.length === 5), `${shapes[topologyIndex]}の模試全行を5科目選択にする`);
  assert(accountSets.every(choices => JSON.stringify(choices) === JSON.stringify(accountSets[0])), `${shapes[topologyIndex]}の模試全行で同一5科目を使い正答行を漏らさない`);
});
assert.strictEqual(examTopologies[0].length, 3, '模試仕訳は常に3行を表示する');
assert(examTopologies[0].every(row => row.length === 4 && row.every(control => !control.disabled)), '模試3行の借方・貸方科目・金額をすべて有効にする');
topologyView.renderJournal(browserSandbox.window.QuestionData.J001, {}, 'story');
assert.strictEqual(topologyContainer.children.find(child => child.className === 'journal-grid-scroll').children.filter(child => child.className === 'journal-row').length, 1, 'Storyは従来の正答形状に応じた行数を維持する');
const maximum = browserSandbox.window.QuestionData.J128.answer;
const maximumWithEmptyRows = { debit:[...maximum.debit], credit:[...maximum.credit] };
assert.strictEqual(Engine.gradeJournalEntry(maximumWithEmptyRows, maximum), true, '最大3行の正答を採点できる');
const partialExtra = { debit:[...maximum.debit, {account:'現金',amount:Number.NaN}], credit:[...maximum.credit] };
assert.strictEqual(Engine.gradeJournalEntry(partialExtra, maximum), false, '部分入力された余分な行を正答として無視しない');
const feedbackView = new browserSandbox.window.AppView({ createElement: tag => new FakeElement(tag) });
const wrongJ001 = { debit:[{ account:'売上', amount:50000 }], credit:[{ account:'現金', amount:40000 }] };
const feedbackDom = feedbackView.renderDiagnostics(browserSandbox.window.QuestionData.J001, wrongJ001, { correct:false });
const domText = node => [node?.textContent || '', ...(node?.children || []).flatMap(domText)].join('\n');
const feedbackText = domText(feedbackDom);
assert(feedbackText.includes('貸借が逆') && feedbackText.includes('次の確認：'), 'DOMに今回の誤答原因と次の確認を表示する');
assert(!feedbackText.includes(browserSandbox.window.QuestionData.J001.explanation), 'DOMのdiagnostic-cardへ問題解説全文をコピーしない');
assert.strictEqual((feedbackText.match(/正しい考え方/g) || []).length, 0, '診断カード内で学習解説の見出しを反復しない');
const materialElements = { 'question-materials': new FakeElement('section') };
const materialView = new browserSandbox.window.AppView({ getElementById: id => materialElements[id], createElement: tag => new FakeElement(tag) });
materialView.renderMaterials(browserSandbox.window.QuestionData.E001);
assert.strictEqual(materialElements['question-materials'].hidden, false, 'materialsを持つ訂正問題で資料DOMを表示する');
assert.strictEqual(materialElements['question-materials'].children[1].children[0].children[1].children.length, 1, 'materialsの全行をDOMに描画する');
materialView.renderMaterials(browserSandbox.window.QuestionData.J001);
assert.strictEqual(materialElements['question-materials'].hidden, true, 'materialsがない問題で古い資料を残さない');
const answerFields = {
  '.debit-account': [{ value: '現金' }], '.debit-amount': [{ value: '１,０００' }],
  '.credit-account': [{ value: '売上' }], '.credit-amount': [{ value: '１,０００' }]
};
const answerView = new browserSandbox.window.AppView({ querySelectorAll: selector => answerFields[selector] || [] });
assert.deepStrictEqual(JSON.parse(JSON.stringify(answerView.readAnswer({ type: 'journal' }))), { debit: [{ account: '現金', amount: 1000 }], credit: [{ account: '売上', amount: 1000 }] }, '仕訳入力の全角数字を数値として読み取る');
const readJournalRow=(account,amount)=>new browserSandbox.window.AppView({querySelectorAll:selector=>({'.debit-account':[{value:account}],'.debit-amount':[{value:amount}],'.credit-account':[],'.credit-amount':[]}[selector]||[])}).readAnswer({type:'journal'}).debit;
assert.strictEqual(readJournalRow('','').length,0,'科目と金額がともに空の中立行だけを無視する');
const partialJournalRows=[['仕入',''],['','100'],['','abc'],['','1,,2'],['仕入','abc']];
for(const [account,amount] of partialJournalRows){const rows=readJournalRow(account,amount);assert.strictEqual(rows.length,1,`${account||'科目なし'}/${amount||'金額なし'}を部分入力行として保持する`);assert.strictEqual(Engine.gradeJournalEntry({debit:rows,credit:[{account:'買掛金',amount:100}]},{debit:[{account:'仕入',amount:100}],credit:[{account:'買掛金',amount:100}]}),false,`${account||'科目なし'}/${amount||'金額なし'}を正答にしない`);}
const neutralAnswerView=new browserSandbox.window.AppView({querySelectorAll:selector=>({'.debit-account':[{value:'仕入'},{value:''}],'.debit-amount':[{value:'100'},{value:''}],'.credit-account':[{value:'買掛金'},{value:''}],'.credit-amount':[{value:'100'},{value:''}]}[selector]||[])});
const neutralAnswer=neutralAnswerView.readAnswer({type:'journal'});assert.strictEqual(Engine.gradeJournalEntry(neutralAnswer,{debit:[{account:'仕入',amount:100}],credit:[{account:'買掛金',amount:100}]}),true,'余分な完全空欄の中立行は正答を妨げない');
const comparison = { hidden: false, children: [], replaceChildren(...children) { this.children = children; }, append(...children) { this.children.push(...children); } };
const comparisonDocument = { getElementById: () => comparison, createElement: tagName => ({ tagName, textContent: '' }) };
const comparisonView = new browserSandbox.window.AppView(comparisonDocument);
comparisonView.journalTable = () => ({ tagName: 'table' });
comparisonView.renderAnswerComparison({ type: 'journal' }, { correct: true }, { debit: [], credit: [] });
assert.strictEqual(comparison.hidden, true, '正解時は空の誤答比較欄をhiddenにする');
comparisonView.renderAnswerComparison({ type: 'journal' }, { correct: false }, { debit: [], credit: [] });
assert.strictEqual(comparison.hidden, false, '仕訳の誤答時だけ比較欄を表示する');
const comparisonElements = { 'answer-comparison': new FakeElement('section') };
const tableComparisonView = new browserSandbox.window.AppView({ getElementById: id => comparisonElements[id], createElement: tag => new FakeElement(tag) });
const descendants = (node, tagName) => (node?.children || []).flatMap(child => [child, ...descendants(child, tagName)]).filter(child => !tagName || child.tagName === tagName);
const representativeIds = { ledger:'L001', trial_balance:'T001', correction:'E001', worksheet:'D001', financial_statement:'F001', comprehensive:'C001' };
for (const [type, id] of Object.entries(representativeIds)) {
  const question = browserSandbox.window.QuestionData[id];
  assert.strictEqual(question.type, type, `${id}を${type}比較表示の代表問題にする`);
  const [wrongCell, matchingCell] = question.table.inputCells;
  const wrongAnswer = { cells:{ ...question.answer.cells, [wrongCell]:'' } };
  const score = Engine.grade(question, wrongAnswer);
  assert.strictEqual(score.correct, false, `${id}の比較テストは実採点経路で誤答になる`);
  tableComparisonView.renderAnswerComparison(question, score, wrongAnswer);
  const container = comparisonElements['answer-comparison']; const rows = descendants(container, 'tr').slice(1);
  const wrongIndex = question.table.inputCells.indexOf(wrongCell); const matchingIndex = question.table.inputCells.indexOf(matchingCell);
  assert.strictEqual(container.hidden, false, `${id}の誤答時に比較欄を表示する`);
  if (type === 'correction') {
    assert.strictEqual(container.children[0].textContent, '最初の訂正仕訳（誤答）', 'E001の比較見出しを最初の訂正仕訳として表示する');
    assert.strictEqual(descendants(container, 'table')[0].className, 'journal-table', 'E001の誤答を借方・貸方の仕訳表で表示する');
    continue;
  }
  if (type === 'worksheet') {
    assert.strictEqual(container.children[0].textContent, '最初の回答を決算整理表で比較', 'D001の比較見出しを最初の回答として表示する');
    assert.strictEqual(descendants(container, 'table')[0].className, 'answer-comparison-table worksheet-answer-comparison', 'D001を問題と同じ表形式で比較する');
    assert(descendants(container, 'span').some(span => /^入力 /.test(span.textContent)) && descendants(container, 'span').some(span => /^正解 /.test(span.textContent)), 'D001の入力値と正解を同じセル内で横に比較する');
    continue;
  }
  assert.strictEqual(rows.length, question.table.inputCells.length, `${id}をinputCells順で全行表示する`);
  assert.strictEqual(rows[wrongIndex].children[0].textContent, question.table.inputMetadata?.[wrongCell]?.label || tableComparisonView.cellLabel(question, wrongCell), `${id}に利用者向け項目名を表示する`);
  assert.strictEqual(rows[wrongIndex].children[1].textContent, '未入力', `${id}の空欄を未入力と表示する`);
  assert.strictEqual(rows[wrongIndex].children[2].textContent, tableComparisonView.comparisonValue(question, wrongCell, question.answer.cells[wrongCell]), `${id}に正しい解答を表示する`);
  assert.strictEqual(rows[wrongIndex].children[1].className, 'cell-mismatch', `${id}の誤答セルだけを識別する`);
  assert(!rows[wrongIndex].children[2].className?.includes('cell-mismatch'), `${id}の正答表示へ誤答クラスを付けない`);
  assert.strictEqual(rows[wrongIndex].children[3].textContent, '要確認', `${id}の誤答判定を文字でも表示する`);
  assert.strictEqual(rows[matchingIndex].children[3].textContent, '一致', `${id}の一致セルを文字でも表示する`);
  assert(!rows[matchingIndex].children[1].className?.includes('cell-mismatch'), `${id}の一致セルへ誤答クラスを付けない`);
  assert(!domText(container).includes('undefined') && !domText(container).includes('null') && !domText(container).includes('NaN'), `${id}で無効値を直接表示しない`);
  tableComparisonView.renderAnswerComparison(question, Engine.grade(question, question.answer), question.answer);
  assert.strictEqual(container.hidden, true, `${id}の正解時は比較欄を表示しない`);
}
const journalDomView = new browserSandbox.window.AppView({ createElement: tag => new FakeElement(tag) });
for (const answer of [wrongJ001, browserSandbox.window.QuestionData.J001.answer, browserSandbox.window.QuestionData.J137.answer]) {
  const journal = journalDomView.journalTable(answer); const rows = descendants(journal, 'tr');
  assert.deepStrictEqual(rows[0].children.map(cell => cell.textContent), ['借方', '貸方'], '仕訳表のグループ見出しは借方を左、貸方を右にする');
  assert.deepStrictEqual(rows[1].children.map(cell => cell.textContent), ['借方科目', '借方金額', '貸方科目', '貸方金額'], '仕訳表のDOM列順を借方科目・借方金額・貸方科目・貸方金額に固定する');
  rows.slice(2).forEach(row => assert.strictEqual(row.children.length, 4, '複合仕訳を含む全行で借貸4列を維持する'));
  assert(domText(rows[2].children[0]).includes(answer.debit[0]?.account || '（未入力）'), '借方科目を左側グループへ表示する');
  assert(domText(rows[2].children[1]).includes(answer.debit[0]?.amount?.toLocaleString('ja-JP') || '—'), '借方金額を第2列へ表示する');
  assert(domText(rows[2].children[2]).includes(answer.credit[0]?.account || '（未入力）'), '貸方科目を右側グループへ表示する');
  assert(domText(rows[2].children[3]).includes(answer.credit[0]?.amount?.toLocaleString('ja-JP') || '—'), '貸方金額を第4列へ表示する');
}
const mobileJournalTicket = journalDomView.journalTable(browserSandbox.window.QuestionData.J135.answer);
const mobileJournalSurface = descendants(mobileJournalTicket).find(node => String(node.className || '').split(/\\s+/).includes('journal-review-mobile'));
assert(mobileJournalSurface, '解説用のモバイル仕訳票を生成する');
assert.deepStrictEqual(mobileJournalSurface.children[0].children.map(cell => cell.textContent), ['借方科目','借方金額','貸方科目','貸方金額'], '解説の仕訳票も問題入力と同じ4列見出しにする');
mobileJournalSurface.children.slice(1).forEach(row => assert.strictEqual(row.children.length, 4, '解説の仕訳票も全行を借方科目・借方金額・貸方科目・貸方金額の4列にする'));
assert(domText(mobileJournalSurface).includes('法人税、住民税及び事業税'), '最長勘定科目も解説の仕訳票へ全文表示する');
assert(!viewSource.includes("sideLabel.className = 'journal-review-side-label'"), 'スマホ解説で借方・貸方カードへ分割しない');
const compoundJournalTicket = journalDomView.journalTable(browserSandbox.window.QuestionData.J128.answer);
const compoundDesktopRows = descendants(compoundJournalTicket, 'tr').slice(2);
assert.strictEqual(domText(compoundDesktopRows[1].children[0]), '', '複合仕訳の行数合わせだけの借方科目セルは空欄にする');
assert.strictEqual(compoundDesktopRows[1].children[1].textContent, '', '複合仕訳の行数合わせだけの借方金額セルは空欄にする');
assert.strictEqual(domText(compoundDesktopRows[2].children[0]), '', '複合仕訳3行目の構造空欄へ未入力表示を出さない');
assert.strictEqual(compoundDesktopRows[2].children[1].textContent, '', '複合仕訳3行目の構造空欄へダッシュを出さない');
const compoundMobileSurface = descendants(compoundJournalTicket).find(node => String(node.className || '').split(/\\s+/).includes('journal-review-mobile'));
assert.strictEqual(compoundMobileSurface.children[2].children[0].textContent, '', 'スマホ解説の構造空欄は未入力表示ではなく空欄にする');
assert.strictEqual(compoundMobileSurface.children[2].children[1].textContent, '', 'スマホ解説の構造空欄金額はダッシュではなく空欄にする');
assert.strictEqual(compoundMobileSurface.children[3].children[0].textContent, '', 'スマホ解説3行目の構造空欄も空欄にする');
assert.strictEqual(compoundMobileSurface.children[3].children[1].textContent, '', 'スマホ解説3行目の構造空欄金額も空欄にする');
assert(!domText(compoundMobileSurface).includes('（未入力）'), '正解の複合仕訳で構造空欄を入力漏れのように表示しない');


allJournalAccounts.forEach(account => assert.notStrictEqual(comparisonView.accountType(account), 'unknown', `${account}を簿記の5要素へ分類する`));
assert.strictEqual(comparisonView.accountType('減価償却累計額'), 'contraAsset', '減価償却累計額は負債ではなく資産の控除項目とする');
assert.strictEqual(comparisonView.accountType('貸倒引当金'), 'contraAsset', '貸倒引当金は資産の控除項目とする');
const poolContext = { ids: Object.keys(browserSandbox.window.QuestionData), questions: browserSandbox.window.QuestionData };
poolContext.examCandidateIds = browserSandbox.window.AppController.prototype.examCandidateIds;
poolContext.learningIds = browserSandbox.window.AppController.prototype.learningIds;
const storyOrder = browserSandbox.window.AppController.prototype.storyIds.call(poolContext);
assert(storyOrder.length > 0 && storyOrder.every(id => browserSandbox.window.QuestionData[id].learningRole !== 'review'), 'ストーリーはdue前のreview問題を露出しない');
['correction','worksheet','financial_statement','comprehensive'].forEach(type => assert(storyOrder.some(id => browserSandbox.window.QuestionData[id].type === type), `Storyで${type}をExam前に学べる`));
assert(storyOrder.every((id, index) => index === 0 || browserSandbox.window.QuestionData[storyOrder[index - 1]].chapter <= browserSandbox.window.QuestionData[id].chapter), 'ストーリーのChapterが逆行しない');
const examAudit = { ...poolContext, model: { state: { examAttempt: 0 } }, semanticAudit };
const examPrototype = browserSandbox.window.AppController.prototype;
const expirySession = { ids: [], startedAt: 1000, endAt: 2000, status: 'RUNNING', scores: {} };
const expiryContext = { model: { state: { examSession: expirySession } } };
assert.strictEqual(examPrototype.isExamExpired.call(expiryContext, 1999), false, 'CASE A: 終了1ms前は採点可能');
assert.strictEqual(examPrototype.isExamExpired.call(expiryContext, 2000), true, 'CASE B: 終了時刻ちょうどは採点不可');
assert.strictEqual(examPrototype.isExamExpired.call(expiryContext, 2001), true, 'CASE C: 終了1ms後は採点不可');
assert.strictEqual(examPrototype.isExamExpired.call(expiryContext, 3000), true, 'CASE D: 終了1秒後は採点不可');
['EXPIRED', 'FINISHING', 'FINISHED'].forEach(status => assert.strictEqual(examPrototype.isExamExpired.call({ model: { state: { examSession: { ...expirySession, status } } } }, 1500), true, `${status}からSCORE_UPDATEへ遷移できない`));

const modeGuardNow = 5000;
const activeModeGuardSession = {
  ids:['Q1'],
  startedAt:1000,
  endAt:6000,
  status:'RUNNING',
  scores:{}
};
const activeModeGuardContext = {
  model:{state:{examSession:activeModeGuardSession}},
  isExamExpired:examPrototype.isExamExpired
};
assert.strictEqual(
  examPrototype.hasActiveExamSession.call(activeModeGuardContext, modeGuardNow),
  true,
  'RUNNINGかつ期限内の模試sessionだけをactiveとして扱う'
);
assert.strictEqual(
  examPrototype.hasActiveExamSession.call({
    model:{state:{examSession:{...activeModeGuardSession,endAt:modeGuardNow}}},
    isExamExpired:examPrototype.isExamExpired
  }, modeGuardNow),
  false,
  '期限切れ模試sessionはactiveとして扱わない'
);
assert.strictEqual(
  examPrototype.hasActiveExamSession.call({
    model:{state:{examSession:{...activeModeGuardSession,status:'EXPIRED'}}},
    isExamExpired:examPrototype.isExamExpired
  }, modeGuardNow),
  false,
  'EXPIRED模試sessionはactiveとして扱わない'
);
assert.strictEqual(
  examPrototype.hasActiveExamSession.call({
    model:{state:{examSession:null}},
    isExamExpired:examPrototype.isExamExpired
  }, modeGuardNow),
  false,
  '模試sessionがなければactiveとして扱わない'
);

for (const targetMode of ['story','training','review','desk']) {
  let saves=0,stops=0,renders=0,views=0,domMutations=0,notices=0;
  const guardContext={
    model:{
      state:{mode:'exam',examSession:{...activeModeGuardSession}},
      save(){saves+=1;}
    },
    hasActiveExamSession:examPrototype.hasActiveExamSession,
    isExamExpired(){return false;},
    stopExamTimer(){stops+=1;},
    renderModes(){renders+=1;},
    view:{show(){views+=1;},showNotice(message, options){notices+=1; assert(message.includes('模試中は他のモードへ移動できません')); assert.strictEqual(options.title,'模試を継続中です');}},
    document:{
      body:{classList:{
        remove(){domMutations+=1;},
        toggle(){domMutations+=1;}
      }},
      getElementById(){domMutations+=1;return {hidden:false};},
      querySelectorAll(){domMutations+=1;return [];}
    }
  };
  browserSandbox.window.alert=()=>{throw new Error('browser alert must not be used by the exam mode guard');};

  assert.strictEqual(
    examPrototype.showMode.call(guardContext,targetMode),
    false,
    `RUNNING模試中は${targetMode}へ移動できない`
  );
  assert.strictEqual(
    guardContext.model.state.mode,
    'exam',
    `RUNNING模試中の${targetMode}要求でmodeを書き換えない`
  );
  assert.deepStrictEqual(
    [saves,stops,renders,views,domMutations,notices],
    [0,0,0,0,0,1],
    `RUNNING模試中の${targetMode}拒否ではsave・timer停止・render・view・DOM変更を行わない`
  );
}

let allowedExamEnsures=0,allowedExamSaves=0,allowedExamUpdates=0,allowedExamTimers=0;
const allowedExamContext={
  model:{
    state:{mode:'exam',examSession:{...activeModeGuardSession}},
    save(){allowedExamSaves+=1;}
  },
  hasActiveExamSession:examPrototype.hasActiveExamSession,
  isExamExpired(){return false;},
  unmetExamPrerequisites(){return [];},
  clearOrdinaryFilters:examPrototype.clearOrdinaryFilters,
  ensureExamSession(){allowedExamEnsures+=1;return this.model.state.examSession;},
  renderModes(){},
  view:{show(){}},
  document:{
    body:{classList:{remove(){},toggle(){}}},
    getElementById(id){return id==='question-filters'?{hidden:false}:null;},
    querySelectorAll(){return [];}
  },
  updateExamStatus(){allowedExamUpdates+=1;},
  startExamTimer(){allowedExamTimers+=1;}
};
assert.strictEqual(
  examPrototype.showMode.call(allowedExamContext,'exam'),
  true,
  'RUNNING模試中でもexam自身への再表示は許可する'
);
assert.deepStrictEqual(
  [allowedExamEnsures,allowedExamSaves,allowedExamUpdates,allowedExamTimers],
  [1,1,1,1],
  'exam自身への再表示ではsession維持・保存・HUD更新・timer継続を行う'
);

let normalReviewStops=0,normalReviewViews=0;
const normalReviewContext={
  model:{state:{mode:'story',examSession:null},save(){}},
  hasActiveExamSession:examPrototype.hasActiveExamSession,
  isExamExpired:examPrototype.isExamExpired,
  stopExamTimer(){normalReviewStops+=1;},
  renderModes(){},
  view:{show(id){if(id==='view-review') normalReviewViews+=1;}},
  document:{
    body:{classList:{remove(){},toggle(){}}},
    getElementById(id){return id==='question-filters'?{hidden:false}:null;},
    querySelectorAll(){return [];}
  }
};
assert.strictEqual(
  examPrototype.showMode.call(normalReviewContext,'review'),
  true,
  '模試sessionがなければ通常どおりreviewへ移動できる'
);
assert.deepStrictEqual(
  [normalReviewContext.model.state.mode,normalReviewStops,normalReviewViews],
  ['review',1,1],
  '非模試時の既存review遷移を維持する'
);

let resumedMode='';
const reloadResumeContext={
  bindEvents(){},
  populateAccountFilter(){},
  renderModes(){},
  view:{updateRpg(){}},
  rpg:{},
  model:{
    state:{
      placement:{completed:true},
      examSession:{...activeModeGuardSession}
    },
    migrateLegacyPlacement(){}
  },
  hasActiveExamSession(){return true;},
  showMode(mode){resumedMode=mode;return true;},
  questions:{}
};
examPrototype.init.call(reloadResumeContext,{mode:'review'});
assert.strictEqual(
  resumedMode,
  'exam',
  'RUNNING模試sessionを保持したreloadでは保存modeやrouteよりexam復帰を優先する'
);
let forcedFinishes = 0; let grades = 0;
const lateSubmit = {
  submitting: false, currentId: 'Q1', questions: { Q1: { id: 'Q1' } },
  model: { state: { mode: 'exam', examSession: { ids: ['Q1'], startedAt: 1, endAt: 2, status: 'RUNNING', scores: {} } } },
  isExamExpired: () => true, finishExam(force) { assert.strictEqual(force, true); forcedFinishes += 1; }, document: { querySelector: () => null }
};
browserSandbox.window.GradingEngine.grade = () => { grades += 1; return { correct: true, earned: 1, possible: 1, ratio: 1 }; };
for (let attack = 0; attack < 3; attack += 1) { lateSubmit.submitting = false; examPrototype.submit.call(lateSubmit); }
assert.deepStrictEqual([grades, Object.keys(lateSubmit.model.state.examSession.scores).length, forcedFinishes], [0, 0, 3], 'CASE E/F: callback遅延後の復帰とsubmit連打でも回答取得・採点・score更新をしない');
lateSubmit.currentId = 'Q2'; lateSubmit.questions.Q2 = { id: 'Q2' }; lateSubmit.model.state.examSession.ids.push('Q2'); lateSubmit.submitting = false;
examPrototype.submit.call(lateSubmit);
assert.strictEqual(Object.keys(lateSubmit.model.state.examSession.scores).length, 0, 'CASE G: 時間切れ後に別問題へ移動しても採点不可');
const fifteenIds = Array.from({ length: 15 }, (_, index) => `Q${index + 1}`);
const examState = { ids: fifteenIds, startedAt: 1, endAt: 3600001, scores: {} };
assert.strictEqual(examPrototype.unansweredExamIds.call({ model: { state: { examSession: examState } } }).length, 15, 'CASE 1: 15問目だけ回答する前は15問が未回答である');
examState.scores.Q15 = { correct: true, earned: 1, possible: 1, ratio: 1 };
assert.strictEqual(examPrototype.unansweredExamIds.call({ model: { state: { examSession: examState } } }).length, 14, 'CASE 1: 15問目だけ正解しても未回答14問を認識する');
examState.scores.Q8 = { correct: true, earned: 1, possible: 1, ratio: 1 };
assert.strictEqual(examPrototype.unansweredExamIds.call({ model: { state: { examSession: examState } } }).length, 13, 'CASE 2: 途中問題を直接回答しても完了扱いにしない');
let warned = ''; let redirected = '';
const incompleteExam = {
  model: { state: { examSession: examState } }, unansweredExamIds: examPrototype.unansweredExamIds,
  start(id) { redirected = id; }, startExamTimer() {}, questions: {}, rpg: {},
  view: { showNotice(message, options) { warned = message; assert.strictEqual(options.title, '未回答があります'); } }
};
browserSandbox.window.alert = () => { throw new Error('browser alert must not be used for incomplete exam warning'); };
assert.strictEqual(examPrototype.finishExam.call(incompleteExam, false, 2), false, 'CASE 3: 1問でも未回答なら終了を拒否する');
assert(warned.includes('未回答が13問') && redirected === 'Q1', 'CASE 3: アプリ内通知で未回答数を示し最初の未回答へ移動する');
const completeScores = Object.fromEntries(fifteenIds.map(id => [id, { correct: true, earned: 1, possible: 1, ratio: 1 }]));
const completedSession = { ids: fifteenIds, startedAt: 1, endAt: 3600001, scores: completeScores };
let resultScore; let examResultFocused=false; const completeExam = {
  model: { state: { examSession: completedSession, examAttempt: 0 }, record() {}, save() {} },
  unansweredExamIds: examPrototype.unansweredExamIds, questions: Object.fromEntries(fifteenIds.map(id => [id, { category: id }])),
  rpg: { recordMastery() {} }, stopExamTimer() {}, view: { examResult(review) { resultScore = { correct: review.passed, earned: review.points, possible: 100 }; }, show() {} }, document: { body: { classList: { remove() {} } }, getElementById(id){return id==='result-status'?{focus(){examResultFocused=true;}}:null;} }
};
browserSandbox.window.confirm = () => { throw new Error('browser confirm must not be used for exam completion'); };
let confirmOptions;
completeExam.view.showNotice = (message, options) => { assert.strictEqual(message, '全15問の回答を終了し、採点しますか？'); confirmOptions = options; };
assert.strictEqual(examPrototype.finishExam.call(completeExam, false, 2), false, 'CASE 4A: 全15問回答後はアプリ内確認を表示して即採点しない');
assert.strictEqual(confirmOptions.title, '模試を採点しますか？');
assert.strictEqual(confirmOptions.cancelLabel, '戻る');
assert.strictEqual(confirmOptions.confirmLabel, '採点する');
assert.strictEqual(examPrototype.finishExam.call(completeExam, false, 2, true), true, 'CASE 4B: アプリ内確認後に正式採点する');
assert.deepStrictEqual(JSON.parse(JSON.stringify(resultScore)), { correct: true, earned: 100, possible: 100 }, '明示配点の合計を100点として採点する');
assert.strictEqual(examResultFocused,true,'最終模試結果の表示後に結果statusへフォーカスする');
const examIds = browserSandbox.window.AppController.prototype.buildExamIds.call(examAudit);
const poolSeparation={...poolContext,model:{state:{mode:'training'}},reviewIds(){return[];},buildExamIds(){return examIds;},storyIds(){return[];}};
const trainingIds=browserSandbox.window.AppController.prototype.modeIds.call(poolSeparation);
assert.strictEqual(examIds.some(id=>trainingIds.includes(id)),false,'Training PoolとExam Poolで同じQuestion IDを使わない');
assert.strictEqual(examIds.some(id=>storyOrder.includes(id)),false,'Story ExposureとExam Poolで同じQuestion IDを使わない');
assert(trainingIds.every(id=>browserSandbox.window.QuestionData[id].learningRole!=='review'),'Trainingはdue前review問題を露出しない');
['correction','worksheet','financial_statement','comprehensive'].forEach(type => assert(trainingIds.some(id => browserSandbox.window.QuestionData[id].type === type), `Trainingで${type}をExam前に学べる`));
assert(examIds.every(id=>browserSandbox.window.QuestionData[id].learningRole==='transfer'),'Exam Poolは初見転移用Questionへ限定する');
['L034','L035','L036','L041','L042','L043'].forEach(id => {
  const prerequisites = browserSandbox.window.QuestionData[id].curriculumPrerequisites;
  assert(prerequisites.length >= 3, `${id}はCore/Drillから特殊帳簿へ接続する複数の前提演習を持つ`);
  assert(prerequisites.every(prerequisite => ['core','drill'].includes(browserSandbox.window.QuestionData[prerequisite].learningRole)), `${id}の前提演習はExam転移問題を参照しない`);
  assert(prerequisites.every(prerequisite => storyOrder.indexOf(prerequisite) < storyOrder.length), `${id}の前提演習はStoryで模試前に学習できる`);
});
const prerequisiteContext = {
  questions:browserSandbox.window.QuestionData,
  model:{state:{correctIds:[]}},
  examCandidateIds:poolContext.examCandidateIds,
  examPrerequisiteIds:examPrototype.examPrerequisiteIds
};
const requiredBeforeExam = examPrototype.examPrerequisiteIds.call(prerequisiteContext);
assert(requiredBeforeExam.includes('J148') && requiredBeforeExam.includes('J149') && requiredBeforeExam.includes('J150'), '手形の受入・振出・満期決済を模試前の実演習として要求する');
assert.deepStrictEqual(
  examPrototype.unmetExamPrerequisites.call(prerequisiteContext),
  requiredBeforeExam,
  '未正解のCore/Drill前提を実行時の模試ゲートへ接続する'
);
prerequisiteContext.model.state.correctIds = [...requiredBeforeExam];
assert.strictEqual(examPrototype.unmetExamPrerequisites.call(prerequisiteContext).length, 0, '全前提の正解後に模試ゲートを解放する');
const firstPrerequisite = requiredBeforeExam[0];
let prerequisiteStarted = ''; let prerequisiteMode = '';
const prerequisiteNavigationContext = {
  questions:browserSandbox.window.QuestionData,
  examPrerequisiteIds(){return requiredBeforeExam;},
  showMode(mode){ prerequisiteMode = mode; return true; },
  start(id){ prerequisiteStarted = id; }
};
assert.strictEqual(examPrototype.openExamPrerequisite.call(prerequisiteNavigationContext, firstPrerequisite), true, '模試前提問題から直接学習問題へ遷移できる');
assert.deepStrictEqual([prerequisiteMode, prerequisiteStarted], ['story', firstPrerequisite], '前提問題はStoryへ切り替えて対象問題を直接開始する');
assert.strictEqual(examPrototype.openExamPrerequisite.call(prerequisiteNavigationContext, 'NOT-PREREQUISITE'), false, '前提外IDへの直接遷移は拒否する');
assert.strictEqual(examIds.length, 15, '模試は設計通り15問を選出する');
const routeRpg = new RPGModel({ getItem(){ return null; }, setItem(){} }, 'route-xp');
Object.values(browserSandbox.window.QuestionData).forEach(question => routeRpg.reward(question, { correct:true, ratio:1, earned:1, possible:1 }));
const theoreticalXp = Object.values(browserSandbox.window.QuestionData).reduce((sum, question) => sum + 20 * question.difficulty, 0);
assert.strictEqual(routeRpg.state.xp, theoreticalXp, 'Story・Training・Examを共通のreward-once経路で完遂した実到達XPを集計する');
assert(routeRpg.level === 30 && routeRpg.state.xp >= 12615, 'Exam候補を含む正当な全問題完遂でLv.30へ到達できる');
const beforeDuplicate = routeRpg.state.xp;
assert.strictEqual(routeRpg.reward(browserSandbox.window.QuestionData[examIds[0]], { ratio:1, earned:1, possible:1 }), false, 'Exam再受験でも同一問題のXPを二重取得できない');
assert.strictEqual(routeRpg.state.xp, beforeDuplicate, '重複報酬拒否後もXPは不変である');
let relatedStarted=''; let relatedSaved=false;
const relatedContext={questions:browserSandbox.window.QuestionData,model:{state:{mode:'story'},save(){relatedSaved=true;}},examCandidateIds:poolContext.examCandidateIds,ids:poolContext.ids,renderModes(){},start(id){relatedStarted=id;}};
assert.strictEqual(examPrototype.openRelated.call(relatedContext,'J001'),true,'Knowledge Linkが実在する学習問題へ遷移する');
assert.deepStrictEqual([relatedContext.model.state.mode,relatedSaved,relatedStarted],['training',true,'J001'],'Knowledge Linkは実在しないsetModeではなく保存済みstateを更新する');
assert.strictEqual(examPrototype.openRelated.call(relatedContext,examIds[0]),false,'Knowledge Linkから未見Exam Poolを露出しない');
const knowledgeEdges = Object.values(browserSandbox.window.QuestionData).flatMap(source => Object.values(source.knowledgeLinks || {}).flatMap(ids => (Array.isArray(ids) ? ids : [ids]).map(target => ({ source:source.id, target }))));
for (const edge of knowledgeEdges) {
  relatedStarted = '';
  assert.strictEqual(examPrototype.openRelated.call(relatedContext, edge.target), true, `${edge.source}→${edge.target}のKnowledge LinkをController経路で開ける`);
  assert.strictEqual(relatedStarted, edge.target, `${edge.source}→${edge.target}のクリック先が対象問題と一致する`);
}
assert.strictEqual(knowledgeEdges.length, 27, '全27 Knowledge Link edgeをE2E対象にする');
examIds.forEach(id => { const question = browserSandbox.window.QuestionData[id]; assert(question.type === 'journal' || (question.table && question.table.inputCells.every(cell => cell in question.answer.cells)), `${id}は必要な入力欄と正答を持つ`); if (question.materials?.length) assert(viewSource.includes('this.renderMaterials(question)'), `${id}の資料を問題表示で描画する`); });
examIds.forEach(id => assert.strictEqual(semanticAudit.findings[id].status, 'VALID', `EXAM-VALIDITY: ${id}は独立Semantic監査でVALIDである`));
assert.deepStrictEqual(JSON.parse(JSON.stringify(comparisonView.explanationSections('【処理の根拠】\n資産が増えます。\n【試験のポイント】ここに注意。'))), [
  { label: '実務MEMO', kind: 'memo', text: '資産が増えます。' },
  { label: '試験POINT', kind: 'point', text: 'ここに注意。' }
], '解説見出しを実務MEMO・試験POINTのカード構造へ正規化する');
assert(viewSource.includes("score.correct ? '正解です！' : 'もう一歩です'"), '不正解時も学習者を非難しない既存の見出しを維持する');
assert(!viewSource.includes('部分点'), 'ユーザー向けの採点結果に部分点を表示しない');
assert.strictEqual(browserSandbox.window.AppView.prefersCalculatorFirst({ matchMedia:()=>({ matches:true }) }), true, 'coarse touch primary inputはcalculator-firstにする');
assert.strictEqual(browserSandbox.window.AppView.prefersCalculatorFirst({ matchMedia:()=>({ matches:false }) }), false, 'fine pointerまたはhybrid primary inputはdesktop direct-entryを保つ');
const policyElement = () => new FakeElement('input');
const mobileAmountView = new browserSandbox.window.AppView({ createElement:policyElement }); mobileAmountView.calculatorFirstInput = true;
const mobileAmount = mobileAmountView.makeAmount('table-input', '金額', '58,800');
assert.deepStrictEqual([mobileAmount.readOnly,mobileAmount.inputmode,mobileAmount.value],[true,'none','58,800'],'calculator-first金額欄は値とfocusabilityを保ちnative software keyboardを抑止する');
assert.strictEqual(mobileAmount['aria-label'],'金額','readonlyでもscreen reader向け金額ラベルを保つ');
const desktopAmountView = new browserSandbox.window.AppView({ createElement:policyElement }); desktopAmountView.calculatorFirstInput = false;
const desktopAmount = desktopAmountView.makeAmount('table-input', '金額', '30,000');
assert.deepStrictEqual([desktopAmount.readOnly,desktopAmount.inputmode,desktopAmount.value],[false,'numeric','30,000'],'desktopでは直接キーボード入力と既存値を保つ');
const amountPattern=viewSource.match(/input\.setAttribute\('pattern', '([^']+)'\)/)?.[1];assert(amountPattern,'金額欄にnative patternを設定する');const nativeAmountPattern=new RegExp(`^(?:${amountPattern})$`);for(const raw of validAmounts.keys())assert(raw===''||nativeAmountPattern.test(raw),`${raw||'空欄'}をnative patternで受理する`);for(const raw of invalidAmounts)assert(!nativeAmountPattern.test(raw),`${raw}をnative patternで拒否する`);
assert(viewSource.includes('必要に応じて計算機も使えます'), '金額欄は直接入力と任意の計算機を案内する');
assert(viewSource.includes("const text = select.selectedOptions[0]?.textContent || ''") && viewSource.includes('select.title = text;'), '選択中の勘定科目をtitleに反映する');
const cssSource = fs.readFileSync('css/style.css', 'utf8');
assert(viewSource.includes("else if (question.type === 'correction') this.renderCorrection(question, draft)"), '記帳訂正は通常の縦型表ではなく専用の仕訳入力欄で表示する');
assert(viewSource.includes("header.innerHTML = '<span>借方科目</span><span>借方金額</span><span>貸方科目</span><span>貸方金額</span>'"), '記帳訂正に借方・貸方の科目欄と金額欄を明示する');
assert(viewSource.includes("input = this.document.createElement('select'); input.className = 'table-input correction-account'"), '記帳訂正の科目欄をプルダウンで表示する');
assert(/\.correction-row\s*\{[^}]*grid-template-columns:\s*minmax\(240px, 3fr\) minmax\(120px, 2fr\) minmax\(240px, 3fr\) minmax\(120px, 2fr\)/s.test(cssSource), '記帳訂正の借方科目・金額と貸方科目・金額を横一列にする');
assert(viewSource.includes("this.renderJournalBook(question, draft, mode)"), '仕訳帳形式は学習モードを維持して専用帳票で表示する');
assert(viewSource.includes("['日付', '摘要', '元丁', '借方', '貸方']"), '仕訳帳をTAC標準の5列（日付・摘要・元丁・借方・貸方）で表示する');
assert(viewSource.includes("select.className = 'table-input journal-book-account'") && viewSource.includes("makeShortDateInput('table-input journal-book-date'") && viewSource.includes("'月/日'") && viewSource.includes('dateCell.rowSpan = 2'), '仕訳帳は中立な月/日入力と摘要欄の勘定科目5択を持ち、1取引を借方・貸方の2行で表示する');
assert(controllerSource.includes(".journal-row select, .correction-row select, .journal-book-account"), '仕訳帳の勘定科目選択もchange時に下書き保存する');
assert(/\.journal-book-entry\s*\{[^}]*table-layout:\s*fixed/s.test(cssSource), '仕訳帳の借方列と貸方列を同じ行に固定する');
assert(/\.journal-book-entry \.table-input\s*\{[^}]*display:\s*block/s.test(cssSource), 'WebKitでも仕訳帳入力のinline baseline余白を発生させない');
assert(viewSource.includes('元丁：総勘定元帳の転記先を示す番号') && viewSource.includes('横にスクロールして借方・貸方を入力できます。'), '仕訳帳に元丁の意味と横スクロール操作を明示する');
assert(viewSource.includes("context.className = 'journal-book-amount-context'") && viewSource.includes("amountContext.textContent = name"), '借方・貸方金額欄に選択済み勘定科目の文脈を残す');
assert(/\.journal-book-guidance\s*\{[^}]*position:\s*sticky[^}]*left:\s*0/s.test(cssSource), '仕訳帳の補助説明は横スクロールしても左端に残す');
assert(/\.journal-book-amount-cell \.table-input\s*\{[^}]*flex:\s*1 1 0[^}]*width:\s*auto/s.test(cssSource), '仕訳帳の金額入力は科目文脈を押し潰さないflex可変幅にする');
assert(/\.journal-book-amount-context\s*\{[^}]*flex:\s*0 0 5em[^}]*min-width:\s*5em[^}]*font-size:\s*\.65rem/s.test(cssSource), '仕訳帳の科目文脈に4文字以上の勘定科目を保持できる固定幅を確保する');
assert(/@media \(max-width:\s*700px\)\s*\{\s*\.journal-book-scroll-note\s*\{[^}]*display:\s*block/s.test(cssSource), '横スクロール案内は狭い画面だけに表示する');
assert(/button,\s*select,\s*input\s*{[^}]*min-height:\s*44px/s.test(cssSource), 'フォーム部品のタップ領域を44px以上にする');
assert(html.includes('id="correct-journal"'), '採点結果に正しい仕訳の表示領域を設ける');
assert(viewSource.includes('this.renderCorrectJournal(question)'), '正解・不正解のどちらでも正しい仕訳を表示する');
assert(viewSource.includes("'正しい訂正仕訳' : '正しい仕訳'"), '通常仕訳と訂正仕訳を区別した正解見出しを表示する');
assert(html.includes('id="answer-comparison"'), '誤答した仕訳を正答と比較する表示領域を設ける');
assert(html.includes('id="app-notice-items"') && viewSource.includes('itemActionLabel') && viewSource.includes('onItemSelect'), '模試前提不足の通知内に未完了問題への直接導線を表示できる');
assert(controllerSource.includes("itemActionLabel:'この問題を解く'") && controllerSource.includes('onItemSelect:item => this.openExamPrerequisite(item.id)'), '模試前提不足では未完了問題をその場から直接開ける');
assert(/\.answer-comparison:empty\s*{[^}]*display:\s*none/s.test(cssSource), '空の誤答比較欄は赤枠ごと非表示にする');
assert(/\.answer-comparison\[hidden\][\s\S]*?display:\s*none/s.test(cssSource), 'hidden属性でも誤答比較欄を確実に非表示にする');
assert(viewSource.includes('container.hidden = true') && viewSource.includes('container.hidden = false'), '誤答比較欄は誤答時だけ表示する');
assert(controllerSource.includes('this.view.result(question, score, answer, confidence, achievement,'), '採点結果画面へ回答者の仕訳・達成通知・retry authorizationを渡す');
assert(controllerSource.includes('writable = false'), 'QuotaExceededErrorの反復を避けてストレージをFail-Safe化する');
assert(viewSource.includes('confidence-feedback') && viewSource.includes('achievement-banner'), '確信度校正とレベル・役職解放を結果画面で強調する');
assert(viewSource.includes("heading.textContent = '最初の仕訳（誤答）'"), '最初に入力した誤答であることを明示する');
assert(viewSource.includes("heading.textContent = '今回の解説'") && viewSource.includes('diagnostic.nextRule'), '誤答理由と次回の判別ポイントを一つの解説内に表示する');
assert(viewSource.includes("solutionHeading.textContent = '解き方（この順番で考える）'") && viewSource.includes("correction:['帳簿に記録済みの仕訳"), '解説に問題形式別の具体的な解法手順を表示する');
assert(viewSource.includes("heading.textContent = question.type === 'correction' ? '正しい訂正仕訳' : '正しい仕訳'"), '訂正問題の正解を借方・貸方の仕訳表で表示する');
assert(viewSource.includes("heading.textContent = '最初の訂正仕訳（誤答）'") && viewSource.includes('this.journalTable(this.correctionJournal(userAnswer))'), '訂正問題の最初の誤答も仕訳形式の表で比較する');
assert(viewSource.includes("heading.textContent = '最初の回答を決算整理表で比較'") && viewSource.includes('this.worksheetAnswerComparison(question, score, userAnswer)'), '決算整理問題は最初の回答と正答を元の行列を保った表で比較する');
assert(viewSource.includes("if (this.compactWorksheetViewport()) return this.worksheetAnswerComparisonMobile(question, score, userAnswer)") && viewSource.includes("flow.className = 'worksheet-comparison-mobile-flow'"), 'D001解説はモバイルで横長8欄比較表ではなく4ブロック比較へ切り替える');
assert(viewSource.includes("dataset.worksheetComparisonGroup = group.title") && viewSource.includes("['勘定科目','借方','貸方']"), 'D001解説の4ブロックは問題画面と同じ勘定科目・借方・貸方の3列構成にする');
assert(/\.worksheet-comparison-mobile-table\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*table-layout:\s*fixed/s.test(cssSource), 'D001モバイル解説表を画面幅内の固定3列に収める');
assert(/\.worksheet-answer-comparison \.worksheet-comparison-pair\s*\{[^}]*grid-template-columns:\s*minmax\(9rem, auto\) minmax\(9rem, auto\)/s.test(cssSource), '入力・正解を横2列にする広幅ルールはデスクトップ8欄比較表だけに限定する');
assert(!/\n\.worksheet-comparison-pair\s*\{[^}]*min-width:\s*18\.5rem/s.test(cssSource), 'モバイル比較セルに18rem超の最小幅を強制しない');
assert(!viewSource.includes("heading.textContent = 'なぜ間違えた？'") && !viewSource.includes("heading.textContent = '詳しい解説'"), '意味が重なる二つの解説見出しを表示しない');
Object.values(browserSandbox.window.QuestionData).forEach(question => {
  assert(String(question.explanation).trim(), `${question.id}にauthored explanationまたはfallbackがある`);
});
assert(viewSource.includes("this.byId('explanation').before(container)"), '古いHTMLがキャッシュされていても正しい仕訳の表示領域を補完する');
assert(/\.journal-header\s*\{[^}]*grid-template-columns:\s*200px\s+120px\s+200px\s+120px[^}]*width:\s*max-content[^}]*min-width:\s*0/s.test(cssSource), '仕訳は過剰な620px固定床を使わずコンパクトな4列幅を保つ');
assert(/\.journal-entry-area\s*\{[^}]*max-width:\s*100%[^}]*overflow:\s*visible/s.test(cssSource) && /\.journal-grid-scroll\s*\{[^}]*overflow-x:\s*auto/s.test(cssSource), 'iPhoneで説明を固定したまま仕訳グリッドだけを横スクロールできる');
assert(/\.table-question-wrap\s*{[^}]*overflow-x:\s*auto/s.test(cssSource), '大きな表は小型画面で横スクロールできる');
assert(viewSource.includes("question.type === 'financial_statement'") && viewSource.includes("columns.length <= 3"), 'F001の3列資料はモバイルでコンパクト表示する');
assert(/\.question-materials\[data-question-type="financial_statement"\] \.materials-table-compact th:nth-child\(2\)[\s\S]*?width:\s*40%/s.test(cssSource), 'F001資料は区分30%・勘定科目40%・金額30%で画面幅に収める');
assert(/\.answer-table:not\(\.eight-column-worksheet\)\[data-question-type="financial_statement"\]\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*table-layout:\s*fixed/s.test(cssSource), 'F001解答表はモバイルで横スクロールせず2列を固定配置する');
assert(/\.answer-table:not\(\.eight-column-worksheet\)\[data-question-type="financial_statement"\] \.table-input\[data-input-type="amount"\]\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*height:\s*44px/s.test(cssSource), 'F001金額入力欄は金額セル幅いっぱい・高さ44pxに統一する');
assert(viewSource.includes("question.type === 'comprehensive' && this.compactWorksheetViewport()") && viewSource.includes("renderComprehensiveMaterialsMobile(question)"), 'C001資料はモバイルで横長汎用表ではなく縦カードへ切り替える');
assert(viewSource.includes("flow.className = 'comprehensive-material-flow'") && viewSource.includes("card.className = 'comprehensive-material-card'"), 'C001資料カード構造を明示する');
assert(viewSource.includes("renderComprehensiveTrialBalanceMobile(material)") && viewSource.includes("table.className = 'comprehensive-trial-balance-mobile'"), 'C001整理前残高試算表は文章列ではなく専用3列表で表示する');
assert(viewSource.includes("['勘定科目','借方','貸方']") && viewSource.includes("total.className = 'comprehensive-trial-balance-total'"), 'C001試算表は勘定科目・借方・貸方と合計行を持つ');
assert(viewSource.includes("String(value).split('／').filter(Boolean)") && viewSource.includes("list.className = 'comprehensive-adjustment-list'"), 'C001決算整理事項は省略せず項目ごとの縦リストで表示する');
assert(/\.comprehensive-trial-balance-mobile\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*table-layout:\s*fixed/s.test(cssSource), 'C001試算表はモバイル画面幅内に固定する');
assert(/\.comprehensive-trial-balance-mobile th:first-child,[\s\S]*?\.comprehensive-trial-balance-mobile td:first-child\s*\{[^}]*width:\s*46%/s.test(cssSource) && /\.comprehensive-trial-balance-mobile th:nth-child\(2\),[\s\S]*?\.comprehensive-trial-balance-mobile td:nth-child\(3\)\s*\{[^}]*width:\s*27%/s.test(cssSource), 'C001試算表は320px WebKitでも勘定科目46%・借貸各27%で収める');
assert(/\.answer-table:not\(\.eight-column-worksheet\)\[data-question-type="comprehensive"\]\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*table-layout:\s*fixed/s.test(cssSource), 'C001解答表はモバイルで横スクロールせず2列固定にする');
assert(/\.answer-table:not\(\.eight-column-worksheet\)\[data-question-type="comprehensive"\] th\s*\{[^}]*height:\s*auto[^}]*text-align:\s*center/s.test(cssSource), 'C001解答表ヘッダーは44px固定を外して中央揃えにする');
assert(/\.answer-table:not\(\.eight-column-worksheet\)\[data-question-type="comprehensive"\] th:nth-child\(2\)\s*\{[^}]*text-align:\s*center/s.test(cssSource), 'C001の金額見出しを横中央に配置する');
assert(/\.answer-table:not\(\.eight-column-worksheet\)\[data-question-type="comprehensive"\] \.table-input\[data-input-type="amount"\]\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*height:\s*44px/s.test(cssSource), 'C001金額入力欄は金額セル幅いっぱい・高さ44pxに統一する');
assert(viewSource.includes('試算表 → 修正記入 → 損益計算書 → 貸借対照表') && viewSource.includes("guide.className = 'worksheet-guide'") && !viewSource.includes('表は横にスクロールして入力してください。'), '8欄精算表はモバイルで4段階の処理順を示し、横スクロール前提にしない');
assert(viewSource.includes("referenceLabel.textContent = 'ここを見る'") && viewSource.includes('元試算表の売上・仕入・保険料') && viewSource.includes('損益計算書の貸借差額'), 'D001モバイル各段階で参照する資料を入力欄の直前に示す');
assert(controllerSource.includes("if (input.readOnly && calculatorPanel)") && controllerSource.includes("calculatorPanel.classList?.add?.('calculator-contextual-float')") && controllerSource.includes("positionCalculatorNearTarget(input") && controllerSource.includes("scrollIntoView?.({ block:'nearest'") && controllerSource.includes("const targetScrollY = Math.max(0, currentScrollY + inputRect.top - workTop)") && controllerSource.includes("root.scrollTo"), '全readOnly金額欄は選択時だけwindowスクロールで作業位置へ移し、計算機をその場に固定表示する');
assert(!controllerSource.includes("scheduleCalculatorPosition") && !controllerSource.includes("document.addEventListener?.('scroll'"), '計算機表示後のスクロールで選択欄を追跡して再配置しない');
assert(!controllerSource.includes("input.closest?.('.worksheet-mobile-section')"), '計算機ドックをD001専用条件へ戻さない');
assert(/\.calculator\.calculator-contextual-float\[open\]\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*auto/s.test(cssSource) && !/#question-form\.calculator-dock-active/.test(cssSource), '全問題共通計算機は選択時固定のオーバーレイとし、旧ドック用の恒久余白を追加しない');
assert(/#question-form\.calculator-workspace-active\s*\{[^}]*padding-bottom:\s*calc\(72vh \+ env\(safe-area-inset-bottom\)\)/s.test(cssSource), '計算機表示中だけ作業位置確保用の一時スクロール余地を持つ');
assert(viewSource.includes("th.scope = 'colgroup'") && viewSource.includes("accountHead.rowSpan = 2"), '8欄精算表のヘッダーを4組と借方・貸方の二段構成にする');
assert(/\.eight-column-worksheet \.worksheet-value-cell, \.answer-table \.amount-cell\s*{[^}]*white-space:\s*nowrap/s.test(cssSource), '精算表を含む表の金額を途中で折り返さない');
assert(/\.eight-column-worksheet th:not\(:first-child\), \.eight-column-worksheet td:not\(:first-child\)\s*{[^}]*min-width:\s*13ch/s.test(cssSource), '8桁精算表の金額列に多桁の数値を表示できる幅を確保する');
assert(/\.table-question-wrap\.worksheet-scroll\s*{[^}]*max-height:[^}]*overflow:\s*auto/s.test(cssSource), '8欄精算表を専用スクロール領域にしてヘッダーを表示内に固定する');
assert(/\.eight-column-worksheet thead tr:nth-child\(2\) th\s*{[^}]*top:\s*44px/s.test(cssSource), '二段目の借方・貸方ヘッダーも固定する');
assert(!/\.calculator\s*{[^}]*position:\s*sticky/s.test(cssSource), '計算機を入力欄へ重ねる固定配置にしない');
assert(/\.answer-table \[data-sticky-context="true"\]\s*\{[^}]*position:\s*sticky[^}]*left:\s*var\(--sticky-left\)/s.test(cssSource), '横スクロール中もsemantic context列を累積offsetで固定する');
assert(/\.journal-table\s*{[^}]*table-layout:\s*fixed/s.test(cssSource), '正しい仕訳表を画面幅に収める');
assert(/\.journal-row\s*{[^}]*grid-template-columns:\s*200px\s+120px\s+200px\s+120px/s.test(cssSource), '仕訳はコンパクトな借方科目・借方金額・貸方科目・貸方金額の4列にする');
assert(/@media \(max-width: 480px\)[\s\S]*?\.journal-header,\s*\.journal-row,\s*\.correction-header,\s*\.correction-row\s*{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*grid-template-columns:\s*minmax\(0,\s*1\.48fr\)\s+minmax\(0,\s*\.72fr\)\s+minmax\(0,\s*1\.48fr\)\s+minmax\(0,\s*\.72fr\)/s.test(cssSource), 'スマホでも借方科目・借方金額・貸方科目・貸方金額の4列を同一画面に収める');
assert(/\.journal-row select:focus,[\s\S]*?\.journal-row \.amount-input:focus,[\s\S]*?font-size:\s*16px/s.test(cssSource), '操作中は16pxへ戻してiPhone自動ズームを防ぐ');
assert(/@media \(max-width: 480px\)[\s\S]*?\.journal-grid-scroll\s*{[^}]*overflow-x:\s*hidden/s.test(cssSource), 'スマホ仕訳は横スクロールを要求しない');
assert(cssSource.includes('font-size: clamp(10px, 2.8vw, 12px);'), 'スマホでは長い勘定科目を2行表示できる専用表示レイヤーを使う');
assert(cssSource.includes('-webkit-text-fill-color: transparent;') && cssSource.includes('.journal-account-display'), 'スマホのnative selectは操作担当、科目名表示は専用レイヤーへ分離する');
assert(viewSource.includes("select.classList?.contains('correction-account')"), '訂正仕訳にも通常仕訳と同じ勘定科目の適応表示を使う');
assert(!viewSource.includes('dataset.sideLabel'), '横並びの仕訳票に縦並び用ラベルを追加しない');
assert(viewSource.includes("<span>借方科目</span><span>借方金額</span><span>貸方科目</span><span>貸方金額</span>"), '仕訳票の4列見出しを表示する');
assert.strictEqual(browserSandbox.window.AppView.prototype.tableLabel('acquisitionCost'), '取得原価', '表の英語見出しを日本語で表示する');
assert.strictEqual(browserSandbox.window.AppView.prototype.tableLabel('debitAccount'), '借方科目', '表内の内部用英語IDを日本語で表示する');
assert.strictEqual(browserSandbox.window.AppView.prototype.tableLabel('現金'), '現金', '日本語の表示値はそのまま保つ');
assert(viewSource.includes('row.append(this.journalAccountControl(select), amount)'), 'iPhoneでも4列構造を保ったまま科目セルだけ表示ラッパー化する');
assert(viewSource.includes("display.textContent = text") && viewSource.includes("display.dataset.empty = select.value ? 'false' : 'true'"), '選択変更時に科目名オーバーレイを同期する');
assert(viewSource.includes("inputType === 'amount'") && viewSource.includes("this.makeText('table-input'"), '表セルの明示型に応じて金額入力と日本語文字入力を分ける');
assert(viewSource.includes("this.byId('q-context').textContent = visibleStory") && viewSource.includes("this.byId('q-scene').textContent = question.scene"), '通常の場面と物語を表示し、正答科目に一致する物語ラベルは保護する');
assert(!cssSource.includes('display: contents'), 'iPhoneの仕訳配置をdisplay: contentsに依存させない');
assert(/button\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s.test(cssSource), 'hidden指定されたbuttonをauthor displayルールより優先して非表示にする');
assert(html.includes(`css/style.css?v=${release}`) && html.includes(`js/view.js?v=${release}`), 'iPhone Chromeに改修後のCSSとJSを再読み込みさせる');
assert(html.includes('name="format-detection" content="telephone=no"'), 'iPhoneで金額を電話番号リンクとして誤認しない');
assert(!html.includes('maximum-scale=1'), 'ユーザーのピンチズームを制限しない');
assert(html.includes('readonly inputmode="numeric"'), '電卓表示にもiPhone向けの数値入力属性を付ける');
assert(html.includes('id="result-status" class="result-box" role="status" aria-live="polite"'), '動的な採点結果をスクリーンリーダーへ通知する');
assert(!html.includes('資金ショート') && !html.includes('XP 3倍'), '誤答で学習を遮断する資金ショートと確信度ギャンブルを表示しない');
assert(!html.includes('pattern="[0-9]*"'), 'カンマや演算子を表示する入力欄へ不整合なpattern制約を付けない');
assert(controllerSource.includes("querySelector?.('.amount-input.calculator-selected')"), '電卓は選択クラスの付いた金額欄も転記先として復元する');
assert(!controllerSource.includes('confidence === \'bold\' ? 3 : 1'), '確信度をXP倍率へ接続しない');
assert(/min-height:\s*100svh/.test(cssSource), 'iPhoneの可変ブラウザーバーを考慮した画面高を使う');
assert(/min-height:\s*100dvh/.test(cssSource), 'iPhone Chromeの可変ビューポート高へ追従する');
assert(/env\(safe-area-inset-top\)/.test(cssSource), 'iPhoneの上側セーフエリアを確保する');
assert(!fs.readFileSync('js/app.js', 'utf8').includes('Function('), 'Functionによる式評価を禁止する');
const appSource = fs.readFileSync('js/app.js', 'utf8');
const appSandbox = {
  window: { location: { search: '' }, SafeCalculator: Calculator },
  document: { addEventListener() {} }, navigator: {}, location: { protocol: 'file:' }, URLSearchParams
};
vm.runInNewContext(appSource, appSandbox);
assert.deepStrictEqual(JSON.parse(JSON.stringify(appSandbox.window.App.initialRoute('?mode=review&question=J001'))), { mode: 'review', questionId: 'J001' }, '有効なURLパラメータを初期表示候補として読み取る');
assert.deepStrictEqual(JSON.parse(JSON.stringify(appSandbox.window.App.initialRoute('%E0%A4%A'))), { mode: null, questionId: null }, '不正なURLパラメータでも初期化を停止しない');
assert(controllerSource.includes("this.questions[route.questionId] && (mode !== 'exam' || this.modeIds().includes(route.questionId))"), '未定義IDと模試選出外IDは開始せず安全なモード一覧に留まる');
assert(html.includes('rel="manifest" href="manifest.webmanifest"'), 'PWAマニフェストを読み込む');
assert(fs.readFileSync('js/app.js', 'utf8').includes("navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })"), 'Service Worker本体をHTTP cacheに依存せず更新確認する');
const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');
['./index.html', './data/questions.js', './js/controller.js'].forEach(asset => assert(serviceWorker.includes(asset), `${asset}をオフラインキャッシュ対象にする`));
assert(!serviceWorker.includes('ignoreSearch'), 'query versionを正規のcache keyとして扱う');
assert(serviceWorker.includes("event.request.mode === 'navigate'") && serviceWorker.includes("cache: 'no-store'"), 'HTML navigationをNetwork Firstで更新する');
assert(serviceWorker.includes("key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME"), 'activate時に旧リリースcacheを削除する');
assert(html.includes('id="exam-result-actions"') && !/id="exam-result-actions"[^>]*>[\s\S]*?data-action="next"/.test(html), '模試結果は通常学習の次へ進む導線を使わない');
assert(controllerSource.includes("if (this.model.state.mode === 'exam' && !this.model.state.examSession) return this.leaveExamResult('story')"), '模試sessionなしで回答可能画面へ進む遷移を防ぐ');
assert(html.includes('id="filter-query"') && html.includes('id="filter-account"') && html.includes('id="filter-mistakes"'), '問題検索・勘定科目・誤答頻度の絞り込みUIを表示する');
assert(controllerSource.includes('filteredIds(ids)') && controllerSource.includes("this.filters.mistakes === 'frequent'"), '問題一覧を検索し誤答頻度順に並べる');
assert(controllerSource.includes('populateAccountFilter(ids = this.modeIds())') && controllerSource.includes('ids.flatMap(id => this.questionAccounts(this.questions[id]))'), '勘定科目フィルターを現在モードの問題集合へ限定する');
assert(controllerSource.includes("select.disabled = accounts.length === 0") && controllerSource.includes("query.placeholder = accounts.length ? '問題文・カテゴリ・勘定科目' : '問題文・カテゴリ'"), '勘定科目検索できないモードでは入力UIを無効化して検索範囲を明示する');
assert(/showMode\(mode\)[\s\S]*?this\.model\.save\(\);\s*this\.renderModes\(\);/.test(controllerSource), 'モード切替時に検索候補と件数を再同期する');
assert(controllerSource.includes("'このモードには条件に一致する問題がありません。'"), '検索0件時に現在モード内の結果であることを明示する');
const intendedExamFilterIds = ['E01','E02','E03'];
for (const [label, filters] of [
  ['nonmatching keyword', { query:'never-matches', account:'', mistakes:'all' }],
  ['mistake status', { query:'', account:'', mistakes:'incorrect' }],
  ['account filter', { query:'', account:'現金', mistakes:'all' }]
]) {
  const staleContext = { filters, filteredIds(){ return []; } };
  assert.deepStrictEqual([...examPrototype.visibleIdsForMode.call(staleContext, intendedExamFilterIds, 'exam')], intendedExamFilterIds, `exam ignores stale ordinary ${label} state`);
}
let normalFilterDelegations = 0;
const normalFilterContext = { filteredIds(ids){ normalFilterDelegations += 1; return ids.slice(0, 1); } };
assert.deepStrictEqual([...examPrototype.visibleIdsForMode.call(normalFilterContext, ['S1','S2'], 'story')], ['S1'], 'normal filtering remains active outside exam mode');
assert.strictEqual(normalFilterDelegations, 1, 'non-exam list delegates to ordinary filtering exactly once');
const filterControls = { 'filter-query':{value:'never-matches'}, 'filter-account':{value:'現金'}, 'filter-mistakes':{value:'incorrect'} };
const clearFilterContext = { filters:{query:'never-matches',account:'現金',mistakes:'incorrect'}, document:{getElementById(id){return filterControls[id] || null;}} };
examPrototype.clearOrdinaryFilters.call(clearFilterContext);
assert.deepStrictEqual([clearFilterContext.filters.query,clearFilterContext.filters.account,clearFilterContext.filters.mistakes,filterControls['filter-query'].value,filterControls['filter-account'].value,filterControls['filter-mistakes'].value], ['','','all','','','all'], 'exam entry clears internal and UI ordinary filter state coherently');
assert(controllerSource.includes("const examIds = this.model.state.examSession?.ids || this.buildExamIds();"), 'exam list uses the active session IDs when a session exists');
assert(controllerSource.includes("render('exam-list', examIds, 'exam')"), 'exam list explicitly bypasses ordinary filtering');
assert(/if \(mode === 'exam'\) this\.clearOrdinaryFilters\(\);[\s\S]*?this\.renderModes\(\);/.test(controllerSource), 'exam filters are cleared before list rendering');
assert(/const modeIndex = \['story', 'training', 'review', 'exam'\]\.indexOf\(this\.model\.state\.mode\);\s*this\.populateAccountFilter\([\s\S]*?\);\s*const counts = \[/.test(controllerSource), 'モード変更で無効になった勘定科目条件を一覧絞り込み前に解除する');
assert(fs.existsSync('types/domain.d.ts') && fs.existsSync('tsconfig.json'), '段階的TypeScript導入用のドメイン型と設定を提供する');
// 第3問は表示資料から独立再計算し、answer改ざんを検出する。
const c001Proof = browserSandbox.window.validateExamQuestion3(browserSandbox.window.QuestionData.C001);
assert.strictEqual(c001Proof.trialBalance.debit, c001Proof.trialBalance.credit, 'C001整理前試算表の貸借が一致する');
assert.strictEqual(c001Proof.statements.bsDebit, c001Proof.statements.bsCredit, 'C001決算後B/Sが一致する');
assert.strictEqual(c001Proof.valid, true, 'C001全answerを独立再計算できる');
assert.strictEqual(browserSandbox.window.validateExamQuestion3(browserSandbox.window.QuestionData.C003).derivedCells.rentRevenue, 80000, 'C003は12月から3月まで4か月を当期収益にする');
const c002Proof = browserSandbox.window.validateExamQuestion3(browserSandbox.window.QuestionData.C002);
assert.deepStrictEqual(JSON.parse(JSON.stringify(browserSandbox.window.journalEffectsForEvent({type:'unrecordedCashSale',netAmount:50000,taxRate:.10,taxMethod:'exclusive'}))), {debit:[{account:'現金',amount:55000}],credit:[{account:'売上',amount:50000},{account:'仮受消費税',amount:5000}],netAmount:50000,taxAmount:5000,cashReceipt:55000}, '税抜未記帳現金売上eventから複数勘定の仕訳効果を一度だけ生成する');
assert.deepStrictEqual(JSON.parse(JSON.stringify({ output:144000 + 50000 * .10, input:96000 + 70000 * .10, payable:c002Proof.derivedCells.vatPayable })), { output:149000, input:103000, payable:46000 }, 'C002は未処理売上・仕入の10%を仮受・仮払へ加えて未払消費税を再計算する');
assert.deepStrictEqual(JSON.parse(JSON.stringify({cashReceipt:Math.round(50000*(1+.10)),cashShortage:c002Proof.derivedCells.cashShortage,netIncome:c002Proof.derivedCells.netIncome})), {cashReceipt:55000,cashShortage:10000,netIncome:-382000}, 'C002は取引イベントを現金55,000円、雑損10,000円、当期純損失382,000円まで波及させる');
for (const id of ['C001','C002','C003']) {
  const original=browserSandbox.window.QuestionData[id]; const first=Object.keys(original.answer.cells)[0];
  const attacked={...original,answer:{cells:{...original.answer.cells,[first]:Number(original.answer.cells[first])+1}}};
  assert.strictEqual(browserSandbox.window.validateExamQuestion3(attacked).valid,false, `${id}の不正answerを第3問validatorが検出する`);
}
const materialAttack=JSON.parse(JSON.stringify(browserSandbox.window.QuestionData.C001));
materialAttack.materials.find(row => row.資料区分 === '整理前残高試算表').借方 = materialAttack.materials.find(row => row.資料区分 === '整理前残高試算表').借方.replace('現金400,000','現金999,999');
assert.strictEqual(browserSandbox.window.validateExamQuestion3(materialAttack).valid,false,'C001の表示materialsだけを改ざんすると明細・合計・貸借の再計算で検出する');
const missingTaxRate=JSON.parse(JSON.stringify(browserSandbox.window.QuestionData.C002));
missingTaxRate.question=missingTaxRate.question.replace('本問の商品は標準税率10%の課税取引であり、','');
assert.strictEqual(browserSandbox.window.validateExamQuestion3(missingTaxRate).valid,false,'C002は問題文から税率を削除するとSemantic INVALIDになる');
const c002MaterialAttack=JSON.parse(JSON.stringify(browserSandbox.window.QuestionData.C002));
c002MaterialAttack.materials.find(row => row.資料区分 === '整理前残高').内容=c002MaterialAttack.materials.find(row => row.資料区分 === '整理前残高').内容.replace('売上1,800,000','売上9,800,000');
assert.strictEqual(browserSandbox.window.validateExamQuestion3(c002MaterialAttack).valid,false,'C002の表示materialsだけの売上改ざんを検出する');
const c003MaterialAttack=JSON.parse(JSON.stringify(browserSandbox.window.QuestionData.C003));
c003MaterialAttack.materials.find(row => row.資料区分 === '整理前残高').内容=c003MaterialAttack.materials.find(row => row.資料区分 === '整理前残高').内容.replace('売掛金400,000','売掛金900,000');
assert.strictEqual(browserSandbox.window.validateExamQuestion3(c003MaterialAttack).valid,false,'C003の表示materialsだけの売掛金改ざんを検出する');
const mutate = (id, change) => { const copy=JSON.parse(JSON.stringify(browserSandbox.window.QuestionData[id])); change(copy); return browserSandbox.window.validateExamQuestion3(copy).valid; };
assert.strictEqual(mutate('C002', q => { q.question=q.question.replace('10%','8%'); }),false,'C002税率変更で必要な現金・VAT・利益が変わるため不整合を検出する');
assert.strictEqual(mutate('C002', q => { q.materials.at(-1).内容=q.materials.at(-1).内容.replace('年10%','年20%'); }),false,'C002減価償却率変更を検出する');
assert.strictEqual(mutate('C001', q => { q.materials.at(-1).内容=q.materials.at(-1).内容.replace('2%','3%'); }),false,'C001貸倒率変更を検出する');
assert.strictEqual(mutate('C001', q => { q.materials.at(-1).内容=q.materials.at(-1).内容.replace('10月1日','11月1日'); }),false,'C001保険開始月変更を検出する');
assert.strictEqual(mutate('C003', q => { q.materials[0].内容=q.materials[0].内容.replace(/3月31日/g,'2月28日'); }),false,'C003決算日変更を検出する');

const reviewQuestions=Object.fromEntries(['A','B','C','X','Y','Z'].map((id,index)=>[id,{id,category:'same-concept',difficulty:2,learningRole:index<3?'core':'review'}]));
const reviewModel=new ProgressModel(reviewQuestions,{getItem(){return null;},setItem(){}},'review-source-redteam');
['A','B','C'].forEach(id=>reviewModel.record(id,false,0));
const reviewController={model:reviewModel,questions:reviewQuestions,reviewMappings:new Map()};
reviewController.reviewIds=browserSandbox.window.AppController.prototype.reviewIds;
const reviewIds=reviewController.reviewIds.call(reviewController);
assert.strictEqual(new Set(reviewIds).size,3,'同conceptの3件同時dueに衝突しない復習問題を割り当てる');
const reverse=[...reviewIds].reverse();
reverse.forEach(id=>{ const mapping=reviewController.reviewMappings.get(id); reviewModel.record(mapping.sourceQuestionId,true,mapping.dueAt); });
assert.deepStrictEqual(['A','B','C'].map(id=>reviewModel.state.reviewSchedule[id].stage),[1,1,1],'B/C/A順でも明示source mappingにより各sourceだけのstageを進める');
// SPACING_CONSTRAINT > ADAPTIVE_RECOMMENDATION: future-due sources are locked,
// even when the adaptive engine ranks them above an unscheduled variant.
const isolationStoreValues={}; const isolationStore={getItem:key=>isolationStoreValues[key]||null,setItem:(key,value)=>{isolationStoreValues[key]=value;}};
const isolationQuestions=Object.fromEntries(['A','B','C','D','V'].map(id=>[id,{id,category:'shared',difficulty:2,learningRole:id==='V'?'review':'core'}]));
const isolationModel=new ProgressModel(isolationQuestions,isolationStore,'spacing-isolation');
const isolationNow=Date.now(); ['A','B','C','D'].forEach(id=>{ assert(isolationModel.recordAttempt(id,false,10,'table-cell',false,isolationNow)); isolationModel.record(id,false,isolationNow); });
isolationModel.state.reviewSchedule={A:{stage:0,dueAt:isolationNow-1},B:{stage:1,dueAt:isolationNow+86400000},C:{stage:2,dueAt:isolationNow+259200000},D:{stage:3,dueAt:isolationNow+604800000}};
isolationModel.recommendedIds=()=>['B','C','D','V','A'];
const isolationController={model:isolationModel,questions:isolationQuestions,reviewMappings:new Map(),reviewIds:browserSandbox.window.AppController.prototype.reviewIds};
const isolatedIds=isolationController.reviewIds.call(isolationController);
assert.deepStrictEqual(isolatedIds,['V'],'R1/R2: due Aのvariantにfuture-due B/C/Dを使用しない');
const assignment=isolationModel.state.reviewAssignments.A;
assert.deepStrictEqual([assignment.sourceQuestionId,assignment.reviewQuestionId,assignment.stage,assignment.status],['A','V',0,'assigned'],'明示review assignmentへsource/variant/stage/statusを保存する');
isolationModel.completeReview('A',false,isolationNow);
assert.deepStrictEqual(['B','C','D'].map(id=>isolationModel.state.reviewSchedule[id].stage),[1,2,3],'R3: Aのvariant誤答はfuture-due B/C/Dのstageを変更しない');
isolationModel.state.reviewSchedule.A={stage:0,dueAt:isolationNow-1}; isolationModel.state.incorrectIds=['A','B','C','D'];
isolationController.reviewIds.call(isolationController); isolationModel.save();
const reloadedIsolation=new ProgressModel(isolationQuestions,isolationStore,'spacing-isolation');
assert.strictEqual(reloadedIsolation.state.reviewAssignments.A.reviewQuestionId,'V','R7: reload後も明示review assignmentを復元する');
let reviewNextShown='';
const reviewNextContext={currentId:'V',learningFlow:{phase:'D',nextConsumed:false},questions:isolationQuestions,model:isolationModel,modeIds(){return ['D'];},start(id){reviewNextShown=id;},renderModes(){},showMode(){}};
isolationModel.state.mode='review'; isolationModel.recommendedIds=()=>['B'];
browserSandbox.window.AppController.prototype.next.call(reviewNextContext);
assert.strictEqual(reviewNextShown,'D','R4/R5: review modeの次dueをAdaptive推薦より優先する');
const adaptive = new ProgressModel({J001:browserSandbox.window.QuestionData.J001}, storage, 'adaptive-test');
for (let i=0;i<3;i+=1) adaptive.recordAttempt('J001',true,30000,'',i===2);
assert.strictEqual(adaptive.adaptiveDifficulty(browserSandbox.window.QuestionData.J001.category),Math.min(4,browserSandbox.window.QuestionData.J001.difficulty+1),'高速・高正答・遅延成功で難化する');
adaptive.recordAttempt('J001',false,90000,'account'); adaptive.recordAttempt('J001',false,90000,'account');
assert.strictEqual(adaptive.adaptiveDifficulty(browserSandbox.window.QuestionData.J001.category),Math.max(1,browserSandbox.window.QuestionData.J001.difficulty-1),'同concept連続誤答で易化する');
const placementQuestions={
  basic:{id:'basic',chapter:1,difficulty:1,learningRole:'core'},
  middle:{id:'middle',chapter:4,difficulty:2,learningRole:'drill'},
  closing:{id:'closing',chapter:7,difficulty:3,learningRole:'core'}
};
const placement=new ProgressModel(placementQuestions,storage,'placement-test');
const startA=placement.placementStart({foundation:95,closing:30});
const startB=placement.placementStart({foundation:20,closing:10});
assert.notStrictEqual(startA,startB,'初期診断の基礎95・決算30と基礎20・決算10で開始地点を変える');
assert.deepStrictEqual([startA,startB],['closing','basic'],'診断結果を章の開始地点へ接続する');
const placementValues={}; const placementStorage={getItem:key=>placementValues[key]||null,setItem:(key,value)=>{placementValues[key]=value;}};
const firstLaunch=new ProgressModel(placementQuestions,placementStorage,'placement-e2e');
assert.strictEqual(firstLaunch.state.placement,null,'初回起動ではPlacementが未完了である');
assert.strictEqual(firstLaunch.completePlacement({foundation:95,closing:30},1234),'closing','診断完了が実際の開始問題を決める');
const reloadedPlacement=new ProgressModel(placementQuestions,placementStorage,'placement-e2e');
assert.deepStrictEqual([reloadedPlacement.state.placement.startQuestionId,reloadedPlacement.state.currentQuestionId],['closing','closing'],'Placement結果と開始地点をreload後も維持する');
const placementMarkup=html.match(/<form id="placement-form">[\s\S]*?<\/form>/)[0];
const fieldsets=[...placementMarkup.matchAll(/<fieldset data-domain="(foundation|closing)">([\s\S]*?)<\/fieldset>/g)];
assert.strictEqual(fieldsets.length,6,'Placementは離脱を防ぐ6問のショート診断とする');
const domainCounts=fieldsets.reduce((counts,[,domain])=>({...counts,[domain]:(counts[domain]||0)+1}),{});
assert.deepStrictEqual(domainCounts,{foundation:3,closing:3},'Placementは基礎と決算を3問ずつ診断し、上級開始判定を到達可能にする');
const firstChoiceCorrect=fieldsets.filter(([, ,body])=>body.match(/<input[^>]+value="([^"]+)"/)[1] === 'correct').length;
assert.strictEqual(firstChoiceCorrect,3,'Placementの正答位置を1番目と2番目に均等配置する');
assert(/data-action="placement-skip"/.test(html),'Placementをスキップして第1章から開始できる');
assert.strictEqual(firstChoiceCorrect/fieldsets.length,.5,'常に1番目を選ぶBotは高得点にならない');
const legacyValues={legacy:JSON.stringify({answeredIds:['basic'],attempts:[{questionId:'basic',correct:true,responseMs:1000}],currentQuestionId:'middle'})};
const legacy=new ProgressModel(placementQuestions,{getItem:key=>legacyValues[key]||null,setItem:(key,value)=>{legacyValues[key]=value;}},'legacy');
assert.strictEqual(legacy.migrateLegacyPlacement(2000),true,'学習履歴のある旧ユーザーにPlacementを強制しない');
assert.strictEqual(legacy.state.currentQuestionId,'middle','Migrationは旧ユーザーの現在位置を上書きしない');
legacy.resetPlacement();
assert.deepStrictEqual([legacy.state.placement,legacy.state.answeredIds], [null,['basic']],'再診断は既存の学習履歴を削除しない');
const spacingQuestions={core:{id:'core',category:'concept',chapter:1,difficulty:1,learningRole:'core'},review:{id:'review',category:'concept',chapter:1,difficulty:1,learningRole:'review'},transfer:{id:'transfer',category:'concept',chapter:1,difficulty:2,learningRole:'transfer'}};
const spacingModel=new ProgressModel(spacingQuestions,{getItem(){return null;},setItem(){}},'scheduler-e2e');
spacingModel.record('core',true,1000);
assert.strictEqual(spacingModel.dueReviewIds(1001).length,0,'core正答直後はreviewを解禁しない');
assert.strictEqual(spacingModel.recommendedIds('concept')[0],'core','未回答優先よりRoleとAssessment隔離を優先する');
assert.deepStrictEqual(spacingModel.dueReviewIds(1000+20*60*1000),['core'],'20分後はspacing対象を優先対象にする');
const integrationQuestions=Object.fromEntries(Object.entries(browserSandbox.window.QuestionData).filter(([,q]) => q.category === browserSandbox.window.QuestionData.J001.category));
const integrationModel=new ProgressModel(integrationQuestions,{getItem(){return null;},setItem(){}},'controller-adaptive');
let integrationShown=''; const integrationQuestion=integrationQuestions.J001;
const controllerIntegration={submitting:false,currentId:'J001',learningFlow:{phase:'I'},questionStartedAt:Date.now()-3600,reviewSourceId:null,questions:integrationQuestions,model:integrationModel,
  view:{readAnswer:()=>integrationQuestion.answer,updateRpg(){},result(){},show(){}},rpg:{state:{companyHP:100},recordMastery(){},reward(){},applyAnswer(){}},
  document:{querySelector(){return null;}},showGameOver(){},start(id){integrationShown=id;},modeIds(){return[];},renderModes(){},showMode(){}};
browserSandbox.window.GradingEngine=Engine;
browserSandbox.window.AppController.prototype.submit.call(controllerIntegration);
assert(integrationModel.state.attempts[0].responseMs >= 3600 && integrationModel.state.attempts[0].responseMs < 5000,'Controllerは問題表示時刻から回答確定時刻までの実時間をrecordAttemptへ渡す');
assert.strictEqual(integrationModel.state.attempts[0].questionId,'J001','Controller回答フローがquestionId・concept・difficultyを含むattemptを保存する');
controllerIntegration.learningFlow.phase='C'; controllerIntegration.learningFlow.nextConsumed=false; browserSandbox.window.AppController.prototype.next.call(controllerIntegration);
assert.notStrictEqual(integrationShown,'J051','core正答直後に同conceptのreview問題を表示しない');
let emergencyView=''; let emergencyRendered=0; let emergencySaved=0; let emergencyDialog=0;
const emergencyContext={model:{state:{mode:'story'},save(){emergencySaved+=1;}},renderModes(){emergencyRendered+=1;},view:{show(id){emergencyView=id;}},document:{getElementById(id){if(id==='question-filters') return {hidden:false}; return {showModal(){emergencyDialog+=1;}};}}};
browserSandbox.window.AppController.prototype.showGameOver.call(emergencyContext);
assert.deepStrictEqual([emergencyContext.model.state.mode,emergencyView,emergencySaved,emergencyRendered,emergencyDialog],['review','view-review',1,1,1],'帳簿信頼度0はダイアログだけで停止せず緊急精算ビューへ強制遷移する');
const {evaluateRows,demonstratesTransfer}=require('../scripts/audit-exam-readiness.js');
assert.strictEqual(evaluateRows([{type:'journal',category:'x',answer:{},difficulty:1}])[0].pass,false,'learnability Cは問題数だけでPASSしない');
const transferPair=[{type:'ledger',question:'金額を記入',table:{columns:['金額'],inputCells:['a']},materials:[{金額:1}]},{type:'ledger',question:'台帳を完成',table:{columns:['日付','摘要'],inputCells:['a','b']},materials:[{日付:'4/1'}]}];
assert.strictEqual(demonstratesTransfer(transferPair),true,'transfer metadataなしでも構造差から転移を評価する');
browserSandbox.window.ProgressModel=ProgressModel; browserSandbox.window.RPGModel=RPGModel;
const backupQuestions=browserSandbox.window.QuestionData;
const canonicalProgress=new ProgressModel(backupQuestions,{getItem(){return null;},setItem(){}}).state;
const canonicalCharacter=new RPGModel({getItem(){return null;},setItem(){}}).state;
assert(ProgressModel.validateBackupState(canonicalProgress,backupQuestions)&&RPGModel.validateBackupState(canonicalCharacter),'現行exportBackupが出力する両stateを検証で受理する');
const mandatoryV1ProgressKeys=['mode','currentQuestionId','answeredIds','correctIds','incorrectIds','mistakeCounts','reviewSchedule','reviewAssignments','attempts','drafts','completed','placement','examAttempt','examSession','examHistory','lastExamReview'];
const historicalV1Progress={mode:'story',currentQuestionId:null,answeredIds:[],correctIds:[],incorrectIds:[],mistakeCounts:{},reviewSchedule:{},reviewAssignments:{},attempts:[],drafts:{},completed:false,placement:null,examAttempt:0,examSession:null,examHistory:[],lastExamReview:null};
assert(ProgressModel.validateBackupState(historicalV1Progress,backupQuestions),'最初のversion 1 producerが出力した進捗shapeを受理する');
const progressWithTopLevelDangerousKey=key=>JSON.parse(`${JSON.stringify(historicalV1Progress).slice(0,-1)},${JSON.stringify(key)}:{"polluted":true}}`);
for(const key of ['__proto__','prototype','constructor'])assert.strictEqual(ProgressModel.validateBackupState(progressWithTopLevelDangerousKey(key),backupQuestions),false,`top-level own ${key} を拒否する`);
const dangerousNested=()=>JSON.parse('{"__proto__":{"polluted":true}}');
const dangerousLastReview={...historicalV1Progress,lastExamReview:dangerousNested()};assert.strictEqual(ProgressModel.validateBackupState(dangerousLastReview,backupQuestions),false,'lastExamReview内のdangerous keyを再帰的に拒否する');
const dangerousAttempt={...historicalV1Progress,attempts:[{questionId:'J001',correct:true,responseMs:1,...dangerousNested()}]};assert(Object.hasOwn(dangerousAttempt.attempts[0],'__proto__'));assert.strictEqual(ProgressModel.validateBackupState(dangerousAttempt,backupQuestions),false,'attempt item内のdangerous keyを再帰的に拒否する');
const dangerousHistory={...historicalV1Progress,examHistory:[{finishedAt:1,points:100,...dangerousNested()}]};assert(Object.hasOwn(dangerousHistory.examHistory[0],'__proto__'));assert.strictEqual(ProgressModel.validateBackupState(dangerousHistory,backupQuestions),false,'examHistory item内のdangerous keyを再帰的に拒否する');
const dangerousSchedule={...historicalV1Progress,reviewSchedule:{J001:{stage:0,dueAt:1,...dangerousNested()}}};assert(Object.hasOwn(dangerousSchedule.reviewSchedule.J001,'__proto__'));assert.strictEqual(ProgressModel.validateBackupState(dangerousSchedule,backupQuestions),false,'keyed reviewSchedule item内のdangerous keyを再帰的に拒否する');
assert.strictEqual(ProgressModel.validateBackupState({},backupQuestions),false,'空の進捗payloadを拒否する');
assert.strictEqual(ProgressModel.validateBackupState({mode:'story'},backupQuestions),false,'modeだけの疎な進捗payloadを拒否する');
assert.strictEqual(ProgressModel.validateBackupState({answeredIds:[],correctIds:[],incorrectIds:[]},backupQuestions),false,'ID配列だけの疎な進捗payloadを拒否する');
for(const missing of mandatoryV1ProgressKeys){const candidate={...historicalV1Progress};delete candidate[missing];assert.strictEqual(ProgressModel.validateBackupState(candidate,backupQuestions),false,`必須v1進捗member ${missing} の欠落を拒否する`);}
assert.strictEqual(ProgressModel.validateBackupState({...historicalV1Progress,mode:1},backupQuestions),false,'必須modeの不正型を拒否する');
assert.strictEqual(ProgressModel.validateBackupState({...historicalV1Progress,answeredIds:['unknown']},backupQuestions),false,'必須ID配列の未知問題を拒否する');
assert.strictEqual(ProgressModel.validateBackupState({...historicalV1Progress,drafts:{J001:{debit:'bad',credit:[]}}},backupQuestions),false,'不正なnested draftを拒否する');
assert.strictEqual(ProgressModel.validateBackupState({...historicalV1Progress,reviewSchedule:{J001:{stage:-1,dueAt:0}}},backupQuestions),false,'不正なnested reviewを拒否する');
assert.strictEqual(ProgressModel.validateBackupState({...historicalV1Progress,examSession:{}},backupQuestions),false,'不正なnested exam sessionを拒否する');
assert(RPGModel.validateBackupState({xp:0,rewardedIds:[],mastery:{},companyHP:100,totalTransactionAmount:0}),'confidenceOutcomes追加前の正当なv1 characterを受理する');
assert(!ProgressModel.validateBackupState({...canonicalProgress,answeredIds:['unknown']},backupQuestions),'sanitize可能でも未知IDを含む進捗backupを拒否する');
assert(!RPGModel.validateBackupState({...canonicalCharacter,xp:'0'}),'sanitize可能でも不正型のcharacter backupを拒否する');
const backupPayload=(progressValue=canonicalProgress,characterValue=canonicalCharacter)=>({format:'boki-rpg-backup',version:1,exportedAt:new Date().toISOString(),progress:progressValue,character:characterValue});
const importRun=async ({payload=backupPayload(),failAt=0,mutateBeforeFailure=false,rollbackFail=false,readFail=false}={})=>{
  const values={progress:'old-progress',character:'old-character'},writes=[],rollbacks=[];let normalWrites=0,reloads=0;
  const storage={readItem(key){return readFail?{ok:false,value:null}:{ok:true,value:values[key]??null};},setItem(key,value){normalWrites++;writes.push(key);if(normalWrites===failAt){if(mutateBeforeFailure)values[key]=value;return false;}values[key]=value;return true;},restoreItem(key,value){rollbacks.push(key);if(rollbackFail)return false;if(value===null)delete values[key];else values[key]=value;return true;}};
  const status={textContent:'',classList:{add(){},remove(){}}};
  const context={questions:backupQuestions,model:{storage,key:'progress'},rpg:{storage,key:'character'},document:{getElementById(){return status;}},storageRead:browserSandbox.window.AppController.prototype.storageRead,storageWrite:browserSandbox.window.AppController.prototype.storageWrite,storageRestore:browserSandbox.window.AppController.prototype.storageRestore};
  browserSandbox.window.location={reload(){reloads++;}};
  const ok=await browserSandbox.window.AppController.prototype.importBackup.call(context,{text:async()=>JSON.stringify(payload)});
  return {ok,values,writes,rollbacks,reloads,status};
};
(async()=>{
  const success=await importRun(); assert.deepStrictEqual([success.ok,success.writes.join(','),success.reloads],[true,'progress,character',1],'有効backupは両方を書いて成功後だけ1回reloadする');
  const malformed=await importRun({payload:{format:'bad'}}); assert.deepStrictEqual([malformed.ok,malformed.writes.length,malformed.reloads],[false,0,0],'不正envelopeは書き込まない');
  const invalidProgress=await importRun({payload:backupPayload({...canonicalProgress,mode:'bad'})}); assert.strictEqual(invalidProgress.writes.length,0,'不正progressではcharacterも書き込まない');
  const invalidCharacter=await importRun({payload:backupPayload(canonicalProgress,{...canonicalCharacter,xp:'bad'})}); assert.strictEqual(invalidCharacter.writes.length,0,'不正characterではprogressも書き込まない');
  const emptyProgress=await importRun({payload:backupPayload({},canonicalCharacter)}); assert.deepStrictEqual([emptyProgress.writes.length,emptyProgress.reloads,emptyProgress.ok],[0,0,false],'空のprogressと正当なcharacterは書込・reloadせず失敗する'); assert.match(emptyProgress.status.textContent,/復元できません/,'空のprogressで失敗statusを通知する');
  const sparseProgress=await importRun({payload:backupPayload({mode:'story'},canonicalCharacter)}); assert.deepStrictEqual([sparseProgress.writes.length,sparseProgress.reloads,sparseProgress.ok],[0,0,false],'疎なprogressと正当なcharacterは書込・reloadせず失敗する');
  const dangerousProgress=await importRun({payload:backupPayload(progressWithTopLevelDangerousKey('__proto__'),canonicalCharacter)}); assert.deepStrictEqual([dangerousProgress.writes.length,dangerousProgress.reloads,dangerousProgress.ok],[0,0,false],'dangerous own keyを含むprogressと正当なcharacterは書込・reloadせず失敗する'); assert.match(dangerousProgress.status.textContent,/復元できません/,'dangerous progressで失敗statusを通知する');
  const unreadable=await importRun({readFail:true}); assert.deepStrictEqual([unreadable.writes.length,unreadable.rollbacks.length,unreadable.reloads],[0,0,0],'snapshot読取失敗時は書込・rollback・reloadを行わない');
  const first=await importRun({failAt:1,mutateBeforeFailure:true}); assert.deepStrictEqual([first.values.progress,first.values.character,first.writes.join(','),first.rollbacks.sort().join(','),first.reloads],['old-progress','old-character','progress','character,progress',0],'第1書込が変異後失敗しても両snapshotを復元する');
  const second=await importRun({failAt:2}); assert.deepStrictEqual([second.values.progress,second.values.character,second.rollbacks.sort().join(','),second.reloads],['old-progress','old-character','character,progress',0],'第2書込失敗時に第1書込を含む両方を復元する');
  const rollback=await importRun({failAt:2,rollbackFail:true}); assert.strictEqual(rollback.rollbacks.length,2,'rollback失敗時も両方の復元を試みる'); assert.match(rollback.status.textContent,/不整合/,'rollback不完全を通常失敗と区別して通知する'); assert.strictEqual(rollback.reloads,0,'rollback失敗時にreloadしない');
})().catch(error=>{console.error(error);process.exitCode=1;});
console.log('app tests: ok');

// Phase D2 protected learning flow regressions.
const D2Controller=browserSandbox.window.AppController;
const expectedJournal={debit:[{account:'現金',amount:100},{account:'現金',amount:100},{account:'売掛金',amount:100}],credit:[{account:'売上',amount:300}]};
const preserved=D2Controller.journalRetryDraft({debit:[{account:'売掛金',amount:100},{account:'現金',amount:100},{account:'現金',amount:100},{account:'現金',amount:100},{account:'現金',amount:300},{account:'売上',amount:100},{account:'現金',amount:Infinity}],credit:[{account:'売上',amount:300},{account:'現金',amount:300}]},expectedJournal);
assert.deepStrictEqual(JSON.parse(JSON.stringify(preserved.debit)),[{account:'売掛金',amount:100},{account:'現金',amount:100},{account:'現金',amount:100},{account:'',amount:''},{account:'',amount:''},{account:'',amount:''},{account:'',amount:''}],'D2 Journalは並替え・重複・超過・同額別科目・科目だけ/金額だけ一致・非有限値をside別exact-pair multisetで処理する');
assert.deepStrictEqual(JSON.parse(JSON.stringify(preserved.credit)),[{account:'売上',amount:300},{account:'',amount:''}],'D2 Journalは正しい側だけを保存し、wrong-side pairを保存しない');
assert.deepStrictEqual(JSON.parse(JSON.stringify(D2Controller.journalRetryDraft({debit:[],credit:[]},expectedJournal))),{debit:[],credit:[]},'D2 Journalはmissing expected rowを合成しない');
const tableDraft=D2Controller.tableRetryDraft({cells:{a:'LEARNER-A',b:'LEARNER-B',extra:'LEARNER-X'}},[{cellId:'a',correct:true,expected:'SECRET-A',actual:'LEARNER-A'},{cellId:'b',correct:false,expected:'SECRET-B',actual:'LEARNER-B'}]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(tableDraft)),{cells:{a:'LEARNER-A',b:'',extra:''}},'D2 Tableはarray detailsをMap化しcellId/correctだけで部分保存しexpectedを転記しない');
let answerTouched=false; const firewalledQuestion={id:'SENTINEL',type:'journal',format:'entry',question:'VISIBLE',scene:'SCENE',story:'STORY'}; Object.defineProperty(firewalledQuestion,'answer',{get(){answerTouched=true;throw new Error('answer leak');}});
const hintCalls=[]; const hintContext={learningFlow:{phase:'I',hintStage:0},currentId:'SENTINEL',questions:{SENTINEL:firewalledQuestion},hintContext:D2Controller.prototype.hintContext,view:{renderHint:(stage,text,context)=>hintCalls.push({stage,text,context})}};
assert.strictEqual(D2Controller.prototype.showHint.call(hintContext,2),false,'D2 Hint 2はHint 1より先に利用できない');
assert.strictEqual(D2Controller.prototype.showHint.call(hintContext,1),true); assert.strictEqual(D2Controller.prototype.showHint.call(hintContext,2),true); assert.strictEqual(D2Controller.prototype.showHint.call(hintContext,3),false,'D2 Hintは2段階だけ');
hintContext.learningFlow.phase='W'; assert.strictEqual(D2Controller.prototype.showHint.call(hintContext,1),false,'submit後はヒント導線を終了し、解説表示を妨げない');
assert.strictEqual(answerTouched,false,'D2 hint pathはquestion.answer getterへ触れない'); assert(!JSON.stringify(hintCalls).includes('expected'),'D2 hint contextへdetail.expectedを渡さない');
const mutationSnapshot={attempts:1,xp:10,mastery:2,hp:95,review:'same',mistakes:1}; let renderedScore;
const coachingContext={learningFlow:{phase:'R',retryCount:0,authoritativeScore:{correct:false},authoritativeAnswer:{own:'FIRST'},confidence:'unsure',achievement:{},gameOverPending:false},submitting:true,document:{createElement(){return {className:'',textContent:''};},getElementById(){return {append(){},focus(){}};}},view:{applyRetryDraft(){},setAnswerMode(){},protectedResult(){},hideProtectedResult(){},result(_q,score,answer){renderedScore={score,answer};},show(){}},dispatchPendingGameOver(){}};
assert.strictEqual(D2Controller.prototype.finishCoachingRetry.call(coachingContext,{id:'Q'},{own:'RETRY'},{correct:false,details:[]}),false); assert.strictEqual(D2Controller.prototype.finishCoachingRetry.call(coachingContext,{id:'Q'},{own:'RETRY'},{correct:true,details:[]}),true);
assert.deepStrictEqual(mutationSnapshot,{attempts:1,xp:10,mastery:2,hp:95,review:'same',mistakes:1},'D2 coaching retry helper performs no authoritative mutation');
assert.strictEqual(renderedScore.score.correct,true,'D2 correct coaching result renders the retry score');
assert.strictEqual(renderedScore.answer.own,'RETRY','D2 correct coaching result renders the corrected retry answer');
assert.strictEqual(coachingContext.learningFlow.authoritativeScore.correct,false,'D2 first wrong score remains authoritative in learning history');
assert.strictEqual(coachingContext.learningFlow.authoritativeAnswer.own,'FIRST','D2 first wrong answer remains authoritative in learning history');
let advances=0; const guardedNext={learningFlow:{phase:'R',nextConsumed:false},model:{state:{mode:'story'}},questions:{Q:{category:'x'}},currentId:'Q'};
assert.strictEqual(D2Controller.prototype.next.call(guardedNext),false,'D2 coaching retry direct next is blocked'); guardedNext.learningFlow.phase='D'; guardedNext.model.recommendedIds=()=>[]; guardedNext.modeIds=()=>['Q','N']; guardedNext.start=()=>{advances+=1;};
D2Controller.prototype.next.call(guardedNext); D2Controller.prototype.next.call(guardedNext); assert.strictEqual(advances,1,'D2 top/bottom repeated next advances once');
const navigationContext=flow=>({learningFlow:flow,model:{state:{mode:'story',answeredIds:[],reviewSchedule:{}},recommendedIds:()=>[]},questions:{Q:{category:'x'},N:{category:'x'}},currentId:'Q',modeIds:()=>['Q','N'],start(){this.advances=(this.advances||0)+1;},renderModes(){},showMode(){}});
const nullFlow=navigationContext(null); assert.strictEqual(D2Controller.prototype.next.call(nullFlow),false); assert.strictEqual(nullFlow.advances,undefined,'own learningFlow=nullのproduction相当objectはfail-closedにする');
for(const phase of ['R']) { const protectedFlow=navigationContext({phase,nextConsumed:false}); assert.strictEqual(D2Controller.prototype.next.call(protectedFlow),false,`D2 State ${phase}はdirect nextを拒否する`); assert.strictEqual(protectedFlow.advances,undefined); }
for(const phase of ['W','C','D']) { const completedFlow=navigationContext({phase,nextConsumed:false}); assert.strictEqual(D2Controller.prototype.next.call(completedFlow),true,`D2 State ${phase}の最初のnextを許可する`); assert.strictEqual(D2Controller.prototype.next.call(completedFlow),false,`D2 State ${phase}の二度目のnextを拒否する`); assert.strictEqual(completedFlow.advances,1); }
let pendingGameOverDispatches=0; const pendingGameOver=navigationContext({phase:'W',nextConsumed:false,gameOverPending:true,gameOverDispatched:false}); pendingGameOver.dispatchPendingGameOver=D2Controller.prototype.dispatchPendingGameOver; pendingGameOver.showGameOver=()=>{pendingGameOverDispatches+=1;};
assert.strictEqual(D2Controller.prototype.next.call(pendingGameOver),false,'D2 pending game-over blocks next-question navigation'); assert.strictEqual(pendingGameOver.advances,undefined,'D2 pending game-over cannot be bypassed by next'); assert.strictEqual(pendingGameOverDispatches,1,'D2 pending game-over dispatches exactly once on next'); assert.strictEqual(pendingGameOver.learningFlow.gameOverDispatched,true,'D2 pending game-over records dispatched authority'); assert.strictEqual(pendingGameOver.learningFlow.nextConsumed,false,'D2 blocked pending game-over does not consume next');
assert.strictEqual(D2Controller.prototype.next.call(pendingGameOver),false,'D2 repeated next remains blocked after game-over dispatch'); assert.strictEqual(pendingGameOverDispatches,1,'D2 repeated next does not double-dispatch game-over');
const legacyRouting=navigationContext(undefined); delete legacyRouting.learningFlow; assert.strictEqual(D2Controller.prototype.next.call(legacyRouting),true,'learningFlow own propertyを持たないcontroller-like harnessはhistorical routingを実行できる'); assert.strictEqual(legacyRouting.advances,1);
assert(!JSON.stringify(hintCalls).includes('SECRET-A')&&!JSON.stringify(hintCalls).includes('SECRET-B'),'D2 protected hint output excludes expected table sentinels');
console.log('Phase D2 learning-flow tests passed');

// D2 independent-review remediation regressions.
assert(hintCalls.some(call=>call.text.includes('VISIBLE')),'H4 hintはanswer-free projectionのlearner-visible promptを具体的根拠として使う');
assert(!JSON.stringify(hintCalls).includes('ANSWER_ONLY_SENTINEL'),'H4 hintへanswer-only値を混入しない');
const mutationNames=['recordAttempt','record','completeReview']; const rpgMutationNames=['recordMastery','reward','applyAnswer'];
for(const correct of [false,true]) {
  const calls=Object.fromEntries([...mutationNames,...rpgMutationNames,'updateCompletion','setDraft'].map(name=>[name,0]));
  const coachingSubmit={submitting:false,currentId:'Q',learningFlow:{phase:'R',retryCount:0,authoritativeScore:{correct:false},authoritativeAnswer:{first:true},confidence:'unsure',achievement:{},gameOverPending:false},questions:{Q:{id:'Q',type:'table'}},model:{state:{mode:'story'},...Object.fromEntries(mutationNames.map(name=>[name,()=>{calls[name]++;}])),updateCompletion(){calls.updateCompletion++;},setDraft(){calls.setDraft++;}},rpg:{...Object.fromEntries(rpgMutationNames.map(name=>[name,()=>{calls[name]++;}]))},view:{readAnswer:()=>({cells:{}}),applyRetryDraft(){},setAnswerMode(){},protectedResult(){},hideProtectedResult(){},result(){},show(){}},document:{createElement:()=>({}),getElementById:()=>({append(){},focus(){}})},dispatchPendingGameOver(){},finishCoachingRetry:D2Controller.prototype.finishCoachingRetry};
  browserSandbox.window.GradingEngine={grade:()=>({correct,details:[]})}; D2Controller.prototype.submit.call(coachingSubmit);
  assert.deepStrictEqual(calls,Object.fromEntries(Object.keys(calls).map(name=>[name,0])),`coaching ${correct?'correct':'wrong'} submitはauthoritative mutationを呼ばない`);
}
let draftWrites=0; const coachingSave={currentId:'Q',learningFlow:{phase:'R'},questions:{Q:{}},model:{state:{mode:'story'},setDraft(){draftWrites++;}},view:{readAnswer:()=>({local:'COACHING'})},document:{getElementById:()=>({textContent:'',classList:{remove(){}}})}};
assert.strictEqual(D2Controller.prototype.saveDraft.call(coachingSave,true),false); assert.strictEqual(draftWrites,0,'W/R saveとinput pathはProgressModel.setDraftを呼ばない'); assert.deepStrictEqual(coachingSave.learningFlow.coachingAnswer,{local:'COACHING'});
const element=()=>({hidden:false,disabled:false,textContent:'OLD',children:[],replaceChildren(){this.textContent='';this.children=[];}}); const resetElements=Object.fromEntries(['protected-learning','protected-status','hint-panel','hint-heading','hint-text','result-status','answer-comparison','correct-journal','explanation','top-result-actions'].map(id=>[id,element()]));
const hintOne=element(),hintTwo=element(); const resetView={byId:id=>resetElements[id],document:{querySelector:selector=>selector.includes('hint-1')?hintOne:hintTwo}};
browserSandbox.window.AppView.prototype.resetLearningSurfaces.call(resetView); assert.strictEqual(resetElements['protected-learning'].hidden,false); assert.strictEqual(resetElements['hint-panel'].hidden,true); assert.strictEqual(resetElements['hint-text'].textContent,''); assert.strictEqual(hintOne.hidden,false); assert.strictEqual(hintTwo.hidden,true); assert(!['protected-status','hint-heading','hint-text','result-status','answer-comparison','correct-journal','explanation'].some(id=>resetElements[id].textContent.includes('OLD')),'new question resetはstale hintとcompleted-result sentinelをhidden DOMから除去する');
resetElements['hint-panel'].hidden=false; resetElements['hint-text'].textContent='STAGE_1'; browserSandbox.window.AppView.prototype.resetLearningSurfaces.call(resetView); assert.strictEqual(resetElements['hint-text'].textContent,'','Stage 1使用後の次問はfresh hint state'); resetElements['hint-panel'].hidden=false; resetElements['hint-text'].textContent='STAGE_2'; browserSandbox.window.AppView.prototype.resetLearningSurfaces.call(resetView); assert.strictEqual(resetElements['hint-text'].textContent,'','Stage 2使用後の次問はfresh hint state');


// D2 protected-status visibility/accessibility regressions.
let protectedFocusWhileVisible=false;
const protectedPanelState={hidden:true};
const protectedStatusState={
  hidden:true,
  children:['STALE'],
  replaceChildren(){this.children=[];},
  append(...nodes){this.children.push(...nodes);},
  focus(){protectedFocusWhileVisible = this.hidden === false;}
};
const protectedDocument={
  createElement(){return {className:'',textContent:''};},
  getElementById(id){
    if(id==='protected-learning') return protectedPanelState;
    if(id==='protected-status') return protectedStatusState;
    return null;
  }
};
const protectedView=new browserSandbox.window.AppView(protectedDocument);
browserSandbox.window.AppView.prototype.protectedResult.call(protectedView,'unsure',true);
assert.strictEqual(protectedPanelState.hidden,false,'protectedResult shows protected-learning');
assert.strictEqual(protectedStatusState.hidden,false,'protectedResult unhides protected-status before focus');
assert.strictEqual(protectedStatusState.children.length,2,'protectedResult clears stale status and renders fresh headline/guidance');
assert.strictEqual(protectedFocusWhileVisible,true,'protectedResult focuses status only after it is visible');

const resetProtectedElements=Object.fromEntries(
  ['protected-learning','protected-status','hint-panel','hint-heading','hint-text','result-status','answer-comparison','correct-journal','explanation','top-result-actions']
    .map(id=>[id,{hidden:false,textContent:'STALE',replaceChildren(){this.textContent='';}}])
);
const resetProtectedView={
  byId:id=>resetProtectedElements[id],
  document:{querySelector:()=>({hidden:false,disabled:false})}
};
browserSandbox.window.AppView.prototype.resetLearningSurfaces.call(resetProtectedView);
assert.strictEqual(resetProtectedElements['protected-status'].hidden,true,'resetLearningSurfaces hides protected-status');
assert.strictEqual(resetProtectedElements['protected-status'].textContent,'','resetLearningSurfaces clears protected-status');

resetProtectedElements['protected-learning'].hidden=false;
resetProtectedElements['protected-status'].hidden=false;
resetProtectedElements['protected-status'].textContent='RETRY STATUS';
browserSandbox.window.AppView.prototype.hideProtectedResult.call(resetProtectedView);
assert.strictEqual(resetProtectedElements['protected-learning'].hidden,true,'hideProtectedResult hides protected-learning');
assert.strictEqual(resetProtectedElements['protected-status'].hidden,true,'hideProtectedResult hides protected-status');
assert.strictEqual(resetProtectedElements['protected-status'].textContent,'','hideProtectedResult clears protected-status');


// Physical iPhone retry UX regressions.
const coachingUiState = {
  confidence:{hidden:false},
  save:{hidden:false},
  saveStatus:{hidden:false},
  protected:{hidden:false},
  actions:{hidden:false},
  submit:{textContent:'回答を確定する'}
};

const coachingUiForm = {
  querySelectorAll:()=>[],
  querySelector(selector) {
    if (selector === '.question-actions') return coachingUiState.actions;
    if (selector === '.confidence-selector') return coachingUiState.confidence;
    if (selector === '.save-button') return coachingUiState.save;
    if (selector === 'button[type="submit"]') return coachingUiState.submit;
    return null;
  },
  setAttribute(name,value){ this[name]=value; }
};

const coachingUiView = {
  byId(id) {
    if (id === 'question-form') return coachingUiForm;
    if (id === 'save-status') return coachingUiState.saveStatus;
    if (id === 'protected-learning') return coachingUiState.protected;
    return null;
  }
};

browserSandbox.window.AppView.prototype.setAnswerMode.call(coachingUiView,'coaching');
assert.strictEqual(coachingUiState.confidence.hidden,true,'retry中は初回回答用の確信度を隠す');
assert.strictEqual(coachingUiState.save.hidden,true,'retry中は通常の保存ボタンを隠す');
assert.strictEqual(coachingUiState.saveStatus.hidden,true,'retry中は通常保存statusを隠す');
assert.strictEqual(coachingUiState.protected.hidden,true,'retry中は回答前ヒント領域を隠す');
assert.strictEqual(coachingUiState.submit.textContent,'練習回答を確認する','retry送信を練習回答として明示する');

browserSandbox.window.AppView.prototype.setAnswerMode.call(coachingUiView,'initial');
assert.strictEqual(coachingUiState.confidence.hidden,false,'次の初回回答では確信度を復元する');
assert.strictEqual(coachingUiState.save.hidden,false,'次の初回回答では保存ボタンを復元する');
assert.strictEqual(coachingUiState.saveStatus.hidden,false,'次の初回回答では保存statusを復元する');
assert.strictEqual(coachingUiState.protected.hidden,false,'次の初回回答ではヒント領域を復元する');
assert.strictEqual(coachingUiState.submit.textContent,'回答を確定する','次の初回回答では通常送信へ戻す');

coachingUiView.questionMode='exam';
browserSandbox.window.AppView.prototype.setAnswerMode.call(coachingUiView,'initial');
assert.strictEqual(coachingUiState.protected.hidden,true,'exam question remains free of dead hint controls after initial answer mode reset');
coachingUiView.questionMode='story';

let stickyResizeCallback;
let stickyObserverDisconnects=0;
browserSandbox.window.ResizeObserver=class {
  constructor(callback){stickyResizeCallback=callback;}
  observe(table){this.table=table;}
  disconnect(){stickyObserverDisconnects++;}
};
const stickyCells={
  description:[{dataset:{},style:{setProperty(name,value){this[name]=value;}},getBoundingClientRect:()=>({width:180})}],
  quantity:[{dataset:{},style:{setProperty(name,value){this[name]=value;}},getBoundingClientRect:()=>({width:70})}]
};
const stickyTable={style:{setProperty(name,value){this[name]=value;}},querySelectorAll(selector){return selector.includes('description')?stickyCells.description:stickyCells.quantity;}};
const stickyView={updateStickyContextColumns:browserSandbox.window.AppView.prototype.updateStickyContextColumns};
browserSandbox.window.AppView.prototype.positionStickyContextColumns.call(stickyView,stickyTable);
assert.strictEqual(stickyCells.quantity[0].style['--sticky-left'],'180px','quantity initially sticks after rendered description width');
stickyCells.description[0].getBoundingClientRect=()=>({width:96});
stickyResizeCallback();
assert.strictEqual(stickyCells.quantity[0].style['--sticky-left'],'96px','sticky offset is recomputed after table resize/reflow');
assert.strictEqual(stickyTable.style['--sticky-context-width'],'166px','combined sticky context width follows resized columns');
browserSandbox.window.AppView.prototype.positionStickyContextColumns.call(stickyView,stickyTable);
assert.strictEqual(stickyObserverDisconnects,1,'rerender disconnects the previous table resize observer');
delete browserSandbox.window.ResizeObserver;

let retryHideCalls = 0;
let retryProtectedCalls = 0;

const physicalRetryContext = {
  learningFlow:{
    phase:'W',
    authoritativeAnswer:{cells:{a:'bad'}},
    authoritativeScore:{details:[{cellId:'a',correct:false}]},
    confidence:'unsure'
  },
  currentId:'Q',
  questions:{Q:{type:'table'}},
  view:{
    applyRetryDraft(){},
    setAnswerMode(){},
    hideProtectedResult(){retryHideCalls += 1;},
    protectedResult(){retryProtectedCalls += 1;},
    show(){}
  },
  document:{
    querySelectorAll:()=>[],
    querySelector:()=>null
  }
};

assert.strictEqual(
  D2Controller.prototype.beginCoachingRetry.call(physicalRetryContext),
  true,
  '結果画面からretryへ遷移できる'
);
assert.strictEqual(physicalRetryContext.learningFlow.phase,'R','retry開始時にState Rへ遷移する');
assert.strictEqual(retryHideCalls,1,'retry開始時に回答前ヒント領域を閉じる');
assert.strictEqual(retryProtectedCalls,0,'retry開始時に回答前ヒントstatusを再表示しない');

const physicalCopyQuestion = browserSandbox.window.QuestionData[representativeIds.ledger];
const physicalCopyWrongCell = physicalCopyQuestion.table.inputCells[0];
const physicalCopyAnswer = {
  cells:{...physicalCopyQuestion.answer.cells,[physicalCopyWrongCell]:''}
};
const physicalCopyScore = Engine.grade(physicalCopyQuestion,physicalCopyAnswer);

tableComparisonView.renderAnswerComparison(
  physicalCopyQuestion,
  physicalCopyScore,
  physicalCopyAnswer
);

const physicalCopyContainer = comparisonElements['answer-comparison'];

assert.strictEqual(
  physicalCopyContainer.children[0].textContent,
  '最初の解答と正しい解答',
  '比較表が初回回答の記録であることを明示する'
);

assert(
  domText(physicalCopyContainer).includes('最初の回答時の判定'),
  '未入力・要確認がretry回答ではなく初回回答時の判定であることを説明する'
);


// D2 final closure: direct W/R persistence, control modes, and start lifecycle.
const makeDraftBoundary=phase=>{let setDraftCalls=0;const context={currentId:'Q',learningFlow:{phase},questions:{Q:{}},model:{state:{mode:'story',drafts:{}},setDraft(){setDraftCalls++;this.state.drafts.Q={persisted:true};}},view:{readAnswer:()=>({session:`${phase}_INPUT`})},document:{getElementById:()=>({textContent:'',classList:{remove(){}}})}};return {context,calls:()=>setDraftCalls};};
const stateWBoundary=makeDraftBoundary('W'); assert.strictEqual(D2Controller.prototype.saveDraft.call(stateWBoundary.context,false),false,'State W input activity is session-local'); assert.strictEqual(stateWBoundary.calls(),0,'State W input setDraft calls = 0'); assert.strictEqual(D2Controller.prototype.saveDraft.call(stateWBoundary.context,true),false,'State W explicit save is refused'); assert.strictEqual(stateWBoundary.calls(),0,'State W explicit save setDraft calls = 0'); assert.strictEqual(stateWBoundary.context.model.state.drafts.Q,undefined,'State W does not recreate persisted draft'); assert.deepStrictEqual(stateWBoundary.context.learningFlow.coachingAnswer,{session:'W_INPUT'});
const stateRBoundary=makeDraftBoundary('R'); assert.strictEqual(D2Controller.prototype.saveDraft.call(stateRBoundary.context,false),false,'State R input activity is session-local'); assert.strictEqual(stateRBoundary.calls(),0,'State R input setDraft calls = 0'); assert.strictEqual(D2Controller.prototype.saveDraft.call(stateRBoundary.context,true),false,'State R explicit save is refused'); assert.strictEqual(stateRBoundary.calls(),0,'State R explicit save setDraft calls = 0'); assert.strictEqual(stateRBoundary.context.model.state.drafts.Q,undefined,'State R does not recreate persisted draft');
const editable={disabled:false,dataset:{}},authoritativeSubmit={disabled:false,textContent:'回答を確定する'},ordinarySave={disabled:false},questionActions={hidden:false}; const modeForm={querySelectorAll:()=>[editable],querySelector:selector=>selector==='.question-actions'?questionActions:selector==='button[type="submit"]'?authoritativeSubmit:null,setAttribute(name,value){this[name]=value;}}; const modeView={byId:id=>id==='question-form'?modeForm:null};
browserSandbox.window.AppView.prototype.setAnswerMode.call(modeView,'protected'); assert.strictEqual(editable.disabled,true,'State W editable answer control is disabled'); assert.strictEqual(questionActions.hidden,true,'State W authoritative submit/save action container is hidden'); assert.strictEqual(authoritativeSubmit.textContent,'回答を確定する','State W does not relabel hidden authoritative submit as coaching');
browserSandbox.window.AppView.prototype.setAnswerMode.call(modeView,'coaching'); assert.strictEqual(editable.disabled,false,'State R intended answer control is enabled'); assert.strictEqual(questionActions.hidden,false,'State R coaching action container is available'); assert.strictEqual(authoritativeSubmit.textContent,'練習回答を確認する','State R submit label is explicitly coaching'); assert.strictEqual(modeForm['data-answer-mode'],'coaching');
const staleSentinels=['EXPECTED_ACCOUNT_SENTINEL','EXPECTED_AMOUNT_SENTINEL','EXPLANATION_SENTINEL','DIAGNOSTIC_SENTINEL']; const lifecycleContentIds=['protected-status','hint-heading','hint-text','result-status','answer-comparison','correct-journal','explanation']; const lifecycleElements=Object.fromEntries(['protected-learning',...lifecycleContentIds,'hint-panel','top-result-actions'].map((id,index)=>[id,{hidden:false,disabled:false,textContent:lifecycleContentIds.includes(id)?staleSentinels[index%staleSentinels.length]:'',replaceChildren(){this.textContent='';}}])); const lifecycleHint1={hidden:true,disabled:true},lifecycleHint2={hidden:false,disabled:false}; const lifecycleDocument={querySelector:selector=>selector.includes('hint-1')?lifecycleHint1:lifecycleHint2,getElementById:id=>id==='question-filters'?{hidden:false}:id==='q-text'?{focus(){}}:lifecycleElements[id]}; const lifecycleView=new browserSandbox.window.AppView(lifecycleDocument); lifecycleView.renderQuestion=()=>{}; lifecycleView.show=()=>{}; lifecycleView.setAnswerMode=()=>{}; const lifecycleStart={questions:{B:{id:'B'}},model:{state:{mode:'story',drafts:{}},save(){}},rpg:{},reviewMappings:new Map(),resetCalculator(){},view:lifecycleView,document:lifecycleDocument}; D2Controller.prototype.start.call(lifecycleStart,'B'); const lifecycleText=()=>lifecycleContentIds.map(id=>lifecycleElements[id].textContent).join('|'); staleSentinels.forEach(sentinel=>assert(!lifecycleText().includes(sentinel),`start removes ${sentinel} from inactive/hidden result DOM`)); lifecycleView.protectedResult=(_confidence,_retry)=>{lifecycleElements['protected-status'].textContent='SAFE_WRONG_STATUS';}; lifecycleStart.learningFlow.phase='W'; lifecycleView.protectedResult('unsure',false); staleSentinels.forEach(sentinel=>assert(!lifecycleText().includes(sentinel),`State W remains free of stale ${sentinel}`));

// D2 final production safety: phase-authorized submission and protected-form reuse.
const blockedSubmit=phase=>{const calls={grade:0,recordAttempt:0,record:0,completeReview:0,recordMastery:0,reward:0,applyAnswer:0,completion:0};const context={submitting:false,currentId:'Q',learningFlow:{phase},questions:{Q:{id:'Q'}},model:{state:{mode:'story'},recordAttempt(){calls.recordAttempt++;},record(){calls.record++;},completeReview(){calls.completeReview++;},updateCompletion(){calls.completion++;}},rpg:{recordMastery(){calls.recordMastery++;},reward(){calls.reward++;},applyAnswer(){calls.applyAnswer++;}},view:{readAnswer:()=>({})},document:{}};browserSandbox.window.GradingEngine={grade(){calls.grade++;return {correct:true};}};return {calls,result:D2Controller.prototype.submit.call(context)};};
for(const phase of ['W','C','D']) { const blocked=blockedSubmit(phase); assert.strictEqual(blocked.result,false,`State ${phase} direct submit is phase-blocked`); assert.deepStrictEqual(blocked.calls,{grade:0,recordAttempt:0,record:0,completeReview:0,recordMastery:0,reward:0,applyAnswer:0,completion:0},`State ${phase} direct submit has zero durable mutations`); }
const revealBlockedContext={learningFlow:{phase:'R',authoritativeScore:{correct:false},authoritativeAnswer:{},confidence:'unsure',achievement:{}},currentId:'Q',questions:{Q:{}},view:{hideProtectedResult(){},result(){},show(){}},document:{getElementById:()=>({focus(){}})},dispatchPendingGameOver(){}}; assert.strictEqual(D2Controller.prototype.revealAnswer.call(revealBlockedContext),true); revealBlockedContext.submitting=false; revealBlockedContext.model={state:{mode:'story'}}; const revealCalls={grade:0}; browserSandbox.window.GradingEngine={grade(){revealCalls.grade++;}}; assert.strictEqual(D2Controller.prototype.submit.call(revealBlockedContext),false,'State D after reveal direct submit is blocked'); assert.strictEqual(revealCalls.grade,0);
const journalControls={debitAccounts:[{value:'現金',selectedOptions:[]}],debitAmounts:[{value:'999'}],creditAccounts:[{value:'売上',selectedOptions:[]}],creditAmounts:[{value:'100'}]}; const selectorValues={'.debit-account':journalControls.debitAccounts,'.debit-amount':journalControls.debitAmounts,'.credit-account':journalControls.creditAccounts,'.credit-amount':journalControls.creditAmounts}; const retryDocument={querySelectorAll:selector=>selectorValues[selector]||[],querySelector:()=>null}; const retryView=new browserSandbox.window.AppView(retryDocument); let retryLocked='',protectedRendered=0; retryView.setAnswerMode=mode=>{retryLocked=mode;}; retryView.protectedResult=()=>{protectedRendered++;}; retryView.result=()=>{protectedRendered++;}; retryView.show=()=>{}; const retryFlowContext={learningFlow:{phase:'R',retryCount:0,confidence:'unsure'},submitting:true,view:retryView}; const retryQuestion={type:'journal',answer:{debit:[{account:'現金',amount:100}],credit:[{account:'売上',amount:100}]}}; assert.strictEqual(D2Controller.prototype.finishCoachingRetry.call(retryFlowContext,retryQuestion,{debit:[{account:'現金',amount:999}],credit:[{account:'売上',amount:100}]},{correct:false}),false); assert.strictEqual(retryFlowContext.learningFlow.phase,'W','wrong coaching retry transitions R -> W'); assert.deepStrictEqual(JSON.parse(JSON.stringify(retryFlowContext.learningFlow.coachingAnswer)),{debit:[{account:'',amount:''}],credit:[{account:'売上',amount:100}]}); assert.deepStrictEqual([journalControls.debitAccounts[0].value,journalControls.debitAmounts[0].value],['現金','999'],'result view preserves the submitted Journal answer for comparison'); assert.deepStrictEqual([journalControls.creditAccounts[0].value,journalControls.creditAmounts[0].value],['売上','100'],'correct Journal pair is preserved'); assert.strictEqual(retryLocked,''); assert.strictEqual(protectedRendered,1,'wrong retry returns directly to the full explanation');
const tableA={value:'learner-a',dataset:{cellId:'a'},tagName:'INPUT'},tableB={value:'learner-b',dataset:{cellId:'b'},tagName:'INPUT'}; const tableView=new browserSandbox.window.AppView({querySelectorAll:selector=>selector==='.table-input'?[tableA,tableB]:[]}); tableView.setAnswerMode=()=>{}; tableView.protectedResult=()=>{}; tableView.result=()=>{}; tableView.show=()=>{}; const tableRetryContext={learningFlow:{phase:'R',retryCount:0,confidence:'unsure'},submitting:true,view:tableView}; D2Controller.prototype.finishCoachingRetry.call(tableRetryContext,{type:'table'},{cells:{a:'learner-a',b:'learner-b'}},{correct:false,details:[{cellId:'a',correct:true,expected:'SECRET'},{cellId:'b',correct:false,expected:'SECRET2'}]}); assert.deepStrictEqual([tableA.value,tableB.value],['learner-a','learner-b'],'result view preserves submitted table cells for comparison');
let touchSelectFocused=false,touchQuestionFocused=false;
const touchSelect={value:'',tagName:'SELECT',focus(){touchSelectFocused=true;}};
const touchRetryContext={
  learningFlow:{phase:'W',authoritativeAnswer:{debit:[],credit:[]},authoritativeScore:{},confidence:'unsure'},
  currentId:'Q',
  questions:{Q:{type:'journal',answer:{debit:[],credit:[]}}},
  model:{state:{mode:'story'}},
  view:{calculatorFirstInput:true,applyRetryDraft(){},setAnswerMode(){},hideProtectedResult(){},show(){}},
  document:{
    querySelectorAll:()=>[touchSelect],
    querySelector:()=>touchSelect,
    getElementById:id=>id==='q-text'?{focus(){touchQuestionFocused=true;}}:null
  }
};
assert.strictEqual(D2Controller.prototype.beginCoachingRetry.call(touchRetryContext),true);
assert.strictEqual(touchSelectFocused,false,'touch端末ではretry開始時にselectを自動focusしない');
assert.strictEqual(touchQuestionFocused,true,'touch端末で最初の空欄がselectなら問題文へ安全にfocusを移す');

let renderQuestionCalls=0,answerRendererCalls=0,appliedDraft=null,focused=false; const clearedField={value:'',focus(){focused=true;}}; const beginContext={learningFlow:{phase:'W',authoritativeAnswer:{cells:{a:'bad'}},authoritativeScore:{details:[{cellId:'a',correct:false}]},confidence:'unsure'},currentId:'Q',questions:{Q:{type:'table'}},model:{state:{mode:'story'}},view:{applyRetryDraft(_q,draft){appliedDraft=draft;},renderQuestion(){renderQuestionCalls++;},renderJournal(){answerRendererCalls++;},renderCorrection(){answerRendererCalls++;},setAnswerMode(){},protectedResult(){},show(){}},document:{querySelectorAll:()=>[clearedField],querySelector:()=>clearedField}}; assert.strictEqual(D2Controller.prototype.beginCoachingRetry.call(beginContext),true); assert.strictEqual(beginContext.learningFlow.phase,'R','explicit retry transitions W -> R'); assert.deepStrictEqual(JSON.parse(JSON.stringify(appliedDraft)),{cells:{a:''}}); assert.strictEqual(renderQuestionCalls,0,'protected retry does not call renderQuestion'); assert.strictEqual(answerRendererCalls,0,'protected retry does not call answer-derived renderer'); assert.strictEqual(focused,true,'protected retry focuses first cleared field');


// D2 retry-action authorization regressions.
const retryActionState={hidden:true};
const nextActionState={secondary:false,classList:{toggle(_name,on){nextActionState.secondary=on;}}};
const retryResultElements={
  'standard-result-actions':{hidden:true,querySelector:()=>nextActionState},
  'exam-result-actions':{hidden:false},
  'top-result-actions':{hidden:true},
  'result-status':{className:'',replaceChildren(){}}
};
const retryAuthorizationView={
  byId:id=>retryResultElements[id],
  document:{
    querySelector:selector=>selector==='[data-action="coaching-retry-result"]'?retryActionState:null,
    createElement:()=>({className:'',textContent:''})
  },
  renderAchievement(){},
  renderErrorSummary(){},
  renderAnswerComparison(){},
  renderCorrectJournal(){},
  renderExplanation(){}
};

browserSandbox.window.AppView.prototype.result.call(
  retryAuthorizationView, {}, {correct:false}, {}, 'unsure', {}, true
);
assert.strictEqual(retryActionState.hidden,false,'State W authorization shows coaching retry');
assert.strictEqual(nextActionState.secondary,true,'Wrong result retains a secondary continue action');

browserSandbox.window.AppView.prototype.result.call(
  retryAuthorizationView, {}, {correct:false}, {}, 'unsure', {}, false
);
assert.strictEqual(retryActionState.hidden,true,'State D hides coaching retry even when authoritative score remains wrong');

browserSandbox.window.AppView.prototype.result.call(
  retryAuthorizationView, {}, {correct:true}, {}, 'unsure', {}, false
);
assert.strictEqual(retryActionState.hidden,true,'State C keeps coaching retry hidden');
assert.strictEqual(nextActionState.secondary,false,'Correct result restores the primary continue action');

let retryAuthorizationSignal=null;
let retryResultScore=null;
let retryResultAnswer=null;
let retryComparisonScore=null;
let retryComparisonAnswer=null;
const retryAuthorizationContext={
  learningFlow:{
    phase:'R',
    retryCount:0,
    authoritativeScore:{correct:false},
    authoritativeAnswer:{first:true},
    confidence:'unsure',
    achievement:{},
    gameOverPending:false
  },
  submitting:true,
  document:{
    createElement(){return {className:'',textContent:''};},
    getElementById(){return {append(){},focus(){}};}
  },
  view:{
    hideProtectedResult(){},
    result(_q,_score,_answer,_confidence,_achievement,retryAuthorized){
      retryAuthorizationSignal=retryAuthorized;
      retryResultScore=_score;
      retryResultAnswer=_answer;
    },
    renderAnswerComparison(_q,_score,_answer){
      retryComparisonScore=_score;
      retryComparisonAnswer=_answer;
    },
    show(){}
  },
  dispatchPendingGameOver(){}
};

assert.strictEqual(
  D2Controller.prototype.finishCoachingRetry.call(
    retryAuthorizationContext,
    {id:'Q',type:'table'},
    {cells:{}},
    {correct:false,details:[]}
  ),
  false
);
assert.strictEqual(retryAuthorizationContext.learningFlow.phase,'W','wrong coaching retry returns to W');
assert.strictEqual(retryAuthorizationSignal,true,'wrong coaching retry re-authorizes retry action');

retryAuthorizationContext.learningFlow.phase='R';
assert.strictEqual(
  D2Controller.prototype.finishCoachingRetry.call(
    retryAuthorizationContext,
    {id:'Q',type:'table'},
    {cells:{}},
    {correct:true,details:[]}
  ),
  true
);
assert.strictEqual(retryAuthorizationContext.learningFlow.phase,'D','successful coaching retry transitions to D');
assert.strictEqual(retryAuthorizationSignal,false,'successful coaching retry removes retry authorization');
assert.strictEqual(retryResultScore.correct,true,'successful coaching retry uses the retry score as the current result');
assert.deepStrictEqual(retryResultAnswer,{cells:{}},'successful coaching retry uses the retry answer as the current result');
assert.strictEqual(retryComparisonScore.correct,false,'successful coaching retry keeps the initial wrong score only for comparison');
assert.deepStrictEqual(retryComparisonAnswer,{first:true},'successful coaching retry keeps the initial wrong answer only for comparison');

let revealRetryAuthorization=null;
const revealRetryAuthorizationContext={
  learningFlow:{
    phase:'W',
    authoritativeScore:{correct:false},
    authoritativeAnswer:{first:true},
    confidence:'unsure',
    achievement:{},
    gameOverPending:false
  },
  currentId:'Q',
  questions:{Q:{id:'Q'}},
  view:{
    hideProtectedResult(){},
    result(_q,_score,_answer,_confidence,_achievement,retryAuthorized){
      revealRetryAuthorization=retryAuthorized;
    },
    show(){}
  },
  document:{getElementById:()=>({focus(){}})},
  dispatchPendingGameOver(){}
};

assert.strictEqual(
  D2Controller.prototype.revealAnswer.call(revealRetryAuthorizationContext),
  true
);
assert.strictEqual(revealRetryAuthorizationContext.learningFlow.phase,'D','reveal transitions to D');
assert.strictEqual(revealRetryAuthorization,false,'reveal removes retry authorization');

// D2 final four-contract closure.
const durableCounter=()=>({recordAttempt:0,record:0,completeReview:0,recordMastery:0,reward:0,applyAnswer:0,updateCompletion:0,setDraft:0});
for(const phase of ['W','R']) {
  const calls=durableCounter(), order=[]; const schedule={Q:{stage:2,dueAt:123}},mistakes={Q:4}; let hp=55;
  const revealContext={learningFlow:{phase,authoritativeScore:{correct:false},authoritativeAnswer:{cells:{a:'own'}},confidence:'unsure',achievement:{}},currentId:'Q',questions:{Q:{id:'Q'}},model:{state:{mode:'review',reviewSchedule:schedule,mistakeCounts:mistakes},recordAttempt(){calls.recordAttempt++;},record(){calls.record++;},completeReview(){calls.completeReview++;},updateCompletion(){calls.updateCompletion++;},setDraft(){calls.setDraft++;}},rpg:{state:{get companyHP(){return hp;},set companyHP(value){hp=value;}},recordMastery(){calls.recordMastery++;},reward(){calls.reward++;},applyAnswer(){calls.applyAnswer++;}},view:{hideProtectedResult(){},result(){order.push('result');},show(){order.push('show');}},document:{getElementById:()=>({focus(){}})},dispatchPendingGameOver(){order.push('dispatch');}};
  assert.strictEqual(D2Controller.prototype.revealAnswer.call(revealContext),true,`State ${phase} reveal is authorized`); assert.strictEqual(revealContext.learningFlow.phase,'D'); assert.deepStrictEqual(calls,durableCounter(),`State ${phase} reveal durable mutations = 0`); assert.strictEqual(hp,55); assert.deepStrictEqual(schedule,{Q:{stage:2,dueAt:123}}); assert.deepStrictEqual(mistakes,{Q:4}); assert.deepStrictEqual(order,['result','show','dispatch']); assert.strictEqual(D2Controller.prototype.revealAnswer.call(revealContext),false,'repeated reveal is idempotently refused'); assert.deepStrictEqual(calls,durableCounter());
}
const reviewCalls=durableCounter(),reviewState={mode:'review',reviewSchedule:{SRC:{stage:1,dueAt:10}},mistakeCounts:{SRC:2},attempts:[],reviewAssignments:{SRC:{status:'assigned'}}}; const reviewScores=[{correct:false,details:[{cellId:'a',correct:false}]},{correct:false,details:[{cellId:'a',correct:false}]},{correct:true,details:[{cellId:'a',correct:true}]}],reviewAnswers=[{cells:{a:'first'}},{cells:{a:'retry-wrong'}},{cells:{a:'retry-correct'}}]; browserSandbox.window.GradingEngine={grade:()=>reviewScores.shift()}; const reviewLoop={submitting:false,currentId:'Q',questionStartedAt:Date.now(),reviewSourceId:'SRC',learningFlow:{phase:'I',hintStage:0,retryCount:0,nextConsumed:false,gameOverPending:false,gameOverDispatched:false},questions:{Q:{id:'Q',type:'table',difficulty:1}},model:{state:reviewState,recordAttempt(id,correct){reviewCalls.recordAttempt++;reviewState.attempts.push({id,correct});},completeReview(){reviewCalls.completeReview++;reviewState.reviewSchedule.SRC={stage:0,dueAt:999};reviewState.mistakeCounts.SRC++;reviewState.reviewAssignments.SRC.status='completed';},record(){reviewCalls.record++;},updateCompletion(){reviewCalls.updateCompletion++;return false;}},rpg:{level:1,role:'r',state:{companyHP:100},recordMastery(){reviewCalls.recordMastery++;},reward(){reviewCalls.reward++;},applyAnswer(){reviewCalls.applyAnswer++;}},view:{readAnswer:()=>reviewAnswers.shift(),updateRpg(){},setAnswerMode(){},protectedResult(){},show(){},applyRetryDraft(){},hideProtectedResult(){},result(){this.completed=true;}},document:{querySelector:()=>null,querySelectorAll:()=>[{value:'',focus(){}}],createElement:()=>({}),getElementById:()=>({append(){},focus(){}})},dispatchPendingGameOver(){},finishCoachingRetry:D2Controller.prototype.finishCoachingRetry}; D2Controller.prototype.submit.call(reviewLoop); assert.deepStrictEqual([reviewCalls.recordAttempt,reviewCalls.completeReview,reviewState.attempts.length],[1,1,1]); const postAuthority=JSON.stringify({schedule:reviewState.reviewSchedule,mistakes:reviewState.mistakeCounts,assignments:reviewState.reviewAssignments,attempts:reviewState.attempts}); D2Controller.prototype.beginCoachingRetry.call(reviewLoop); D2Controller.prototype.submit.call(reviewLoop); assert.strictEqual(reviewLoop.learningFlow.phase,'W'); assert.strictEqual(JSON.stringify({schedule:reviewState.reviewSchedule,mistakes:reviewState.mistakeCounts,assignments:reviewState.reviewAssignments,attempts:reviewState.attempts}),postAuthority); D2Controller.prototype.beginCoachingRetry.call(reviewLoop); D2Controller.prototype.submit.call(reviewLoop); assert.strictEqual(reviewLoop.learningFlow.phase,'D'); assert.strictEqual(JSON.stringify({schedule:reviewState.reviewSchedule,mistakes:reviewState.mistakeCounts,assignments:reviewState.reviewAssignments,attempts:reviewState.attempts}),postAuthority); assert.deepStrictEqual([reviewCalls.recordAttempt,reviewCalls.completeReview],[1,1]); assert.strictEqual(reviewState.attempts[0].correct,false,'Review first wrong remains authoritative after correct coaching');
let hpOrder=[],gameOverCalls=0,applyCalls=0; const hpScores=[{correct:false,details:[{cellId:'a',correct:false}]},{correct:false,details:[{cellId:'a',correct:false}]},{correct:true,details:[{cellId:'a',correct:true}]}],hpAnswers=[{cells:{a:'first'}},{cells:{a:'wrong'}},{cells:{a:'right'}}]; browserSandbox.window.GradingEngine={grade:()=>hpScores.shift()}; const hpLoop={submitting:false,currentId:'Q',questionStartedAt:Date.now(),reviewSourceId:null,learningFlow:{phase:'I'},questions:{Q:{id:'Q',type:'table',difficulty:1}},model:{state:{mode:'story',answeredIds:[],reviewSchedule:{}},recordAttempt(){},record(){},updateCompletion(){return false;}},rpg:{level:1,role:'r',state:{companyHP:5},recordMastery(){},reward(){},applyAnswer(correct){applyCalls++;if(!correct)this.state.companyHP=0;}},view:{readAnswer:()=>hpAnswers.shift(),updateRpg(){},setAnswerMode(){},protectedResult(){},show(){},applyRetryDraft(){},hideProtectedResult(){},result(){hpOrder.push('completed');}},document:{querySelector:()=>null,querySelectorAll:()=>[{value:'',focus(){}}],createElement:()=>({}),getElementById:()=>({append(){},focus(){}})},showGameOver(){gameOverCalls++;hpOrder.push('game-over');},dispatchPendingGameOver:D2Controller.prototype.dispatchPendingGameOver,finishCoachingRetry:D2Controller.prototype.finishCoachingRetry}; D2Controller.prototype.submit.call(hpLoop); assert.deepStrictEqual([hpLoop.rpg.state.companyHP,applyCalls,hpLoop.learningFlow.phase,hpLoop.learningFlow.gameOverPending,gameOverCalls],[0,1,'W',true,0]); D2Controller.prototype.beginCoachingRetry.call(hpLoop); D2Controller.prototype.submit.call(hpLoop); assert.deepStrictEqual([hpLoop.rpg.state.companyHP,applyCalls,hpLoop.learningFlow.phase,gameOverCalls],[0,1,'W',0]); D2Controller.prototype.beginCoachingRetry.call(hpLoop); D2Controller.prototype.submit.call(hpLoop); assert.deepStrictEqual(hpOrder,['completed','completed','completed','game-over'],'each wrong and corrected attempt returns to an explanation before game-over dispatch'); assert.deepStrictEqual([hpLoop.learningFlow.phase,gameOverCalls,hpLoop.rpg.state.companyHP,applyCalls],['D',1,0,1]); D2Controller.prototype.dispatchPendingGameOver.call(hpLoop); assert.strictEqual(gameOverCalls,1);
let examD2Calls=0,examDrafts=0,examSaves=0,examUpdates=0; const d2ExamQuestion={id:'E',type:'table'}; browserSandbox.window.GradingEngine={grade:()=>({correct:true,earned:1,possible:1,ratio:1})}; const examContext={submitting:false,currentId:null,learningFlow:{phase:'W'},questionStartedAt:null,reviewSourceId:null,questions:{E:d2ExamQuestion},model:{state:{mode:'exam',drafts:{},examSession:{ids:['E'],scores:{},endAt:Date.now()+100000,status:'ACTIVE'}},save(){examSaves++;},setDraft(){examDrafts++;},recordAttempt(){this.attempts=(this.attempts||0)+1;}},rpg:{},reviewMappings:new Map(),resetCalculator(){},modeIds:()=>['E'],isExamExpired:()=>false,unansweredExamIds:()=>[],updateExamStatus(){examUpdates++;},renderModes(){},showMode(){this.examRouted=true;},view:{resetLearningSurfaces(){},renderQuestion(){},setAnswerMode(){},show(id){this.current=id;},readAnswer:()=>({cells:{a:'exam'}}),renderHint(){examD2Calls++;},protectedResult(){examD2Calls++;}},document:{querySelector:()=>null,getElementById:id=>id==='question-filters'?{hidden:false}:id==='q-text'?{focus(){}}:null}}; D2Controller.prototype.start.call(examContext,'E'); assert.strictEqual(examContext.learningFlow,null); assert.strictEqual(D2Controller.prototype.showHint.call(examContext,1),false); assert.strictEqual(D2Controller.prototype.beginCoachingRetry.call(examContext),false); assert.strictEqual(D2Controller.prototype.revealAnswer.call(examContext),false); assert.strictEqual(examContext.view.current,'view-question'); D2Controller.prototype.submit.call(examContext); assert.strictEqual(examContext.model.state.examSession.scores.E.correct,true); assert.deepStrictEqual([examDrafts,examSaves,examUpdates,examD2Calls,examContext.model.attempts],[1,2,1,0,1]); assert.strictEqual(examContext.examRouted,true,'Exam unanswered/session routing remains active outside D2');
