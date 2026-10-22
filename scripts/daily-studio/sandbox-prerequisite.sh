#!/usr/bin/env bash
# Ubuntu's packaged profile, as recommended by official Codex Linux setup:
# https://learn.chatgpt.com/docs/sandboxing
# No global sysctl change, blanket profile removal or unsandboxed CLI fallback.
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
prereq_dir="$repo_root/reports/daily-studio/runtime-prereq"
profile_source="$prereq_dir/extracted/usr/share/apparmor/extra-profiles/bwrap-userns-restrict"
profile_target=/etc/apparmor.d/bwrap-userns-restrict
expected_sha=11d39094f044f0cda0febb3ad517b830301da6b2ce929664af09ee9e4dd264f9

case "${1:-}" in
  --prepare)
    mkdir -p -- "$prereq_dir"
    cd -- "$prereq_dir"
    apt-get download apparmor-profiles
    packages=(apparmor-profiles_*.deb)
    if [[ ${#packages[@]} != 1 ]]; then echo 'Preserve existing downloads; select one reviewed distro package.' >&2; exit 1; fi
    dpkg-deb -x "${packages[0]}" extracted
    ;;
  --install)
    if [[ $EUID != 0 ]]; then echo 'Administrator authentication is required. Run this script with sudo and --install.' >&2; exit 1; fi
    ;;
  *) echo 'Use --prepare without sudo, then review the distro profile and run --install with sudo.' >&2; exit 1 ;;
esac

[[ -f "$profile_source" && ! -L "$profile_source" ]] || { echo 'Prepare the distro profile first.' >&2; exit 1; }
actual_sha="$(sha256sum -- "$profile_source")"
[[ "${actual_sha%% *}" == "$expected_sha" ]] || { echo 'Distro profile changed; review it before installation.' >&2; exit 1; }
# Compile without loading into the kernel, including during the unprivileged
# preparation step. Reject a package/parser mismatch before installing anything.
apparmor_parser --skip-kernel-load --skip-read-cache "$profile_source"
if [[ "${1}" == --prepare ]]; then echo "Reviewed profile prepared: $profile_source"; exit 0; fi
if [[ -e "$profile_target" ]] && ! cmp -s -- "$profile_source" "$profile_target"; then
  echo 'Existing administrator profile differs; preserve it for review.' >&2; exit 1
fi
install -m 0644 -- "$profile_source" "$profile_target"
apparmor_parser -r "$profile_target"
echo 'Distro bubblewrap profile loaded. Now run node scripts/daily-studio/run.js --preflight.'
