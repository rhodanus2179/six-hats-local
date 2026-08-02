const GREEN_GENERATION_TIMEOUT_MS=6*60*1000;
const destroyedSessions=new WeakSet();

function createInputBase(minimal=false){return {topic:safeText(state.input.topic,minimal?240:420),context:safeText(state.input.context,minimal?360:750),constraints:safeText(state.input.constraints,minimal?300:650),stakeholders:state.deterministic.stakeholders.map(x=>({id:x.id,name:x.name,priority:x.priority})),desiredOutcome:state.input.desiredOutcome,focus:state.deterministic.focusItems,detail:state.input.detail};}
function compactResult(id,r){
  if(!r)return null;
  if(id==="blue_opening")return {coreQuestion:safeText(r.coreQuestion,240),decisionCriteria:arr(r.decisionCriteria).slice(0,6),assumptions:arr(r.assumptions).slice(0,4),outOfScope:arr(r.outOfScope).slice(0,4),ambiguities:arr(r.ambiguities).slice(0,4)};
  if(id==="white")return {inputFacts:arr(r.inputFacts).slice(0,8).map(x=>({id:x.id,text:safeText(x.text,160)})),missingInformation:arr(r.missingInformation).slice(0,6).map(x=>({text:safeText(x.text,160),priority:x.priority})),assumptions:arr(r.assumptions).slice(0,5).map(x=>({text:safeText(x.text,150),relationToInput:x.relationToInput}))};
  if(id==="red")return {stakeholders:arr(r.stakeholders).slice(0,10).map(x=>({stakeholderId:x.stakeholderId,reaction:safeText(x.intuitiveReaction,100),concern:safeText(x.mainConcern||x.negativeFeeling||x.communicationConcern,100)})),consensusConcerns:arr(r.consensusConcerns).slice(0,4)};
  if(id==="black")return {summary:safeText(r.summary,200),topRisks:[...arr(r.risks)].sort((a,b)=>(b.likelihood*b.impact)-(a.likelihood*a.impact)).slice(0,4).map(x=>({name:x.name,cause:safeText(x.cause,120),likelihood:x.likelihood,impact:x.impact,mitigations:arr(x.mitigations).slice(0,2)})),fatalConditions:arr(r.fatalConditions).slice(0,3)};
  if(id==="yellow")return {summary:safeText(r.summary,200),benefits:arr(r.benefits).slice(0,4).map(x=>({name:x.name,description:safeText(x.description,120),conditions:arr(x.conditions).slice(0,2),indicators:arr(x.indicators).slice(0,2),evidenceLevel:x.evidenceLevel}))};
  if(id==="green")return {ideas:conclusionEligibleIdeas(r.ideas).slice(0,4).map(x=>({ideaId:x.ideaId,name:x.name,category:x.category,description:safeText(x.description,140),benefits:arr(x.benefits).slice(0,2),challenges:arr(x.challenges).slice(0,2)})),combinationIdeas:arr(r.combinationIdeas).slice(0,2)};
  return null;
}
function buildContext(id,minimal=false){
  const input=createInputBase(minimal),c={input};
  if(id==="white"&&state.results.blue_opening)c.blueOpening=compactResult("blue_opening",state.results.blue_opening);
  if(id==="red"){c.input={topic:input.topic,stakeholders:input.stakeholders};c.coreQuestion=state.results.blue_opening?.coreQuestion||"";}
  if(id==="black"){c.input={topic:input.topic,constraints:input.constraints,focus:input.focus};c.blueOpening=compactResult("blue_opening",state.results.blue_opening);c.white=compactResult("white",state.results.white);}
  if(id==="yellow"){c.input={topic:input.topic,focus:input.focus};c.blueOpening=compactResult("blue_opening",state.results.blue_opening);c.white=compactResult("white",state.results.white);}
  if(id==="green"){c.input={topic:input.topic,constraints:state.deterministic.constraints,decisionBoundary:state.decisionBoundary};c.black=compactResult("black",state.results.black);c.yellow=compactResult("yellow",state.results.yellow);}
  if(id==="blue_closing"){
    c.input={topic:input.topic,desiredOutcome:input.desiredOutcome,focus:input.focus,constraints:state.deterministic.constraints,decisionBoundary:state.decisionBoundary};
    for(const hid of HAT_IDS.slice(0,6))if(!state.meta.excluded.includes(hid)&&state.results[hid])c[hid]=compactResult(hid,state.results[hid]);
    c.excludedGreenIdeas=excludedIdeasForPrompt(state.results.green?.ideas);
    c.importantHats=state.meta.important.filter(x=>!state.meta.excluded.includes(x));
  }
  return c;
}
function buildPrompt(id,{deep=false,regenerate=false,compact=false}={},attempt=1,errors=[]){
  const depth=compact?"必須情報だけを短く回答してください。":state.input.detail==="brief"?"回答は簡潔にしてください。":state.input.detail==="detailed"?"必要な条件分岐を含めて詳しくしてください。ただしSchemaの件数・文字数上限を守ってください。":"過不足のない標準的な詳しさで回答してください。";
  const retry=attempt>1?`\n前回の出力は要件を満たしませんでした。次だけを修正してください: ${errors.slice(0,4).map(x=>safeText(x,120)).join(" / ")}`:"";
  const compactNote=compact?"\n出力を短縮して再試行しています。重複を避け、指定件数と文字数以内で回答してください。":"";
  const conclusionRule=id==="blue_closing"?"\n入力のexcludedGreenIdeasは比較案、推奨案、推奨ラベル、推奨理由、要約、成功条件、次の行動に含めないでください。recommendation.labelはrecommendation.optionIdが参照する比較案のlabelと一致させてください。":"";
  return `役割:\n${ROLE_PROMPTS[id]}\n\n回答方針:\n${depth}${deep?"\n通常より一段深く、見落としを追加してください。":""}${regenerate?"\n前回とは異なる切り口も検討してください。":""}${compactNote}${conclusionRule}${retry}\n\n入力情報:\n${JSON.stringify(buildContext(id,attempt>1||compact))}`;
}

