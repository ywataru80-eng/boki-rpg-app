'use strict';

const assert = require('assert');
const fs = require('fs');
const { evidenceStamp, loadQuestions, verifyMatrix } = require('../scripts/audit-matrix');

const matrix = JSON.parse(fs.readFileSync('reports/question-audit-matrix.json', 'utf8'));
const questions = loadQuestions();
// The original matrix is historical evidence, not rewritten to fit repaired content.
const cp=require('node:child_process'),vm=require('node:vm'),baseline='37086c6ae6511a249218533375bf6f19dac231d1',old={window:{}};
assert(fs.readFileSync('reports/question-audit-matrix.json').equals(cp.execFileSync('git',['show',baseline+':reports/question-audit-matrix.json'],{maxBuffer:8*1024*1024})),'historical matrix bytes unchanged');
vm.runInNewContext(cp.execFileSync('git',['show',baseline+':data/questions.js'],{encoding:'utf8',maxBuffer:8*1024*1024}),old);
assert.strictEqual(verifyMatrix(matrix,old.window.QuestionData).ok,true,'historical matrix matches its fixed source');
assert.deepStrictEqual(verifyMatrix(matrix,questions).stale,[{id:'J148',status:'STALE',reasons:['SOURCE_CHANGED']},{id:'L044',status:'STALE',reasons:['SOURCE_CHANGED']},{id:'L045',status:'STALE',reasons:['SOURCE_CHANGED']}],'only three explicitly superseded source texts differ');
assert.deepStrictEqual(JSON.parse(JSON.stringify(questions.J148.answer)),JSON.parse(JSON.stringify(old.window.QuestionData.J148.answer)),'J148 accepted accounting answer is unchanged');
cp.execFileSync(process.execPath,['scripts/validate-category-successor.cjs'],{stdio:'inherit'});

const sourceMutation = structuredClone(questions);
sourceMutation.L033.question += ' 改ざん';
let finding = verifyMatrix(matrix, sourceMutation).findings.find(item => item.id === 'L033');
assert.deepStrictEqual(finding, { id: 'L033', status: 'STALE', reasons: ['SOURCE_CHANGED'] });

const schemaMutation = structuredClone(questions);
schemaMutation.L034.table.inputTypes.date1 = 'amount';
finding = verifyMatrix(matrix, schemaMutation).findings.find(item => item.id === 'L034');
assert.ok(finding.reasons.includes('SOURCE_CHANGED'));
assert.ok(finding.reasons.includes('ANSWER_SCHEMA_CHANGED'));

assert.notStrictEqual(evidenceStamp(questions.L033).sourceHash, evidenceStamp(sourceMutation.L033).sourceHash);
console.log('audit matrix freshness tests passed');
