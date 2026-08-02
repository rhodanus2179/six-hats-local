const BUILD = Object.freeze({
  appVersion: "1.2.0",
  schemaVersion: 3,
  promptVersion: 2,
  validatorVersion: 2,
  buildDate: "2026-07-19",
  buildId: "six-hats-1.2.0-20260719"
});
const APP_VERSION = BUILD.appVersion;
const SCHEMA_VERSION = BUILD.schemaVersion;
const STORAGE_KEY = "sixHatsMeetings";
const BACKUP_KEY = "sixHatsMeetingsBackupV2";
const MIGRATION_MARKER_KEY = "sixHatsMigrationV3Done";
const DEV_MODE = new URLSearchParams(location.search).get("dev") === "1";

const HATS = [
  {id:"blue_opening",name:"青い帽子",short:"論点整理",role:"議題・判断基準・前提を整理",color:"var(--blue)",icon:"🔵"},
  {id:"white",name:"白い帽子",short:"事実",role:"事実・仮定・不足情報を分離",color:"var(--white)",icon:"⚪",white:true},
  {id:"red",name:"赤い帽子",short:"感情",role:"関係者の感情・直感を可視化",color:"var(--red)",icon:"🔴"},
  {id:"black",name:"黒い帽子",short:"リスク",role:"失敗要因・弱点・対策を検討",color:"var(--black)",icon:"⚫"},
  {id:"yellow",name:"黄色い帽子",short:"利点",role:"価値・機会・成功条件を整理",color:"var(--yellow)",icon:"🟡"},
  {id:"green",name:"緑の帽子",short:"創造",role:"二択を超える代替案を発想",color:"var(--green)",icon:"🟢"},
  {id:"blue_closing",name:"青い帽子",short:"統合",role:"全視点を統合し次の行動を提示",color:"var(--blue)",icon:"🔵"}
];
const HAT_IDS = HATS.map(h => h.id);
const DEPENDENTS = {
  blue_opening:["white","red","black","yellow","green","blue_closing"],
  white:["black","yellow","green","blue_closing"],
  red:["blue_closing"],
  black:["green","blue_closing"],
  yellow:["green","blue_closing"],
  green:["blue_closing"],
  blue_closing:[]
};
const PREREQUISITES = {
  blue_opening:[], white:["blue_opening"], red:["blue_opening"],
  black:["blue_opening","white"], yellow:["blue_opening","white"],
  green:["black","yellow"], blue_closing:["blue_opening","white","red","black","yellow","green"]
};
const AI_SESSION_OPTIONS = {
  expectedInputs:[{type:"text",languages:["ja"]}],
  expectedOutputs:[{type:"text",languages:["ja"]}]
};
const SCORE_BASIS = ["explicit_user_input","derived_from_input","model_judgment","externally_verified","insufficient_information"];
const WARNING_SEVERITIES = ["info","review_required","blocking"];
const DISPLAY_LABELS = {
  proceed:"実施を推奨", conditional:"条件付きで実施", pilot:"試行後に判断", research:"追加調査後に判断", hold:"現時点では見送り", compare:"比較を継続",
  short:"短期", medium:"中期", long:"長期",
  explicit_user_input:"ユーザー明示", derived_from_input:"入力から導出", model_judgment:"AIによる判断", externally_verified:"外部確認済み", insufficient_information:"情報不足",
  general_inference:"一般論からの推定", speculative:"仮説的", user_input:"ユーザー入力", assumed:"仮定", unknown:"不明",
  consistent:"入力と整合", supplements:"入力を補足", possible_conflict:"矛盾の可能性", supportive:"支持的", mixed:"期待と不安", anxious:"不安が強い", resistant:"抵抗感", not_related:"対象外と無関係", possibly_conflicts:"抵触の可能性", conflicts:"対象外に抵触", satisfies:"制約を満たす", violates:"制約に違反",
  topic:"議題", context:"背景・前提", constraints:"制約条件", stakeholders:"関係者", other:"その他",
  info:"情報", review_required:"要確認", blocking:"停止"
};
const CATEGORY_LABELS = {pilot:"実証",phased:"段階導入",regional:"地域限定",joint:"共同化",outsourcing:"外部化",process_change:"工程変更",combination:"組合せ",other:"その他"};
const PRIORITY_LABELS = {high:"高",medium:"中",low:"低"};
const PLACEHOLDERS = new Set(["リスク名","案名","利点名","受益者","成立条件","評価指標","順番","推奨判断","概要","原因","可能性","影響","対応策","早期兆候"]);

