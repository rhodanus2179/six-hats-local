import { readFile, readdir } from "node:fs/promises";
import { Script, createContext } from "node:vm";

const expectedScripts = [
  "config.js",
  "state.js",
  "validation.js",
  "ai.js",
  "workflow.js",
  "ui.js",
  "persistence.js",
  "test-harness.js",
  "main.js",
];

const html = await readFile("index.html", "utf8");
for (const file of expectedScripts) {
  const marker = `./src/${file}`;
  if (!html.includes(marker)) throw new Error(`index.html is missing ${marker}`);
}
if (html.includes('type="module"')) {
  throw new Error("Direct file operation requires ordered classic scripts, not ES modules");
}

const files = (await readdir("src")).filter((file) => file.endsWith(".js")).sort();
for (const expected of expectedScripts) {
  if (!files.includes(expected)) throw new Error(`Missing source file: ${expected}`);
}
for (const file of files) {
  const code = await readFile(`src/${file}`, "utf8");
  new Script(code, { filename: `src/${file}` });
}

const css = await readFile("styles/app.css", "utf8");
if (!css.includes(":root") || !css.includes(".hatCard")) {
  throw new Error("styles/app.css appears incomplete");
}

// Regression test: a green idea that violates a constraint must never reach
// the final-blue schema context or be accepted in the final conclusion.
const validationCode = await readFile("src/validation.js", "utf8");
const aiCode = await readFile("src/ai.js", "utf8");
for (const requiredText of [
  "function ideaConclusionAssessment",
  "GREEN_IDEA_AUTO_EXCLUDED",
  "validateConclusionEligibility(data,ctx)",
]) {
  if (!validationCode.includes(requiredText)) {
    throw new Error(`Conclusion gate is incomplete: ${requiredText}`);
  }
}
for (const requiredText of [
  "conclusionEligibleIdeas(r.ideas)",
  "excludedGreenIdeas",
  "conclusionSchemaContext(state)",
]) {
  if (!aiCode.includes(requiredText)) {
    throw new Error(`Final-blue filtering is incomplete: ${requiredText}`);
  }
}

const context = createContext({
  console,
  arr: (value) => (Array.isArray(value) ? value : []),
  unique: (values) => [...new Set(values.filter(Boolean))],
  safeText: (value, max = 700) => String(value ?? "").slice(0, max),
  normalizeText: (value) =>
    String(value ?? "")
      .normalize("NFKC")
      .replace(/[\s。、，,.・:：;；!?！？「」『』（）()\-—_]/g, "")
      .toLowerCase(),
  createWarning: (code, severity, message, hatId = null, relatedIds = []) => ({
    code,
    severity,
    message,
    hatId,
    relatedIds,
    acknowledged: false,
  }),
  PLACEHOLDERS: new Set(),
});
new Script(validationCode, { filename: "src/validation.js" }).runInContext(context);

const eligibleIdea = {
  ideaId: "G-001",
  name: "段階的導入",
  constraintAssessments: [{ constraintId: "C-002", status: "satisfies" }],
  outOfScopeAssessments: [],
};
const excludedIdea = {
  ideaId: "G-002",
  name: "住民インセンティブ制度の導入",
  constraintAssessments: [{ constraintId: "C-002", status: "violates" }],
  outOfScopeAssessments: [],
};
const harnessState = {
  results: { green: { ideas: [eligibleIdea, excludedIdea] } },
  deterministic: { constraints: [{ id: "C-002", type: "unknown" }] },
  decisionBoundary: { outOfScope: [] },
};
context.state = harnessState;

if (context.ideaConclusionAssessment(excludedIdea).status !== "excluded") {
  throw new Error("A constraint-violating green idea was not marked excluded");
}
const schemaIdeas = context.conclusionSchemaContext(harnessState).results.green.ideas;
if (schemaIdeas.some((idea) => idea.ideaId === "G-002")) {
  throw new Error("An excluded green idea remained in the final-blue schema context");
}

const validConclusion = {
  executiveSummary: "段階的導入を中心に検討する。",
  recommendation: { optionId: "OPT-001", label: "段階的導入" },
  keyReasons: ["制約を満たすため。"],
  options: [
    {
      optionId: "OPT-001",
      sourceIdeaIds: ["G-001"],
      label: "段階的導入",
      summary: "段階的に実施する。",
      advantages: ["リスクを抑える。"],
      risks: ["導入に時間を要する。"],
    },
  ],
  successConditions: ["評価指標を定める。"],
  nextActions: [{ order: 1, action: "試行を設計する。", purpose: "実現性を確認する。" }],
};
if (context.validateConclusionEligibility(validConclusion, harnessState).errors.length) {
  throw new Error("A valid conclusion was rejected by the conclusion gate");
}
const badReference = structuredClone(validConclusion);
badReference.options[0].sourceIdeaIds = ["G-002"];
if (!context.validateConclusionEligibility(badReference, harnessState).errors.length) {
  throw new Error("A final option was allowed to reference an excluded green idea");
}
const badText = structuredClone(validConclusion);
badText.executiveSummary = "住民インセンティブ制度の導入を推奨する。";
if (!context.validateConclusionEligibility(badText, harnessState).errors.length) {
  throw new Error("An excluded green idea name was allowed into the final conclusion");
}

console.log(`Static and conclusion-gate checks passed for ${files.length} JavaScript files.`);
