# Architecture

## Runtime model

The application remains build-free and can be opened directly from `index.html`.
External JavaScript files are loaded as ordered classic scripts rather than ES modules so local `file://` use continues to work.

## File responsibilities

| File | Responsibility |
|---|---|
| `src/config.js` | Build metadata, hats, labels, prompts, JSON Schemas |
| `src/state.js` | State creation, warnings, logs, deterministic input extraction |
| `src/validation.js` | JSON Schema and semantic/cross-hat validation |
| `src/ai.js` | Prompt context construction, Prompt API sessions, retry policy |
| `src/workflow.js` | Hat execution, pause/resume, autosave orchestration |
| `src/ui.js` | Rendering, dialogs, form binding, Markdown output |
| `src/persistence.js` | Migration, import/export, local history |
| `src/test-harness.js` | Test assertions, reports, demo data, developer panel |
| `src/main.js` | Runtime markup, event handlers, bootstrap |

## Dependency direction

Files are loaded in the order shown above. Later files may use bindings declared by earlier files.
No bundler or package installation is required.

## Compatibility note

Changing the scripts to `type="module"` would make direct `file://` operation unreliable because module loading is subject to CORS rules. Keep the ordered classic-script model unless the project adopts a local web server as a hard requirement.
