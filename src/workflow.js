function checkPrerequisites(id){const missing=[];for(const p of PREREQUISITES[id]||[]){if(id==="blue_closing"&&state.meta.excluded.includes(p))continue;if(!state.results[p]||["invalid","idle","generating","interrupted"].includes(state.resultMeta[p]?.status))missing.push(p);}return missing;}
function shouldPauseForWarnings(warnings){const max=maxWarningSeverity(warnings);if(max==="blocking")return true;if(state.input.mode==="standard")return true;if(state.input.warningPolicy==="each_hat")return true;if(state.input.warningPolicy==="review_required"&&max==="review_required")return true;return false;}
function nextWorkflowHatId(){for(const id of HAT_IDS){const m=state.resultMeta[id];if(!state.results[id]||["invalid","stale","interrupted"].includes(m?.status))return id;}return null;}
function markDependentsStale(id,onlyExisting=true){for(const dep of DEPENDENTS[id]||[]){if(onlyExisting&&!state.results[dep])continue;if(!state.meta.stale.includes(dep))state.meta.stale.push(dep);if(state.resultMeta[dep])state.resultMeta[dep].status="stale";debugLog("dependency-stale",{source:id,dependent:dep});}}

async function runHat(id,opt={}){
  const missing=checkPrerequisites(id);if(missing.length){showGlobalNotice(`前段の結果が不足しています: ${missing.join("、")}`,"error");return {ok:false,continue:false};}
  if(!opt.workflow){const parent=state.runSummary?.runId||null;createRun("single",{parentRunId:parent,testCaseId:state.test?.testCaseId||null});}
  const previous=state.results[id]?clone(state.results[id]):null;const previousMeta=state.resultMeta[id]?clone(state.resultMeta[id]):freshResultMeta();
  state.meta.status="running";state.meta.currentHat=id;state.meta.interruptedHat=null;state.meta.pendingNextHat=null;state.resultMeta[id]={...freshResultMeta(),status:"generating",phase:"preparing_session",generation:{...freshResultMeta().generation,startedAt:now()}};
  debugLog("hat-run-start",{hatId:id,options:opt});startElapsed(id);renderAll();await queueAutosave("hat-start");abortController=new AbortController();
  try{
    setHatPhase(id,"preparing_session");const result=await callAI(id,opt);const meta=state.resultMeta[id];state.results[id]=result.candidate;meta.formatUsed=result.formatUsed;meta.schemaVariant=result.attempts.at(-1)?.schemaVariant||"normal";meta.rawOutput=result.raw;meta.normalizedOutput=JSON.stringify(result.candidate,null,2);meta.validation=result.validation;meta.status=result.validation.warnings.length?"warning":"valid";meta.generation={attemptCount:result.attempts.length,structuredAttempted:true,startedAt:result.attempts[0]?.startedAt||meta.generation.startedAt,completedAt:now(),durationMs:result.attempts.reduce((s,x)=>s+(x.durationMs||0),0),promptLength:result.attempts.at(-1)?.promptLength||0,responseLength:result.raw.length,contextUsageBefore:result.attempts.at(-1)?.contextUsageBefore??null,contextWindow:result.attempts.at(-1)?.contextWindow??null,attempts:result.attempts};meta.updatedAt=now();meta.lastError=null;meta.phase="saving";
    if(id==="blue_opening")state.decisionBoundary=buildDecisionBoundary(state.results.blue_opening);
    if(opt.regenerate||opt.deep||previous)markDependentsStale(id,true);
    state.meta.stale=state.meta.stale.filter(x=>x!==id);state.meta.currentHat=null;state.meta.phase=null;state.runSummary.lastCompletedHat=id;
    setHatPhase(id,"saving");await queueAutosave("hat-complete");meta.phase="complete";debugLog("hat-run-complete",{hatId:id,result:result.candidate,status:meta.status,schemaVariant:meta.schemaVariant});stopElapsed();
    const next=HAT_IDS[HAT_IDS.indexOf(id)+1]||null;
    if(id==="blue_closing"){state.meta.status="complete";finishRun("complete");await queueAutosave("workflow-complete");document.title="6色思考会議 — Gemini Nano";if(state.test?.testType==="generation")completeGenerationTest();renderAll();return {ok:true,continue:false};}
    if(!opt.workflow){state.meta.status="paused";finishRun("complete");await queueAutosave("single-hat-complete");renderAll();return {ok:true,continue:false};}
    const pause=shouldPauseForWarnings(meta.validation.warnings);
    if(pause){state.meta.status="awaiting_review";state.meta.pendingNextHat=next;if(state.runSummary)state.runSummary.status="awaiting_review";debugLog("workflow-awaiting-review",{hatId:id,nextHat:next});await queueAutosave("awaiting-review");renderAll();if(state.input.mode==="quick")openWarningDialog(id,next);return {ok:true,continue:false};}
    state.meta.status="paused";state.meta.pendingNextHat=next;renderAll();return {ok:true,continue:state.input.mode==="quick"};
  }catch(e){stopElapsed();state.meta.currentHat=null;state.meta.phase=null;const m=state.resultMeta[id];m.status=e.name==="AbortError"?"interrupted":"invalid";m.phase=null;m.lastError=errorData(e);m.validation={...emptyValidation(),errors:e.details||[e.message]};m.generation.attempts=e.attempts||[];m.generation.attemptCount=m.generation.attempts.length;m.generation.completedAt=now();m.updatedAt=now();state.meta.status=e.name==="AbortError"?"interrupted":"paused";state.meta.interruptedHat=id;if(previous){state.results[id]=previous;state.meta.interruptedHat=null;state.meta.status="paused";state.resultMeta[id]={...previousMeta,lastError:errorData(e),status:"warning",validation:{...previousMeta.validation,warnings:[...normalizeWarnings(previousMeta.validation?.warnings,id),createWarning("REGENERATION_FAILED","review_required",`再生成に失敗したため、以前の結果を保持しました: ${e.message}`,id)]}};}
    debugLog("hat-run-failed",{hatId:id,error:errorData(e)});await queueAutosave("hat-failed");renderAll();return {ok:false,continue:false};
  }finally{abortController=null;activeHatSession=null;}
}

