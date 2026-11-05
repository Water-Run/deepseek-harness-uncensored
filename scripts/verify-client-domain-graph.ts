/**
 * Enforce intra-package domain layering inside `packages/client/*\/src/client/`.
 * verify-module-graph covers package-level edges; this gate covers the
 * directory level: domain directories may import `contract/` and never each
 * other, and only the assembly point (`apply.ts` / `index.ts`) may import
 * across domains.
 *
 * Layer model (lower may not import higher):
 *   0  contract/            shared contract API (types + slot declarations)
 *   1  <domain>/ + service  domain implementations (skeleton/, chat/, ...)
 *   2  apply.ts, index.ts   assembly point and re-export shell
 *
 * Run directly:
 *   pnpm exec tsx scripts/verify-client-domain-graph.ts
 */

import { globSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, resolve, sep } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')

/** Directory names treated as the shared contract layer (importable by all). */
const CONTRACT_DIRS = new Set(['contract'])
/** Top-level client files allowed to import across domains (assembly layer). */
const ASSEMBLY_FILES = new Set(['apply.ts', 'index.ts', 'index.tsx'])

/** One source dependency that crosses the package's declared directory layers. */
export interface ClientDomainViolation { file: string; imported: string; reason: string }

/** Recursively list .ts/.tsx files under dir (relative paths). */
function listSources(dir: string): string[] {
  return globSync('**/*.{ts,tsx}', { cwd: dir })
    .map(rel => rel.split(sep).join('/'))
    .filter(rel => !/\.legacy\./.test(rel.slice(rel.lastIndexOf('/') + 1)))
    .sort()
}

/** First path segment of a client-relative file, or '' for top-level files. */
function domainOf(rel: string): string {
  const ix = rel.indexOf('/')
  return ix === -1 ? '' : rel.slice(0, ix)
}

/**
 * Resolve one relative import to a client-directory-relative path.
 * @param file - Importing file relative to `src/client`.
 * @param specifier - Relative module specifier from that file.
 * @returns Normalized path, preserving leading `..` segments outside `src/client`.
 */
export function resolveClientImport(file: string, specifier: string): string {
  return posix.normalize(posix.join(posix.dirname(file), specifier))
}

function localImports(file: string, source: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const imports = new Set<string>()
  const visited = new Set<ts.Node>()
  const visit = (node: ts.Node): void => {
    if (visited.has(node)) return
    visited.add(node)
    let specifier: ts.Node | undefined
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isJSDocImportTag(node)) specifier = node.moduleSpecifier
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      specifier = node.moduleReference.expression
    }
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) specifier = node.arguments[0]
    if (specifier !== undefined && ts.isStringLiteralLike(specifier) && specifier.text.startsWith('.')) imports.add(specifier.text)
    ts.forEachChild(node, visit)
    for (const doc of ts.getJSDocCommentsAndTags(node)) visit(doc)
  }
  visit(parsed)
  return [...imports]
}

function imageResource(specifier: string): boolean {
  const [path, search] = specifier.split('?'), query = search?.split('#')[0]
  return path !== undefined && /\.(?:svg|png|jpe?g|gif|webp|avif|ico)$/i.test(path.split('#')[0] ?? '')
    && (query === undefined || query === 'url')
}

function checkPackage(pkgName: string, clientDir: string): ClientDomainViolation[] {
  const violations: ClientDomainViolation[] = []
  const files = listSources(clientDir)
  for (const rel of files) {
    const fromDomain = domainOf(rel)
    const isAssembly = fromDomain === '' && ASSEMBLY_FILES.has(rel)
    if (isAssembly) continue
    const source = readFileSync(join(clientDir, rel), 'utf8')
    for (const spec of localImports(rel, source)) {
      if (imageResource(spec)) continue
      const target = resolveClientImport(rel, spec)
      if (target === '..' || target.startsWith('../')) continue // package-level rules govern
      const toDomain = domainOf(target)
      if (toDomain === '' || CONTRACT_DIRS.has(toDomain)) continue // top-level shared file or contract layer
      if (fromDomain === toDomain) continue // inside one domain
      violations.push({
        file: `${pkgName}/src/client/${rel}`,
        imported: spec,
        reason: fromDomain === ''
          ? `top-level non-assembly file imports domain "${toDomain}" (only apply/index may assemble)`
          : `domain "${fromDomain}" imports sibling domain "${toDomain}" (route shared API through contract/)`,
      })
    }
  }
  return violations
}

/**
 * Check source, type, re-export and literal dynamic imports within every client package.
 * Static image URLs are resources; script and stylesheet dependencies retain their layer checks.
 * @param repoRoot - Repository containing packages/client.
 * @returns All directory-layer violations, without executing client modules.
 */
export function verifyClientDomainGraph(repoRoot: string): ClientDomainViolation[] {
  const violations: ClientDomainViolation[] = [], packages = join(repoRoot, 'packages/client')
  for (const pkg of readdirSync(packages, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue
    const clientDir = join(packages, pkg.name, 'src/client')
    if (!statSync(clientDir, { throwIfNoEntry: false })?.isDirectory()) continue
    violations.push(...checkPackage(pkg.name, clientDir))
  }
  return violations
}

function main(): void {
  const violations = verifyClientDomainGraph(root)
  if (violations.length > 0) {
    console.error(`verify-client-domain-graph: ${violations.length} violation(s):`)
    for (const v of violations) console.error(`  ${v.file} -> ${v.imported}\n    ${v.reason}`)
    process.exitCode = 1
    return
  }
  console.log('verify-client-domain-graph: client domain layering clean.')
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) main()
