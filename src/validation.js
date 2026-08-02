function validateSchema(value,schema,path="$"){
  const errors=[];const type=schema?.type;const actual=Array.isArray(value)?"array":value===null?"null":typeof value;
  if(type){const ok=type==="object"?(value&&typeof value==="object"&&!Array.isArray(value)):type==="array"?Array.isArray(value):type==="integer"?Number.isInteger(value):type==="number"?(typeof value==="number"&&Number.isFinite(value)):actual===type;if(!ok){errors.push(`${path}: ${type}が必要ですが${actual}です`);return errors;}}
  if(schema.enum&&!schema.enum.includes(value))errors.push(`${path}: 許可されていない値です (${String(value)})`);
  if(typeof value==="string"){if(schema.minLength!=null&&value.length<schema.minLength)errors.push(`${path}: 文字数が短すぎます`);if(schema.maxLength!=null&&value.length>schema.maxLength)errors.push(`${path}: 文字数が長すぎます`);}
  if(typeof value==="number"){if(schema.minimum!=null&&value<schema.minimum)errors.push(`${path}: 最小値${schema.minimum}未満です`);if(schema.maximum!=null&&value>schema.maximum)errors.push(`${path}: 最大値${schema.maximum}を超えています`);}
  if(Array.isArray(value)){if(schema.minItems!=null&&value.length<schema.minItems)errors.push(`${path}: 最低${schema.minItems}件必要です`);if(schema.maxItems!=null&&value.length>schema.maxItems)errors.push(`${path}: 最大${schema.maxItems}件です`);if(schema.items)value.forEach((x,i)=>errors.push(...validateSchema(x,schema.items,`${path}[${i}]`)));}
  if(value&&typeof value==="object"&&!Array.isArray(value)){const props=schema.properties||{};for(const key of schema.required||[])if(!(key in value))errors.push(`${path}.${key}: 必須項目です`);if(schema.additionalProperties===false)for(const key of Object.keys(value))if(!(key in props))errors.push(`${path}.${key}: 許可されていない項目です`);for(const [key,sub] of Object.entries(props))if(key in value)errors.push(...validateSchema(value[key],sub,`${path}.${key}`));}
  return errors;
}
function stringsIn(value,out=[]){if(typeof value==="string")out.push(value);else if(Array.isArray(value))value.forEach(x=>stringsIn(x,out));else if(value&&typeof value==="object")Object.values(value).forEach(x=>stringsIn(x,out));return out;}
function duplicateWarnings(items,labelName,hatId){const seen=new Map(),warnings=[];for(const s of arr(items)){const n=normalizeText(s);if(!n)continue;if(seen.has(n))warnings.push(createWarning("DUPLICATE_ITEM","info",`${labelName}に重複があります: ${safeText(s,80)}`,hatId));else seen.set(n,s);}return warnings;}
function validateIdCoverage(actualIds,expectedIds,labelName,hatId){
  const errors=[],warnings=[];const actual=arr(actualIds);const dup=actual.filter((x,i)=>actual.indexOf(x)!==i);const unknown=actual.filter(x=>!expectedIds.includes(x));const missing=expectedIds.filter(x=>!actual.includes(x));
  if(unknown.length)errors.push(`${labelName}に未知のIDがあります: ${unique(unknown).join("、")}`);
  if(dup.length)errors.push(`${labelName}に重複IDがあります: ${unique(dup).join("、")}`);
  if(missing.length)warnings.push(createWarning("ID_COVERAGE_MISSING","review_required",`${labelName}に未処理IDがあります: ${missing.join("、")}`,hatId,missing));
  return {errors,warnings};
}
function semanticValidate(id,data,ctx=state,variant="normal"){
  const errors=[],warnings=[],checks=[],placeholderHits=[];
  for(const s of stringsIn(data))if(PLACEHOLDERS.has(String(s).trim()))placeholderHits.push(s);
  if(placeholderHits.length)errors.push(`見本ラベルが実データとして残っています: ${unique(placeholderHits).join("、")}`);
  if(id==="blue_opening"){
    if(normalizeText(data.reframedTopic)===normalizeText(data.coreQuestion))warnings.push(createWarning("BLUE_DUPLICATE_QUESTION","info","議題の言い換えと中心的な問いがほぼ同一です",id));
    warnings.push(...duplicateWarnings(data.decisionCriteria,"判断基準",id),...duplicateWarnings(data.discussionPoints,"主な論点",id));
    if(/推奨|実施すべき|見送るべき/.test(data.reframedTopic+data.coreQuestion))warnings.push(createWarning("BLUE_PREMATURE_CONCLUSION","review_required","最初の青い帽子が結論を先取りしている可能性があります",id));
  }
  if(id==="white"){
    for(const a of data.assumptions){if(a.relationToInput==="possible_conflict")warnings.push(createWarning("WHITE_POSSIBLE_CONFLICT","review_required",`入力と矛盾する可能性のある仮定です: ${safeText(a.text,100)}`,id));}
    warnings.push(...duplicateWarnings(data.assumptions.map(x=>x.text),"仮定",id));
    for(const f of ctx.deterministic.inputClaims.filter(x=>x.verificationStatus==="unverified"))warnings.push(createWarning("EXTERNAL_VERIFICATION_RECOMMENDED","info",`重要な入力は外部確認を推奨します: ${safeText(f.text,100)}`,id,[f.id]));
  }
  if(id==="red"){
    const allIds=ctx.deterministic.stakeholders.map(x=>x.id);const targetIds=(variant==="core"||(variant==="compact"&&allIds.length>10))?allIds.slice(0,6):allIds;
    const c=validateIdCoverage(data.stakeholders.map(x=>x.stakeholderId),targetIds,"赤い帽子の関係者",id);errors.push(...c.errors);warnings.push(...c.warnings);
    if(variant==="core"){
      const remaining=allIds.slice(6);const cc=validateIdCoverage(data.otherStakeholdersSummary?.coveredStakeholderIds||[],remaining,"集約対象関係者",id);errors.push(...cc.errors);warnings.push(...cc.warnings);
      if(remaining.length)warnings.push(createWarning("RED_STAKEHOLDERS_AGGREGATED","review_required",`${targetIds.length}件を個別分析し、残り${remaining.length}件を集約しました`,id,remaining));
    }
    if(variant==="compact"&&allIds.length>10)warnings.push(createWarning("RED_COMPACT_UNANALYZED_SECONDARY","review_required",`出力短縮のため、${allIds.length-6}件の関係者は個別・集約分析されていません`,id,allIds.slice(6)));
    if(!arr(data.consensusConcerns).length)warnings.push(createWarning("RED_NO_CONSENSUS_CONCERN","info","合意形成上の注意がありません",id));
  }
  if(id==="black"){
    for(const r of data.risks){
      if((r.likelihood===0||r.impact===0)&&r.scoreBasis!=="insufficient_information")errors.push(`${r.name}: 未評価値の根拠区分は情報不足でなければなりません`);
      if(r.likelihood>0&&r.impact>0&&r.scoreBasis==="insufficient_information")warnings.push(createWarning("BLACK_SCORE_BASIS_CONFLICT","review_required",`${r.name}: 数値評価と情報不足が併存しています`,id));
      if(!r.warningSigns.length)warnings.push(createWarning("BLACK_NO_WARNING_SIGN","info",`${r.name}: 早期兆候がありません`,id));
      if(!r.mitigations.length)warnings.push(createWarning("BLACK_NO_MITIGATION","review_required",`${r.name}: 対応策がありません`,id));
    }
    warnings.push(...duplicateWarnings(data.risks.map(x=>x.name),"リスク",id));
  }
  if(id==="yellow"){
    for(const b of data.benefits){if(!b.conditions.length)warnings.push(createWarning("YELLOW_NO_CONDITION","info",`${b.name}: 成立条件がありません`,id));if(!b.indicators.length)warnings.push(createWarning("YELLOW_NO_INDICATOR","info",`${b.name}: 評価指標がありません`,id));if(/雇用|新産業|地域経済/.test(b.name+b.description)&&b.evidenceLevel!=="speculative")warnings.push(createWarning("YELLOW_SPECULATIVE_EFFECT","review_required",`${b.name}: 波及効果は仮説的として扱うことを推奨します`,id));}
    warnings.push(...duplicateWarnings(data.benefits.map(x=>x.name),"利点",id));
  }
  if(id==="green"){
    const ideaIds=data.ideas.map(x=>x.ideaId);const expectedIdeaIds=Array.from({length:variant==="compact"?3:4},(_,i)=>`G-${String(i+1).padStart(3,"0")}`);const ic=validateIdCoverage(ideaIds,expectedIdeaIds,"緑の案",id);errors.push(...ic.errors);warnings.push(...ic.warnings);
    warnings.push(...duplicateWarnings(data.ideas.map(x=>x.name),"代替案",id));
    const cats=new Set(data.ideas.map(x=>x.category));if(cats.size<3)warnings.push(createWarning("GREEN_LOW_DIVERSITY","review_required","代替案の性質が十分に多様でない可能性があります",id));
    const cIds=ctx.deterministic.constraints.map(x=>x.id).slice(0,4),oIds=ctx.decisionBoundary.outOfScope.map(x=>x.id).slice(0,4);
    for(const idea of data.ideas){
      const cc=validateIdCoverage(idea.constraintAssessments.map(x=>x.constraintId),cIds,`${idea.ideaId}の制約評価`,id);errors.push(...cc.errors);warnings.push(...cc.warnings);
      const oc=validateIdCoverage(idea.outOfScopeAssessments.map(x=>x.outOfScopeId),oIds,`${idea.ideaId}の対象外評価`,id);errors.push(...oc.errors);warnings.push(...oc.warnings);
      for(const x of idea.constraintAssessments)if(x.status==="violates")warnings.push(createWarning("CONSTRAINT_POSSIBLE_VIOLATION","review_required",`${idea.name}は制約${x.constraintId}に違反すると評価されています`,id,[idea.ideaId,x.constraintId]));
      for(const x of idea.outOfScopeAssessments)if(["possibly_conflicts","conflicts"].includes(x.status))warnings.push(createWarning("OUT_OF_SCOPE_POSSIBLE_CONFLICT",x.status==="conflicts"?"review_required":"info",`${idea.name}は対象外事項${x.outOfScopeId}に抵触する可能性があります`,id,[idea.ideaId,x.outOfScopeId]));
    }
  }
  if(id==="blue_closing"){
    const optionIds=data.options.map(x=>x.optionId);if(new Set(optionIds).size!==optionIds.length)errors.push("比較案のIDが重複しています");
    if(!optionIds.includes(data.recommendation.optionId))errors.push("推奨案IDが比較案に存在しません");
    const orders=data.nextActions.map(x=>x.order);if(new Set(orders).size!==orders.length)errors.push("次のアクションの順番が重複しています");
    for(const o of data.options){
      if((o.feasibility===0||o.recommendationScore===0)&&o.scoreBasis!=="insufficient_information")errors.push(`${o.label}: 未評価値の根拠区分は情報不足でなければなりません`);
      if((o.feasibility>0&&o.recommendationScore>0)&&o.scoreBasis==="insufficient_information")warnings.push(createWarning("BLUE_SCORE_BASIS_CONFLICT","review_required",`${o.label}: 数値評価と情報不足が併存しています`,id));
      for(const gid of o.sourceIdeaIds)if(!arr(ctx.results?.green?.ideas).some(x=>x.ideaId===gid))errors.push(`${o.label}: 存在しない緑案ID ${gid} を参照しています`);
    }
    const recommended=data.options.find(x=>x.optionId===data.recommendation.optionId);
    if(recommended){
      const sourceIdeas=recommended.sourceIdeaIds.map(gid=>arr(ctx.results?.green?.ideas).find(x=>x.ideaId===gid)).filter(Boolean);
      const violatedIds=sourceIdeas.flatMap(idea=>idea.constraintAssessments.filter(x=>x.status==="violates").map(x=>x.constraintId));
      const hardViolation=violatedIds.some(cid=>ctx.deterministic.constraints.find(x=>x.id===cid)?.type==="hard");
      if(violatedIds.length)warnings.push(createWarning("RECOMMENDED_OPTION_CONSTRAINT_VIOLATION",hardViolation?"blocking":"review_required","推奨案が制約違反と評価された緑案を含みます",id,[recommended.optionId,...violatedIds]));
      if(sourceIdeas.length&&sourceIdeas.every(idea=>idea.outOfScopeAssessments.some(x=>x.status==="conflicts")))warnings.push(createWarning("RECOMMENDED_OPTION_OUT_OF_SCOPE","blocking","推奨案が対象外事項に抵触する案だけで構成されています",id,[recommended.optionId]));
    }
  }
  checks.push(`帽子別意味検証: ${errors.length?"エラー":"通過"}`,`警告件数: ${warnings.length}`);
  return {errors:unique(errors),warnings:normalizeWarnings(warnings,id),placeholderHits:unique(placeholderHits),semanticChecks:checks};
}
function validateCandidate(id,candidate,ctx=state,variant="normal"){
  const schemaErrors=validateSchema(candidate,schemaFor(id,variant,ctx));const semantic=semanticValidate(id,candidate,ctx,variant);
  return {valid:!schemaErrors.length&&!semantic.errors.length,errors:[...schemaErrors,...semantic.errors],warnings:semantic.warnings,placeholderHits:semantic.placeholderHits,missingRequired:schemaErrors.filter(x=>x.includes("必須")),semanticChecks:semantic.semanticChecks};
}

function transformCandidate(id,candidate,variant){
  if(id==="white")return {inputFacts:clone(state.deterministic.inputClaims),...candidate};
  if(id==="red")return {...candidate,schemaVariant:variant};
  if(id==="green")return candidate;
  if(id==="blue_closing")return {...candidate,informationCompleteness:calculateInformationCompleteness()};
  return candidate;
}
function aiCandidateForValidation(id,full){
  if(id==="white"){const {inputFacts,...rest}=full;return rest;}
  if(id==="red"){const {schemaVariant,...rest}=full;return rest;}
  if(id==="blue_closing"){const {informationCompleteness,...rest}=full;return rest;}
  return full;
}
function validateFullResult(id,full,variant,ctx=state){return validateCandidate(id,aiCandidateForValidation(id,full),ctx,variant);}
