const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const imageId = 'a'.repeat(64);

test('isolated browser cleanup verifies ownership and reports uncertain cleanup', async t => {
  for (const scenario of ['already-removed', 'removed-during-rm', 'daemon-unavailable', 'wrong-owner', 'wrong-id', 'production-readonly']) {
    await t.test(scenario, () => {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hampton-cleanup-test-'));
      const bin = path.join(temp, 'bin');
      const core = path.join(temp, 'playwright-core');
      const browser = path.join(temp, 'webkit-999');
      fs.mkdirSync(bin);
      fs.mkdirSync(core);
      fs.mkdirSync(path.join(browser, 'minibrowser-gtk'), {recursive:true});
      fs.writeFileSync(path.join(core, 'browsers.json'), JSON.stringify({browsers:[{name:'webkit', revision:'999'}]}));
      fs.writeFileSync(path.join(browser, 'pw_run.sh'), '');
      fs.writeFileSync(path.join(bin, 'tar'), '#!/bin/sh\nexit 0\n', {mode:0o755});
      fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/bash
set -eu
case "$1" in
  image) exit 0 ;;
  run)
    printf '%s\\n' "$@" > "$FAKE_ARGS"
    shift
    while (($#)); do
      case "$1" in
        --cidfile) printf '%s' "$FAKE_ID" > "$2"; shift 2 ;;
        --label) printf '%s' "\${2#*=}" > "$FAKE_STATE"; shift 2 ;;
        *) shift ;;
      esac
    done
    exit 0 ;;
  inspect)
    case "$FAKE_SCENARIO" in
      already-removed|production-readonly) printf 'Error: no such object: test\\n' >&2; exit 1 ;;
      daemon-unavailable) printf 'Docker is unavailable\\n' >&2; exit 1 ;;
      *)
        if [[ "$2" == '--format' ]]; then
          owner=$(<"$FAKE_STATE")
          [[ "$FAKE_SCENARIO" != wrong-owner ]] || owner=other-owner
          inspected_id=$FAKE_ID
          [[ "$FAKE_SCENARIO" != wrong-id ]] || inspected_id=$(printf 'b%.0s' {1..64})
          printf '%s %s\\n' "$inspected_id" "$owner"
          exit 0
        fi
        printf 'Error: No such object: test\\n' >&2; exit 1 ;;
    esac ;;
  rm) printf 'called' > "$FAKE_RM_LOG"; exit 1 ;;
  *) exit 90 ;;
esac
`, {mode:0o755});
      let session;
      try {
        const run = spawnSync('bash', ['scripts/test-e2e-isolated.sh'], {
          cwd:repo, encoding:'utf8', timeout:15000,
          env:{...process.env, PATH:`${bin}:${process.env.PATH}`, HAMPTON_PLAYWRIGHT_CORE:core,
            HAMPTON_WEBKIT_DIR:browser, FAKE_SCENARIO:scenario, FAKE_ID:imageId,
            FAKE_STATE:path.join(temp,'state'), FAKE_RM_LOG:path.join(temp,'removed'),
            FAKE_ARGS:path.join(temp,'args'), E2E_PRODUCTION_READONLY:scenario === 'production-readonly' ? '1' : '0',
            E2E_SCRIPT:'tests/e2e.cjs'},
        });
        assert.ifError(run.error);
        const match = run.stderr.match(/Container identity retained in (\/tmp\/hampton-browser-session\.[A-Za-z0-9]+) for a directed cleanup\./);
        session = match?.[1];
        const args = fs.readFileSync(path.join(temp, 'args'), 'utf8').split('\n');
        assert.ok(args.includes(scenario === 'production-readonly' ? '--network=bridge' : '--network=none'));
        assert.ok(args.includes(scenario === 'production-readonly' ? 'E2E_SCRIPT=tests/production-readonly-e2e.cjs' : 'E2E_SCRIPT=tests/e2e.cjs'));
        if (scenario === 'already-removed' || scenario === 'removed-during-rm' || scenario === 'production-readonly') {
          assert.equal(run.status, 0, run.stderr);
          assert.doesNotMatch(run.stderr, /identity retained/i);
        } else {
          assert.equal(run.status, 1, run.stderr);
          assert.ok(match, run.stderr);
          assert.equal(fs.readFileSync(path.join(session, 'cid'), 'utf8'), imageId);
        }
        assert.equal(fs.existsSync(path.join(temp,'removed')), scenario === 'removed-during-rm');
      } finally {
        if (session) {
          fs.rmSync(path.join(session, 'cid'), {force:true});
          fs.rmSync(path.join(session, 'inspect-error'), {force:true});
          fs.rmdirSync(session);
        }
        fs.rmSync(temp, {recursive:true, force:true});
      }
    });
  }
});
