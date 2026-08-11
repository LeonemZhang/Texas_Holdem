import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTable } from 'micromark-extension-gfm-table';
import { parseDocument } from 'yaml';

const checkerPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(checkerPath), '..');
const rootOptionIndex = globalThis.process.argv.indexOf('--root');
if (rootOptionIndex >= 0 && !globalThis.process.argv[rootOptionIndex + 1]) {
  throw new Error('--root requires a repository path');
}
const root =
  rootOptionIndex >= 0
    ? resolve(globalThis.process.argv[rootOptionIndex + 1])
    : defaultRoot;
const errors = [];
const ignoredDirectories = new Set([
  '.git',
  '.codegraph',
  'node_modules',
  'dist',
  'coverage',
  'output',
  'playwright-report',
  'release',
  'test-results',
]);
const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.md',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const statusValues = new Set([
  'pending',
  'active',
  'blocked',
  'done',
  'cancelled',
]);
const invariantStatusValues = new Set(['complete', 'partial', 'gap']);
const invariantExecutionValues = new Set([
  'test',
  'architecture',
  'test + architecture',
  'manual',
]);
const planLifecycleValues = new Set(['normal', 'legacy', 'superseded']);
const taskIdPattern = /^[A-Z][A-Z0-9]*-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const markdownOptions = {
  extensions: [gfmTable()],
  mdastExtensions: [gfmTableFromMarkdown()],
};
const markdownDocumentCache = new Map();

function displayPath(filePath) {
  return relative(root, filePath) || '.';
}

function escapesRoot(filePath) {
  const relativePath = relative(root, filePath);
  return (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  );
}

