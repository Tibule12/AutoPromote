SCA vendor helper scripts

This folder contains helper PowerShell scripts to run vendor SCA scans locally and write reports into `evidence/`.

Prerequisites
- Java 11+ must be installed and available on PATH (verify with `java -version`).
- Download the vendor agent jars and place them in the repository root:
  - Synopsys Detect: place `detect.jar` in repo root (download via Synopsys instructions)
  - Mend / WhiteSource Unified Agent: place `unified-agent.jar` in repo root
  - Sonatype Nexus IQ CLI: place `nexus-iq-cli.jar` in repo root
- Ensure you have API tokens / credentials for each service.

Usage
- Black Duck (Synopsys Detect):
  - Run: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run_blackduck.ps1`
  - The script will prompt for Black Duck URL and token (or read `BLACKDUCK_URL` and `BLACKDUCK_TOKEN` from env).
  - Outputs: `evidence/blackduck/` folder with detect logs and reports.

- Mend / WhiteSource:
  - Run: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run_mend.ps1`
  - The script prompts for `MEND_API_KEY` (or reads `MEND_API_KEY` env var).
  - Outputs: `evidence/mend/`.

- Sonatype Nexus IQ:
  - Run: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run_sonatype.ps1`
  - The script prompts for Nexus IQ URL, username, and password (or reads `NEXUS_IQ_URL`, `NEXUS_IQ_USER`, `NEXUS_IQ_PASS` env vars).
  - Outputs: `evidence/sonatype/`.

Security notes
- Do not commit tokens or credentials to source control. Prefer using environment variables.
- The scripts will not persist credentials to disk; they only use them to call the respective agent.

If you prefer, I can run these scans in this environment if you provide the tokens and confirm; note I will not store them and will remove them from the environment after the run.