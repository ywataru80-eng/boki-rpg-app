'use strict';
// Issue #256: compare answers using the actual form's fields, not fictional 8-column groups.
// Run via npm run verify; D001 must retain its true eight-column comparison.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = {window:{},console};
for (const path of ['data/accounting-domain.js','data/questions.js','js/view.js']) {
  vm.runInNewContext(fs.readFileSync(path,'utf8'),sandbox,{filename:path});
  if (path === 'data/accounting-domain.js') sandbox.AccountingDomain = sandbox.window.AccountingDomain;
}
const questions = sandbox.window.QuestionData;
assert.equal(Object.keys(questions).length,300,'canonical 300 retained');

function element(tag) {
  return {
    tag, children:[], dataset:{}, className:'', textContent:'', hidden:false,
    append(...nodes) {this.children.push(...nodes);},
    replaceChildren(...nodes) {this.children=[...nodes];},
    setAttribute(key,value) {this[key]=value;},
    insertRow() {const child=element('tr');this.append(child);return child;},
    insertCell() {const child=element('td');this.append(child);return child;},
    createTHead() {const child=element('thead');this.append(child);return child;},
    createTBody() {const child=element('tbody');this.append(child);return child;}
  };
}
const compareRoot = element('div');
const view = Object.create(sandbox.window.AppView.prototype);
view.document = {createElement:element};
view.byId = id => {assert.equal(id,'answer-comparison');return compareRoot;};
let eightColumnCalls=0, semanticCalls=0;
view.worksheetAnswerComparison = () => {eightColumnCalls++;return element('worksheet8');};
const realTableComparison = view.tableAnswerComparison;
view.tableAnswerComparison = function(...args) {semanticCalls++;return realTableComparison.apply(this,args);};

for (let index=1; index<=20; index++) {
  const id = 'D'+String(index).padStart(3,'0');
  const q = questions[id];
  assert.equal(q.type,'worksheet',id+' worksheet type');
  const fields = q.table.inputCells;
  const answer = {cells:Object.fromEntries(fields.map(cellId=>[cellId,0]))};
  const score = {correct:false,details:fields.map(cellId=>({cellId,correct:false}))};
  const prevEight=eightColumnCalls,prevSemantic=semanticCalls;
  view.renderAnswerComparison(q,score,answer);
  assert.equal(compareRoot.hidden,false,id+' wrong-answer comparison must be visible');
  if (index === 1) {
    assert.equal(eightColumnCalls,prevEight+1,'D001 uses actual 8-column worksheet');
    assert.equal(semanticCalls,prevSemantic,'D001 must not change to generic fields');
    assert.equal(compareRoot.children[0].textContent,'最初の回答を決算整理表で比較');
  } else {
    assert.equal(eightColumnCalls,prevEight,id+' must NOT use 8-column grouping');
    assert.equal(semanticCalls,prevSemantic+1,id+' uses original field labels');
    assert.equal(compareRoot.children[0].textContent,'最初の解答と正しい解答');
    const wrap = compareRoot.children[2],table=wrap.children.find(node=>node.tag==='table');
    const body = table.children.find(node=>node.tag==='tbody');
    const labels=body.children.map(row=>row.children[0].textContent);
    const expected=fields.map(cellId=>q.table.inputMetadata?.[cellId]?.label||view.cellLabel(q,cellId));
    assert.equal(JSON.stringify(labels),JSON.stringify(expected),id+' semantic labels in actual table');
    assert.equal(body.children.length,fields.length,id+' full input-cell coverage');
  }
  const correctBefore=eightColumnCalls,correctSemantic=semanticCalls;
  view.renderAnswerComparison(q,{correct:true,details:[]},q.answer);
  assert.equal(compareRoot.hidden,true,id+' correct answer hides wrong-answer comparison');
  view.renderAnswerComparison(q,{correct:false,details:[]},null);
  assert.equal(compareRoot.hidden,true,id+' unanswered answer hides wrong-answer comparison');
  assert.equal(eightColumnCalls,correctBefore,id+' correct/unanswered do not route to 8-column');
  assert.equal(semanticCalls,correctSemantic,id+' correct/unanswered do not route to fields');
}
assert.equal(eightColumnCalls,1);
assert.equal(semanticCalls,19);
console.log('WORKSHEET_COMPARISON_20_PASS: D001 8-column, D002-D020 semantic labels, 20 correct and 20 unanswered states');