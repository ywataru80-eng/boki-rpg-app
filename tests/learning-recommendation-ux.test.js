const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const controllerSource = fs.readFileSync('js/controller.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const sandbox = { window:{}, Event:class Event {}, queueMicrotask(fn){ fn(); } };
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

const questions = {
  J1:{ id:'J1', type:'journal', category:'仕訳', question:'仕訳の弱点問題' },
  L1:{ id:'L1', type:'ledger', category:'帳簿', question:'元帳の弱点問題' },
  L2:{ id:'L2', type:'trial_balance', category:'試算表', question:'試算表の未回答問題' },
  L3:{ id:'L3', type:'worksheet', category:'精算表', question:'精算表の問題' }
};
const priorities = {
  J1:{ id:'J1', reasons:['直近の回答が誤答です'], mastery:{state:'要復習'} },
  L1:{ id:'L1', reasons:['累積正答率が60%未満です'], mastery:{state:'学習中'} },
  L2:{ id:'L2', reasons:['まだ回答していない問題です'], mastery:{state:'未着手'} },
  L3:{ id:'L3', reasons:['現在の学習順で進められます'], mastery:{state:'定着'} }
};
const state = { answeredIds:['J1','L1'], marker:'immutable' };
let due = [];
const model = {
  state,
  dueReviewIds(){ return [...due]; },
  priorityStudyIds(){ return ['J1','L1','L2','L3']; },
  studyPriority(id){ return priorities[id] || null; }
};
const story = new FakeNode('section');
const training = new FakeNode('section');
const documentStub = {
  createElement(tagName){ return new FakeNode(tagName); },
  getElementById(id){
    if (id === 'story-recommendations') return story;
    if (id === 'training-recommendations') return training;
    return null;
  }
};
const context = {
  document:documentStub,
  model,
  questions,
  storyIds(){ return ['J1','L1','L2','L3']; },
  learningIds(){ return ['J1','L1','L2','L3']; }
};

const before = JSON.stringify(state);
assert.strictEqual(Controller.prototype.renderStudyRecommendations.call(context, 'story', 1000), true);
assert.strictEqual(JSON.stringify(state), before, 'おすすめ描画は学習状態を変更しない');
let text = flatten(story);
for (const expected of ['今日のおすすめ','仕訳｜J1','直近の回答が誤答です','習熟度：要復習','帳簿｜L1','試算表｜L2']) {
  assert(text.includes(expected), `Storyおすすめに「${expected}」を表示する`);
}
assert(!text.includes('精算表｜L3'), '通常おすすめは上位3問までに制限する');
let storyButtons = buttons(story).filter(button => button.dataset.action === 'start');
assert.deepStrictEqual(storyButtons.map(button => button.dataset.questionId), ['J1','L1','L2'], 'Phase 3A順序を保って上位3問を開始できる');
assert(storyButtons.every(button => button.dataset.startFresh === 'true'), 'おすすめ問題は通常学習として新規開始する');

assert.strictEqual(Controller.prototype.renderStudyRecommendations.call(context, 'training', 1000), true);
text = flatten(training);
assert(!text.includes('仕訳｜J1'), 'Trainingおすすめは既存仕様どおりjournalを除外する');
assert(text.includes('帳簿｜L1') && text.includes('試算表｜L2') && text.includes('精算表｜L3'), 'Trainingの許可プール内で優先順を維持する');

due = ['L1'];
Controller.prototype.renderStudyRecommendations.call(context, 'story', 1000);
text = flatten(story);
assert(text.includes('復習する問題が1問あります。') && text.includes('復習モードから取り組みましょう。'), '期限到来時は復習を最優先で表示する');
const dueButtons = buttons(story);
assert(dueButtons.some(button => button.dataset.action === 'mode' && button.dataset.mode === 'review'), '期限到来時は既存review modeへ誘導する');
assert(!dueButtons.some(button => button.dataset.action === 'start'), '期限到来済みsourceを通常問題として直接開始しない');

assert(html.includes('id="story-recommendations"') && html.includes('id="training-recommendations"'), 'Story/Trainingにおすすめ表示領域を持つ');
assert(controllerSource.includes("this.renderStudyRecommendations('story')") && controllerSource.includes("this.renderStudyRecommendations('training')"), '問題一覧再描画とおすすめを同期する');
assert(css.includes('.study-recommendation-card { display: grid; grid-template-columns: minmax(0, 1fr) auto;'), 'デスクトップでは説明とCTAを可変gridで配置する');
assert(css.includes('@media (max-width: 560px)') && css.includes('.study-recommendation-card { grid-template-columns: 1fr; }'), 'モバイルではおすすめカードを1列化して横スクロールを避ける');

console.log('LEARNING_RECOMMENDATION_PHASE3B_PASS');
