"""Read-only inventory of the existing VM; records missing tools as such."""
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time


def main():
    commands = [
        ["hostname"], ["uname", "-a"], ["cat", "/etc/os-release"],
        ["lscpu"], ["free", "-b"], ["df", "-B1"], ["nvidia-smi"],
        ["nvidia-smi", "--query-gpu=name,driver_version,memory.total,memory.free",
         "--format=csv,noheader,nounits"],
        ["docker", "--version"],
        ["docker", "info", "--format", "{{json .Runtimes}}"],
        ["docker", "image", "ls", "--format", "{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}"],
        ["ffmpeg", "-version"], ["ffmpeg", "-hide_banner", "-hwaccels"],
        ["ffmpeg", "-hide_banner", "-encoders"], ["ffmpeg", "-hide_banner", "-decoders"],
        ["python3", "-c", "import importlib.util; print('torch_installed:', bool(importlib.util.find_spec('torch')))"],
        ["sudo", "-n", "true"],
    ]
    receipt = {"capturedAt": datetime.now(timezone.utc).isoformat(), "commands": []}
    for argv in commands:
        started = time.monotonic()
        try:
            result = subprocess.run(argv, capture_output=True, text=True, timeout=20)
            row = {"argv": argv, "exitCode": result.returncode,
                   "stdout": result.stdout, "stderr": result.stderr}
        except (OSError, subprocess.TimeoutExpired) as error:
            row = {"argv": argv, "exitCode": None, "error": str(error)}
        row["elapsedSeconds"] = round(time.monotonic() - started, 4)
        receipt["commands"].append(row)
        print(json.dumps({"argv": argv, "exitCode": row["exitCode"],
                          "error": row.get("error")}), flush=True)
    Path(__file__).with_name("environment.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
