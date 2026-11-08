// /avanzar calls this after acquiring the Hermes project lock, when applicable.
// Only remote references are updated. HEAD, the index and working files stay put.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const shaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

function canonicalOrigin(value) {
  if (/^git@github\.com:andresleosan\/HamptonJersey(?:\.git)?\/?$/i.test(value)) return true;
  try {
    const url = new URL(value);
    const transport = (url.protocol === "https:" && (!url.port || url.port === "443"))
      || (url.protocol === "ssh:" && url.username === "git" && !url.password && (!url.port || url.port === "22"));
    return transport && url.hostname.toLowerCase() === "github.com"
      && !url.search && !url.hash
      && /^\/andresleosan\/HamptonJersey(?:\.git)?\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function changeCounts(porcelain) {
  const entries = porcelain.split("\0");
  const counts = { staged: 0, unstaged: 0, untracked: 0 };
  for (let i = 0; i < entries.length; i++) {
    if (!entries[i]) continue;
    const [index, working] = entries[i];
    if (index === "?" && working === "?") counts.untracked++;
    else {
      if (index !== " ") counts.staged++;
      if (working !== " ") counts.unstaged++;
      // With -z, a rename/copy has a second pathname, not a second status.
      if (index === "R" || index === "C" || working === "R" || working === "C") i++;
    }
  }
  return counts;
}

function worktreeSummary(porcelain) {
  const worktrees = [];
  let current;
  for (const field of porcelain.split("\0")) {
    if (field.startsWith("worktree ")) {
      current = { path: field.slice(9), branch: null, head: null };
      worktrees.push(current);
    } else if (current && field.startsWith("HEAD ")) current.head = field.slice(5);
    else if (current && field.startsWith("branch ")) current.branch = field.slice(7).replace(/^refs\/heads\//, "");
  }
  return worktrees;
}

export function checkAvanzar({ cwd = process.cwd(), approvedSha, env = {} } = {}) {
  const gitEnv = { ...process.env, ...env, GIT_OPTIONAL_LOCKS: "0" };
  const report = {
    checkedAt: null, root: null, branch: null, head: null, main: null,
    remoteHead: null, relation: "unknown", ahead: null, behind: null,
    dirty: null, counts: null, worktrees: [],
  };
  const finish = (status, message, exitCode) => ({
    ...report, checkedAt: new Date().toISOString(), status, message, exitCode,
  });
  let failureMessage = "Sincronización no verificada: no se pudo leer el repositorio local.";
  function git(args, allowed = [0]) {
    const result = spawnSync("git", args, {
      cwd: report.root || cwd, env: gitEnv, encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"], timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    // Git errors can contain credentials in URLs. Never forward stdout/stderr.
    if (result.error || !allowed.includes(result.status)) throw new Error("git_failed");
    return { text: result.stdout, code: result.status };
  }
  function snapshot() {
    const head = git(["rev-parse", "--verify", "HEAD^{commit}"]).text.trim();
    const mainResult = git(["rev-parse", "--verify", "--quiet", "refs/heads/main^{commit}"], [0, 1]);
    const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1]);
    const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).text;
    return { head, main: mainResult.code === 0 ? mainResult.text.trim() : null,
      branch: branchResult.code === 0 ? branchResult.text.trim() : null, status };
  }
  try {
    report.root = git(["rev-parse", "--show-toplevel"]).text.trim();
    const before = snapshot();
    Object.assign(report, { head: before.head, main: before.main, branch: before.branch,
      dirty: before.status.length > 0, counts: changeCounts(before.status) });
    report.worktrees = worktreeSummary(git(["worktree", "list", "--porcelain", "-z"]).text);

    failureMessage = "Sincronización no verificada: no se pudo comprobar origin.";
    const fetchUrls = git(["remote", "get-url", "--all", "origin"]).text.trim().split(/\r?\n/);
    const pushUrls = git(["remote", "get-url", "--push", "--all", "origin"]).text.trim().split(/\r?\n/);
    if (![...fetchUrls, ...pushUrls].every(canonicalOrigin)) {
      return finish("wrong_repository", "Origin no identifica exclusivamente andresleosan/HamptonJersey en GitHub. Se conserva la copia sin consultar el remoto.", 1);
    }

    const environmentSha = gitEnv.TALLER_SHA_APROBADO || undefined;
    const approved = approvedSha ?? environmentSha;
    if ((approvedSha && environmentSha && approvedSha.toLowerCase() !== environmentSha.toLowerCase())
      || (approved !== undefined && !shaPattern.test(approved))
      || (gitEnv.TALLER_PUSH_APROBADO === "1" && !approved)) {
      return finish("approved_mismatch", "Falta un SHA aprobado completo o las referencias de aprobación no coinciden. No publicar.", 2);
    }

    failureMessage = "Sincronización no verificada: falló la consulta actual de main en GitHub. No usar la referencia en caché como prueba.";
    // Ignore configured refmaps and automatic tags: fetch must not update local branches.
    git(["fetch", "--refmap=", "--no-tags", "--no-prune", "origin", "refs/heads/main:refs/remotes/origin/main"]);
    const fetched = git(["rev-parse", "--verify", "refs/remotes/origin/main^{commit}"]).text.trim();
    const advertised = git(["ls-remote", "--exit-code", "origin", "refs/heads/main"]).text.trim().split(/\r?\n/);
    const [remoteSha, remoteRef] = (advertised[0] || "").split(/\s+/);
    if (advertised.length !== 1 || !shaPattern.test(remoteSha || "") || remoteRef !== "refs/heads/main") throw new Error("invalid_remote");
    report.remoteHead = remoteSha;
    if (fetched !== remoteSha) {
      return finish("unverified", "Sincronización no verificada: main cambió durante la consulta o la referencia descargada no coincide. Repetir la comprobación.", 1);
    }

    failureMessage = "Sincronización no verificada: no se pudo comprobar la relación entre los commits.";
    const after = snapshot();
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      return finish("unverified", "La copia local cambió durante la comprobación. Conservar el trabajo y repetirla.", 1);
    }
    const counts = git(["rev-list", "--left-right", "--count", `HEAD...${remoteSha}`]).text.trim().split(/\s+/).map(Number);
    if (counts.length !== 2 || !counts.every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("invalid_counts");
    [report.ahead, report.behind] = counts;
    if (report.head === remoteSha) report.relation = "equal";
    else if (git(["merge-base", "--is-ancestor", remoteSha, "HEAD"], [0, 1]).code === 0) report.relation = "ahead";
    else if (git(["merge-base", "--is-ancestor", "HEAD", remoteSha], [0, 1]).code === 0) report.relation = "behind";
    else report.relation = git(["rev-parse", "--is-shallow-repository"]).text.trim() === "true" ? "unknown" : "diverged";

    if (approved) {
      if (report.head.toLowerCase() !== approved.toLowerCase()
        || report.main?.toLowerCase() !== approved.toLowerCase() || report.branch !== "main" || report.dirty) {
        return finish("approved_mismatch", "HEAD, main o los archivos locales no coinciden con la entrega aprobada. Conservar el trabajo y revisar antes de publicar.", 2);
      }
      if (["equal", "ahead"].includes(report.relation)) {
        return finish("approved", "El commit indicado permanece intacto e incluye el main remoto observado. Esta comprobación no autoriza publicar.", 0);
      }
      return finish(report.relation === "unknown" ? "unverified" : "approved_mismatch",
        "No se ha demostrado que el commit aprobado incluya el main remoto actual. No publicar; revisar la base sin modificar el SHA aprobado.", report.relation === "unknown" ? 1 : 2);
    }
    if (!report.branch) return finish("detached", "HEAD está separado de una rama. Conservar la copia y resolver la base de trabajo.", 2);
    if (report.branch !== "main") return finish("wrong_branch", "La copia está en otra rama. Conservar su trabajo y elegir una copia válida de main.", 2);
    if (!report.main) return finish("missing_main", "No existe main local. Conservar la copia y preparar una base válida.", 2);
    if (report.relation === "unknown") return finish("unverified", "Sincronización no verificada: el historial superficial no permite demostrar la relación de los commits.", 1);
    if (report.relation === "behind") return finish("behind", "Main está atrasado. Solo una copia limpia permite avance fast-forward; conservar cualquier trabajo pendiente.", 2);
    if (report.relation === "diverged") return finish("diverged", "Los historiales divergen. Conservar el trabajo y resolver la integración en una copia segura.", 2);
    if (report.relation === "ahead") return finish("ahead", "La base incluye main remoto y contiene commits locales pendientes. Identificar la tarea antes de continuar; no están publicados.", 2);
    if (report.dirty) return finish("dirty", "El commit coincide con main remoto, pero hay cambios locales. Identificar y conservar el trabajo pendiente.", 2);
    return finish("equal", "Main limpio coincide con el commit remoto observado.", 0);
  } catch {
    return finish("unverified", failureMessage, 1);
  }
}

function main() {
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (["--repo", "--approved-sha"].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith("--")) {
      options[args[i] === "--repo" ? "cwd" : "approvedSha"] = args[++i];
    } else {
      console.log(JSON.stringify({ status: "unverified", message: "Uso: node scripts/check-avanzar.mjs [--repo ruta] [--approved-sha SHA-completo]", exitCode: 1 }));
      process.exitCode = 1;
      return;
    }
  }
  const report = checkAvanzar(options);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
