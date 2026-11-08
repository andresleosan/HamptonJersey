// Run: node --test tests/check-avanzar.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const { pathToFileURL } = require('node:url');

const realSpawnSync = childProcess.spawnSync;
const script = path.join(__dirname, '..', 'scripts', 'check-avanzar.mjs');
const canonical = 'https://github.com/andresleosan/HamptonJersey.git';
let checkAvanzar;
test.before(async () => {
  ({ checkAvanzar } = await import(pathToFileURL(script)));
});

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avanzar-git-'));
  const remote = path.join(dir, 'remote.git');
  const seed = path.join(dir, 'seed');
  const repo = path.join(dir, 'checkout');
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(dir, 'absent-global-config'),
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    TALLER_PUSH_APROBADO: undefined, TALLER_SHA_APROBADO: undefined,
  };
  const calls = [];
  const controls = { fetchURL: canonical, pushURL: canonical };
  function git(cwd, ...args) {
    const r = realSpawnSync('git', args, { cwd, env, encoding: 'utf8' });
    assert.equal(r.status, 0, `fixture git ${args[0]} failed: ${r.stderr}`);
    return r.stdout.trim();
  }
  function commit(cwd, file, content) {
    fs.writeFileSync(path.join(cwd, file), content);
    git(cwd, 'add', '--', file);
    git(cwd, 'commit', '-m', 'Fixture change');
    return git(cwd, 'rev-parse', 'HEAD');
  }
  function publish() {
    git(seed, 'push', 'origin', 'main');
    return git(seed, 'rev-parse', 'HEAD');
  }
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  git(dir, 'init', '--bare', '--initial-branch=main', remote);
  git(dir, 'init', '--initial-branch=main', seed);
  commit(seed, 'tracked.txt', 'published\n');
  commit(seed, 'second.txt', 'second published file\n');
  git(seed, 'remote', 'add', 'origin', remote);
  publish();
  git(dir, 'clone', remote, repo);
  const initial = git(repo, 'rev-parse', 'HEAD');

  // Only the URL inspection is simulated. All history, fetches, comparisons,
  // worktrees and status checks use real Git against a local bare repository.
  // Updating Node's builtin bindings keeps this fixture portable without a
  // shell wrapper or a production option that bypasses repository validation.
  t.mock.method(childProcess, 'spawnSync', (command, args, options) => {
    if (command !== 'git') return realSpawnSync(command, args, options);
    const subcommand = [...args];
    if (subcommand[0] === '-C') subcommand.splice(0, 2);
    calls.push(subcommand);
    if (subcommand[0] === 'remote' && subcommand[1] === 'get-url') {
      const url = subcommand.includes('--push') ? controls.pushURL : controls.fetchURL;
      return { status: 0, stdout: `${url}\n`, stderr: '' };
    }
    if (controls.failFetch && subcommand[0] === 'fetch') {
      return { status: 1, stdout: '', stderr: 'fixture-secret in transport failure' };
    }
    if (controls.remoteRace && subcommand[0] === 'ls-remote') {
      return { status: 0, stdout: `${'a'.repeat(40)}\trefs/heads/main\n`, stderr: '' };
    }
    return realSpawnSync(command, args, options);
  });
  syncBuiltinESMExports();
  return {
    dir, remote, seed, repo, initial, env, controls, calls, git, commit, publish,
    check: (options = {}) => checkAvanzar({ cwd: repo, env, ...options }),
  };
}

test('a clean main verifies the current remote commit and records its location', (t) => {
  const f = fixture(t);
  const r = f.check();
  assert.equal(r.exitCode, 0);
  assert.equal(r.status, 'equal');
  assert.equal(r.relation, 'equal');
  assert.equal(r.root, fs.realpathSync(f.repo));
  assert.equal(r.branch, 'main');
  assert.equal(r.head, f.initial);
  assert.equal(r.main, f.initial);
  assert.equal(r.remoteHead, f.initial);
  assert.equal(r.dirty, false);
  assert.deepEqual(r.counts, { staged: 0, unstaged: 0, untracked: 0 });
  assert.ok(Number.isFinite(Date.parse(r.checkedAt)));
  assert.ok(r.worktrees.some((w) => w.head === f.initial));
  assert.ok(f.calls.some((c) => c[0] === 'fetch'));
  assert.ok(f.calls.some((c) => c[0] === 'ls-remote'));
});