async function runWorkflowFrom(startId){
  const startIndex=Math.max(0,HAT_IDS.indexOf(startId));
  if(state.input.mode==="quick"){
    for(let i=startIndex;i<HAT_IDS.length;i++){const id=HAT_IDS[i];if(state.results[id]&&!["invalid","stale","interrupted"].includes(state.resultMeta[id]?.status))continue;const r=await runHat(id,{workflow:true});if(!r.ok||!r.continue)break;}
  }else await runHat(HAT_IDS[startIndex],{workflow:true});
}
async function startFreshWorkflow(){
  pullInputs();if(!state.input.topic.trim()){showGlobalNotice("議題を入力してください。","error");$("#topic").focus();return;}
  stopGeneration();state.deterministic=extractDeterministicInput();state.decisionBoundary={criteria:[],outOfScope:[]};state.results={};state.resultMeta=Object.fromEntries(HAT_IDS.map(id=>[id,freshResultMeta()]));state.meta={status:"paused",currentHat:null,interruptedHat:null,phase:null,important:[],excluded:[],edited:[],stale:[],autosaveStatus:"未保存",lastAutosavedAt:null,pendingNextHat:null};state.test=state.test?.testType==="generation"?state.test:null;createRun(state.input.mode,{testCaseId:state.test?.testCaseId||null});renderAll();await queueAutosave("workflow-start");await runWorkflowFrom("blue_opening");
}
function findResumeHat(){if(state.meta.interruptedHat)return state.meta.interruptedHat;for(const id of HAT_IDS)if(["invalid","stale","interrupted"].includes(state.resultMeta[id]?.status))return id;for(const id of HAT_IDS)if(!state.results[id])return id;return null;}
async function resumeWorkflow(){pullInputs();state.deterministic=extractDeterministicInput();const id=findResumeHat();if(!id){showGlobalNotice("再開する未完了の帽子はありません。","warn");return;}const parent=state.runSummary?.runId||null;createRun(state.input.mode,{parentRunId:parent,testCaseId:state.test?.testCaseId||null});state.meta.status="paused";state.meta.interruptedHat=null;await queueAutosave("workflow-resume");debugLog("workflow-resume",{hatId:id});await runWorkflowFrom(id);}
async function startMeeting(){pullInputs();if(!state.input.topic.trim()){showGlobalNotice("議題を入力してください。","error");return;}if(Object.keys(state.results).length){openResumeDialog();return;}await startFreshWorkflow();}
