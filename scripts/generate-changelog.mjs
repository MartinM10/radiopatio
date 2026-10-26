import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');
const APP_JSON_PATH = path.join(ROOT_DIR, 'app', 'app.json');
const REPO_URL = 'https://github.com/MartinM10/radiopatio';

// Mapping Conventional Commit types to Keep a Changelog categories
const TYPE_MAPPING = {
  feat: { title: 'Añadido', emoji: '✨' },
  fix: { title: 'Corregido', emoji: '🐛' },
  perf: { title: 'Rendimiento', emoji: '⚡' },
  refactor: { title: 'Refactorizado', emoji: '♻️' },
  docs: { title: 'Documentación', emoji: '📝' },
  chore: { title: 'Mantenimiento', emoji: '🔧' },
  build: { title: 'Compilación y EAS', emoji: '📦' },
  ci: { title: 'Integración Continua (CI)', emoji: '🚀' },
  style: { title: 'Estilo y Formato', emoji: '💄' },
  test: { title: 'Pruebas', emoji: '✅' },
};

function getGitTags() {
  try {
    const raw = execSync('git tag --sort=-creatordate', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    return raw ? raw.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

function getAppVersion() {
  try {
    if (existsSync(APP_JSON_PATH)) {
      const appJson = JSON.parse(readFileSync(APP_JSON_PATH, 'utf8'));
      return appJson.expo?.version || null;
    }
  } catch {}
  return null;
}

function getCommits(fromRef, toRef = 'HEAD') {
  const range = fromRef ? `${fromRef}..${toRef}` : toRef;
  try {
    const raw = execSync(`git log ${range} --pretty=format:"%H|%h|%ad|%s" --date=short`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    }).trim();

    if (!raw) return [];

    const regex = /^([a-f0-9]+)\|([a-f0-9]+)\|([^|]+)\|(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
    const commits = [];

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      const match = line.match(regex);
      if (match) {
        const [, hash, shortHash, date, type, scope, breaking, message] = match;
        // Skip automated changelog commits
        if (type.toLowerCase() === 'docs' && message.toLowerCase().includes('changelog')) {
          continue;
        }
        commits.push({
          hash,
          shortHash,
          date,
          type: type.toLowerCase(),
          scope: scope ? scope.trim() : null,
          breaking: !!breaking,
          message: message.trim(),
        });
      } else {
        const parts = line.split('|');
        if (parts.length >= 4) {
          const message = parts.slice(3).join('|').trim();
          if (!message.toLowerCase().includes('changelog')) {
            commits.push({
              hash: parts[0],
              shortHash: parts[1],
              date: parts[2],
              type: 'other',
              scope: null,
              breaking: false,
              message,
            });
          }
        }
      }
    }
    return commits;
  } catch (err) {
    console.error('Error leyendo commits de git:', err.message);
    return [];
  }
}

function formatChangelogSection(version, date, commits) {
  const sections = {};
  const breakingChanges = [];

  for (const c of commits) {
    if (c.breaking) {
      breakingChanges.push(c);
    }
    const category = TYPE_MAPPING[c.type]?.title || 'Otros Cambios';
    if (!sections[category]) {
      sections[category] = [];
    }
    sections[category].push(c);
  }

  let out = `## [${version}] - ${date}\n\n`;

  if (breakingChanges.length > 0) {
    out += `### ⚠️ Cambios Importantes (Breaking Changes)\n`;
    for (const c of breakingChanges) {
      const scopePrefix = c.scope ? `**${c.scope}:** ` : '';
      out += `- ${scopePrefix}${c.message} ([${c.shortHash}](${REPO_URL}/commit/${c.hash}))\n`;
    }
    out += '\n';
  }

  const order = [
    'Añadido',
    'Corregido',
    'Rendimiento',
    'Refactorizado',
    'Compilación y EAS',
    'Integración Continua (CI)',
    'Documentación',
    'Mantenimiento',
    'Otros Cambios',
  ];

  for (const title of order) {
    const list = sections[title];
    if (list && list.length > 0) {
      out += `### ${title}\n`;
      for (const c of list) {
        const scopePrefix = c.scope ? `**${c.scope}:** ` : '';
        out += `- ${scopePrefix}${c.message} ([${c.shortHash}](${REPO_URL}/commit/${c.hash}))\n`;
      }
      out += '\n';
    }
  }

  return out;
}

export function updateChangelog({ version = null, from = null, to = 'HEAD', dryRun = false } = {}) {
  const tags = getGitTags();
  const latestTag = from || (tags.length > 0 ? tags[0] : null);

  console.log(`Rango de análisis: ${latestTag ? `${latestTag}..${to}` : `inicio..${to}`}`);

  const commits = getCommits(latestTag, to);
  if (commits.length === 0) {
    console.log('No se encontraron nuevos commits convencionales para registrar.');
    return;
  }

  console.log(`Se encontraron ${commits.length} commits para registrar.`);

  const resolvedVersion = version || getAppVersion() || 'Unreleased';
  const today = new Date().toISOString().split('T')[0];
  const newSection = formatChangelogSection(resolvedVersion, today, commits);

  if (dryRun) {
    console.log('\n--- VISTA PREVIA DEL CHANGELOG GENERADO (DRY RUN) ---\n');
    console.log(newSection);
    return;
  }

  let changelog = '';
  if (existsSync(CHANGELOG_PATH)) {
    changelog = readFileSync(CHANGELOG_PATH, 'utf8');
  } else {
    changelog = `# Changelog\n\nTodos los cambios notables en este proyecto serán documentados en este archivo.\n\nEl formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)\ny este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).\n\n---\n\n`;
  }

  const separator = '---\n';
  const sepIndex = changelog.indexOf(separator);

  let updatedChangelog = '';
  if (sepIndex !== -1) {
    const header = changelog.slice(0, sepIndex + separator.length);
    const body = changelog.slice(sepIndex + separator.length).trimStart();
    updatedChangelog = `${header}\n${newSection}---\n\n${body}`;
  } else {
    updatedChangelog = `${newSection}\n${changelog}`;
  }

  writeFileSync(CHANGELOG_PATH, updatedChangelog, 'utf8');
  console.log(`CHANGELOG.md actualizado con éxito con la versión [${resolvedVersion}].`);
}

// Parse CLI flags
const args = process.argv.slice(2);
let version = null;
let from = null;
let to = 'HEAD';
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--dry-run') {
    dryRun = true;
  } else if (arg === '--from' && args[i + 1]) {
    from = args[++i];
  } else if (arg === '--to' && args[i + 1]) {
    to = args[++i];
  } else if (!arg.startsWith('--') && !version) {
    version = arg;
  }
}

if (process.argv[1] && process.argv[1].endsWith('generate-changelog.mjs')) {
  updateChangelog({ version, from, to, dryRun });
}
