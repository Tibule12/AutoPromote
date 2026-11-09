# GPU cost investigation — 9 October 2026

The verified total spend remains unknown. No invoice or Brev transaction ledger was retrieved. The Google billing account is readable, but this project has no BigQuery billing-export dataset.

Fresh authenticated inventory confirms the retained Brev L40S is STOPPED. The seven-region Google Cloud Run inventory has zero active GPU executions, zero GPU services and four idle job definitions. Compute Engine has no instances in this project. Stopped Brev storage and retained cloud assets can still incur charges. No GPU was started, restarted, warmed or requested during this investigation.

The latest runtime proof had nine GPU attempts and 3205.37 seconds (53.42 minutes) of execution wall time, including failures/cancellation. Google Cloud Monitoring reports 1941.23 billable instance-seconds for those GPU job definitions in the investigated interval. Applying an estimated one-minute floor for each observed task gives a **$1.77 compute estimate**, including CPU, RAM and GPU. About **$0.78 of that estimate** belongs to failed attempts. Minute-point attribution and cancelled-job treatment are assumptions; this is not an invoice. Earlier work, builds, storage, network, logs, taxes and discounts/free tiers are excluded. This subtotal cannot be used as the overall amount spent or wasted.

Sources: [Google pricing](https://cloud.google.com/run/pricing), [Brev stopped-instance billing](https://docs.nvidia.com/brev/concepts/gpu-instances), [safe audit and per-attempt calculations](GPU-COST-AUDIT-20261009.json). Historical L40S console rate was $1.79/hour; complete earlier billable intervals remain unreconciled.

Product state is unchanged. The founder rejected the logo/combined creative result; technical execution does not establish reference-level quality. Runtime product integration remains partial. Next cost task is reconcile actual provider transactions with all runtime/earlier instance intervals. Shared Studio backlog remains S02; no additional creative/model/GPU work was performed in response to this cost question.
