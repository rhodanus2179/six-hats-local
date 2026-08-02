import { readFile, readdir } from "node:fs/promises";
import { Script } from "node:vm";

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

console.log(`Static checks passed for ${files.length} JavaScript files.`);