test('finds the repository root from a subdirectory', (t) => {
  const f = fixture(t);
  const cwd = path.join(f.repo, 'nested', 'folder');
  fs.mkdirSync(cwd, { recursive: true });
  const r = f.check({ cwd });
  assert.equal(r.exitCode, 0);
  assert.equal(r.root, fs.realpathSync(f.repo));
});

test('accepts HTTPS and both SSH forms of the canonical repository', (t) => {
  const f = fixture(t);
  for (const url of [canonical, 'https://github.com/andresleosan/HamptonJersey',
    'git@github.com:andresleosan/HamptonJersey.git',
    'ssh://git@github.com/andresleosan/HamptonJersey.git']) {
    f.controls.fetchURL = url;
    f.controls.pushURL = url;
    assert.equal(f.check().exitCode, 0, url);
  }
});

test('the same SHA with staged, unstaged and untracked work is not a clean match', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.repo, 'tracked.txt'), 'staged change\n');
  f.git(f.repo, 'add', 'tracked.txt');
  fs.appendFileSync(path.join(f.repo, 'tracked.txt'), 'unstaged change\n');
  fs.writeFileSync(path.join(f.repo, 'private-fixture-name.txt'), 'private fixture data');
  const before = f.git(f.repo, 'status', '--porcelain=v1');
  const r = f.check();
  assert.equal(r.exitCode, 2);
  assert.equal(r.status, 'dirty');
  assert.equal(r.relation, 'equal');
  assert.equal(r.head, r.remoteHead);
  assert.deepEqual(r.counts, { staged: 1, unstaged: 1, untracked: 1 });
  assert.equal(f.git(f.repo, 'status', '--porcelain=v1'), before);
  assert.equal(fs.readFileSync(path.join(f.repo, 'tracked.txt'), 'utf8'), 'staged change\nunstaged change\n');
  assert.doesNotMatch(JSON.stringify(r), /private-fixture-name|private fixture data/);
});

test('reports unpublished local commits without moving HEAD', (t) => {
  const f = fixture(t);
  const local = f.commit(f.repo, 'local.txt', 'local work');
  const r = f.check();
  assert.equal(r.exitCode, 2);
  assert.equal(r.status, 'ahead');
  assert.equal(r.relation, 'ahead');
  assert.equal(r.ahead, 1);
  assert.equal(r.behind, 0);
  assert.equal(r.remoteHead, f.initial);
  assert.equal(f.git(f.repo, 'rev-parse', 'HEAD'), local);
});

test('a staged rename counts once even when paths contain tabs or newlines', (t) => {
  const f = fixture(t);
  // Git for Windows rejects some control characters in filenames.
  const renamed = process.platform === 'win32' ? 'renamed file.txt' : 'renamed\tfile\n.txt';
  f.git(f.repo, 'mv', 'tracked.txt', renamed);
  const r = f.check();
  assert.equal(r.status, 'dirty');
  assert.deepEqual(r.counts, { staged: 1, unstaged: 0, untracked: 0 });
  assert.equal(fs.readFileSync(path.join(f.repo, renamed), 'utf8'), 'published\n');
});

test('recognizes linked worktrees and leaves their branches intact', (t) => {
  const f = fixture(t);
  const linked = path.join(f.dir, 'linked');
  f.git(f.repo, 'worktree', 'add', '-b', 'other-task', linked);
  const r = f.check({ cwd: linked });
  assert.equal(r.status, 'wrong_branch');
  assert.equal(r.root, fs.realpathSync(linked));
  assert.equal(r.worktrees.length, 2);
  assert.ok(r.worktrees.some((w) => w.branch === 'main'));
  assert.ok(r.worktrees.some((w) => w.branch === 'other-task'));
  assert.equal(f.git(f.repo, 'rev-parse', 'main'), f.initial);
  assert.equal(f.git(linked, 'rev-parse', 'HEAD'), f.initial);
});

test('reports remote advancement without integrating it automatically', (t) => {
  const f = fixture(t);
  const remote = f.commit(f.seed, 'remote.txt', 'remote work');
  f.publish();
  const r = f.check();
  assert.equal(r.exitCode, 2);
  assert.equal(r.status, 'behind');
  assert.equal(r.relation, 'behind');
  assert.equal(r.ahead, 0);
  assert.equal(r.behind, 1);
  assert.equal(r.remoteHead, remote);
  assert.equal(f.git(f.repo, 'rev-parse', 'HEAD'), f.initial);
  assert.equal(fs.existsSync(path.join(f.repo, 'remote.txt')), false);
});