function setHatPhase(id,phase){state.meta.phase=phase;const m=state.resultMeta[id]||freshResultMeta();m.phase=phase;state.resultMeta[id]=m;debugLog("hat-phase-change",{hatId:id,phase});renderAll();}
function startElapsed(id){stopElapsed();elapsedStartedAtMs=Date.now();elapsedTimer=setInterval(updateElapsedDisplay,1000);debugLog("elapsed-timer-start",{hatId:id});}
function stopElapsed(){if(elapsedTimer){clearInterval(elapsedTimer);elapsedTimer=null;}}
function formatElapsed(ms){const s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;}
function updateElapsedDisplay(){const el=$(`[data-elapsed="${state.meta.currentHat}"]`);if(el)el.textContent=formatElapsed(Date.now()-elapsedStartedAtMs);const top=$("#liveElapsed");if(top)top.textContent=formatElapsed(Date.now()-elapsedStartedAtMs);}

function queueAutosave(reason){pendingSave=pendingSave.catch(()=>{}).then(()=>autosaveMeeting(reason));return pendingSave;}
async function autosaveMeeting(reason){
  state.meta.autosaveStatus="保存中";renderSidebar();debugLog("autosave-start",{reason});
  try{state.updatedAt=now();const all=JSON.parse(storage.getItem(STORAGE_KEY)||"{}");all[state.id]=clone(state);storage.setItem(STORAGE_KEY,JSON.stringify(all));state.meta.lastAutosavedAt=now();state.meta.autosaveStatus="保存済み";if(state.meta.currentHat&&state.resultMeta[state.meta.currentHat])state.resultMeta[state.meta.currentHat].autosavedAt=state.meta.lastAutosavedAt;debugLog("autosave-complete",{reason});}
  catch(e){state.meta.autosaveStatus="保存失敗";debugLog("autosave-error",{reason,error:errorData(e)});showGlobalNotice("自動保存に失敗しました。JSONを書き出して結果を保護してください。","error");}
  renderSidebar();
}
function showGlobalNotice(message,type="warn"){const el=$("#aiNotice");el.className=`notice ${type}`;el.textContent=message;el.classList.remove("hidden");}

