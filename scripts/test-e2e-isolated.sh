#!/usr/bin/env bash
set -Eeuo pipefail

# Run local fixtures with no network, or an explicit anonymous public smoke test with bridge access.
# Both modes use a disposable container without host mounts, capabilities or production credentials.
task_root=$(git rev-parse --show-toplevel)
cd "$task_root"
# Content ID of the locally installed mcr.microsoft.com/playwright:v1.63.0-noble image.
task_image='sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27'
task_cli=$(command -v playwright || true)
if [[ -n ${HAMPTON_PLAYWRIGHT_CORE:-} ]]; then
  task_core=$HAMPTON_PLAYWRIGHT_CORE
elif [[ -n $task_cli ]]; then
  task_core="$(dirname "$(readlink -f "$task_cli")")/node_modules/playwright-core"
else
  printf 'Playwright Core is not installed; set HAMPTON_PLAYWRIGHT_CORE to an existing copy.\n' >&2; exit 1
fi
[[ -d $task_core && $(basename "$task_core") == playwright-core && -d node_modules ]] || { printf 'Install the project dependencies and provide the playwright-core directory.\n' >&2; exit 1; }
task_core=$(realpath "$task_core")
task_revision=$(node -e 'const b=require(process.argv[1]).browsers.find(x=>x.name==="webkit");if(!b)process.exit(1);process.stdout.write(b.revision)' "$task_core/browsers.json")
task_browser=${HAMPTON_WEBKIT_DIR:-$(node -p 'require("node:os").homedir()')/.cache/ms-playwright/webkit-$task_revision}
[[ $(basename "$task_browser") == "webkit-$task_revision" && -f $task_browser/pw_run.sh && -d $task_browser/minibrowser-gtk ]] || {
  printf 'Matching WebKit revision %s is unavailable; set HAMPTON_WEBKIT_DIR to its existing cache.\n' "$task_revision" >&2; exit 1;
}
docker image inspect "$task_image" >/dev/null || { printf 'The pinned Playwright image is not installed locally.\n' >&2; exit 1; }
task_production=${E2E_PRODUCTION_READONLY:-0}
[[ $task_production == 0 || $task_production == 1 ]] || { printf 'Invalid browser test mode.\n' >&2; exit 1; }
task_browser_mode=${HAMPTON_E2E_BROWSER:-$([[ $task_production == 0 ]] && printf chromium || printf webkit)}
[[ $task_browser_mode == chromium || $task_browser_mode == webkit ]] || { printf 'Invalid browser selection.\n' >&2; exit 1; }
[[ $task_production == 0 || $task_browser_mode == webkit ]] || { printf 'Chromium without its sandbox is limited to local fixtures.\n' >&2; exit 1; }
if [[ $task_production == 1 ]]; then
  task_script=tests/production-readonly-e2e.cjs
  task_network=bridge
  task_inner='cd /work && tar -xf - && xvfb-run -a node "$E2E_SCRIPT" >&2'
else
  task_script=${E2E_SCRIPT:-tests/e2e.cjs}
  task_network=none
  task_inner='cd /work && tar -xf - && xvfb-run -a npm run test:e2e >&2; result=$?; if [ -d /tmp/hampton-shots ]; then tar -cf - -C /tmp/hampton-shots .; fi; exit "$result"'
fi
[[ $task_script =~ ^tests/[a-zA-Z0-9._-]+\.cjs$ && -f $task_script ]] && git ls-files --error-unmatch "$task_script" >/dev/null 2>&1 || {
  printf 'E2E_SCRIPT must name a tracked or staged test file.\n' >&2; exit 1;
}

