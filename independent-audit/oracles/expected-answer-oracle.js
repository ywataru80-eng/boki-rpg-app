'use strict';

const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const release236=require('./issue256-successor-expected');
const GOLDEN_PATH=path.resolve(__dirname,'../golden/expected-answers.json');

function loadIndependentExpected(){
  const bytes=fs.readFileSync(GOLDEN_PATH);
  const document=JSON.parse(bytes);
  if(document.authority!=='independent-audit-golden'||!document.answers)throw new Error('INVALID_INDEPENDENT_EXPECTED');
  return {answers:document.answers,sourceHash:crypto.createHash('sha256').update(bytes).digest('hex')};
}

function expectedFor(questionId){
  const golden=loadIndependentExpected();
  const successor=release236.expectedFor(questionId);
  // A new, independently transcribed successor answer must not overwrite the
  // historical 235 golden. A non-D question keeps its existing authority.
  return successor===null?{expected:golden.answers[questionId]||null,sourceHash:golden.sourceHash}:{expected:successor,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(require.resolve('./issue256-successor-expected'))).digest('hex')};
}

module.exports={GOLDEN_PATH,loadIndependentExpected,expectedFor};