async function detectAI(){
  debugLog("ai-detection-start");
  try{
    if(self.LanguageModel?.availability){ai.api=self.LanguageModel;const a=await self.LanguageModel.availability(AI_SESSION_OPTIONS);if(["available","readily"].includes(a)){ai.status="available";ai.label="モデル準備完了";}else if(["downloadable","downloading","after-download"].includes(a)){ai.status="downloadable";ai.label="モデル準備が必要";}else{ai.status="unavailable";ai.label="Gemini Nano 利用不可（デモ）";}}
    else{ai.status="unavailable";ai.label="Gemini Nano 利用不可（デモ）";}
  }catch(e){ai.status="unavailable";ai.label="Gemini Nano 利用不可（デモ）";debugLog("ai-detection-error",{error:errorData(e)});}
  debugLog("ai-detection-result",{status:ai.status,label:ai.label});updateAIPill();renderSidebar();
}
function updateAIPill(){const p=$("#aiPill"),span=p?.querySelector("span");if(!p||!span)return;span.textContent=ai.label;p.className="statusPill "+(ai.status==="available"?"ok":ai.status==="downloadable"?"warn":"bad");}
async function ensureBaseSession(signal){
  if(ai.status==="unavailable")return null;if(ai.baseSession)return ai.baseSession;
  if(!ai.api)await detectAI();if(ai.status==="unavailable")return null;
  ai.label="モデルを準備しています";updateAIPill();debugLog("session-create-start",{kind:"base"});
  const options={...AI_SESSION_OPTIONS,initialPrompts:[{role:"system",content:SYSTEM_PROMPT}],signal,monitor(m){m.addEventListener("downloadprogress",e=>{const pct=Math.round((e.loaded||0)*100);ai.label=pct>=100?"モデルを読み込んでいます":`モデル準備中 ${pct}%`;updateAIPill();});}};
  ai.baseSession=await ai.api.create(options);ai.status="available";ai.label="モデル準備完了";updateAIPill();debugLog("session-create-complete",{kind:"base",contextWindow:ai.baseSession.contextWindow});return ai.baseSession;
}
async function createHatSession(signal){const base=await ensureBaseSession(signal);if(!base)return null;debugLog("session-create-start",{kind:"hat"});const session=typeof base.clone==="function"?await base.clone({signal}):await ai.api.create({...AI_SESSION_OPTIONS,initialPrompts:[{role:"system",content:SYSTEM_PROMPT}],signal});debugLog("session-create-complete",{kind:"hat"});return session;}
function destroySession(session,kind="hat"){if(!session||destroyedSessions.has(session))return;try{destroyedSessions.add(session);session.destroy?.();debugLog("session-destroy",{kind});}catch{}}
function destroyBaseSession(){destroySession(ai.baseSession,"base");ai.baseSession=null;}
function stopGeneration(){abortController?.abort();destroySession(activeHatSession,"hat");activeHatSession=null;stopElapsed();}

function classifyQuotaError(error){const msg=String(error?.message||"").toLowerCase();if(msg.includes("response exceeded output limits")||msg.includes("truncated")||msg.includes("output limit"))return "output_limit";if(Number.isFinite(error?.requested)&&Number.isFinite(error?.contextWindow))return "input_context";return "quota_unknown";}
function isRetryable(error,attempt){if(attempt>=2)return false;if(["AbortError","NotSupportedError","ReferenceError","TypeError"].includes(error?.name))return false;return ["QuotaExceededError","SchemaValidationError","SemanticValidationError","SyntaxError","GenerationTimeoutError"].includes(error?.name)||/json/i.test(error?.message||"");}
function promptWithTimeout(session,prompt,options,id){
  if(!session)return Promise.resolve("");
  const timeoutMs=id==="green"?GREEN_GENERATION_TIMEOUT_MS:0;
  if(!timeoutMs)return session.prompt(prompt,options);
  return new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{
      if(settled)return;settled=true;destroySession(session,"hat");if(activeHatSession===session)activeHatSession=null;
      const error=new Error(`緑の帽子が${Math.round(timeoutMs/60000)}分以内に応答しませんでした`);error.name="GenerationTimeoutError";error.timeoutMs=timeoutMs;
      debugLog("generation-timeout",{hatId:id,timeoutMs});reject(error);
    },timeoutMs);
    Promise.resolve(session.prompt(prompt,options)).then(
      value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);},
      error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);}
    );
  });
}
function failedAttemptMeta({attempt,variant,attemptId,startedAt,prompt,raw,measured,session,error}){const completedAt=Date.now();return {attempt,attemptId:attemptId||null,startedAt:new Date(startedAt).toISOString(),completedAt:new Date(completedAt).toISOString(),durationMs:Math.max(0,completedAt-startedAt),promptLength:prompt.length,responseLength:raw.length,contextUsageBefore:session?.contextUsage??null,measuredContextUsage:measured,contextWindow:session?.contextWindow??null,schemaVariant:variant,error:errorData(error)};}

