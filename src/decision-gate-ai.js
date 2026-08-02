/* Schema 4 Lite AI adapter: send only confirmed candidates and receive IDs plus short evaluations. */
(function installSchema4AI(){
  "use strict";
  const S=window.Schema4Lite,L=S.legacy;

  conclusionSchemaContext=function(ctx=state){return {...ctx,finalBlueArtifacts:S.buildFinalBlueArtifacts(ctx,"normal")};};
  buildContext=function(id,minimal=false){return id==="blue_closing"?S.buildFinalBlueArtifacts(state,minimal?"compact":"normal"):L.buildContext(id,minimal);};
  buildPrompt=function(id,opt={},attempt=1,errors=[]){
    if(id!=="blue_closing")return L.buildPrompt(id,opt,attempt,errors);
    const compact=Boolean(opt.compact),retry=attempt>1?`\n前回の不備だけを修正してください: ${errors.slice(0,3).map(x=>safeText(x,120)).join(" / ")}`:"";
    return `役割:\n${ROLE_PROMPTS.blue_closing}\n\n回答方針:\n候補案を漏れなく1回ずつ評価し、候補から1案を選択してください。理由は各1文で簡潔にしてください。アクションは入力のactionIdだけを選択してください。${compact?" 出力をさらに簡潔にしてください。":""}${retry}\n\n入力情報:\n${JSON.stringify(S.buildFinalBlueArtifacts(state,compact?"compact":"normal"))}`;
  };

  semanticValidate=function(id,data,ctx=state,variant="normal"){
    if(id!=="blue_closing")return L.semanticValidate(id,data,ctx,variant);
    const v=S.validateFinalBlue(data,ctx);return {errors:v.errors,warnings:v.warnings,placeholderHits:[],semanticChecks:[`Schema 4候補整合性: ${v.errors.length?"エラー":"通過"}`,`警告件数: ${v.warnings.length}`]};
  };
  transformCandidate=function(id,candidate,variant){return id==="blue_closing"?S.assembleFinalDecision(candidate,state,variant):L.transformCandidate(id,candidate,variant);};
  aiCandidateForValidation=function(id,full){return id==="blue_closing"?(full?.modelResult||full):L.aiCandidateForValidation(id,full);};

  structuredAttempt=async function(id,variant,attempt,opt,previousErrors){
    if(id!=="blue_closing")return L.structuredAttempt(id,variant,attempt,opt,previousErrors);
    const session=await createHatSession(abortController.signal);activeHatSession=session;const artifacts=S.buildFinalBlueArtifacts(state,variant),schema=schemaFor(id,variant,{...state,finalBlueArtifacts:artifacts}),compact=variant==="compact";
    try{
      setHatPhase(id,"measuring_context");const prompt=buildPrompt(id,{...opt,compact},attempt,previousErrors);let measured=null;if(session?.measureContextUsage)measured=await session.measureContextUsage(prompt,{responseConstraint:schema});const windowSize=session?.contextWindow||9216,ratio=Number(measured||0)/windowSize;
      debugLog("context-usage",{hatId:id,attempt,schemaVariant:variant,measured,contextWindow:windowSize,contextRatio:ratio,promptLength:prompt.length,candidateCount:artifacts.candidates.length,actionCandidateCount:artifacts.actionCandidates.length});
      if((!compact&&ratio>0.25)||(compact&&ratio>=0.35)){const e=new Error(compact?"compact入力もコンテキスト予算を超えています":"最終青をcompact入力へ切り替えます");e.name="QuotaExceededError";e.requested=measured;e.contextWindow=windowSize;throw e;}
      setHatPhase(id,"generating");currentAttemptId=`${currentRunId||"manual"}-${id}-${attempt}`;const started=Date.now();debugLog("structured-generation-start",{hatId:id,attempt,schemaVariant:variant,promptLength:prompt.length,prompt});
      const raw=session?await session.prompt(prompt,{responseConstraint:schema,signal:abortController.signal}):JSON.stringify(demoResult(id,variant)),durationMs=Date.now()-started;debugLog("structured-generation-complete",{hatId:id,attempt,schemaVariant:variant,rawLength:raw.length,raw});
      setHatPhase(id,"receiving");const candidate=JSON.parse(raw);setHatPhase(id,"validating_schema");const schemaErrors=validateSchema(candidate,schema);if(schemaErrors.length)throw new SchemaValidationError("JSON Schemaを満たしません",schemaErrors);setHatPhase(id,"validating_semantics");const sem=semanticValidate(id,candidate,state,variant);if(sem.errors.length)throw new SemanticValidationError("意味検証を満たしません",sem.errors);
      return {candidate:transformCandidate(id,candidate,variant),raw,validation:{valid:true,errors:[],warnings:sem.warnings,placeholderHits:[],missingRequired:[],semanticChecks:sem.semanticChecks},attemptMeta:{attempt,attemptId:currentAttemptId,startedAt:new Date(started).toISOString(),completedAt:now(),durationMs,promptLength:prompt.length,responseLength:raw.length,contextUsageBefore:session?.contextUsage??null,contextWindow:windowSize,schemaVariant:variant},formatUsed:session?"json_schema":"demo"};
    }finally{destroySession(session,"hat");activeHatSession=null;currentAttemptId=null;}
  };

  demoResult=function(id,variant="normal"){
    if(id==="green"){const old=L.demoResult(id,variant);return {...old,combinationSuggestion:arr(old.combinationIdeas)[0]||"",combinationIdeas:undefined};}
    if(id!=="blue_closing")return L.demoResult(id,variant);
    if(!state.candidateSelection?.items?.length)S.initializeCandidateSelection(true);let v=S.validateCandidateSelection();if(!v.valid){state.candidateSelection.items.forEach((x,i)=>x.disposition=i<3?"include":"exclude");state.candidateSelection.sourceGreenUpdatedAt=state.resultMeta.green?.updatedAt;}
    state.candidateSelection.state="confirmed";state.candidateSelection.confirmedAt=now();const a=S.buildFinalBlueArtifacts(state,variant),selected=a.candidates[0],actions=a.actionCandidates.filter(x=>x.ideaId===selected.ideaId||x.ideaId==null).slice(0,variant==="compact"?2:3);
    return {decisionType:selected.disposition==="conditional"?"conditional":"pilot",selectedIdeaId:selected.ideaId,ideaEvaluations:a.candidates.map((x,i)=>({ideaId:x.ideaId,feasibility:Math.max(2,4-i),recommendationScore:i===0?5:Math.max(2,4-i),mainReason:x.benefits[0]||"主要な便益を確認できる。",mainRisk:x.challenges[0]||"実施条件の確認が必要。"})),keyReasons:["主要な制約との整合を確認しながら着手できる。","小規模な着手で不確実性を下げられる。"],selectedActionIds:actions.map(x=>x.actionId)};
  };
})();