const SYSTEM_PROMPT = "あなたはシックスハット法の思考支援者です。指定された帽子の役割だけを担当してください。入力にない事実を断定せず、ユーザー入力、一般論、仮定、AIによる判断を区別してください。不明な事項は不明とし、日本語で簡潔かつ具体的に回答してください。出力形式はAPIから指定されたJSON Schemaに厳密に従ってください。";
const ROLE_PROMPTS = {
  blue_opening:"青い帽子として、議題を言い換え、中心的な問い、判断基準、前提、論点、対象外、曖昧さを整理してください。まだ結論は出さないでください。",
  white:"白い帽子として、一般的な観察、追加仮定、不足情報、調査質問、数値情報を整理してください。ユーザー入力の事実一覧はアプリ側で作成するため再出力しないでください。仮定は入力との関係を分類してください。",
  red:"赤い帽子として、指定された関係者IDごとに、合理化しすぎず、主要な感情、直感、懸念、伝達上の注意を簡潔に整理してください。関係者名は書かず、必ず指定されたIDを使用してください。",
  black:"黒い帽子として、リスクを原因、可能性、影響、根拠、兆候、対策、残余リスクに分解してください。単なる否定で終わらせないでください。AIが判断した数値の根拠区分はmodel_judgmentとし、評価不能は0かつinsufficient_informationとしてください。",
  yellow:"黄色い帽子として、利点を説明、受益者、成立条件、評価指標、時間軸、根拠の強さとセットで整理してください。入力との接続が弱い効果は仮説的としてください。",
  green:"緑の帽子として、二択を崩し、性質の異なる代替案を提示してください。指定された案IDを使用し、各案について入力制約と対象外事項への関係を全ID分評価してください。説明は重複を避けて簡潔にしてください。",
  blue_closing:"最後の青い帽子として、各結果を統合し、推奨判断、比較案、主要リスク、成功条件、次の行動、不足情報、留意事項を示してください。緑案を利用する場合は案IDを参照してください。AIが判断した評価値の根拠区分はmodel_judgmentとし、評価不能は0かつinsufficient_informationとしてください。"
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[m]);
const arr = v => Array.isArray(v) ? v : [];
const clone = v => v == null ? v : structuredClone(v);
const unique = xs => [...new Set(xs.filter(Boolean))];
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID?.() || `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const safeText = (v,max=700) => { const s=String(v??"").trim(); return s.length>max ? s.slice(0,max-1)+"…" : s; };
const normalizeText = s => String(s??"").normalize("NFKC").replace(/[\s。、，,.・:：;；!?！？「」『』（）()\-—_]/g,"").toLowerCase();
const splitTags = s => unique(String(s||"").split(/[\n、,，]/).map(x=>x.trim()).filter(Boolean));
const splitStatements = s => unique(String(s||"").split(/(?:\r?\n|。|；|;)+/).map(x=>x.trim()).filter(Boolean));
const label = v => DISPLAY_LABELS[v] || v || "—";
const errorData = e => ({name:e?.name||"Error",message:e?.message||String(e),stack:e?.stack||"",requested:e?.requested,contextWindow:e?.contextWindow});
const scoreDisplay = n => Number(n)>0 ? `${Number(n)}/5` : '<span class="unassessed">未評価</span>';
const scoreText = n => Number(n)>0 ? `${Number(n)}/5` : "未評価";
const severityRank = s => ({info:1,review_required:2,blocking:3})[s] || 1;
const storage = (() => {
  try { const ls = window.localStorage; ls.getItem("__six_hats_probe__"); return ls; }
  catch {
    const mem = new Map();
    return {getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),clear:()=>mem.clear()};
  }
})();
const isUuid = s => /^[0-9a-f-]{20,}$/i.test(String(s||""));

function sString(max,min=0){const x={type:"string",maxLength:max};if(min)x.minLength=min;return x;}
function sArray(items,min=0,max){const x={type:"array",items};if(min)x.minItems=min;if(max!=null)x.maxItems=max;return x;}
function sObject(properties,required=Object.keys(properties)){return {type:"object",properties,required,additionalProperties:false};}
function sEnum(values){return {type:"string",enum:values};}
function sInt(min,max){return {type:"integer",minimum:min,maximum:max};}

const BASE_SCHEMAS = {
  blue_opening:sObject({
    reframedTopic:sString(320,1), coreQuestion:sString(320,1),
    decisionCriteria:sArray(sString(180,1),2,6), assumptions:sArray(sString(220,1),0,5),
    discussionPoints:sArray(sString(220,1),2,6), outOfScope:sArray(sString(180,1),0,4), ambiguities:sArray(sString(220,1),0,6)
  }),
  white:sObject({
    generalObservations:sArray(sString(260,1),0,5),
    assumptions:sArray(sObject({text:sString(260,1),relationToInput:sEnum(["consistent","supplements","possible_conflict","unknown"]),reason:sString(180,0)}),0,6),
    missingInformation:sArray(sObject({text:sString(260,1),priority:sEnum(["high","medium","low"]),reason:sString(220,1)}),1,7),
    researchQuestions:sArray(sString(260,1),0,6),
    numbers:sArray(sObject({label:sString(100,1),value:sString(100,1),provenance:sEnum(["user_input","model_judgment","unknown"])}),0,8)
  }),
  black:sObject({
    summary:sString(360,1),
    risks:sArray(sObject({
      name:sString(130,1),cause:sString(260,1),likelihood:sInt(0,5),impact:sInt(0,5),scoreBasis:sEnum(SCORE_BASIS),
      warningSigns:sArray(sString(180,1),0,3),mitigations:sArray(sString(180,1),0,3),residualRiskLevel:sInt(0,5),residualRiskNote:sString(220,0)
    }),2,5),
    fatalConditions:sArray(sString(220,1),0,4)
  }),
  yellow:sObject({
    summary:sString(360,1),
    benefits:sArray(sObject({
      name:sString(130,1),description:sString(260,1),timeframe:sEnum(["short","medium","long"]),beneficiaries:sArray(sString(100,1),1,4),
      conditions:sArray(sString(180,1),0,3),indicators:sArray(sString(140,1),0,3),evidenceLevel:sEnum(["general_inference","speculative","model_judgment"])
    }),2,5),
    strategicOpportunities:sArray(sString(220,1),0,4)
  })
};

function schemaForRed(variant, stakeholders){
  const ids=stakeholders.map(x=>x.id);
  const targetCount = variant === "core" || (variant === "compact" && ids.length>10) ? Math.min(6,ids.length) : ids.length;
  const targetIds=ids.slice(0,targetCount);
  const idSchema=sEnum(targetIds.length?targetIds:["S-001"]);
  let item;
  if(variant === "normal"){
    item=sObject({stakeholderId:idSchema,positiveFeeling:sString(100,1),negativeFeeling:sString(100,1),intuitiveReaction:sString(140,1),communicationConcern:sString(140,0)});
  }else if(variant === "lean" || variant === "core"){
    item=sObject({stakeholderId:idSchema,emotionalTone:sEnum(["supportive","mixed","anxious","resistant","unknown"]),mainConcern:sString(100,1),intuitiveReaction:sString(120,1),communicationConcern:sString(120,0)});
  }else{
    item=sObject({stakeholderId:idSchema,mainConcern:sString(80,1),intuitiveReaction:sString(100,1),communicationNeed:sString(100,0)});
  }
  const props={stakeholders:sArray(item,targetCount,targetCount)};
  if(variant === "core"){
    const remaining=ids.slice(targetCount);
    props.otherStakeholdersSummary=sObject({
      coveredStakeholderIds:sArray(sEnum(remaining.length?remaining:["S-OTHER"]),remaining.length,remaining.length),
      commonReaction:sString(180,1),mainCommunicationNeed:sString(160,1)
    });
  }
  if(variant !== "compact") props.hiddenEmotions=sArray(sString(160,1),0,variant==="normal"?4:3);
  props.consensusConcerns=sArray(sString(160,1),0,variant==="compact"?2:4);
  return sObject(props);
}
function schemaForGreen(variant,constraints,outOfScope){
  const ideaCount=variant==="compact"?3:4;
  const cIds=constraints.map(x=>x.id).slice(0,4);
  const oIds=outOfScope.map(x=>x.id).slice(0,4);
  const assessmentC=sObject({constraintId:sEnum(cIds.length?cIds:["C-NONE"]),status:sEnum(["satisfies","violates","unknown"]),note:sString(100,0)});
  const assessmentO=sObject({outOfScopeId:sEnum(oIds.length?oIds:["O-NONE"]),status:sEnum(["not_related","possibly_conflicts","conflicts","unknown"]),note:sString(100,0)});
  const idea=sObject({
    ideaId:sEnum(Array.from({length:ideaCount},(_,i)=>`G-${String(i+1).padStart(3,"0")}`)),
    name:sString(120,1),category:sEnum(["pilot","phased","regional","joint","outsourcing","process_change","combination","other"]),
    description:sString(variant==="compact"?160:240,1),distinctiveFeature:sString(variant==="compact"?120:180,1),
    benefits:sArray(sString(variant==="compact"?110:150,1),1,variant==="compact"?1:2),
    challenges:sArray(sString(variant==="compact"?110:150,1),1,variant==="compact"?1:2),
    requirements:sArray(sString(variant==="compact"?110:150,1),0,variant==="compact"?2:3),pilotMethod:sString(variant==="compact"?140:200,0),
    constraintAssessments:sArray(assessmentC,cIds.length,cIds.length),outOfScopeAssessments:sArray(assessmentO,oIds.length,oIds.length)
  });
  return sObject({ideas:sArray(idea,ideaCount,ideaCount),combinationIdeas:sArray(sString(variant==="compact"?160:220,1),0,variant==="compact"?1:2)});
}
function schemaForBlueClosing(variant,greenIdeas){
  const count=variant==="compact"?2:3;
  const sourceIds=greenIdeas.map(x=>x.ideaId).filter(Boolean);
  const optionIds=Array.from({length:count},(_,i)=>`OPT-${String(i+1).padStart(3,"0")}`);
  const option=sObject({
    optionId:sEnum(optionIds),sourceType:sEnum(["green_idea","combination","baseline","new_synthesis"]),
    sourceIdeaIds:sArray(sEnum(sourceIds.length?sourceIds:["G-NONE"]),0,2),label:sString(120,1),summary:sString(variant==="compact"?160:220,1),
    advantages:sArray(sString(variant==="compact"?120:160,1),1,variant==="compact"?1:2),risks:sArray(sString(variant==="compact"?120:160,1),1,variant==="compact"?1:2),
    feasibility:sInt(0,5),recommendationScore:sInt(0,5),scoreBasis:sEnum(SCORE_BASIS)
  });
  return sObject({
    executiveSummary:sString(variant==="compact"?300:500,1),
    recommendation:sObject({type:sEnum(["proceed","conditional","pilot","research","hold","compare"]),label:sString(120,1),rationale:sString(variant==="compact"?260:380,1),optionId:sEnum(optionIds)}),
    keyReasons:sArray(sString(variant==="compact"?160:220,1),2,variant==="compact"?3:4),
    options:sArray(option,count,count),keyRisks:sArray(sString(180,1),0,variant==="compact"?3:4),successConditions:sArray(sString(180,1),0,variant==="compact"?3:4),
    nextActions:sArray(sObject({order:sInt(1,4),action:sString(180,1),purpose:sString(180,1)}),2,variant==="compact"?3:4),
    missingInformation:sArray(sString(200,1),0,variant==="compact"?3:5),caveats:sArray(sString(200,1),0,variant==="compact"?3:4)
  });
}
function schemaFor(id,variant="normal",ctx=state){
  if(id==="red") return schemaForRed(variant,ctx.deterministic?.stakeholders||[]);
  if(id==="green") return schemaForGreen(variant,ctx.deterministic?.constraints||[],ctx.decisionBoundary?.outOfScope||[]);
  if(id==="blue_closing") return schemaForBlueClosing(variant,ctx.results?.green?.ideas||[]);
  return BASE_SCHEMAS[id];
}