task_archive=$(mktemp /tmp/hampton-browser-archive.XXXXXX)
task_manifest=$(mktemp /tmp/hampton-browser-files.XXXXXX)
task_shots=$(mktemp /tmp/hampton-browser-shots.XXXXXX)
task_session=$(mktemp -d /tmp/hampton-browser-session.XXXXXXXXXXXX)
task_nonce=${task_session##*/}
task_container="hampton-e2e-$task_nonce"
task_docker_pid=''
task_remove_container() {
  local task_metadata task_id task_label task_error
  if task_metadata=$(timeout 5s docker inspect --format '{{.Id}} {{index .Config.Labels "io.hampton.e2e.session"}}' "$task_container" 2>"$task_session/inspect-error"); then
    read -r task_id task_label <<< "$task_metadata"
    if [[ ! $task_id =~ ^[0-9a-f]{64}$ || $task_label != "$task_nonce" ]] ||
       { [[ -s $task_session/cid ]] && [[ $(<"$task_session/cid") != "$task_id" ]]; }; then
      printf 'Could not verify ownership of the temporary browser container; leaving it untouched.\n' >&2
      return 1
    fi
    if ! timeout 10s docker rm -f -- "$task_id" >/dev/null 2>&1; then
      if timeout 5s docker inspect "$task_id" >/dev/null 2>"$task_session/inspect-error"; then
        printf 'Could not remove the verified temporary browser container.\n' >&2
        return 1
      fi
      task_error=$(<"$task_session/inspect-error")
      if [[ ${task_error,,} != *'no such object:'* && ${task_error,,} != *'no such container:'* ]]; then
        printf 'Could not confirm removal of the temporary browser container.\n' >&2
        return 1
      fi
    fi
  else
    task_error=$(<"$task_session/inspect-error")
    if [[ ${task_error,,} != *'no such object:'* && ${task_error,,} != *'no such container:'* ]]; then
      printf 'Could not inspect the temporary browser container; leaving it untouched.\n' >&2
      return 1
    fi
  fi
}
task_cleanup() {
  local task_exit=$? task_cleanup_failed=0
  trap - EXIT INT TERM
  task_remove_container || task_cleanup_failed=1
  if [[ -n $task_docker_pid ]]; then
    kill -KILL "$task_docker_pid" 2>/dev/null || true
    wait "$task_docker_pid" 2>/dev/null || true
    task_cleanup_failed=0
    task_remove_container || task_cleanup_failed=1
  fi
  rm -f -- "$task_archive" "$task_manifest" "$task_shots"
  if (( task_cleanup_failed )); then
    printf 'Container identity retained in %s for a directed cleanup.\n' "$task_session" >&2
    if (( task_exit == 0 )); then task_exit=1; fi
  else
    rm -f -- "$task_session/cid" "$task_session/inspect-error"
    rmdir -- "$task_session" 2>/dev/null || true
  fi
  exit "$task_exit"
}
trap task_cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ $task_production == 1 ]]; then
  printf '%s\0' "$task_script" > "$task_manifest"
else
  git ls-files -z > "$task_manifest"
fi
tar --null --no-recursion -cf "$task_archive" -T "$task_manifest"
if [[ $task_production == 0 ]]; then tar -rf "$task_archive" node_modules; fi
tar -rf "$task_archive" -C "$(dirname "$task_core")" "$(basename "$task_core")"
tar -rf "$task_archive" -C "$(dirname "$task_browser")" "webkit-$task_revision/pw_run.sh" "webkit-$task_revision/minibrowser-gtk"

task_result=0
docker run -i --rm --pull=never --network="$task_network" --read-only --cap-drop=ALL \
  --name "$task_container" --cidfile "$task_session/cid" --label "io.hampton.e2e.session=$task_nonce" \
  --security-opt=no-new-privileges --pids-limit=512 --memory=4g --cpus=2 --user=pwuser \
  --tmpfs /work:rw,exec,nosuid,nodev,size=1500m,mode=1777 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=400m \
  -e PW=/work/tests/isolated-webkit.cjs -e "E2E_SCRIPT=$task_script" -e "HAMPTON_E2E_BROWSER=$task_browser_mode" \
  -e "E2E_PRODUCTION_READONLY=$task_production" -e HAMPTON_E2E_ISOLATED=1 \
  -e "E2E_PHASES=${E2E_PHASES:-public,urls,admin,reg17}" -e E2E_OFFLINE_FONTS=1 -e E2E_OFFLINE_TURNSTILE=1 \
  -e E2E_LOCAL_HTTPS=1 -e E2E_SHOTS=/tmp/hampton-shots -e E2E_RECYCLE_BROWSER=1 \
  -e "E2E_PROD_EXPECT_REG06=${E2E_PROD_EXPECT_REG06:-0}" -e "E2E_PROD_EXPECT_REG07=${E2E_PROD_EXPECT_REG07:-0}" \
  -e XDG_CONFIG_HOME=/tmp/hampton-config -e XDG_CACHE_HOME=/tmp/hampton-cache \
  "$task_image" sh -c "$task_inner" \
  < "$task_archive" > "$task_shots" &
task_docker_pid=$!
wait "$task_docker_pid" || task_result=$?
task_docker_pid=''

if [[ -s $task_shots ]]; then
  task_parent=${E2E_ARTIFACT_DIR:-/tmp/hampton-browser-captures}
  mkdir -p -- "$task_parent"
  task_output=$(mktemp -d "$task_parent/run-XXXXXX")
  tar -xf "$task_shots" --no-same-owner --no-same-permissions -C "$task_output"
  printf 'Captures: %s\n' "$task_output"
fi
exit "$task_result"
