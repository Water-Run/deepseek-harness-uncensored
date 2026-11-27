/** Portable binding-name validation shared by providers that start their own interpreter. */
import type { PtcBindingNamespace, PtcRunRequest } from './types.ts'

/**
 * Binding globals EVERY backend refuses because SOME backend owns the slot in
 * the program's namespace: `console` (Node's log capture), and
 * `__dsh_main__`/`__builtins__`/`__name__` (the Python backend's bootstrap
 * wrapper and seeded module globals),
 * and `__debug__`. One shared set — rather than each backend refusing only its
 * own slots — keeps the portability promise real: a namespace list valid on
 * one backend is valid on all, so a caller cannot pick a name that works on
 * Node and collides on Python (or vice versa). `__name__` et al. ARE
 * valid portable identifiers, so the identifier rule on
 * `PtcBindingNamespace.global` never rejects them — hence this explicit set.
 * (Error members differ: {@link DUNDER_MEMBER} refuses every dunder form
 * wholesale; binding globals refuse only the names listed here.) `__debug__`
 * is listed for a different reason than a collision: CPython compiles a bare
 * `__debug__` reference to the constant `True` and rejects any assignment to
 * the name at COMPILE time, so an injected global under that name is
 * unreachable from the program — accepted by validation, unusable on the
 * Python backend, which is exactly the split the shared set exists to prevent.
 */
export const RESERVED_BINDING_GLOBALS: ReadonlySet<string> = new Set([
  'console',
  '__dsh_main__', '__builtins__', '__name__', '__debug__',
])

/**
 * `PtcBindingErrorClass.memberNameProperty` names EVERY backend refuses, as
 * one shared contract so a request valid on one backend is valid on all. The
 * JS `Error` exclusions (`name`, `message`, `stack`) and Python's
 * exception-protocol members (`args`, `with_traceback`, `add_note`) are
 * listed by name; dunder-form names (`__x__`, non-empty middle) are refused
 * wholesale — several are constrained CPython descriptors whose `setattr`
 * raises while constructing the rejection, and the exact set is an interpreter
 * version detail. Any other non-empty own property name is accepted everywhere.
 */
export const RESERVED_ERROR_MEMBERS: ReadonlySet<string> = new Set([
  'name', 'message', 'stack',
  'args', 'with_traceback', 'add_note',
])

/**
 * Dunder form (`__x__`, non-empty middle): object-protocol slots in Python,
 * refused as {@link RESERVED_ERROR_MEMBERS | error members} on every backend.
 */
export const DUNDER_MEMBER = /^__.+__$/

/**
 * Reserved words of every portable target language (ECMAScript ∪ Python),
 * refused as {@link PtcBindingNamespace.global} / error-class names by all
 * backends, one per language: the released TypeScript Node process and the
 * experimental, private CPython subprocess. The portable-identifier contract
 * promises a namespace list valid on one backend is valid on every backend; a
 * per-language check would let `lambda` pass the TypeScript backend and fail
 * the Python one. Extending the seam with a new language means widening this
 * union (a breaking review of existing binding names, by design).
 */
export const PORTABLE_RESERVED_WORDS: ReadonlySet<string> = new Set([
  // ECMAScript reserved words and reserved-in-strict-mode names.
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
  'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'implements', 'interface', 'package',
  'private', 'protected', 'public', 'arguments', 'eval',
  // Python 3.x keywords and soft keywords not already above ('type' and '_'
  // are soft keywords: legal names in practice, reserved here for safety).
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'def', 'del', 'elif', 'except', 'from',
  'global', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'match', 'type', '_',
])

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/
/**
 * Reject unusable namespaces before starting a process.
 * @param request - Host-owned binding declarations.
 * @param diagnosticPrefix - Owning provider named in validation failures.
 * @returns Namespaces keyed by their declared global.
 */
export function validatePtcBindings(request: PtcRunRequest, diagnosticPrefix = 'ptc-runtime'): Map<string, PtcBindingNamespace> {
  const bindings = new Map<string, PtcBindingNamespace>()
  for (const namespace of request.bindings) {
    if (!IDENTIFIER.test(namespace.global) || PORTABLE_RESERVED_WORDS.has(namespace.global)) {
      throw new Error(`${diagnosticPrefix}: binding global ${JSON.stringify(namespace.global)} is not a usable identifier`)
    }
    if (RESERVED_BINDING_GLOBALS.has(namespace.global)) {
      throw new Error(`${diagnosticPrefix}: reserved binding global ${JSON.stringify(namespace.global)}`)
    }
    if (bindings.has(namespace.global)) {
      throw new Error(`${diagnosticPrefix}: duplicate binding global ${JSON.stringify(namespace.global)}`)
    }
    bindings.set(namespace.global, namespace)
  }

  const errorClassNames = new Set<string>()
  for (const namespace of request.bindings) {
    const descriptor = namespace.errorClass
    if (!descriptor) continue
    if (!IDENTIFIER.test(descriptor.name) || PORTABLE_RESERVED_WORDS.has(descriptor.name)) {
      throw new Error(`${diagnosticPrefix}: binding error class ${JSON.stringify(descriptor.name)} is not a usable identifier`)
    }
    if (RESERVED_BINDING_GLOBALS.has(descriptor.name)) {
      throw new Error(`${diagnosticPrefix}: reserved binding global ${JSON.stringify(descriptor.name)}`)
    }
    if (bindings.has(descriptor.name) || errorClassNames.has(descriptor.name)) {
      throw new Error(`${diagnosticPrefix}: duplicate injected global ${JSON.stringify(descriptor.name)}`)
    }
    const member = descriptor.memberNameProperty
    if (member.length === 0 || RESERVED_ERROR_MEMBERS.has(member) || DUNDER_MEMBER.test(member)) {
      throw new Error(`${diagnosticPrefix}: binding error member property ${JSON.stringify(descriptor.memberNameProperty)} is not usable`)
    }
    errorClassNames.add(descriptor.name)
  }
  return bindings
}
