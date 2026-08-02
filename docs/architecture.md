# Architecture

## Runtime model

The application remains build-free and can be opened directly from `index.html`.
External JavaScript files are loaded as ordered classic scripts rather than ES modules so local `file://` use continues to work.

## File responsibilities

| File | Responsibility |
|---|---|
| `src/config.js` | Build metadata, hats, labels, prompts, JSON Schemas |
| `src/state.js` | State creation, warnings, logs, deterministic input extraction |
| `src/validation.js` | JSON Schema, semantic/cross-hat validation, conclusion eligibility gate |
| `src/ai.js` | Prompt context construction, Prompt API sessions, retry policy, final-blue filtering |
| `src/workflow.js` | Hat execution, pause/resume, autosave orchestration |
| `src/ui.js` | Rendering, dialogs, form binding, Markdown output |
| `src/persistence.js` | Import/export and local history |
| `src/test-harness.js` | Test assertions, reports, demo data, developer panel |
| `src/main.js` | Runtime markup, event handlers, bootstrap |

## Dependency direction

Files are loaded in the order shown above. Later files may use bindings declared by earlier files.
No bundler or package installation is required.

## Conclusion eligibility gate

The green hat remains free to generate unconventional ideas, including ideas that conflict with a stated constraint. Before the final blue hat runs, the harness classifies each green idea:

- `eligible`: all evaluated constraints are satisfied and no out-of-scope conflict exists
- `conditional`: at least one assessment is unknown or possibly conflicting
- `excluded`: at least one constraint is violated or an out-of-scope item is directly conflicted

Excluded ideas are removed from both the final-blue prompt context and the dynamic JSON Schema enum. The semantic validator also rejects any final output that references an excluded idea ID or repeats an excluded idea name in the conclusion fields. This makes exclusion deterministic rather than relying only on prompt instructions.

## Compatibility note

The refactored v1.2 data model is the current contract. Compatibility with meeting JSON produced by pre-v1.2 builds is not a release requirement. Direct `file://` startup compatibility is retained.
