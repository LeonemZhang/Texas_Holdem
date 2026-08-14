import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const sourceExtensions = new Set([
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
]);
const sourceRoots = new Set(['apps', 'packages']);

const prohibitedPokerCoreModules = [
  {
    category: '网络',
    matches: (specifier) =>
      /^(?:@texas-holdem\/(?:lan-discovery|protocol)|@fastify\/|fastify$|socket\.io(?:-client)?$|node:(?:dgram|dns|http|http2|https|net|tls|udp))/.test(
        specifier,
      ),
  },
  {
    category: '数据库',
    matches: (specifier) =>
      /(?:better-sqlite|knex|mongodb|mysql|postgres|prisma|redis|sqlite|typeorm)/i.test(
        specifier,
      ),
  },
  {
    category: 'UI',
    matches: (specifier) =>
      /^(?:@texas-holdem\/ui|@testing-library\/|preact$|react(?:$|-)|react-dom$|svelte$|vue$)/.test(
        specifier,
      ),
  },
  {
    category: 'Electron',
    matches: (specifier) => /^(?:electron$|node:electron$)/.test(specifier),
  },
  {
    category: '系统时间',
    matches: (specifier) =>
      /^node:(?:perf_hooks|process|timers|timers\/promises)$/.test(specifier),
  },
  {
    category: '全局随机源',
    matches: (specifier) =>
      /^(?:crypto$|node:crypto$|node:random$)/.test(specifier),
  },
];

function displayPath(rootDirectory, filePath) {
  return relative(rootDirectory, filePath).split(sep).join('/');
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
    } else if (
      entry.isFile() &&
      sourceExtensions.has(extname(entry.name).toLowerCase())
    ) {
      files.push(path);
    }
  }
  return files;
}

