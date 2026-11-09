# Browser operator

Run a real goal-driven browser agent:

```sh
NODE_PATH=/home/tibule12/Projects/AutoPromte/AutoPromote/node_modules \
BROWSER_AGENT_PROVIDER=nvidia \
node scripts/run-browser-agent.js task.json reports/browser-agent/my-task
```

The NVIDIA planner uses the existing `autopromote-l40s-staging` over SSH. Prepare
the pinned official Qwen3-VL-8B-Instruct model separately, then run
`scripts/run-nvidia-browser-planner.py` in an offline CUDA container. Requests and
responses pass through a file spool; no public inference port is opened. The
qualification service stops at the original GPU deadline. Its model cache stays
on NVIDIA. A later session must explicitly supply its own authorized deadline.

An optional OpenAI Responses planner is available with `BROWSER_AGENT_PROVIDER`
set to `responses`, `BROWSER_AGENT_API_KEY` and `BROWSER_AGENT_MODEL`. Configure a vision-capable
model explicitly. Screenshots and semantic page observations are sent to that
provider; keys are never sent to the browser or NVIDIA. Requests use `store:false`.
This adapter follows the official [vision input documentation](https://developers.openai.com/api/docs/guides/images-vision)
and [structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

Example task:

```json
{
  "goal": "Open the locally served Studio and inspect its available tools",
  "startUrl": "http://127.0.0.1:5007/?fixture=podcast",
  "allowedOrigins": ["http://127.0.0.1:5007"],
  "success": [{"type": "visible", "role": "navigation", "name": "Creative tools"}],
  "allowedOperations": [],
  "maxSteps": 20
}
```

The agent observes the screenshot, labels, roles, control states, modal context,
page URLs, frames, scroll position, busy indicators and browser errors. The
planner chooses one current target and explicit verification conditions. The
executor scrolls the control into view, uses Playwright actionability checks,
re-resolves semantic targets after DOM replacement, dispatches once, and polls
the postcondition. See [Playwright locators](https://playwright.dev/docs/locators)
and [auto-waiting](https://playwright.dev/docs/actionability).

`allowedOperations` is a task boundary for consequential actions, not an extra
interactive approval flow. Each entry includes `id`, `action`, `role` and exact
`name`. Native dialog entries instead include `value` (`accept`/`dismiss`) and
the exact `message`. Unknown operations stop at the boundary. Passwords, file
inputs and CAPTCHA require user input; there is no stealth or identity spoofing.

The durable action journal is written before dispatch. An uncertain outcome is
inspected and reconciled; the agent does not click or submit again. Reusing the
same evidence folder retains this protection across a process restart. Reuse a
folder only for the same goal. Every consequential action must have observable
postconditions, and goal completion is checked independently of the planner.

Each observation and failure saves PNG and JSON evidence. The CLI also saves a
Playwright trace. Evidence contains page content and may be sensitive; keep it
local. Password fields are masked and URL credential parameters are redacted.

The automated local tests exercise modal handling, offscreen content, delayed
confirmation, changed DOM/layout, ambiguous targets, native dialogs, CAPTCHA,
failure evidence, and single submission across restarts. The real NVIDIA
qualification uses a local dynamic fixture, with no production authentication.
A bounded fixture pass does not establish reliable operation on every website.

The default provider is NVIDIA. `BROWSER_AGENT_GPU_HOST` and
`BROWSER_AGENT_GPU_SPOOL` can select another explicitly authorized deployment.
The qualified Qwen3 revision is `0c351dd01ed87e9c1b53cbc748cba10e6187ff3b`.
Build `python_media_worker/Dockerfile.vfx` with that directory as its context,
then build `scripts/browser-agent/Dockerfile.nvidia` from the repository root.
Run the planner with `--model-dir`, `--spool`, `--deadline` and an explicit
`--expected-gpu` if changing hardware. Keep inference networking disabled and
mount only the model cache and spool. Never supply cloud credentials.

The live L40S evidence is in
`reports/browser-agent-nvidia-20261006/dynamic-workflow-grammar-fixed/result.json`
(six observations, one actual POST) and `real-welcome/receipt.json` (actual
welcome page demo open/close). The earlier failed model runs are retained. The
successful dynamic run recovered from one wrong intermediate expectation;
it is evidence of recovery, not flawless model judgment. The executor also
passes twelve local browser checks, including section context, changed DOM,
popups, real downloaded bytes, native dialogs and duplicate-submit protection.
The optional Responses adapter has a request-contract test; it has not been
qualified with a live API call in this NVIDIA-only session.

The final self-contained runtime also passed in
`dynamic-workflow-portable-final/result.json`: five verified actions, one POST,
six observations and no recovery errors. It uses the current controller,
visible-only heading observations and additional examples for immediate modal
verification.

`state_changed` is allowed for reversible exploration and is followed by a fresh
observation. Consequential actions require specific success predicates. A
download succeeds only after its bytes are retained under the evidence folder.
Downloaded artifacts now retain a durable filename, byte count and SHA-256
receipt. On restart, the operator verifies the actual retained bytes before
recognizing the prior download. Missing or changed bytes cannot establish
success; an unresolved authorized operation is not silently clicked again.
Observation identifiers also continue across restart, preserving the journal.
Content can trigger a recovery observation, but cannot supply executable code
or expand the task's allowed origins/operations. This is a bounded operator,
not a claim of universal web reliability; canvas-only interfaces, complex drag
gestures and authentication still need additional integration.
