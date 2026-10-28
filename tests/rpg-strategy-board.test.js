'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const RPGModel = require('../js/rpg');

const controllerSource = fs.readFileSync('js/controller.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const sandbox = { window:{ RPGModel }, Event:class Event {}, queueMicrotask(fn){ fn(); } };
vm.runInNewContext(controllerSource, sandbox);
const Controller = sandbox.window.AppController;

class FakeNode {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.type = '';
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
}
const flatten = node => [node.textContent, ...node.children.flatMap(flatten)].filter(Boolean).join(' ');
const buttons = node => [
  ...(node.tagName === 'button' ? [node] : []),
  ...node.children.flatMap(buttons)
];

assert.strictEqual(RPGModel.skillForQuestion({type:'journal'}), '仕訳');
for (const type of ['ledger','trial_balance','correction']) assert.strictEqual(RPGModel.skillForQuestion({type}), '帳簿');
assert.strictEqual(RPGModel.skillForQuestion({type:'worksheet'}), '決算整理');
for (const type of ['financial_statement','comprehensive']) assert.strictEqual(RPGModel.skillForQuestion({type}), '財務諸表');
assert.strictEqual(RPGModel.skillForQuestion({type:'other'}), null);

const storage = { getItem(){ return null; }, setItem(){ return true; } };
const rpg = new RPGModel(storage, 'phase4a-rpg');
rpg.state.xp = 540;
rpg.state.mastery = {
  '@skill:仕訳':{ earned:8, possible:10 },
  '@skill:帳簿':{ earned:1, possible:2 },
  '@skill:決算整理':{ earned:3, possible:4 }
};

const questions = {
  J1:{ id:'J1', type:'journal', category:'仕訳', question:'仕訳の再確認', learningRole:'core' },
  L1:{ id:'L1', type:'ledger', category:'元帳', question:'元帳の弱点を確認する', learningRole:'core' },
  W1:{ id:'W1', type:'worksheet', category:'精算表', question:'精算表の次の仕事', learningRole:'core' }
};
const priorities = {
  J1:{ id:'J1', tier:2, reasons:['累積正答率が60%未満です'], mastery:{state:'学習中'} },
  L1:{ id:'L1', tier:1, reasons:['直近の回答が誤答です'], mastery:{state:'要復習'} },
  W1:{ id:'W1', tier:4, reasons:['まだ回答していない問題です'], mastery:{state:'未着手'} }
};
let due = [];
let priorityIds = ['L1','J1','W1'];
const model = {
  state:{ marker:'immutable', mode:'desk', reviewSchedule:{} },
  dueReviewIds(){ return [...due]; },
  priorityStudyIds(){ return [...priorityIds]; },
  studyPriority(id){ return priorities[id] || null; },
  learningMastery(id){ return priorities[id]?.mastery || {state:'未着手'}; },
  save(){ this.saved = (this.saved || 0) + 1; return true; }
};
const missionNode = new FakeNode('section');
const documentStub = {
  createElement(tagName){ return new FakeNode(tagName); },
  getElementById(id){ return id === 'rpg-mission' ? missionNode : null; }
};
const context = {
  document:documentStub,
  model,
  rpg,
  questions,
  storyIds(){ return ['J1','L1','W1']; },
  learningIds(){ return ['J1','L1','W1']; }
};
context.rpgMission = now => Controller.prototype.rpgMission.call(context, now);

const progressBefore = JSON.stringify(model.state);
const rpgBefore = JSON.stringify(rpg.state);
assert.strictEqual(Controller.prototype.renderRpgMission.call(context, 1000), true);
assert.strictEqual(JSON.stringify(model.state), progressBefore, '攻略ミッション描画はProgressModel stateを変更しない');
assert.strictEqual(JSON.stringify(rpg.state), rpgBefore, '攻略ミッション描画はRPGModel stateを変更しない');
let text = flatten(missionNode);
for (const expected of ['攻略ミッション','攻略対象','元帳｜L1','直近の回答が誤答です','習熟度：要復習','対応スキル：帳簿 50%','現在：Lv.']) {
  assert(text.includes(expected), `通常攻略ミッションに「${expected}」を表示する`);
}
let ctas = buttons(missionNode);
assert(ctas.some(button => button.dataset.action === 'start-rpg-mission' && button.dataset.questionId === 'L1'), '通常攻略ミッションは専用開始CTAを持つ');

due = ['L1'];
Controller.prototype.renderRpgMission.call(context, 1000);
text = flatten(missionNode);
assert(text.includes('再戦：復習期限'), '期限到来時は再戦ミッションとして表示する');
assert(text.includes('復習する問題が1問あります。'), '期限到来件数を表示する');
ctas = buttons(missionNode);
assert(ctas.some(button => button.dataset.action === 'mode' && button.dataset.mode === 'review'), '期限到来時はReview modeへ誘導する');
assert(!ctas.some(button => button.dataset.action === 'start-rpg-mission'), '期限到来sourceを通常ミッションとして直接開始しない');

due = [];
priorityIds = ['W1'];
Controller.prototype.renderRpgMission.call(context, 1000);
text = flatten(missionNode);
assert(text.includes('次の仕事'), '未回答問題は中立的な次の仕事として表示する');
assert(!text.includes('攻略対象'), '未回答問題を攻略対象と断定しない');
assert(!text.includes('苦手'), '未回答問題を苦手と表現しない');
assert(text.includes('対応スキル：決算整理 75%'), '既存RPG skillMasteryを読み取り専用で表示する');

let started = null;
const startContext = {
  questions,
  model:{ state:{mode:'desk'}, save(){ this.saved = true; return true; } },
  storyIds(){ return ['L1']; },
  learningIds(){ return ['L1','W1']; },
  start(id, options){ started = {id, options}; }
};
assert.strictEqual(Controller.prototype.startRpgMission.call(startContext, 'L1'), true);
assert.strictEqual(startContext.model.state.mode, 'story', '攻略ミッション開始時に既存Story modeへ接続する');
assert.strictEqual(started.id, 'L1', '選択した攻略ミッションを開始する');
assert.strictEqual(started.options?.fresh, true, '通常学習としてfresh startする');
assert.strictEqual(Controller.prototype.startRpgMission.call(startContext, 'unknown'), false, '未知IDはfail-closed');

assert(html.includes('id="rpg-mission"') && html.includes('aria-label="攻略ミッション"'), '実務デスクに攻略ミッション領域を持つ');
assert(controllerSource.includes("this.renderRpgMission()"), '問題一覧再描画と攻略ミッションを同期する');
assert(controllerSource.includes("'start-rpg-mission'"), '攻略ミッション専用CTA handlerを持つ');
assert(css.includes('.rpg-mission-card { display: grid; grid-template-columns: minmax(0, 1fr) auto;'), 'デスクトップでは説明とCTAを可変gridで配置する');
assert(css.includes('@media (max-width: 560px)') && css.includes('.rpg-mission-card { grid-template-columns: 1fr; }'), 'モバイルでは攻略ミッションを1列化する');

console.log('RPG_STRATEGY_PHASE4A_PASS');