async function structuredAttempt(id,variant,attempt,opt,previousErrors){
  const session=await createHatSession(abortController.signal);activeHatSession=session;const schemaContext=id==="blue_closing"?conclusionSchemaContext(state):state;const schema=schemaFor(id,variant,schemaContext);const compact=variant==="compact";
  let prompt="",measured=null,raw="",attemptStarted=Date.now(),attemptId=null;
  try{
    setHatPhase(id,"measuring_context");prompt=buildPrompt(id,{...opt,compact},attempt,previousErrors);attemptStarted=Date.now();
    if(session?.measureContextUsage){try{measured=await session.measureContextUsage(prompt,{responseConstraint:schema});}catch(e){debugLog("context-measure-error",{hatId:id,error:errorData(e)});}}
    debugLog("context-usage",{hatId:id,attempt,schemaVariant:variant,measured,contextUsage:session?.contextUsage??null,contextWindow:session?.contextWindow??null,promptLength:prompt.length});
    setHatPhase(id,"generating");currentAttemptId=`${currentRunId||"manual"}-${id}-${attempt}`;attemptId=currentAttemptId;const started=Date.now();debugLog("structured-generation-start",{hatId:id,attempt,schemaVariant:variant,promptLength:prompt.length,prompt});
    raw=session?await promptWithTimeout(session,prompt,{responseConstraint:schema,signal:abortController.signal},id):JSON.stringify(demoResult(id,variant));
    const durationMs=Date.now()-started;debugLog("structured-generation-complete",{hatId:id,attempt,schemaVariant:variant,rawLength:raw.length,raw});
    setHatPhase(id,"receiving");let candidate;try{candidate=JSON.parse(raw);}catch(e){e.name="SyntaxError";e.raw=raw;throw e;}
    setHatPhase(id,"validating_schema");const schemaErrors=validateSchema(candidate,schema);debugLog("schema-validation",{hatId:id,attempt,valid:!schemaErrors.length,errors:schemaErrors});if(schemaErrors.length)throw new SchemaValidationError("JSON Schemaを満たしません",schemaErrors);
    setHatPhase(id,"validating_semantics");const semantic=semanticValidate(id,candidate,state,variant);debugLog("semantic-validation",{hatId:id,attempt,warnings:semantic.warnings,errors:semantic.errors});if(semantic.errors.length)throw new SemanticValidationError("意味検証を満たしません",semantic.errors);
    const validation={valid:true,errors:[],warnings:semantic.warnings,placeholderHits:semantic.placeholderHits,missingRequired:[],semanticChecks:semantic.semanticChecks};
    return {candidate:transformCandidate(id,candidate,variant),raw,validation,attemptMeta:{attempt,attemptId,startedAt:new Date(started).toISOString(),completedAt:now(),durationMs,promptLength:prompt.length,responseLength:raw.length,contextUsageBefore:session?.contextUsage??null,measuredContextUsage:measured,contextWindow:session?.contextWindow??null,schemaVariant:variant},formatUsed:session?"json_schema":"demo"};
  }catch(e){e.attemptMeta=failedAttemptMeta({attempt,variant,attemptId,startedAt:attemptStarted,prompt,raw,measured,session,error:e});throw e;}
  finally{destroySession(session,"hat");activeHatSession=null;currentAttemptId=null;}
}
async function callAI(id,opt={}){
  const attempts=[];let previousErrors=[];let variant=id==="red"?selectRedSchemaVariant(state.deterministic.stakeholders.length):"normal";
  for(let attempt=1;attempt<=2;attempt++){
    try{const result=await structuredAttempt(id,variant,attempt,opt,previousErrors);attempts.push(result.attemptMeta);return {...result,attempts};}
    catch(e){const details=e.details||[e.message];debugLog("structured-generation-error",{hatId:id,attempt,schemaVariant:variant,error:errorData(e),details});attempts.push(e.attemptMeta||{attempt,attemptId:null,startedAt:null,completedAt:now(),durationMs:0,promptLength:0,responseLength:0,contextUsageBefore:null,measuredContextUsage:null,contextWindow:null,schemaVariant:variant,error:errorData(e)});if(!isRetryable(e,attempt)){e.attempts=attempts;throw e;}previousErrors=details;const quota=e.name==="QuotaExceededError"?classifyQuotaError(e):null;if(quota==="output_limit"||quota==="input_context"||id==="red"||id==="green"||id==="blue_closing")variant="compact";debugLog("structured-generation-retry",{hatId:id,nextAttempt:attempt+1,reason:errorData(e),schemaVariant:variant});if(state.runSummary)state.runSummary.retryCount++;setHatPhase(id,"retrying_compact");}
  }
  throw new Error("再試行に失敗しました");
}
