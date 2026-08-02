/* Schema 4 Lite core: candidate selection and deterministic final-blue artifacts. */
(function installSchema4Core(){
  "use strict";
  const S=window.Schema4Lite={legacy:{
    freshState,hashBuildAssets,calculateInformationCompleteness,semanticValidate,
    transformCandidate,aiCandidateForValidation,buildContext,buildPrompt,
    conclusionSchemaContext,structuredAttempt,demoResult,renderResult,renderCard,
    bindCardActions,runHat,startFreshWorkflow,markDependentsStale,migrateState,
    migrateStoredMeetings,runTestAssertions,continueAfterWarning
  }};
  const L=S.legacy;

  function freshSelection(){return {state:"empty",sourceGreenUpdatedAt:null,maxCandidates:3,items:[],confirmedAt:null};}
  function ensureState(x){
    x=x&&typeof x==="object"?x:L.freshState();
    x.build={...BUILD,...(x.build||{}),appVersion:APP_VERSION,schemaVersion:SCHEMA_VERSION,promptVersion:BUILD.promptVersion,validatorVersion:BUILD.validatorVersion,buildId:BUILD.buildId,buildDate:BUILD.buildDate};
    x.appVersion=APP_VERSION;x.schemaVersion=SCHEMA_VERSION;
    if(!x.candidateSelection||typeof x.candidateSelection!=="object")x.candidateSelection=freshSelection();
    x.candidateSelection.maxCandidates=3;x.candidateSelection.items=arr(x.candidateSelection.items);
    return x;
  }
  freshState=function(){return ensureState(L.freshState());};
  state=ensureState(state);

  hashBuildAssets=async function(){
    const schemaText=JSON.stringify({base:BASE_SCHEMAS,red:"dynamic-v2",green:"schema4-lite-concerns",blue_closing:"schema4-lite"});
    const hashes=await Promise.all([sha256Short(SYSTEM_PROMPT),sha256Short(JSON.stringify(ROLE_PROMPTS)),sha256Short(schemaText),sha256Short("validator-v3-schema4-lite")]);
    state.build={...BUILD,systemPromptHash:hashes[0],rolePromptsHash:hashes[1],schemaSetHash:hashes[2],validatorConfigHash:hashes[3]};
  };

  function reasonsFor(idea){
    const out=[];
    for(const x of arr(idea?.constraintAssessments)){
      if(x.status==="violates")out.push({code:"constraint_violation",relatedIds:[x.constraintId]});
      else if(x.status==="unknown")out.push({code:"constraint_unknown",relatedIds:[x.constraintId]});
    }
    for(const x of arr(idea?.outOfScopeAssessments)){
      if(x.status==="conflicts")out.push({code:"out_of_scope_conflict",relatedIds:[x.outOfScopeId]});
      else if(["unknown","possibly_conflicts"].includes(x.status))out.push({code:"out_of_scope_uncertain",relatedIds:[x.outOfScopeId]});
    }
    if(!arr(idea?.constraintAssessments).length)out.push({code:"assessment_missing",relatedIds:[]});
    return out;
  }
  function deriveInitialDisposition(idea){
    const r=reasonsFor(idea);
    if(r.some(x=>["constraint_violation","out_of_scope_conflict"].includes(x.code)))return "exclude";
    return r.length?"conditional":"include";
  }
  function reasonLabel(r){const id=arr(r.relatedIds)[0]||"";return ({constraint_violation:`制約 ${id} に違反する可能性`,out_of_scope_conflict:`対象外 ${id} に抵触`,constraint_unknown:`制約 ${id} の評価が不明`,out_of_scope_uncertain:`対象外 ${id} との関係が未確定`,assessment_missing:"制約評価が未実施",user_override:"ユーザーが採否を変更"})[r.code]||r.code;}

  function initializeCandidateSelection(force=false,ctx=state){
    const ideas=arr(ctx.results?.green?.ideas),version=ctx.resultMeta?.green?.updatedAt||null;
    if(!force&&ctx.candidateSelection?.sourceGreenUpdatedAt===version&&ctx.candidateSelection.items?.length===ideas.length)return ctx.candidateSelection;
    ctx.candidateSelection={state:ideas.length?"pending":"empty",sourceGreenUpdatedAt:version,maxCandidates:3,items:ideas.map(idea=>{const autoDisposition=deriveInitialDisposition(idea);return {ideaId:idea.ideaId,autoDisposition,disposition:autoDisposition,reasons:reasonsFor(idea),changedBy:"auto",updatedAt:now()};}),confirmedAt:null};
    debugLog("candidate-selection-initialized",{items:ctx.candidateSelection.items.map(x=>({ideaId:x.ideaId,disposition:x.disposition}))});
    return ctx.candidateSelection;
  }
  function validateCandidateSelection(selection=state.candidateSelection,ctx=state){
    const errors=[],warnings=[],ideas=arr(ctx.results?.green?.ideas),ideaIds=ideas.map(x=>x.ideaId),items=arr(selection?.items),ids=items.map(x=>x.ideaId);
    if(!ideas.length)errors.push("緑の案がありません");
    if(selection?.sourceGreenUpdatedAt!==ctx.resultMeta?.green?.updatedAt)errors.push("緑の結果更新後に候補選択が再確認されていません");
    const unknown=ids.filter(x=>!ideaIds.includes(x)),missing=ideaIds.filter(x=>!ids.includes(x)),dup=ids.filter((x,i)=>ids.indexOf(x)!==i);
    if(unknown.length)errors.push(`未知の案IDがあります: ${unique(unknown).join("、")}`);
    if(missing.length)errors.push(`未処理の案があります: ${missing.join("、")}`);
    if(dup.length)errors.push(`重複案IDがあります: ${unique(dup).join("、")}`);
    const chosen=items.filter(x=>["include","conditional"].includes(x.disposition));
    if(chosen.length<1)errors.push("最終比較候補を1件以上選択してください");
    if(chosen.length>3)errors.push("最終比較候補は最大3件です");
    if(chosen.some(x=>x.disposition==="conditional"))warnings.push("条件付き候補が含まれています");
    return {valid:!errors.length,errors,warnings,candidateIds:chosen.map(x=>x.ideaId)};
  }

  function selectedPairs(ctx=state){const byId=new Map(arr(ctx.results?.green?.ideas).map(x=>[x.ideaId,x]));return arr(ctx.candidateSelection?.items).filter(x=>["include","conditional"].includes(x.disposition)).map(item=>({item,idea:byId.get(item.ideaId)})).filter(x=>x.idea);}
  function compactCandidate({item,idea},compact){return {ideaId:idea.ideaId,disposition:item.disposition,name:safeText(idea.name,120),summary:safeText(idea.description,compact?140:220),benefits:arr(idea.benefits).slice(0,compact?1:2).map(x=>safeText(x,180)),challenges:arr(idea.challenges).slice(0,compact?1:2).map(x=>safeText(x,180)),conditionNotes:item.disposition==="conditional"?arr(item.reasons).slice(0,compact?1:2).map(reasonLabel):[]};}
  function makeTopRisks(ctx,compact){return [...arr(ctx.results?.black?.risks)].sort((a,b)=>((b.likelihood||0)*(b.impact||0))-((a.likelihood||0)*(a.impact||0))).slice(0,compact?2:3).map((x,i)=>({riskId:`R-${String(i+1).padStart(3,"0")}`,name:safeText(x.name,120),cause:safeText(x.cause,compact?120:180),likelihood:Number(x.likelihood)||0,impact:Number(x.impact)||0}));}
  function makeTopBenefits(ctx,compact){return arr(ctx.results?.yellow?.benefits).slice(0,2).map((x,i)=>({benefitId:`B-${String(i+1).padStart(3,"0")}`,name:safeText(x.name,120),description:safeText(x.description,compact?120:180)}));}
  function makeMissing(ctx,compact){const rank={high:0,medium:1,low:2};return [...arr(ctx.results?.white?.missingInformation)].sort((a,b)=>(rank[a.priority]??9)-(rank[b.priority]??9)).slice(0,compact?2:3).map((x,i)=>({missingId:`MI-${String(i+1).padStart(3,"0")}`,text:safeText(x.text,compact?140:200),priority:x.priority}));}
  function makeActions(pairs,missing,compact){
    const limit=compact?4:6,out=[],seen=new Set();
    const add=x=>{if(out.length>=limit)return false;const key=`${x.ideaId||"GLOBAL"}|${normalizeText(x.text)}`;if(!normalizeText(x.text)||seen.has(key))return false;seen.add(key);out.push(x);return true;};
    const groups=pairs.map(({idea})=>{
      const base=idea.ideaId.replace(/[^A-Z0-9]/gi,""),items=[];
      if(String(idea.pilotMethod||"").trim())items.push({actionId:`ACT-${base}-PILOT`,ideaId:idea.ideaId,type:"pilot",text:safeText(idea.pilotMethod,220)});
      arr(idea.requirements).slice(0,2).forEach((text,i)=>items.push({actionId:`ACT-${base}-REQ-${i+1}`,ideaId:idea.ideaId,type:"requirement",text:safeText(text,220)}));
      if(!items.length)items.push({actionId:`ACT-${base}-REVIEW`,ideaId:idea.ideaId,type:"review",text:`「${safeText(idea.name,100)}」の実施条件を確認する`});
      return items;
    });
    for(const group of groups)add(group[0]);
    for(let depth=1;out.length<limit&&groups.some(group=>group[depth]);depth++)for(const group of groups)if(group[depth])add(group[depth]);
    for(const m of missing.filter(x=>x.priority==="high"))add({actionId:`ACT-RESEARCH-${m.missingId}`,ideaId:null,type:"research",text:safeText(m.text,220)});
    return out.slice(0,limit);
  }
  function buildFinalBlueArtifacts(ctx=state,variant="normal"){
    const compact=variant==="compact",selection=validateCandidateSelection(ctx.candidateSelection,ctx);if(!selection.valid)throw new Error(selection.errors.join(" / "));
    const pairs=selectedPairs(ctx),missing=makeMissing(ctx,compact);
    return {topic:safeText(ctx.input?.topic,320),decisionCriteria:arr(ctx.decisionBoundary?.criteria).slice(0,compact?3:4).map(x=>({id:x.id,text:safeText(x.text,160)})),candidates:pairs.map(x=>compactCandidate(x,compact)),topRisks:makeTopRisks(ctx,compact),topBenefits:makeTopBenefits(ctx,compact),missingInformation:missing,actionCandidates:makeActions(pairs,missing,compact)};
  }
  function validateFinalBlue(data,ctx=state){
    const errors=[],warnings=[],a=buildFinalBlueArtifacts(ctx,"normal"),candidateIds=a.candidates.map(x=>x.ideaId),actionIds=a.actionCandidates.map(x=>x.actionId);
    if(!candidateIds.includes(data.selectedIdeaId))errors.push("推奨案IDが確定候補に存在しません");
    const evalIds=arr(data.ideaEvaluations).map(x=>x.ideaId),dup=evalIds.filter((x,i)=>evalIds.indexOf(x)!==i),missing=candidateIds.filter(x=>!evalIds.includes(x)),unknown=evalIds.filter(x=>!candidateIds.includes(x));
    if(dup.length)errors.push(`案別評価IDが重複しています: ${unique(dup).join("、")}`);if(missing.length)errors.push(`未評価の候補があります: ${missing.join("、")}`);if(unknown.length)errors.push(`未知の評価対象があります: ${unique(unknown).join("、")}`);
    const selectedActions=arr(data.selectedActionIds),unknownActions=selectedActions.filter(x=>!actionIds.includes(x));if(new Set(selectedActions).size!==selectedActions.length)errors.push("アクションIDが重複しています");if(unknownActions.length)errors.push(`未知のアクションIDがあります: ${unique(unknownActions).join("、")}`);
    const actionObjects=selectedActions.map(id=>a.actionCandidates.find(x=>x.actionId===id)).filter(Boolean);if(["proceed","conditional","pilot"].includes(data.decisionType)&&!actionObjects.some(x=>x.ideaId===data.selectedIdeaId))errors.push("選択案に属する着手候補を1件以上選択してください");if(actionObjects.some(x=>x.ideaId&&x.ideaId!==data.selectedIdeaId))errors.push("選択案以外に属するアクションが含まれています");
    const allZero=arr(data.ideaEvaluations).every(x=>Number(x.feasibility)===0&&Number(x.recommendationScore)===0);if(allZero&&!['research','compare'].includes(data.decisionType))errors.push("全案未評価の場合は追加調査または比較継続を選択してください");
    const excluded=arr(ctx.candidateSelection?.items).filter(x=>x.disposition==="exclude").map(x=>arr(ctx.results?.green?.ideas).find(y=>y.ideaId===x.ideaId)).filter(Boolean),text=normalizeText(stringsIn({keyReasons:data.keyReasons,ideaEvaluations:data.ideaEvaluations}).join(" "));for(const idea of excluded){const name=normalizeText(idea.name);if(name&&text.includes(name))errors.push(`結論理由に除外案「${idea.name}」が含まれています`);}
    if(a.candidates.some(x=>x.disposition==="conditional"))warnings.push(createWarning("BLUE_CONDITIONAL_CANDIDATE","review_required","条件付き候補を含む比較です","blue_closing"));
    return {errors,warnings,artifacts:a};
  }
  function assembleFinalDecision(modelResult,ctx=state,variant="normal"){
    const a=buildFinalBlueArtifacts(ctx,variant),selectedIdea=arr(ctx.results?.green?.ideas).find(x=>x.ideaId===modelResult.selectedIdeaId),selection=arr(ctx.candidateSelection?.items).find(x=>x.ideaId===modelResult.selectedIdeaId);
    return {modelResult:clone(modelResult),decisionType:modelResult.decisionType,selectedIdea:{...clone(selectedIdea),disposition:selection?.disposition||"include"},evaluations:clone(modelResult.ideaEvaluations),keyReasons:clone(modelResult.keyReasons),selectedActions:arr(modelResult.selectedActionIds).map(id=>a.actionCandidates.find(x=>x.actionId===id)).filter(Boolean),successConditions:arr(selectedIdea?.requirements),topRisks:a.topRisks,missingInformation:a.missingInformation,informationCompleteness:calculateInformationCompleteness()};
  }

  Object.assign(S,{freshSelection,ensureState,reasonsFor,reasonLabel,deriveInitialDisposition,initializeCandidateSelection,validateCandidateSelection,selectedPairs,buildFinalBlueArtifacts,validateFinalBlue,assembleFinalDecision});
  Object.assign(window,{deriveInitialDisposition,initializeCandidateSelection,validateCandidateSelection,buildFinalBlueArtifacts});
})();
