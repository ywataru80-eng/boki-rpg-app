(function(root){
'use strict';
// Raw native storage only, under the same origin-wide writer lock as the
// existing answer transaction. An absent key is NOT the reset tombstone.
const KEYS=Object.freeze({FY2026:'boki-rpg-progress-v3',FY2027:'boki-rpg-progress-v3:FY2027',character:'boki-rpg-character-v2'});
const JOURNAL='boki-rpg-annual-transaction-v1';
const years=['FY2026','FY2027'],names=Object.keys(KEYS);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(o,ks)=>plain(o)&&Object.keys(o).length===ks.length&&ks.every(k=>own(o,k));
const raw=x=>x===null||typeof x==='string';
// Explicit empty primary slots occupy their own key: normal model writes
// replace them atomically. An absent restore must not re-trigger legacy migration.
const ABSENT='boki-rpg:restored-absent:v1',SCOPED_RESET='boki-rpg:year-reset:v1';
const intentionalEmpty=(key,v)=>(key===KEYS.FY2026&&(v===ABSENT||v===SCOPED_RESET))||(key===KEYS.character&&v===ABSENT);
const stateOf=v=>v===null||v===ABSENT?'absent':v==='null'||v===SCOPED_RESET?'reset':'saved';
const sig=o=>{let h=2166136261;const s=JSON.stringify([o.version,names.map(n=>o.before[n])]);for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619)>>>0;return h.toString(16).padStart(8,'0');};
// Wrong answers, partial scores and archived observations affect shared RPG
// mastery and confidence even when no correct answer or XP has been earned.
// Drafts, a placement choice and an unsubmitted mock alone are not evidence.
const nonempty=a=>Array.isArray(a)&&a.length>0;
const observed=q=>q&&(q.correctCount>0||q.incorrectCount>0||q.observedAttempts>0||q.delayedReview?.attempts>0);
const requiresCharacter=p=>
 ['answeredIds','correctIds','incorrectIds','attempts','examHistory'].some(k=>nonempty(p[k]))||
 Object.values(p.questionStats||{}).some(observed)||Object.values(p.learningEffectiveness?.questions||{}).some(observed)||
 Object.values(p.mistakeCounts||{}).some(n=>n>0)||
 Object.values(p.contentMigrationArchive?.questions||{}).some(q=>nonempty(q.attempts)||nonempty(q.examHistory)||
   Object.values(q.flags||{}).some(Boolean)||observed(q.questionStats)||observed(q.learningEvidence)||q.mistakeCount>0);
function create(store,{owns,validateProgress,validateCharacter,yearAllowed=()=>true,recoverAnswer=null}){
 if(typeof owns!=='function'||typeof validateProgress!=='function'||typeof validateCharacter!=='function'||typeof yearAllowed!=='function')throw Error('annual contract');
 const guard=()=>{if(!owns())throw Error('writer lock required');};
 const read=k=>{guard();const v=store.getItem(k);if(!raw(v))throw Error('storage read');return v;};
 const put=(k,v)=>{guard();if((v===null?store.removeItem(k):store.setItem(k,v))===false)throw Error('storage write');if(read(k)!==v)throw Error('storage verification');};
 const pending=()=>years.filter(y=>{const v=read(KEYS[y]+':pending-answer-v1');return v!==null&&v!=='';});
 const readAll=()=>Object.fromEntries(names.map(n=>[n,read(KEYS[n])]));
 const validRaw=(n,v)=>{if(v===null)return true;if(n!=='character'&&!yearAllowed(n))return false;if(v==='null'||intentionalEmpty(KEYS[n],v))return true;try{const o=JSON.parse(v);return plain(o)&&(n==='character'?validateCharacter(o):validateProgress(n,o))===true;}catch(_){return false;}};
 const validState=o=>exact(o,names)&&names.every(n=>raw(o[n])&&validRaw(n,o[n]))&&
   (stateOf(o.character)==='saved'||years.every(y=>stateOf(o[y])!=='saved'||!requiresCharacter(JSON.parse(o[y]))));
 function recover(){guard();const v=read(JOURNAL),answers=pending();
  if(answers.length>1||(v!==null&&answers.length))throw Error('competing recovery journals');
  if(answers.length){const y=answers[0];if(!yearAllowed(y)||typeof recoverAnswer!=='function'||recoverAnswer(y)!==true||pending().length)throw Error('answer recovery required before annual recovery');}
  if(v===null)return true;
  const j=JSON.parse(v);if(!exact(j,['version','before','signature'])||j.version!==1||!validState(j.before)||j.signature!==sig(j))throw Error('invalid annual journal');
  for(const n of names)if(read(KEYS[n])!==j.before[n])put(KEYS[n],j.before[n]);put(JOURNAL,null);return true;
 }
 function snapshot(){recover();const s=readAll();if(!validState(s))throw Error('invalid annual state');return s;}
 function transact(change){const before=snapshot(),after=change({...before});if(!validState(after))throw Error('invalid proposed state');const j={version:1,before};j.signature=sig(j);let clearing=false;
  try{put(JOURNAL,JSON.stringify(j));for(const n of names)if(after[n]!==before[n])put(KEYS[n],after[n]);clearing=true;put(JOURNAL,null);return true;}
  catch(e){try{if(read(JOURNAL)===null){const actual=readAll();if(clearing&&names.every(n=>actual[n]===after[n]))return true;if(!names.every(n=>actual[n]===before[n]))throw Error('unrecorded change');}else recover();}catch(_){throw Error('annual recovery pending');}throw e;}
 }
 const pack=v=>stateOf(v)==='saved'?{status:'saved',state:JSON.parse(v)}:{status:stateOf(v)};
 const unpack=(n,v)=>{if(exact(v,['status'])&&v.status==='absent')return n==='FY2027'?null:ABSENT;if(exact(v,['status'])&&v.status==='reset')return 'null';if(exact(v,['status','state'])&&v.status==='saved'&&plain(v.state)){const s=JSON.stringify(v.state);if(validRaw(n,s))return s;}throw Error('invalid namespace entry');};
 function exportV2(){const s=snapshot();return {format:'boki-rpg-backup',version:2,progress:{FY2026:pack(s.FY2026),FY2027:pack(s.FY2027)},character:pack(s.character)};}
 function importV2(p,{confirmReplaceAll=false}={}){if(!confirmReplaceAll||!exact(p,['format','version','progress','character'])||p.format!=='boki-rpg-backup'||p.version!==2||!exact(p.progress,years))throw Error('full restore confirmation or format');const next={FY2026:unpack('FY2026',p.progress.FY2026),FY2027:unpack('FY2027',p.progress.FY2027),character:unpack('character',p.character)};if(next.FY2026==='null'&&stateOf(next.character)==='saved')next.FY2026=SCOPED_RESET;if(!validState(next))throw Error('invalid backup');return transact(()=>next);}
 function importV1(p,{confirmLegacyRestore=false}={}){if(!confirmLegacyRestore||!plain(p)||p.format!=='boki-rpg-backup'||p.version!==1||!plain(p.progress)||!plain(p.character)||validateProgress('FY2026',p.progress)!==true||validateCharacter(p.character)!==true)throw Error('invalid legacy backup');return transact(s=>{if(s.FY2027!==null)throw Error('legacy full restore would overwrite shared rewards');return {...s,FY2026:JSON.stringify(p.progress),character:JSON.stringify(p.character)};});}
 function resetYear(y,{confirm=false}={}){if(!years.includes(y)||!yearAllowed(y)||!confirm)throw Error('year reset confirmation');return transact(s=>({...s,[y]:y==='FY2026'?SCOPED_RESET:'null'}));}
 function resetAll({confirm=false}={}){if(!confirm)throw Error('all reset confirmation');return transact(s=>({FY2026:'null',FY2027:yearAllowed('FY2027')?'null':s.FY2027,character:'null'}));}
 return Object.freeze({snapshot,recover,exportV2,importV2,importV1,resetYear,resetAll});
}
const api=Object.freeze({create,KEYS,JOURNAL,intentionalEmpty});if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AnnualStorage=api;
})(typeof window!=='undefined'?window:globalThis);
