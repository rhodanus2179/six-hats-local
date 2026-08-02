import { readFile, readdir } from "node:fs/promises";
import { Script, createContext } from "node:vm";

const expectedScripts = [
  "config.js", "state.js", "validation.js", "ai.js", "workflow.js",
  "ui.js", "persistence.js", "test-harness.js",
  "decision-gate-core.js", "decision-gate-ai.js", "decision-gate-ui.js", "main.js",
];
const html = await readFile("index.html", "utf8");
for (const file of expectedScripts) {
  if (!html.includes(`./src/${file}`)) throw new Error(`index.html is missing ./src/${file}`);
}
if (html.includes('type="module"')) throw new Error("file:// operation requires classic scripts");
const files = (await readdir("src")).filter((file) => file.endsWith(".js")).sort();
for (const file of expectedScripts) if (!files.includes(file)) throw new Error(`Missing source file: ${file}`);
for (const file of files) new Script(await readFile(`src/${file}`, "utf8"), { filename: `src/${file}` });

const config = await readFile("src/config.js", "utf8");
for (const marker of ['appVersion: "1.3.0"', "schemaVersion: 4", "promptVersion: 3", "validatorVersion: 3", 'sixHatsMeetingsV4', "combinationSuggestion", "selectedIdeaId", "selectedActionIds"]) {
  if (!config.includes(marker)) throw new Error(`Schema 4 config marker missing: ${marker}`);
}
const ai = await readFile("src/decision-gate-ai.js", "utf8");
for (const marker of ["buildFinalBlueArtifacts", "candidateCount", "contextRatio", "selectedActionIds"]) if (!ai.includes(marker)) throw new Error(`AI adapter marker missing: ${marker}`);
const ui = await readFile("src/decision-gate-ui.js", "utf8");
for (const marker of ["最終青の比較候補", "候補を確定して最終青へ", "Schema 4の会議データだけ"]) if (!ui.includes(marker)) throw new Error(`UI marker missing: ${marker}`);

const context = createContext({console, structuredClone, Date, Math, JSON, Set, Map, window: null});
context.window = context;
Object.assign(context, {
  BUILD:{appVersion:"1.3.0",schemaVersion:4,promptVersion:3,validatorVersion:3,buildId:"test",buildDate:"2026-08-02"}, APP_VERSION:"1.3.0", SCHEMA_VERSION:4,
  BASE_SCHEMAS:{}, ROLE_PROMPTS:{},
  freshState:()=>({build:{},results:{},resultMeta:{},input:{},decisionBoundary:{criteria:[]},candidateSelection:null}),
  hashBuildAssets:async()=>{}, calculateInformationCompleteness:()=>75, semanticValidate:()=>({errors:[],warnings:[]}), transformCandidate:(id,x)=>x,
  aiCandidateForValidation:(id,x)=>x, buildContext:()=>({}), buildPrompt:()=>"", conclusionSchemaContext:x=>x, structuredAttempt:async()=>{}, demoResult:()=>({}),
  renderResult:()=>"", renderCard:()=>"", bindCardActions:()=>{}, runHat:async()=>({ok:true}), startFreshWorkflow:async()=>{}, markDependentsStale:()=>{},
  migrateState:x=>x, migrateStoredMeetings:()=>{}, runTestAssertions:()=>({assertions:[],summary:{}}), continueAfterWarning:async()=>{},
  arr:v=>Array.isArray(v)?v:[], unique:v=>[...new Set(v.filter(Boolean))], safeText:(v,m=700)=>String(v??"").slice(0,m),
  normalizeText:v=>String(v??"").normalize("NFKC").replace(/[\s。、，,.・:：;；!?！？「」『』（）()\-—_]/g,"").toLowerCase(),
  stringsIn:function stringsIn(v,out=[]){if(typeof v==="string")out.push(v);else if(Array.isArray(v))v.forEach(x=>stringsIn(x,out));else if(v&&typeof v==="object")Object.values(v).forEach(x=>stringsIn(x,out));return out;},
  now:()=>"2026-08-02T00:00:00.000Z", sha256Short:async()=>"hash", debugLog:()=>{}, createWarning:(code,severity,message,hatId)=>({code,severity,message,hatId}),
  state:{build:{},input:{topic:"test"},decisionBoundary:{criteria:[{id:"D-001",text:"実現性"}]},results:{},resultMeta:{green:{updatedAt:"v1"}},candidateSelection:null},
});
new Script(await readFile("src/decision-gate-core.js", "utf8"), {filename:"src/decision-gate-core.js"}).runInContext(context);
const idea=(id,name,status)=>({ideaId:id,name,description:`${name}の説明`,benefits:["便益"],challenges:["課題"],requirements:["条件確認"],pilotMethod:`${name}を試行する`,constraintAssessments:[{constraintId:"C-002",status}],outOfScopeAssessments:[]});
context.state.results={
  green:{ideas:[idea("G-001","段階導入","satisfies"),idea("G-002","住民インセンティブ制度","violates"),idea("G-003","資源化企業との連携","satisfies")]},
  black:{risks:[{name:"処理能力不足",cause:"余力不足",likelihood:3,impact:5,mitigations:["住民インセンティブ"]}]},
  yellow:{benefits:[{name:"資源化",description:"資源化率向上"}],strategicOpportunities:["景品を付与"]},
  white:{missingInformation:[{text:"処理能力",priority:"high"}]},
};
context.initializeCandidateSelection(true);
if (context.deriveInitialDisposition(context.state.results.green.ideas[1]) !== "exclude") throw new Error("Violating idea was not excluded");
const artifacts = context.buildFinalBlueArtifacts(context.state,"normal");
if (artifacts.candidates.some(x=>x.ideaId==="G-002")) throw new Error("Excluded candidate leaked into final-blue context");
const serialized=JSON.stringify(artifacts);
for (const term of ["住民インセンティブ","景品"]) if (serialized.includes(term)) throw new Error(`Excluded/unsafe upstream text leaked: ${term}`);
if (serialized.includes("mitigations") || serialized.includes("strategicOpportunities")) throw new Error("Unapproved upstream fields leaked");
const selected="G-003", selectedAction=artifacts.actionCandidates.find(x=>x.ideaId===selected);
const model={decisionType:"pilot",selectedIdeaId:selected,ideaEvaluations:artifacts.candidates.map(x=>({ideaId:x.ideaId,feasibility:4,recommendationScore:4,mainReason:"実現可能",mainRisk:"調整必要"})),keyReasons:["制約と整合","小規模試行可能"],selectedActionIds:[selectedAction.actionId]};
if (context.Schema4Lite.validateFinalBlue(model,context.state).errors.length) throw new Error("Valid Schema 4 result failed validation");
const assembled=context.Schema4Lite.assembleFinalDecision(model,context.state);
if (assembled.selectedIdea.ideaId!==selected || !assembled.selectedActions.length) throw new Error("Deterministic final assembly failed");

const css = await readFile("styles/app.css", "utf8");
if (!css.includes(":root") || !css.includes(".hatCard")) throw new Error("styles/app.css appears incomplete");
console.log(`Schema 4 Lite checks passed for ${files.length} JavaScript files.`);