test('reports diverged histories while preserving both sides', (t) => {
  const f = fixture(t);
  const local = f.commit(f.repo, 'local.txt', 'local work');
  const remote = f.commit(f.seed, 'remote.txt', 'remote work');
  f.publish();
  const r = f.check();
  assert.equal(r.exitCode, 2);
  assert.equal(r.status, 'diverged');
  assert.equal(r.relation, 'diverged');
  assert.equal(r.ahead, 1);
  assert.equal(r.behind, 1);
  assert.equal(r.remoteHead, remote);
  assert.equal(f.git(f.repo, 'rev-parse', 'HEAD'), local);
});

test('another branch and detached HEAD require a decision even with the same SHA', (t) => {
  const f = fixture(t);
  f.git(f.repo, 'checkout', '-b', 'feature');
  assert.equal(f.check().status, 'wrong_branch');
  assert.equal(f.check().exitCode, 2);
  f.git(f.repo, 'checkout', '--detach');
  const detached = f.check();
  assert.equal(detached.status, 'detached');
  assert.equal(detached.exitCode, 2);
  assert.equal(f.git(f.repo, 'rev-parse', 'HEAD'), f.initial);
});

test('a missing main branch is reported instead of assuming the current branch', (t) => {
  const f = fixture(t);
  f.git(f.repo, 'branch', '-m', 'feature');
  const r = f.check();
  assert.equal(r.exitCode, 2);
  assert.equal(r.main, null);
  assert.notEqual(r.status, 'equal');
});

test('wrong fetch or push repositories stop before contacting any remote', (t) => {
  const f = fixture(t);
  for (const key of ['fetchURL', 'pushURL']) {
    f.controls.fetchURL = canonical;
    f.controls.pushURL = canonical;
    f.controls[key] = 'https://github.com/other/repository.git';
    f.calls.length = 0;
    const r = f.check();
    assert.equal(r.status, 'wrong_repository');
    assert.equal(r.exitCode, 1);
    assert.equal(f.calls.some((c) => ['fetch', 'ls-remote'].includes(c[0])), false);
  }
});

