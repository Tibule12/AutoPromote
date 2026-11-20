# Google Cloud cost audit — 17 November 2026

The owner's current-month Billing screenshot shows $18.54 total: App Engine $13.17 (71.0%), Artifact Registry $4.64 (25.0%), Cloud Storage $0.46 and Cloud Run $0.27 after savings. Cloud Run Functions nets $0. These are screenshot-observed account-level amounts; the report has no visible project filter. Grey chart bars are forecasts.

Read-only inspection of `autopromote-cc6d3` found 37,199,956 Firestore document reads over the preceding 30 days, including 36,126,660 query reads. Recent daily totals are about1.1million. A bounded sample of100 recent Firestore RunQuery audit entries includes33 promotion_tasks,28 promotion_schedules,16 engagement_campaigns and13 platform_posts queries. The sample is truncated and is not a whole-period attribution. Background scheduling/engagement polling is a concrete source of continuing database activity while the owner is the only tester.

App Engine Admin returns NOT_FOUND for this project's application and services. Google documents that Firestore/Datastore usage can be billed under App Engine. Therefore Firestore is a likely explanation for that screenshot row, but exact SKU and project attribution remain unverified. Billing API access returns SERVICE_DISABLED, and no billing-export dataset exists. No API or export was enabled. The next billing view is App Engine filtered, grouped by SKU and project.

Artifact Registry retains88.57GB in `us/gcr.io` and8.51GB in `us-central1/thulani-repo`:97.08GB total (90.42GiB), with no cleanup policies configured. Google bills retained artifact storage even when images are not executing. This is a concrete ongoing storage driver; the exact storage/transfer split of the screenshot's $4.64 requires its SKU view. Active image and rollback reachability must be inventoried before deleting any versions.

Other observations: approximately55.64GB of Cloud Storage,66.07GB of Storage response bytes (not all necessarily billable Internet egress),1.47million first-generation function invocations and17.28GB of logging ingestion over30days. Four content-update triggers dominate invocations. No Compute Engine instances/disks or Cloud SQL instances are listed. The five us-central1 Cloud Run services have no configured positive minimum instance count. These are usage observations, not an invoice or exact price calculation.

No production configuration, deployments, jobs, API enablement, deletions or billing settings changed. Reads used metadata/Monitoring GET requests and a bounded read-only Logging entries:list POST. Private sanitized evidence is retained under private/.

Sources: [Google Cloud billing release notes](https://docs.cloud.google.com/billing/docs/release-notes#July_27_2023), [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing), [Billing report grouping](https://docs.cloud.google.com/billing/docs/how-to/reports).
