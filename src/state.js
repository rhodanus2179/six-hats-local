class SchemaValidationError extends Error{constructor(message,details=[]){super(message);this.name="SchemaValidationError";this.details=details;}}
class SemanticValidationError extends Error{constructor(message,details=[]){super(message);this.name="SemanticValidationError";this.details=details;}}

function emptyValidation(){return {valid:false,errors:[],warnings:[],placeholderHits:[],missingRequired:[],semanticChecks:[]};}
function freshResultMeta(){return {status:"idle",formatUsed:null,schemaVariant:null,phase:null,rawOutput:"",normalizedOutput:"",validation:emptyValidation(),generation:{attemptCount:0,structuredAttempted:false,startedAt:null,completedAt:null,durationMs:0,promptLength:0,responseLength:0,contextUsageBefore:null,contextWindow:null,attempts:[]},sourceResultVersion:SCHEMA_VERSION,userAcceptedWarnings:false,updatedAt:null,lastError:null,autosavedAt:null};}
function freshState(){return {
  build:{...BUILD,systemPromptHash:"pending",rolePromptsHash:"pending",schemaSetHash:"pending",validatorConfigHash:"pending"},
  appVersion:APP_VERSION,schemaVersion:SCHEMA_VERSION,id:uuid(),createdAt:now(),updatedAt:now(),
  input:{topic:"",context:"",constraints:"",stakeholders:"",desiredOutcome:"推奨判断",focus:"",detail:"standard",mode:"standard",warningPolicy:"review_required"},
  deterministic:{inputClaims:[],constraints:[],focusItems:[],stakeholders:[]},decisionBoundary:{criteria:[],outOfScope:[]},
  results:{},resultMeta:Object.fromEntries(HAT_IDS.map(id=>[id,freshResultMeta()])),
  meta:{status:"draft",currentHat:null,interruptedHat:null,phase:null,important:[],excluded:[],edited:[],stale:[],autosaveStatus:"未保存",lastAutosavedAt:null,pendingNextHat:null},
  runSummary:null,test:null
};}

let state=freshState();
let abortController=null, activeHatSession=null, editingHat=null, detailHat=null;
let elapsedTimer=null, elapsedStartedAtMs=0, currentRunId=null, currentAttemptId=null;
let pendingSave=Promise.resolve(), pendingImportData=null, currentTestReport=null;
const debugEvents=[];
const ai={status:"checking",label:"AI確認中",api:null,baseSession:null};

function createWarning(code,severity,message,hatId=null,relatedIds=[]){return {code,severity:WARNING_SEVERITIES.includes(severity)?severity:"info",message,hatId,relatedIds:arr(relatedIds),acknowledged:false};}
function normalizeWarnings(warnings,hatId){return arr(warnings).map((w,i)=>typeof w==="string"?createWarning(`LEGACY_WARNING_${i+1}`,"info",w,hatId):{...w,hatId:w.hatId||hatId,acknowledged:Boolean(w.acknowledged)});}
function maxWarningSeverity(warnings){return arr(warnings).reduce((m,w)=>severityRank(w.severity)>severityRank(m)?w.severity:m,"info");}
function warningCounts(){const c={info:0,review_required:0,blocking:0};for(const m of Object.values(state.resultMeta||{}))for(const w of arr(m?.validation?.warnings))c[w.severity]=(c[w.severity]||0)+1;return c;}

function debugLog(type,data={}){
  const event={time:now(),type,runId:data.runId??currentRunId,meetingId:state.id,attemptId:data.attemptId??currentAttemptId,buildId:BUILD.buildId,...data};
  debugEvents.push(event);
  if(debugEvents.length>2000){const removed=debugEvents.length-1999;debugEvents.splice(0,removed);debugEvents.unshift({time:now(),type:"log-truncated",removed,buildId:BUILD.buildId});}
  try{console.debug("[SixHats]",event);}catch{}
  return event;
}
function redactValue(v){if(typeof v==="string")return "[REDACTED]";if(Array.isArray(v))return v.map(redactValue);if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,redactValue(x)]));return v;}
function debugSnapshot(redacted=false,scope="current_run"){
  let events=debugEvents;
  if(scope==="current_run"&&currentRunId)events=events.filter(e=>e.runId===currentRunId);
  else if(scope==="meeting")events=events.filter(e=>e.meetingId===state.id);
  events=events.map(e=>{if(!redacted)return e;const x=clone(e);for(const k of ["prompt","raw","normalizedOutput","result","candidate"])if(k in x)x[k]="[REDACTED]";return x;});
  const resultMeta=redacted?Object.fromEntries(Object.entries(state.resultMeta||{}).map(([id,m])=>[id,{...m,rawOutput:m?.rawOutput?"[REDACTED]":"",normalizedOutput:m?.normalizedOutput?"[REDACTED]":""}])):state.resultMeta;
  return {app:"6色思考会議",build:state.build,exportedAt:now(),redacted,scope,environment:{userAgent:navigator.userAgent,language:navigator.language,platform:navigator.userAgentData?.platform||navigator.platform,location:location.href,secureContext:self.isSecureContext,online:navigator.onLine,languageModelGlobal:typeof self.LanguageModel,aiStatus:ai.status,aiLabel:ai.label},meeting:{id:state.id,status:state.meta?.status,currentHat:state.meta?.currentHat,input:redacted?redactValue(state.input):state.input,completed:HAT_IDS.filter(id=>state.results[id]),runSummary:state.runSummary,resultMeta},events};
}
function debugText(redacted=false,scope="current_run"){return JSON.stringify(debugSnapshot(redacted,scope),null,2);}