test('a credential-bearing rejected URL is never copied into the report', (t) => {
  const f = fixture(t);
  f.controls.fetchURL = 'https://user:fixture-secret@wrong.invalid/repository.git';
  const r = f.check();
  assert.equal(r.exitCode, 1);
  assert.doesNotMatch(JSON.stringify(r), /fixture-secret|wrong\.invalid|https:\/\//);
});

test('a failed fetch cannot turn a matching cached reference into success', (t) => {
  const f = fixture(t);
  assert.equal(f.git(f.repo, 'rev-parse', 'origin/main'), f.initial);
  f.controls.failFetch = true;
  const r = f.check();
  assert.equal(r.exitCode, 1);
  assert.equal(r.status, 'unverified');
  assert.doesNotMatch(JSON.stringify(r), /fixture-secret/);
  assert.equal(f.git(f.repo, 'rev-parse', 'HEAD'), f.initial);
});

test('explicitly fetches main even when configured fetch refspec excludes it', (t) => {
  const f = fixture(t);
  f.git(f.repo, 'config', 'remote.origin.fetch', '+refs/heads/feature:refs/remotes/origin/feature');
  const remote = f.commit(f.seed, 'remote.txt', 'new published work');
  f.publish();
  const r = f.check();
  assert.equal(r.status, 'behind');
  assert.equal(r.remoteHead, remote);
  assert.equal(f.git(f.repo, 'rev-parse', 'origin/main'), remote);
});

test('a configured fetch mapping cannot update an unrelated local branch', (t) => {
  const f = fixture(t);
  f.git(f.repo, 'branch', 'other-task');
  f.git(f.repo, 'config', 'remote.origin.fetch', '+refs/heads/main:refs/heads/other-task');
  const remote = f.commit(f.seed, 'remote.txt', 'new published work');
  f.publish();
  const r = f.check();
  assert.equal(r.status, 'behind');
  assert.equal(r.remoteHead, remote);
  assert.equal(f.git(f.repo, 'rev-parse', 'other-task'), f.initial);
  assert.equal(f.git(f.repo, 'rev-parse', 'HEAD'), f.initial);
});

test('does not claim full ancestry knowledge for a shallow divergent checkout', (t) => {
  const f = fixture(t);
  const shallow = path.join(f.dir, 'shallow');
  f.git(f.dir, 'clone', '--depth=1', pathToFileURL(f.remote).href, shallow);
  const local = f.commit(shallow, 'local.txt', 'local work');
  f.commit(f.seed, 'remote.txt', 'remote work');
  f.publish();
  const r = f.check({ cwd: shallow });
  assert.equal(r.exitCode, 1);
  assert.equal(r.status, 'unverified');
  assert.equal(r.relation, 'unknown');
  assert.equal(f.git(shallow, 'rev-parse', 'HEAD'), local);
});

test('remote movement between fetch and observation is not reported as synchronized', (t) => {
  const f = fixture(t);
  f.controls.remoteRace = true;
  const r = f.check();
  assert.equal(r.exitCode, 1);
  assert.equal(r.status, 'unverified');
  assert.equal(f.git(f.repo, 'rev-parse', 'HEAD'), f.initial);
});

test('an approved local SHA may include unpublished commits on the current remote base', (t) => {
  const f = fixture(t);
  const local = f.commit(f.repo, 'local.txt', 'reviewed work');
  const r = f.check({ approvedSha: local });
  assert.equal(r.exitCode, 0);
  assert.equal(r.status, 'approved');
  assert.equal(r.head, local);
  assert.equal(r.main, local);
  assert.equal(r.remoteHead, f.initial);
  assert.equal(f.git(f.repo, 'rev-parse', 'HEAD'), local);
});

test('approved SHA mismatches and uncommitted changes cannot pass', (t) => {
  const f = fixture(t);
  const local = f.commit(f.repo, 'local.txt', 'reviewed work');
  const mismatch = f.check({ approvedSha: f.initial });
  assert.equal(mismatch.exitCode, 2);
  assert.equal(mismatch.status, 'approved_mismatch');
  fs.appendFileSync(path.join(f.repo, 'local.txt'), 'unreviewed work');
  const dirty = f.check({ approvedSha: local });
  assert.equal(dirty.exitCode, 2);
  assert.notEqual(dirty.status, 'approved');
  assert.equal(f.git(f.repo, 'rev-parse', 'HEAD'), local);
});

test('Hermes approval environment is checked without implying permission to publish', (t) => {
  const f = fixture(t);
  const approved = f.check({ env: { ...f.env, TALLER_PUSH_APROBADO: '1', TALLER_SHA_APROBADO: f.initial } });
  assert.equal(approved.exitCode, 0);
  const missing = f.check({ env: { ...f.env, TALLER_PUSH_APROBADO: '1' } });
  assert.notEqual(missing.exitCode, 0);
  assert.equal(f.calls.some((c) => ['push', 'merge', 'reset', 'rebase', 'stash', 'checkout'].includes(c[0])), false);
});

test('an empty approval environment means there is no approved publication', (t) => {
  const f = fixture(t);
  const r = f.check({ env: { ...f.env, TALLER_SHA_APROBADO: '' } });
  assert.equal(r.exitCode, 0);
  assert.equal(r.status, 'equal');
});

test('explicit and Hermes approved SHAs cannot silently disagree', (t) => {
  const f = fixture(t);
  const local = f.commit(f.repo, 'local.txt', 'reviewed work');
  const r = f.check({ approvedSha: local, env: { ...f.env, TALLER_SHA_APROBADO: f.initial } });
  assert.equal(r.exitCode, 2);
  assert.equal(r.status, 'approved_mismatch');
  assert.equal(f.git(f.repo, 'rev-parse', 'HEAD'), local);
});

test('approved SHA cannot pass after the remote advances beyond it', (t) => {
  const f = fixture(t);
  f.commit(f.seed, 'remote.txt', 'remote advancement');
  f.publish();
  const r = f.check({ approvedSha: f.initial });
  assert.equal(r.exitCode, 2);
  assert.notEqual(r.status, 'approved');
  assert.equal(f.git(f.repo, 'rev-parse', 'HEAD'), f.initial);
});

test('CLI returns machine-readable failure for a noncanonical repository', (t) => {
  const f = fixture(t);
  const r = realSpawnSync(process.execPath, [script, '--repo', f.repo], { env: f.env, encoding: 'utf8' });
  assert.equal(r.status, 1);
  const report = JSON.parse(r.stdout);
  assert.equal(report.status, 'wrong_repository');
  assert.equal(report.exitCode, r.status);
  assert.equal(r.stderr, '');
});