async function exists(relativePath) {
  try {
    await stat(resolve(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function maskMarkdownContent(value) {
  return value.replace(/[^\r\n]/g, ' ');
}

function markdownChildren(node) {
  return Array.isArray(node.children) ? node.children : [];
}

function visitMarkdown(node, visitor, ancestors = []) {
  if (visitor(node, ancestors) === false) return;
  const nextAncestors = [...ancestors, node];
  for (const child of markdownChildren(node)) {
    visitMarkdown(child, visitor, nextAncestors);
  }
}

function markdownNodeText(node) {
  if (node.type === 'text' || node.type === 'inlineCode') {
    return node.value;
  }
  if (node.type === 'image' || node.type === 'imageReference') {
    return node.alt ?? '';
  }
  if (node.type === 'code' || node.type === 'html') {
    return '';
  }
  return markdownChildren(node).map(markdownNodeText).join('');
}

function markdownDocument(content) {
  const cached = markdownDocumentCache.get(content);
  if (cached) return cached;

  const tree = fromMarkdown(content, markdownOptions);
  const definitions = new Map();
  const maskedRanges = [];

  visitMarkdown(tree, (node, ancestors) => {
    if (node.type === 'definition') {
      definitions.set(node.identifier, node.url);
    }

    const parent = ancestors.at(-1);
    const shouldMask =
      node.type === 'code' ||
      node.type === 'html' ||
      node.type === 'inlineCode' ||
      (node.type === 'table' && parent?.type !== 'root');
    if (!shouldMask) return;

    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (typeof start === 'number' && typeof end === 'number') {
      maskedRanges.push([start, end]);
    }
    return false;
  });

  const contractCharacters = content.split('');
  for (const [start, end] of maskedRanges) {
    const masked = maskMarkdownContent(content.slice(start, end));
    for (let index = start; index < end; index += 1) {
      contractCharacters[index] = masked[index - start];
    }
  }

  const document = {
    contractContent: contractCharacters.join(''),
    definitions,
    tree,
  };
  markdownDocumentCache.set(content, document);
  return document;
}

function markdownContractContent(content) {
  return markdownDocument(content).contractContent;
}

function markdownCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) {
    return null;
  }

  let trailingBackslashes = 0;
  for (let index = trimmed.length - 2; index >= 0; index -= 1) {
    if (trimmed[index] !== '\\') break;
    trailingBackslashes += 1;
  }
  const hasTrailingDelimiter =
    trimmed.endsWith('|') && trailingBackslashes % 2 === 0;
  const body = hasTrailingDelimiter ? trimmed.slice(1, -1) : trimmed.slice(1);
  return body
    .split(/(?<!\\)\|/u)
    .map((cell) => cell.replaceAll('\\|', '|').trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function localMarkdownLinks(content) {
  const document = markdownDocument(content);
  const links = [];

  visitMarkdown(document.tree, (node) => {
    let target = null;
    if (node.type === 'link' || node.type === 'image') {
      target = node.url;
    } else if (
      node.type === 'linkReference' ||
      node.type === 'imageReference'
    ) {
      target = document.definitions.get(node.identifier) ?? null;
    }

    if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(target)) {
      return;
    }

    const [pathAndQuery, fragment = ''] = target.split('#', 2);
    links.push({
      fragment,
      path: pathAndQuery.split('?', 1)[0],
      target,
    });
  });

  return links;
}

function localMarkdownTargets(content) {
  return localMarkdownLinks(content)
    .map((link) => link.path)
    .filter(Boolean);
}

function markdownHeadingIds(content) {
  const slugger = new GithubSlugger();
  const ids = new Set();

  visitMarkdown(markdownDocument(content).tree, (node) => {
    if (node.type !== 'heading') return;
    const heading = markdownNodeText(node).trim();
    if (heading) ids.add(slugger.slug(heading));
  });

  return ids;
}

function definitionIds(content) {
  return markdownChildren(markdownDocument(content).tree)
    .filter((node) => node.type === 'heading')
    .map(
      (node) =>
        /^(INV-[A-Z0-9-]+|ADR-[A-Z0-9-]+)\b/u.exec(
          markdownNodeText(node).trim(),
        )?.[1],
    )
    .filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function headingDepthMatches(depth, levelPattern) {
  if (levelPattern === '#{1,6}') return depth >= 1 && depth <= 6;
  return levelPattern === '#'.repeat(depth);
}

function headingMatches(content, heading, levelPattern = '#{1,6}') {
  return markdownChildren(markdownDocument(content).tree)
    .map((node, index) => ({ index, node }))
    .filter(
      ({ node }) =>
        node.type === 'heading' &&
        headingDepthMatches(node.depth, levelPattern) &&
        markdownNodeText(node).trim() === heading,
    );
}

function headingBody(content, heading, levelPattern = '#{1,6}') {
  const children = markdownChildren(markdownDocument(content).tree);
  const match = headingMatches(content, heading, levelPattern)[0];
  if (!match) return null;

  const bodyStart = match.node.position?.end.offset;
  if (typeof bodyStart !== 'number') return null;
  const nextHeading = children
    .slice(match.index + 1)
    .find((node) => node.type === 'heading' && node.depth <= match.node.depth);
  const bodyEnd = nextHeading?.position?.start.offset ?? content.length;
  return content.slice(bodyStart, bodyEnd).trim();
}

function labeledValue(content, label) {
  return (
    new RegExp(`^${escapeRegExp(label)}：\\s*(.+?)\\s*$`, 'mu')
      .exec(markdownContractContent(content))?.[1]
      ?.trim() ?? null
  );
}

function planMetadataValue(content, label) {
  return (
    new RegExp(`^>\\s*${escapeRegExp(label)}：\\s*(.+?)\\s*$`, 'mu')
      .exec(markdownContractContent(content))?.[1]
      ?.trim() ?? null
  );
}

function invariantSections(content) {
  const matches = markdownChildren(markdownDocument(content).tree)
    .filter((node) => node.type === 'heading' && node.depth === 3)
    .map((node) => ({
      id: /^(INV-[A-Z0-9-]+)\b/u.exec(markdownNodeText(node).trim())?.[1],
      node,
    }))
    .filter((match) => match.id);
  return matches.map((match, index) => ({
    id: match.id,
    content: content.slice(
      match.node.position.start.offset,
      matches[index + 1]?.node.position.start.offset ?? content.length,
    ),
  }));
}

function bodySaysNone(body) {
  return /^(?:-\s*)?无[。.]?$/u.test(markdownContractContent(body).trim());
}

function invariantReferences(content) {
  return [
    ...markdownContractContent(content).matchAll(/\bINV-[A-Z0-9-]+\b/gu),
  ].map((match) => match[0]);
}

function validateInvariantReferences(content, context, invariantIds) {
  if (bodySaysNone(content)) return;
  const references = invariantReferences(content);
  if (references.length === 0) {
    errors.push(`${context} must list INV-* IDs or explicitly say 无`);
    return;
  }
  for (const reference of new Set(references)) {
    if (!invariantIds.has(reference)) {
      errors.push(`${context} references unknown invariant ${reference}`);
    }
  }
}

function parsePlanTables(content) {
  const lines = markdownContractContent(content).split(/\r?\n/u);
  let tableKind = null;
  let expectsSeparator = false;
  let statusHeaderLineNumber = null;
  let statusHeaderCount = 0;
  const statusRows = [];
  const detailIds = [];
  const malformedStatusRows = [];

  for (const [lineIndex, line] of lines.entries()) {
    const cells = markdownCells(line);
    if (!cells) {
      if (tableKind === 'status' && expectsSeparator) {
        malformedStatusRows.push({
          lineNumber: statusHeaderLineNumber,
          reason: 'missing separator row after task status header',
        });
      }
      tableKind = null;
      expectsSeparator = false;
      statusHeaderLineNumber = null;
      continue;
    }

    if (tableKind === null) {
      if (
        cells.length === 6 &&
        cells[0] === 'ID' &&
        cells[1] === 'Status' &&
        cells[2] === 'Depends' &&
        cells[3] === 'Affected' &&
        cells[4] === 'Acceptance' &&
        cells[5] === 'Detail'
      ) {
        tableKind = 'status';
        expectsSeparator = true;
        statusHeaderLineNumber = lineIndex + 1;
        statusHeaderCount += 1;
      } else if (
        cells.length >= 2 &&
        cells[0] === 'ID' &&
        /^(?:依赖|Depends)$/u.test(cells[1])
      ) {
        tableKind = 'detail';
        expectsSeparator = true;
      }
      continue;
    }

    if (expectsSeparator) {
      if (!isSeparatorRow(cells)) {
        if (tableKind === 'status') {
          malformedStatusRows.push({
            lineNumber: lineIndex + 1,
            reason: 'expected separator row after task status header',
          });
        }
        tableKind = null;
        expectsSeparator = false;
        statusHeaderLineNumber = null;
        continue;
      }
      if (tableKind === 'status' && cells.length !== 6) {
        malformedStatusRows.push({
          lineNumber: lineIndex + 1,
          reason: `expected 6 separator cells, received ${cells.length}`,
        });
        tableKind = null;
        expectsSeparator = false;
        statusHeaderLineNumber = null;
        continue;
      }
      expectsSeparator = false;
      continue;
    }

    if (isSeparatorRow(cells)) {
      if (tableKind === 'status') {
        malformedStatusRows.push({
          lineNumber: lineIndex + 1,
          reason: 'unexpected additional separator row',
        });
      }
      continue;
    }

    const id = cells[0];
    if (tableKind === 'status') {
      if (cells.length !== 6) {
        malformedStatusRows.push({
          lineNumber: lineIndex + 1,
          reason: `expected 6 cells, received ${cells.length}`,
        });
        continue;
      }
      if (!taskIdPattern.test(id)) {
        malformedStatusRows.push({
          lineNumber: lineIndex + 1,
          reason: `invalid task ID ${id || '<empty>'}`,
        });
        continue;
      }
      statusRows.push({
        id,
        status: cells[1] ?? '',
        depends: cells[2] ?? '',
        detail: cells[5] ?? '',
      });
    } else if (taskIdPattern.test(id)) {
      detailIds.push(id);
    }
  }

  if (tableKind === 'status' && expectsSeparator) {
    malformedStatusRows.push({
      lineNumber: statusHeaderLineNumber,
      reason: 'missing separator row after task status header',
    });
  }

  return {
    detailIds,
    malformedStatusRows,
    statusHeaderCount,
    statusRows,
  };
}

function parseDependencyField(value) {
  const rawDependencies = value
    .split(',')
    .map((dependency) => dependency.trim());
  const issues = [];

  if (!value.trim()) {
    issues.push("must use '-' when there are no dependencies");
  } else if (rawDependencies.some((dependency) => !dependency)) {
    issues.push('must not contain empty dependency entries');
  }

  const dependencies = rawDependencies.filter(Boolean);
  if (dependencies.includes('-') && dependencies.length !== 1) {
    issues.push("must not combine '-' with other dependencies");
  }

  const seen = new Set();
  for (const dependency of dependencies) {
    if (seen.has(dependency)) {
      issues.push(`contains duplicate dependency ${dependency}`);
    }
    seen.add(dependency);

    if (dependency === '-') continue;
    if (dependency.startsWith('external:')) {
      if (!dependency.slice('external:'.length).trim()) {
        issues.push('external dependency must include a description');
      }
    } else if (!taskIdPattern.test(dependency)) {
      issues.push(`contains invalid dependency ${dependency}`);
    }
  }

  return { dependencies: [...seen], issues };
}

function dependencyValues(value) {
  return parseDependencyField(value).dependencies;
}

function internalDependencyValues(value) {
  return dependencyValues(value).filter(
    (dependency) => dependency !== '-' && !dependency.startsWith('external:'),
  );
}

function dependencyCycles(statusRows) {
  const taskIds = new Set(statusRows.map((row) => row.id));
  const graph = new Map(
    statusRows.map((row) => [
      row.id,
      internalDependencyValues(row.depends).filter((dependency) =>
        taskIds.has(dependency),
      ),
    ]),
  );
  const visitState = new Map();
  const stack = [];
  const cycles = [];

  function visit(taskId) {
    visitState.set(taskId, 'visiting');
    stack.push(taskId);

    for (const dependency of graph.get(taskId) ?? []) {
      if (visitState.get(dependency) === 'visiting') {
        const cycleStart = stack.lastIndexOf(dependency);
        cycles.push([...stack.slice(cycleStart), dependency]);
      } else if (!visitState.has(dependency)) {
        visit(dependency);
      }
    }

    stack.pop();
    visitState.set(taskId, 'visited');
  }

  for (const taskId of taskIds) {
    if (!visitState.has(taskId)) {
      visit(taskId);
    }
  }
  return cycles;
}

async function checkRequiredFiles() {
  const requiredFiles = [
    'AGENTS.md',
    'INVARIANTS.md',
    'ARCHITECTURE.md',
    'docs/product-specs/index.md',
    'docs/product-specs/gameplay.md',
    'docs/product-specs/room-experience.md',
    'docs/product-specs/statistics.md',
    'docs/product-specs/desktop-experience.md',
    'docs/design-docs/index.md',
    'docs/design-docs/poker-domain.md',
    'docs/design-docs/hand-lifecycle.md',
    'docs/design-docs/room-domain.md',
    'docs/design-docs/protocol-and-sync.md',
    'docs/design-docs/network-and-discovery.md',
    'docs/design-docs/persistence-and-recovery.md',
    'docs/design-docs/client.md',
    'docs/design-docs/desktop.md',
    'docs/decisions/index.md',
    'docs/exec-plans/index.md',
    'docs/exec-plans/active/README.md',
    'docs/exec-plans/template/plan.md',
    'docs/exec-plans/template/verification.md',
    'docs/exec-plans/template/tasks/CHANGE-001.md',
    '.agents/skills/poker-rule-change/SKILL.md',
  ];

  for (const requiredFile of requiredFiles) {
    if (!(await exists(requiredFile))) {
      errors.push(`Missing required harness entrypoint: ${requiredFile}`);
    }
  }

  for (const requiredDirectory of [
    'docs/exec-plans/active',
    'docs/exec-plans/completed',
  ]) {
    if (!(await exists(requiredDirectory))) {
      errors.push(`Missing required plan directory: ${requiredDirectory}`);
    }
  }
}

async function checkMarkdownLinks(markdownFiles) {
  for (const filePath of markdownFiles) {
    const content = await readFile(filePath, 'utf8');
    for (const link of localMarkdownLinks(content)) {
      let decodedPath;
      let decodedFragment;
      try {
        decodedPath = decodeURIComponent(link.path);
        decodedFragment = decodeURIComponent(link.fragment).toLowerCase();
      } catch {
        errors.push(
          `Invalid encoded Markdown link in ${displayPath(filePath)}: ${link.target}`,
        );
        continue;
      }

      const targetPath = decodedPath
        ? resolve(dirname(filePath), decodedPath)
        : filePath;
      if (escapesRoot(targetPath)) {
        errors.push(
          `Markdown link escapes repository in ${displayPath(filePath)}: ${link.target}`,
        );
      } else if (!(await exists(relative(root, targetPath)))) {
        errors.push(
          `Broken Markdown link in ${displayPath(filePath)}: ${link.target}`,
        );
      } else if (decodedFragment && targetPath.toLowerCase().endsWith('.md')) {
        const targetContent =
          targetPath === filePath
            ? content
            : await readFile(targetPath, 'utf8');
        if (!markdownHeadingIds(targetContent).has(decodedFragment)) {
          errors.push(
            `Broken Markdown heading in ${displayPath(filePath)}: ${link.target}`,
          );
        }
      }
    }
  }
}

async function checkSkills() {
  const skillsDirectory = resolve(root, '.agents', 'skills');
  let entries;
  try {
    entries = await readdir(skillsDirectory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries.filter((item) => item.isDirectory())) {
    const skillPath = resolve(skillsDirectory, entry.name, 'SKILL.md');
    if (!(await exists(relative(root, skillPath)))) {
      errors.push(`Skill ${entry.name} is missing SKILL.md`);
      continue;
    }

    const content = await readFile(skillPath, 'utf8');
    const frontmatter = content.match(
      /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u,
    );
    if (!frontmatter) {
      errors.push(`Skill ${entry.name} has no valid YAML frontmatter`);
      continue;
    }

    const document = parseDocument(frontmatter[1], { uniqueKeys: true });
    if (document.errors.length > 0) {
      errors.push(`Skill ${entry.name} has invalid YAML frontmatter`);
      continue;
    }
    const fields = document.toJS({ maxAliasCount: 20 });
    if (!fields || Array.isArray(fields) || typeof fields !== 'object') {
      errors.push(`Skill ${entry.name} frontmatter must be a YAML mapping`);
      continue;
    }

    const skillName = fields.name;
    const description = fields.description;
    if (typeof skillName !== 'string' || !skillName.trim()) {
      errors.push(`Skill ${entry.name} has no valid name`);
    } else if (skillName !== entry.name) {
      errors.push(
        `Skill folder ${entry.name} does not match name ${skillName}`,
      );
    } else if (skillName.length > 64 || !skillNamePattern.test(skillName)) {
      errors.push(`Skill ${entry.name} has an invalid skill name`);
    }
    if (typeof description !== 'string' || !description.trim()) {
      errors.push(`Skill ${entry.name} has no valid description`);
    } else if (description.length > 1024) {
      errors.push(`Skill ${entry.name} description exceeds 1024 characters`);
    }
  }
}

async function checkUniqueDefinitions(markdownFiles) {
  const seen = new Map();

  for (const filePath of markdownFiles) {
    const content = await readFile(filePath, 'utf8');
    for (const id of definitionIds(content)) {
      const previousFile = seen.get(id);
      if (previousFile) {
        errors.push(
          `Duplicate definition ${id}: ${displayPath(previousFile)} and ${displayPath(filePath)}`,
        );
      } else {
        seen.set(id, filePath);
      }
    }
  }
}

async function checkInvariants() {
  const invariantPath = resolve(root, 'INVARIANTS.md');
  if (!(await exists('INVARIANTS.md'))) return new Set();

  const content = await readFile(invariantPath, 'utf8');
  const sections = invariantSections(content);
  const invariantIds = new Set(sections.map((section) => section.id));
  if (sections.length === 0) {
    errors.push('INVARIANTS.md must define at least one INV-* entry');
    return invariantIds;
  }

  for (const section of sections) {
    const context = `${section.id} in INVARIANTS.md`;
    const specification = labeledValue(section.content, '完整行为规范');
    const execution = labeledValue(section.content, '执行方式');
    const status = labeledValue(section.content, '覆盖状态');
    const evidence = labeledValue(section.content, '证据');

    if (!specification) {
      errors.push(`${context} is missing 完整行为规范`);
    } else if (localMarkdownLinks(specification).length === 0) {
      errors.push(`${context} 完整行为规范 must contain a Markdown link`);
    }

    if (!execution) {
      errors.push(`${context} is missing 执行方式`);
    } else if (!invariantExecutionValues.has(execution)) {
      errors.push(`${context} has invalid 执行方式 ${execution}`);
    }

    if (!status) {
      errors.push(`${context} is missing 覆盖状态`);
    } else if (!invariantStatusValues.has(status)) {
      errors.push(`${context} has invalid 覆盖状态 ${status}`);
    }

    if (!evidence) {
      errors.push(`${context} is missing 证据`);
    } else if (localMarkdownLinks(evidence).length === 0) {
      errors.push(`${context} 证据 must contain a Markdown link`);
    }

    if (status === 'partial' || status === 'gap') {
      for (const label of ['缺口', '责任边界', '跟进']) {
        if (!labeledValue(section.content, label)) {
          errors.push(`${context} with status ${status} is missing ${label}`);
        }
      }
    }
  }

  return invariantIds;
}

async function planDirectoryNames(stateDirectory) {
  const absoluteDirectory = resolve(root, 'docs/exec-plans', stateDirectory);
  try {
    return new Set(
      (await readdir(absoluteDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    );
  } catch {
    return new Set();
  }
}

async function checkPlanIndex() {
  const indexPath = resolve(root, 'docs/exec-plans/index.md');
  if (!(await exists('docs/exec-plans/index.md'))) return;

  const content = await readFile(indexPath, 'utf8');
  const listedByState = new Map([
    ['active', new Set()],
    ['completed', new Set()],
  ]);

  for (const link of localMarkdownLinks(content)) {
    const normalized = link.path.replaceAll('\\', '/').replace(/^\.\//u, '');
    const match = /^(active|completed)\/([^/]+)\/plan\.md$/u.exec(normalized);
    if (!match) continue;
    const listed = listedByState.get(match[1]);
    if (listed.has(match[2])) {
      errors.push(`Duplicate plan index entry: ${match[1]}/${match[2]}`);
    }
    listed.add(match[2]);
  }

  for (const stateDirectory of ['active', 'completed']) {
    const actual = await planDirectoryNames(stateDirectory);
    const listed = listedByState.get(stateDirectory);
    for (const name of actual) {
      if (!listed.has(name)) {
        errors.push(
          `Plan ${stateDirectory}/${name} is not listed in docs/exec-plans/index.md`,
        );
      }
    }
    for (const name of listed) {
      if (!actual.has(name)) {
        errors.push(
          `Plan index lists missing directory ${stateDirectory}/${name}`,
        );
      }
    }
  }
}

function checkTaskDetail(detailContent, targetPath, invariantIds) {
  const bodies = new Map();
  for (const heading of [
    '规范来源',
    '相关不变量',
    '允许范围',
    '完成条件',
    '验证命令',
    '文档影响',
  ]) {
    const body = headingBody(detailContent, heading);
    if (body === null) {
      errors.push(
        `Task detail ${displayPath(targetPath)} is missing heading ${heading}`,
      );
    } else if (!body) {
      errors.push(
        `Task detail ${displayPath(targetPath)} has empty section ${heading}`,
      );
    }
    bodies.set(heading, body);
  }

  const specificationSources = bodies.get('规范来源');
  if (
    specificationSources &&
    localMarkdownLinks(specificationSources).length === 0
  ) {
    errors.push(
      `Task detail ${displayPath(targetPath)} 规范来源 must contain a Markdown link`,
    );
  }

  const relatedInvariants = bodies.get('相关不变量');
  if (relatedInvariants) {
    validateInvariantReferences(
      relatedInvariants,
      `Task detail ${displayPath(targetPath)} 相关不变量`,
      invariantIds,
    );
  }

  const allowedScope = bodies.get('允许范围');
  if (allowedScope) {
    for (const label of ['允许', '禁止']) {
      if (!new RegExp(`^\\s*-\\s*${label}：\\s*\\S`, 'mu').test(allowedScope)) {
        errors.push(
          `Task detail ${displayPath(targetPath)} 允许范围 is missing ${label}： entry`,
        );
      }
    }
  }
}

function checkLegacyVerification(verificationContent, verificationPath) {
  for (const heading of ['归档范围', '历史状态']) {
    const body = headingBody(verificationContent, heading);
    if (body === null) {
      errors.push(
        `Legacy verification ${displayPath(verificationPath)} is missing heading ${heading}`,
      );
    } else if (!body) {
      errors.push(
        `Legacy verification ${displayPath(verificationPath)} has empty section ${heading}`,
      );
    }
  }
}

function checkVerificationEntry(
  verificationContent,
  verificationPath,
  taskId,
  invariantIds,
) {
  const entries = headingMatches(verificationContent, taskId, '##');
  if (entries.length > 1) {
    errors.push(
      `Done task ${taskId} has duplicate verification entries in ${displayPath(verificationPath)}`,
    );
  }
  const entry = headingBody(verificationContent, taskId, '##');
  if (entry === null) {
    errors.push(
      `Done task ${taskId} has no verification entry in ${displayPath(verificationPath)}`,
    );
    return;
  }

  const bodies = new Map();
  for (const heading of [
    '覆盖不变量',
    '自动化验证',
    '场景',
    '执行方式',
    '覆盖状态',
    '证据',
  ]) {
    const body = headingBody(entry, heading, '###');
    if (body === null) {
      errors.push(
        `Verification ${taskId} in ${displayPath(verificationPath)} is missing heading ${heading}`,
      );
    } else if (!body) {
      errors.push(
        `Verification ${taskId} in ${displayPath(verificationPath)} has empty section ${heading}`,
      );
    }
    bodies.set(heading, body);
  }

  const coveredInvariants = bodies.get('覆盖不变量');
  if (coveredInvariants) {
    validateInvariantReferences(
      coveredInvariants,
      `Verification ${taskId} 覆盖不变量`,
      invariantIds,
    );
  }
  const evidence = bodies.get('证据');
  if (evidence && localMarkdownLinks(evidence).length === 0) {
    errors.push(
      `Verification ${taskId} in ${displayPath(verificationPath)} 证据 must contain a Markdown link`,
    );
  }
}

async function checkPlans(invariantIds) {
  for (const stateDirectory of ['active', 'completed']) {
    const absoluteDirectory = resolve(root, 'docs/exec-plans', stateDirectory);
    let entries;
    try {
      entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries.filter((item) => item.isDirectory())) {
      const planDirectory = resolve(absoluteDirectory, entry.name);
      const planPath = resolve(planDirectory, 'plan.md');
      const verificationPath = resolve(planDirectory, 'verification.md');

      if (!(await exists(relative(root, planPath)))) {
        errors.push(`Plan ${stateDirectory}/${entry.name} is missing plan.md`);
        continue;
      }
      if (!(await exists(relative(root, verificationPath)))) {
        errors.push(
          `Plan ${stateDirectory}/${entry.name} is missing verification.md`,
        );
      }

      const planContent = await readFile(planPath, 'utf8');
      const verificationContent = (await exists(
        relative(root, verificationPath),
      ))
        ? await readFile(verificationPath, 'utf8')
        : '';
      const lifecycle = planMetadataValue(planContent, '生命周期');
      const archiveReason = planMetadataValue(planContent, '归档说明');
      if (!lifecycle) {
        errors.push(
          `Plan ${stateDirectory}/${entry.name} is missing 生命周期 metadata`,
        );
      } else if (!planLifecycleValues.has(lifecycle)) {
        errors.push(
          `Plan ${stateDirectory}/${entry.name} has invalid lifecycle ${lifecycle}`,
        );
      }
      if (
        (lifecycle === 'legacy' || lifecycle === 'superseded') &&
        !archiveReason
      ) {
        errors.push(
          `Plan ${stateDirectory}/${entry.name} with lifecycle ${lifecycle} is missing 归档说明`,
        );
      }
      if (stateDirectory === 'completed' && lifecycle === 'legacy') {
        checkLegacyVerification(verificationContent, verificationPath);
      }

      const { detailIds, malformedStatusRows, statusHeaderCount, statusRows } =
        parsePlanTables(planContent);
      for (const malformedRow of malformedStatusRows) {
        errors.push(
          `Invalid task status row in ${displayPath(planPath)}:${malformedRow.lineNumber}: ${malformedRow.reason}`,
        );
      }
      if (statusHeaderCount !== 1) {
        errors.push(
          `Plan ${stateDirectory}/${entry.name} must contain exactly one task status table`,
        );
        continue;
      }
      if (statusRows.length === 0) {
        errors.push(
          `Plan ${stateDirectory}/${entry.name} has an empty task status table`,
        );
        continue;
      }

      const statusIds = new Set();
      const statusById = new Map(statusRows.map((row) => [row.id, row.status]));
      const requiresStructuredTaskDetails =
        stateDirectory === 'active' || lifecycle === 'normal';
      for (const row of statusRows) {
        if (statusIds.has(row.id)) {
          errors.push(
            `Duplicate task ID ${row.id} in ${displayPath(planPath)}`,
          );
        }
        statusIds.add(row.id);

        if (!statusValues.has(row.status)) {
          errors.push(
            `Invalid status ${row.status || '<empty>'} for ${row.id} in ${displayPath(planPath)}`,
          );
        }

        const dependencyField = parseDependencyField(row.depends);
        for (const issue of dependencyField.issues) {
          errors.push(
            `Invalid Depends for ${row.id} in ${displayPath(planPath)}: ${issue}`,
          );
        }
        for (const dependency of dependencyField.dependencies) {
          if (dependency === '-' || dependency.startsWith('external:')) {
            continue;
          }
          if (taskIdPattern.test(dependency) && !statusById.has(dependency)) {
            errors.push(
              `Unknown dependency ${dependency} for ${row.id} in ${displayPath(planPath)}`,
            );
          }
        }

        const detailTargets = localMarkdownTargets(row.detail);
        if (row.detail !== '-' && row.detail !== '') {
          for (const target of detailTargets) {
            const targetPath = resolve(planDirectory, target);
            if (!(await exists(relative(root, targetPath)))) {
              errors.push(
                `Broken task detail link in ${displayPath(planPath)}: ${target}`,
              );
            }
          }
        }

        if (requiresStructuredTaskDetails) {
          const taskContext =
            stateDirectory === 'active'
              ? 'Active plan task'
              : 'Normal completed plan task';
          if (detailTargets.length !== 1) {
            errors.push(
              `${taskContext} ${row.id} must link exactly one task detail file`,
            );
          } else {
            const normalizedTarget = detailTargets[0]
              .replaceAll('\\', '/')
              .replace(/^\.\//u, '');
            const targetPath = resolve(planDirectory, detailTargets[0]);
            const expectedTarget = `tasks/${row.id}.md`;
            if (normalizedTarget !== expectedTarget) {
              errors.push(
                `${taskContext} ${row.id} detail must link ${expectedTarget}`,
              );
            } else if (await exists(relative(root, targetPath))) {
              const detailContent = await readFile(targetPath, 'utf8');
              checkTaskDetail(detailContent, targetPath, invariantIds);
            }
          }
        }

        if (
          row.status === 'done' &&
          (stateDirectory === 'active' || lifecycle === 'normal')
        ) {
          checkVerificationEntry(
            verificationContent,
            verificationPath,
            row.id,
            invariantIds,
          );
        }
      }

      for (const cycle of dependencyCycles(statusRows)) {
        errors.push(
          `Dependency cycle in ${displayPath(planPath)}: ${cycle.join(' -> ')}`,
        );
      }

      const activeRows = statusRows.filter((row) => row.status === 'active');
      if (stateDirectory === 'active') {
        if (lifecycle && lifecycle !== 'normal') {
          errors.push(
            `Active plan ${entry.name} cannot use lifecycle ${lifecycle}`,
          );
        }
        if (activeRows.length > 1) {
          errors.push(
            `Active plan ${entry.name} has more than one active task`,
          );
        }
        for (const row of activeRows) {
          for (const dependency of internalDependencyValues(row.depends)) {
            if (statusById.get(dependency) !== 'done') {
              errors.push(
                `Active task ${row.id} depends on non-done task ${dependency}`,
              );
            }
          }
        }
      } else if (lifecycle === 'superseded') {
        // Superseded plans preserve unverified historical statuses for traceability.
      } else {
        const unfinishedRows = statusRows.filter((row) =>
          ['pending', 'active', 'blocked'].includes(row.status),
        );
        if (unfinishedRows.length > 0) {
          errors.push(
            `Completed plan ${entry.name} has unfinished tasks: ${unfinishedRows
              .map((row) => row.id)
              .join(', ')}`,
          );
        }
      }

      const uniqueDetailIds = new Set(detailIds);
      if (uniqueDetailIds.size !== detailIds.length) {
        errors.push(
          `Duplicate task ID in detailed tables of ${displayPath(planPath)}`,
        );
      }
      if (uniqueDetailIds.size > 0) {
        for (const id of uniqueDetailIds) {
          if (!statusIds.has(id)) {
            errors.push(
              `Task ${id} has no status row in ${displayPath(planPath)}`,
            );
          }
        }
        for (const id of statusIds) {
          if (!uniqueDetailIds.has(id)) {
            errors.push(
              `Status row ${id} has no detailed task row in ${displayPath(planPath)}`,
            );
          }
        }
      }
    }
  }
}

async function checkStalePaths(files) {
  const stalePaths = [
    'docs/product-spec.md',
    'docs/architecture.md',
    'docs/plans/luna-incremental-plan.md',
    'docs/plans/terra-foundation-plan.md',
    'docs/exec-plans/active/luna',
  ];

  for (const filePath of files) {
    if (filePath === checkerPath) {
      continue;
    }
    const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    if (!textExtensions.has(extension)) {
      continue;
    }
    const content = await readFile(filePath, 'utf8');
    for (const stalePath of stalePaths) {
      if (content.includes(stalePath)) {
        errors.push(
          `Stale path reference ${stalePath} in ${displayPath(filePath)}`,
        );
      }
    }
  }
}

await checkRequiredFiles();
const files = await walk(root);
const markdownFiles = files.filter((filePath) =>
  filePath.toLowerCase().endsWith('.md'),
);
await checkMarkdownLinks(markdownFiles);
await checkUniqueDefinitions(markdownFiles);
await checkSkills();
const invariantIds = await checkInvariants();
await checkPlanIndex();
await checkPlans(invariantIds);
await checkStalePaths(files);

if (errors.length > 0) {
  globalThis.console.error(
    `Repository harness check failed with ${errors.length} error(s):`,
  );
  for (const error of errors) {
    globalThis.console.error(`- ${error}`);
  }
  globalThis.process.exitCode = 1;
} else {
  globalThis.console.log('Repository harness check passed.');
}