async function sha256Short(value){try{const bytes=new TextEncoder().encode(String(value));const hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,12);}catch{return "unavailable";}}
async function hashBuildAssets(){
  const schemaText=JSON.stringify({base:BASE_SCHEMAS,red:"dynamic",green:"dynamic",blue_closing:"dynamic"});
  const [systemPromptHash,rolePromptsHash,schemaSetHash,validatorConfigHash]=await Promise.all([sha256Short(SYSTEM_PROMPT),sha256Short(JSON.stringify(ROLE_PROMPTS)),sha256Short(schemaText),sha256Short("validator-v2-cross-hat-warning-severity")]);
  state.build={...BUILD,systemPromptHash,rolePromptsHash,schemaSetHash,validatorConfigHash};
}
function createRun(mode,{parentRunId=null,testCaseId=null}={}){
  currentRunId=uuid();
  state.runSummary={runId:currentRunId,parentRunId,meetingId:state.id,testCaseId,mode,status:"running",startedAt:now(),completedAt:null,lastCompletedHat:null,retryCount:0,warningCounts:{info:0,review_required:0,blocking:0}};
  debugLog("workflow-start",{mode,testCaseId});
  return currentRunId;
}
function finishRun(status="complete"){
  if(!state.runSummary)return;
  state.runSummary.status=status;state.runSummary.completedAt=now();state.runSummary.warningCounts=warningCounts();
  debugLog(status==="complete"?"workflow-complete":"workflow-pause",{status});
}

function extractDeterministicInput(input=state.input){
  const inputClaims=[];
  const addClaims=(prefix,sourceField,values)=>values.forEach((text,i)=>inputClaims.push({id:`U-${prefix}-${String(i+1).padStart(3,"0")}`,text,sourceField,provenance:"user_input",verificationStatus:/税|法|制度|円|%|％|年度|期限|費用/.test(text)?"unverified":"not_required"}));
  if(String(input.topic||"").trim())addClaims("TOPIC","topic",[String(input.topic).trim()]);
  addClaims("CONTEXT","context",splitStatements(input.context));
  addClaims("CONSTRAINT","constraints",splitStatements(input.constraints));
  const stakeholderNames=splitTags(input.stakeholders);
  addClaims("STAKEHOLDER","stakeholders",stakeholderNames);
  const constraints=splitStatements(input.constraints).slice(0,6).map((text,i)=>({id:`C-${String(i+1).padStart(3,"0")}`,text,sourceField:"constraints",type:"unknown",verificationStatus:/税|法|制度|円|%|％|年度|期限|費用/.test(text)?"unverified":"not_required"}));
  const stakeholders=stakeholderNames.map((name,i)=>({id:`S-${String(i+1).padStart(3,"0")}`,name,priority:i<6?"core":"secondary",sourceField:"stakeholders",inputOrder:i+1}));
  return {inputClaims,constraints,focusItems:splitTags(input.focus).slice(0,8),stakeholders};
}
function buildDecisionBoundary(blue){
  return {
    criteria:arr(blue?.decisionCriteria).map((text,i)=>({id:`D-${String(i+1).padStart(3,"0")}`,text})),
    outOfScope:arr(blue?.outOfScope).slice(0,4).map((text,i)=>({id:`O-${String(i+1).padStart(3,"0")}`,text,source:"blue_opening",userConfirmed:state.input.mode==="standard"}))
  };
}
function selectRedSchemaVariant(count,compact=false){if(compact)return "compact";if(count<=6)return "normal";if(count<=10)return "lean";return "core";}
function findStakeholder(id){return state.deterministic.stakeholders.find(x=>x.id===id);}
function findIdea(id){return arr(state.results.green?.ideas).find(x=>x.ideaId===id);}
function calculateInformationCompleteness(){
  let score=100;
  const white=state.results.white, blue=state.results.blue_closing;
  for(const x of arr(white?.missingInformation))score-=x.priority==="high"?10:x.priority==="medium"?5:2;
  for(const o of arr(blue?.options))if(o.feasibility===0||o.recommendationScore===0)score-=5;
  for(const idea of arr(state.results.green?.ideas)){
    score-=arr(idea.constraintAssessments).filter(x=>x.status==="unknown"&&x.note!=="no_concern_reported").length*3;
    score-=arr(idea.outOfScopeAssessments).filter(x=>x.status==="unknown"&&x.note!=="no_concern_reported").length*3;
    score-=arr(idea.outOfScopeAssessments).filter(x=>x.status==="possibly_conflicts").length*2;
  }
  const importantUnverified=state.deterministic.inputClaims.filter(x=>x.verificationStatus==="unverified").length;score-=importantUnverified*3;
  return Math.max(0,Math.min(100,score));
}