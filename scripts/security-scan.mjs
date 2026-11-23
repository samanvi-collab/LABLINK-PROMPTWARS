import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const IGNORE_DIRS = new Set(['node_modules', '.git', 'coverage']);

const SOURCE_PATTERNS = [
  { name: 'Private Key Block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Service Account Key Field', regex: /"private_key_id"\s*:\s*"[a-f0-9]{16,}"/i },
  { name: 'Google / Firebase Key Literal', regex: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'Real Gemini Key Assignment', regex: /GEMINI_API_KEY\s*=\s*(?!$|""|''|"MY_GEMINI_API_KEY"|MY_GEMINI_API_KEY)[A-Za-z0-9\-_]{20,}/ },
  { name: 'Disallowed Build-Time VITE Secret/Firebase Prefix', regex: /import\.meta\.env\.VITE_(?:GEMINI|FIREBASE)/ },
];

function walkFiles(dirPath, collected = []) {
  if (!fs.existsSync(dirPath)) return collected;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, collected);
    } else if (entry.isFile()) {
      collected.push(full);
    }
  }
  return collected;
}

function scanFiles() {
  const findings = [];
  const allFiles = walkFiles(ROOT);

  for (const file of allFiles) {
    const rel = path.relative(ROOT, file);
    if (rel === 'scripts/security-scan.mjs') continue;
    if (/\.(png|jpg|jpeg|gif|webp|woff2?|ico|lock)$/i.test(rel)) continue;

    const stat = fs.statSync(file);
    if (stat.size > 5 * 1024 * 1024) continue;

    const content = fs.readFileSync(file, 'utf8');
    for (const pat of SOURCE_PATTERNS) {
      if (pat.regex.test(content)) {
        findings.push({ file: rel, rule: pat.name });
      }
    }
  }
  return findings;
}

function inspectGitState() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  } catch {
    return { initialized: false };
  }

  const run = (cmd) => {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };

  const branch = run('git rev-parse --abbrev-ref HEAD') || 'unborn';
  const remotes = run('git remote -v');
  const trackedRaw = run('git ls-files');
  const trackedFiles = trackedRaw ? trackedRaw.split('\n').filter(Boolean) : [];
  const sensitiveTracked = trackedFiles.filter((f) =>
    /(?:^|\/)(?:\.env(?!\.example)|users\.local\.json|.*service-account.*\.json|.*firebase-adminsdk.*\.json)$/i.test(
      f,
    ),
  );

  return {
    initialized: true,
    branch,
    hasRemotes: Boolean(remotes),
    trackedCount: trackedFiles.length,
    sensitiveTracked,
  };
}

const findings = scanFiles();
const gitInfo = inspectGitState();

console.log(
  JSON.stringify(
    {
      secretScanFindings: findings,
      gitInspection: gitInfo,
      status: findings.length === 0 && (gitInfo.sensitiveTracked?.length ?? 0) === 0 ? 'PASS' : 'FAIL',
    },
    null,
    2,
  ),
);

if (findings.length > 0 || (gitInfo.sensitiveTracked?.length ?? 0) > 0) {
  process.exit(1);
}