async function sourceFiles(rootDirectory) {
  const files = [];
  for (const topLevelDirectory of sourceRoots) {
    const directory = resolve(rootDirectory, topLevelDirectory);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sourceDirectory = resolve(directory, entry.name, 'src');
      try {
        if ((await stat(sourceDirectory)).isDirectory()) {
          files.push(...(await walk(sourceDirectory)));
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function ownerForPath(rootDirectory, filePath) {
  const path = relative(rootDirectory, filePath).split(sep);
  if (path.length < 3 || !sourceRoots.has(path[0]) || path[2] !== 'src')
    return null;
  return { kind: path[0] === 'packages' ? 'package' : 'app', name: path[1] };
}

async function workspacePackages(rootDirectory) {
  const packages = new Map();
  for (const topLevelDirectory of sourceRoots) {
    const directory = resolve(rootDirectory, topLevelDirectory);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directoryPath = resolve(directory, entry.name);
      const manifestPath = resolve(directoryPath, 'package.json');
      let name = `@texas-holdem/${entry.name}`;
      try {
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        if (typeof manifest.name === 'string') name = manifest.name;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      packages.set(name, {
        kind: topLevelDirectory === 'packages' ? 'package' : 'app',
        name: entry.name,
        directory: directoryPath,
      });
    }
  }
  return packages;
}

function scriptKind(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
      return ts.ScriptKind.JS;
    case '.mjs':
      return ts.ScriptKind.JS;
    case '.cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function moduleReferences(sourceFile) {
  const references = [];
  const add = (node, specifier, kind) => {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    references.push({
      kind,
      line: position.line + 1,
      column: position.character + 1,
      specifier,
    });
  };

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      add(node.moduleSpecifier, node.moduleSpecifier.text, 'import');
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      add(node.moduleSpecifier, node.moduleSpecifier.text, 'export');
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      add(
        node.moduleReference.expression,
        node.moduleReference.expression.text,
        'import',
      );
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        add(node.arguments[0], node.arguments[0].text, 'dynamic import');
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        add(node.arguments[0], node.arguments[0].text, 'require');
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function globalCapabilityReferences(sourceFile) {
  const references = [];
  const add = (node, category, expression) => {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    references.push({
      category,
      line: position.line + 1,
      column: position.character + 1,
      expression,
    });
  };

  function visit(node) {
    if (ts.isPropertyAccessExpression(node)) {
      const expression = node.getText(sourceFile);
      if (
        expression === 'Math.random' ||
        expression === 'globalThis.crypto' ||
        /^(?:crypto|webCrypto|globalThis\.crypto)\.(?:getRandomValues|randomUUID|randomBytes|randomInt)$/.test(
          expression,
        )
      ) {
        add(node, '全局随机源', expression);
      } else if (
        expression === 'Date.now' ||
        expression === 'performance.now' ||
        expression === 'process.hrtime' ||
        expression === 'process.uptime'
      ) {
        add(node, '系统时间', expression);
      }
    } else if (
      ts.isNewExpression(node) &&
      node.expression.getText(sourceFile) === 'Date' &&
      node.arguments?.length === 0
    ) {
      add(node, '系统时间', 'new Date()');
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function fileCandidates(filePath, specifier) {
  const path = resolve(dirname(filePath), specifier);
  const extension = extname(path).toLowerCase();
  const candidates = [path];
  if (
    extension === '.js' ||
    extension === '.jsx' ||
    extension === '.mjs' ||
    extension === '.cjs'
  ) {
    candidates.push(path.slice(0, -extension.length) + '.ts');
    candidates.push(path.slice(0, -extension.length) + '.tsx');
  }
  if (!extension) {
    for (const sourceExtension of sourceExtensions)
      candidates.push(`${path}${sourceExtension}`);
  }
  candidates.push(resolve(path, 'index.ts'), resolve(path, 'index.tsx'));
  return candidates;
}

function resolvedOwner(filePath, specifier, fileOwners) {
  if (!specifier.startsWith('.')) return null;
  for (const candidate of fileCandidates(filePath, specifier)) {
    const owner = fileOwners.get(resolve(candidate));
    if (owner) return owner;
  }
  return null;
}

function violationForReference({
  importer,
  owner,
  reference,
  packages,
  fileOwners,
  rootDirectory,
}) {
  const importedPackage = packages.get(reference.specifier);
  const importedOwner =
    importedPackage ?? resolvedOwner(importer, reference.specifier, fileOwners);
  const location = `${displayPath(rootDirectory, importer)}:${reference.line}:${reference.column}`;
  const violations = [];

  if (owner.kind === 'package' && importedOwner?.kind === 'app') {
    violations.push(
      `${location} 共享包禁止反向导入应用层：${reference.specifier}`,
    );
  }

  if (owner.kind === 'package' && owner.name === 'poker-core') {
    const prohibited = prohibitedPokerCoreModules.find((rule) =>
      rule.matches(reference.specifier),
    );
    if (prohibited) {
      violations.push(
        `${location} poker-core 禁止导入${prohibited.category}模块：${reference.specifier}`,
      );
    } else if (importedOwner && importedOwner.name !== 'poker-core') {
      violations.push(
        `${location} poker-core 禁止依赖其他 workspace 模块：${reference.specifier}`,
      );
    }
  }

  return violations;
}

export async function scanWorkspace(rootDirectory) {
  const root = resolve(rootDirectory);
  const files = await sourceFiles(root);
  const packages = await workspacePackages(root);
  const fileOwners = new Map(
    files.map((filePath) => [filePath, ownerForPath(root, filePath)]),
  );
  const violations = [];

  for (const filePath of files) {
    const owner = fileOwners.get(filePath);
    if (!owner) continue;
    const source = await readFile(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(filePath),
    );
    for (const reference of moduleReferences(sourceFile)) {
      violations.push(
        ...violationForReference({
          fileOwners,
          importer: filePath,
          owner,
          packages,
          reference,
          rootDirectory: root,
        }),
      );
    }
    if (owner.kind === 'package' && owner.name === 'poker-core') {
      for (const reference of globalCapabilityReferences(sourceFile)) {
        const location = `${displayPath(root, filePath)}:${reference.line}:${reference.column}`;
        violations.push(
          `${location} poker-core 禁止使用${reference.category}：${reference.expression}`,
        );
      }
    }
  }

  return {
    files,
    violations: [...new Set(violations)].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function rootFromArguments(arguments_) {
  const rootIndex = arguments_.indexOf('--root');
  if (rootIndex === -1)
    return resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const root = arguments_[rootIndex + 1];
  if (!root || root.startsWith('--')) throw new Error('--root 需要仓库路径');
  return resolve(root);
}

export async function checkWorkspaceBoundaries(rootDirectory) {
  const result = await scanWorkspace(rootDirectory);
  if (result.violations.length > 0) {
    throw new Error(
      `架构边界检查失败：发现 ${result.violations.length} 个违规。\n${result.violations.join('\n')}`,
    );
  }
  return result;
}

async function main() {
  try {
    const result = await checkWorkspaceBoundaries(
      rootFromArguments(globalThis.process.argv.slice(2)),
    );
    globalThis.console.log(
      `架构边界检查通过：扫描 ${result.files.length} 个 workspace 源码文件，未发现违规 import。`,
    );
  } catch (error) {
    globalThis.console.error(
      error instanceof Error ? error.message : String(error),
    );
    globalThis.process.exitCode = 1;
  }
}

const currentModule = pathToFileURL(fileURLToPath(import.meta.url)).href;
const invokedModule = globalThis.process.argv[1]
  ? pathToFileURL(resolve(globalThis.process.argv[1])).href
  : null;
if (currentModule === invokedModule) await main();
