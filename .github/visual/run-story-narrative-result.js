'use strict';
const fs=require('fs'),http=require('http'),path=require('path');
const {chromium,webkit}=require('playwright');
const ROOT=path.resolve(__dirname,'../..');
const OUTPUT=path.join(ROOT,'artifacts','story-narrative-result');
const engines={chromium,webkit};
const widths=[320,390,768];
const mime={'.css':'text/css','.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const evidence={status:'RUNNING',reports:[],failures:[]};
const write=()=>{fs.mkdirSync(OUTPUT,{recursive:true});fs.writeFileSync(path.join(OUTPUT,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');};
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const relative=pathname==='/'?'index.html':pathname.slice(1);
  const file=path.resolve(ROOT,relative);
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('not found');}
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/';write();
  try{
    for(const[browserName,launcher]of Object.entries(engines)){
      const browser=await launcher.launch();
      try{
        for(const width of widths){
          const page=await browser.newPage({viewport:{width,height:900}});
          const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error?.stack||error?.message||error)));
          try{
            await page.goto(url,{waitUntil:'load'});
            const report=await page.evaluate(()=>{
              document.querySelectorAll('.view').forEach(node=>{node.hidden=true;node.style.display='none';});
              const result=document.getElementById('view-result');result.hidden=false;result.style.display='block';
              const view=new window.AppView(document);
              const baselinePageWidth=document.documentElement.scrollWidth;
              const node=document.getElementById('narrative-result');
              const runtimeController=Object.create(window.AppController.prototype);
              runtimeController.model={state:{mode:'story',correctIds:['J050','F005','C005']},verifiedCorrectIds(){return this.state.correctIds;},isUnverified(){return false;}};
              runtimeController.questions=window.QuestionData||{};
              runtimeController.view=view;
              const authorityScenes=window.AnchorScenes||[];
              const questions=runtimeController.questions;
              const finale=authorityScenes.find(candidate=>candidate.sceneId==='CH12-BOSS');
              const finaleScenes=window.AppController.prototype.narrativeScenesForQuestion.call(runtimeController,questions.C005);
              const epilogueFacts=window.AppController.prototype.epilogueFactsForScene.call(runtimeController,finale);
              // Exercise the actual Controller authorization boundary in the browser,
              // not only the View's ability to render a supplied answer key.
              const gated=[];
              runtimeController.view={renderNarrativeResult(_scenes,options){gated.push({resolved:options.resolved,sourceIds:options.epilogueFacts.map(x=>x.sourceQuestionId)});return true;}};
              const resolve=window.AppController.prototype.renderNarrativeResolution;
              runtimeController.model.state.correctIds=[];
              resolve.call(runtimeController,questions.C005,true);
              runtimeController.model.state.correctIds=['C005'];
              resolve.call(runtimeController,questions.C005,true);
              runtimeController.model.state.correctIds=['J050','F005','C005'];
              resolve.call(runtimeController,questions.C005,true);
              runtimeController.view=view;
              const storyResolved=view.renderNarrativeResult(finaleScenes,{mode:'story',resolved:true,epilogueFacts});
              const visibleText=node.textContent;
              const sceneId=node.dataset.sceneId;
              const epilogueClass=node.classList.contains('narrative-result-epilogue');
              const containerOverflow=node.scrollWidth>node.clientWidth+1;
              const pageOverflowAdded=document.documentElement.scrollWidth>baselinePageWidth+1;
              const finalReportMarker=String(questions.C005?.story||'').includes('〔最終報告〕');
              const ordinaryCounterRemoved=!String(questions.C005?.story||'').includes('〔調査');
              const missingAuthorityScenes=authorityScenes.filter(authorityScene=>{
                const question=questions[authorityScene.referenceQuestionId];
                const matched=window.AppController.prototype.narrativeScenesForQuestion.call(runtimeController,question);
                return !matched.some(candidate=>candidate.sceneId===authorityScene.sceneId);
              }).map(authorityScene=>authorityScene.sceneId);
              const coveredChapters=[...new Set(authorityScenes.map(authorityScene=>authorityScene.chapter))].sort((a,b)=>a-b);
              const j049SceneIds=window.AppController.prototype.narrativeScenesForQuestion
                .call(runtimeController,questions.J049)
                .map(authorityScene=>authorityScene.sceneId);
              const isolatedModes=['training','review','exam'].every(mode=>{
                runtimeController.model.state.mode=mode;
                return window.AppController.prototype.narrativeScenesForQuestion
                  .call(runtimeController,questions.J001).length===0;
              });
              runtimeController.model.state.mode='story';
              const overflowingAuthorityScenes=[];
              for(const authorityScene of authorityScenes){
                view.renderNarrativeResult([authorityScene],{mode:'story',resolved:true});
                if(node.scrollWidth>node.clientWidth+1)overflowingAuthorityScenes.push(authorityScene.sceneId);
              }
              view.renderNarrativeResult(finaleScenes,{mode:'story',resolved:true,epilogueFacts});
              const wrongHidden=view.renderNarrativeResult(finaleScenes,{mode:'story',resolved:false,epilogueFacts})===false&&node.hidden===true;
              const trainingHidden=view.renderNarrativeResult(finaleScenes,{mode:'training',resolved:true,epilogueFacts})===false&&node.hidden===true;
              return{gated,storyResolved,visibleText,sceneId,epilogueClass,epilogueFacts,finalReportMarker,ordinaryCounterRemoved,containerOverflow,pageOverflowAdded,baselinePageWidth,finalPageWidth:document.documentElement.scrollWidth,wrongHidden,trainingHidden,authorityCount:authorityScenes.length,missingAuthorityScenes,coveredChapters,j049SceneIds,isolatedModes,overflowingAuthorityScenes};
            });
            report.browser=browserName;report.width=width;report.pageErrors=pageErrors;report.violations=[];
            if(JSON.stringify(report.gated)!==JSON.stringify([
              {resolved:false,sourceIds:[]},
              {resolved:true,sourceIds:['C005','C005']},
              {resolved:true,sourceIds:['J050','F005','C005','C005']}
            ]))report.violations.push('UNVERIFIED_FINAL_ACCOUNT_FACTS_VISIBLE');
            if(!report.storyResolved)report.violations.push('STORY_RESULT_NOT_RENDERED');
            if(!report.visibleText.includes('やっと、うちの会社が見えた'))report.violations.push('AFTER_MISSING');
            if(!report.visibleText.includes('最初の一枚'))report.violations.push('HOOK_MISSING');
            if(!report.visibleText.includes('あなたは社長へ伝えます'))report.violations.push('PROTAGONIST_STATEMENT_MISSING');
            if(!report.visibleText.includes('最終章で確定した数字'))report.violations.push('EPILOGUE_FACT_HEADING_MISSING');
            for(const amount of ['420,000円','1,280,000円','275,000円','45,000円'])if(!report.visibleText.includes(amount))report.violations.push('EPILOGUE_FACT_VALUE_MISSING:'+amount);
            if(!report.visibleText.includes('エピローグ'))report.violations.push('EPILOGUE_LABEL_MISSING');
            if(report.visibleText.includes('次の展開'))report.violations.push('ORDINARY_HOOK_LABEL_IN_FINALE');
            if(!report.finalReportMarker)report.violations.push('FINAL_REPORT_MARKER_MISSING');
            if(!report.ordinaryCounterRemoved)report.violations.push('ORDINARY_INVESTIGATION_COUNTER_REMAINS');
            if(JSON.stringify(report.epilogueFacts)!==JSON.stringify([
              {label:'当期純利益',value:420000,sourceQuestionId:'J050'},
              {label:'年度末資産合計',value:1280000,sourceQuestionId:'F005'},
              {label:'3月末現金',value:275000,sourceQuestionId:'C005'},
              {label:'3月利益',value:45000,sourceQuestionId:'C005'}
            ]))report.violations.push('EPILOGUE_FACT_SOURCE_MISMATCH');
            if(report.sceneId!=='CH12-BOSS')report.violations.push('SCENE_ID_MISSING');
            if(!report.epilogueClass)report.violations.push('EPILOGUE_CLASS_MISSING');
            if(!report.wrongHidden)report.violations.push('WRONG_REVEALS_RESULT');
            if(!report.trainingHidden)report.violations.push('TRAINING_MODE_LEAK');
            if(report.authorityCount!==36)report.violations.push('ANCHOR_AUTHORITY_COUNT');
            if(report.missingAuthorityScenes.length)report.violations.push('ANCHOR_RUNTIME_LOOKUP_MISSING:'+report.missingAuthorityScenes.join(','));
            if(report.coveredChapters.join(',')!=='1,2,3,4,5,6,7,8,9,10,11,12')report.violations.push('ANCHOR_CHAPTER_COVERAGE');
            if(report.j049SceneIds.join(',')!=='CH11-OPEN,CH11-REVERSAL')report.violations.push('CH11_DUPLICATE_REFERENCE');
            if(!report.isolatedModes)report.violations.push('NON_STORY_LOOKUP_LEAK');
            if(report.overflowingAuthorityScenes.length)report.violations.push('ANCHOR_OVERFLOW:'+report.overflowingAuthorityScenes.join(','));
            if(report.containerOverflow)report.violations.push('NARRATIVE_CONTAINER_OVERFLOW');
            if(report.pageOverflowAdded)report.violations.push('NARRATIVE_ADDED_PAGE_OVERFLOW');
            if(pageErrors.length)report.violations.push('PAGE_SCRIPT_ERROR');
            evidence.reports.push(report);
            if(report.violations.length)evidence.failures.push(`${browserName}/${width}: ${report.violations.join(',')}`);
            fs.mkdirSync(path.join(OUTPUT,browserName),{recursive:true});
            await page.screenshot({path:path.join(OUTPUT,browserName,`result-${width}.png`),fullPage:true});
            write();
          }finally{await page.close();}
        }
      }finally{await browser.close();}
    }
    if(evidence.failures.length)throw new Error(evidence.failures.join('\n'));
    evidence.status='PASS';write();console.log('ISSUE179_S3_NARRATIVE_RESULT_VISUAL_PASS');
  }catch(error){evidence.status='FAIL';evidence.error=error.message;write();throw error;}
  finally{await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
