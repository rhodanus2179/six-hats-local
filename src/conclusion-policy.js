function ideaConclusionAssessment(idea){
  const constraintAssessments=arr(idea?.constraintAssessments);
  const outOfScopeAssessments=arr(idea?.outOfScopeAssessments);
  const violatedConstraints=constraintAssessments.filter(x=>x.status==="violates").map(x=>x.constraintId);
  const conflictingScopes=outOfScopeAssessments.filter(x=>x.status==="conflicts").map(x=>x.outOfScopeId);
  if(violatedConstraints.length||conflictingScopes.length){
    const reasons=[];
    if(violatedConstraints.length)reasons.push(`制約違反: ${violatedConstraints.join("、")}`);
    if(conflictingScopes.length)reasons.push(`対象外事項に抵触: ${conflictingScopes.join("、")}`);
    return {status:"excluded",reasons,relatedIds:[...violatedConstraints,...conflictingScopes]};
  }
  const unknownConstraints=constraintAssessments.filter(x=>x.status==="unknown").map(x=>x.constraintId);
  const uncertainScopes=outOfScopeAssessments.filter(x=>["unknown","possibly_conflicts"].includes(x.status)).map(x=>x.outOfScopeId);
  if(!constraintAssessments.length||unknownConstraints.length||uncertainScopes.length){
    const reasons=[];
    if(!constraintAssessments.length)reasons.push("制約評価が未実施");
    if(unknownConstraints.length)reasons.push(`制約評価が不明: ${unknownConstraints.join("、")}`);
    if(uncertainScopes.length)reasons.push(`対象外事項との関係が未確定: ${uncertainScopes.join("、")}`);
    return {status:"conditional",reasons,relatedIds:[...unknownConstraints,...uncertainScopes]};
  }
  return {status:"eligible",reasons:[],relatedIds:[]};
}
function conclusionEligibleIdeas(ideas){return arr(ideas).filter(idea=>ideaConclusionAssessment(idea).status!=="excluded");}
function conclusionExcludedIdeas(ideas){return arr(ideas).filter(idea=>ideaConclusionAssessment(idea).status==="excluded");}
function conclusionSchemaContext(ctx=state){
  const green=ctx.results?.green||{};
  return {...ctx,results:{...(ctx.results||{}),green:{...green,ideas:conclusionEligibleIdeas(green.ideas)}}};
}
function excludedIdeasForPrompt(ideas){
  return conclusionExcludedIdeas(ideas).map(idea=>{
    const assessment=ideaConclusionAssessment(idea);
    return {ideaId:idea.ideaId,name:idea.name,reasons:assessment.reasons};
  });
}
function conclusionCandidateText(data){
  const payload={
    executiveSummary:data?.executiveSummary,
    recommendation:data?.recommendation,
    keyReasons:data?.keyReasons,
    options:arr(data?.options).map(x=>({label:x.label,summary:x.summary,advantages:x.advantages,risks:x.risks})),
    successConditions:data?.successConditions,
    nextActions:data?.nextActions
  };
  return normalizeText(stringsIn(payload).join(" "));
}
function validateConclusionEligibility(data,ctx=state){
  const errors=[],warnings=[];
  const ideas=arr(ctx.results?.green?.ideas);
  const excluded=conclusionExcludedIdeas(ideas);
  const excludedIds=new Set(excluded.map(x=>x.ideaId));
  const conditionalIds=new Set(ideas.filter(x=>ideaConclusionAssessment(x).status==="conditional").map(x=>x.ideaId));
  for(const option of arr(data?.options)){
    const excludedRefs=arr(option.sourceIdeaIds).filter(id=>excludedIds.has(id));
    if(excludedRefs.length)errors.push(`${option.label}: 結論候補から除外された緑案 ${excludedRefs.join("、")} を参照しています`);
    const conditionalRefs=arr(option.sourceIdeaIds).filter(id=>conditionalIds.has(id));
    if(conditionalRefs.length)warnings.push(createWarning("BLUE_CONDITIONAL_IDEA_USED","review_required",`${option.label}は条件未確定の緑案を含みます`,"blue_closing",[option.optionId,...conditionalRefs]));
  }
  const candidateText=conclusionCandidateText(data);
  for(const idea of excluded){
    const normalizedName=normalizeText(idea.name);
    if(normalizedName&&candidateText.includes(normalizedName))errors.push(`結論に除外案「${idea.name}」が含まれています`);
  }
  const recommended=arr(data?.options).find(x=>x.optionId===data?.recommendation?.optionId);
  if(recommended&&normalizeText(recommended.label)!==normalizeText(data.recommendation?.label)){
    warnings.push(createWarning("BLUE_RECOMMENDATION_LABEL_MISMATCH","review_required",`推奨ラベルと参照案の名称が一致しません: ${data.recommendation?.label} / ${recommended.label}`,"blue_closing",[recommended.optionId]));
  }
  return {errors,warnings};
}
