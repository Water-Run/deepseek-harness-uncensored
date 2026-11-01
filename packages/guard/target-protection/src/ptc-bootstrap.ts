/** Interpreter-realm helpers; no Node object or Host prototype reaches program code. @module */

/** Factory evaluated only by QuickJS; callbacks exchange strings and numeric binding indexes. */
export const PTC_BOOTSTRAP = String.raw`
(program, declarations, send, log) => {
  const create = Object.create, define = Object.defineProperty, proto = Object.getPrototypeOf;
  const setProto = Object.setPrototypeOf, ownKeys = Reflect.ownKeys;
  const descriptor = Object.getOwnPropertyDescriptor, own = Object.hasOwn, apply = Reflect.apply;
  const array = Array.isArray, finite = Number.isFinite, integer = Number.isSafeInteger, same = Object.is;
  const objectPrototype = Object.prototype, arrayPrototype = Array.prototype;
  const stringify = JSON.stringify, parse = JSON.parse, evaluate = Function;
  const ErrorType = Error, then = Promise.prototype.then;
  const SetType = Set, has = Set.prototype.has, add = Set.prototype.add, remove = Set.prototype.delete;
  const text = String;
  function put(target, key, value) {
    const attributes = create(null);
    attributes.value = value; attributes.enumerable = true; attributes.configurable = true; attributes.writable = true;
    define(target, key, attributes);
  }
  function encode(value) {
    const active = new SetType();
    function copy(item) {
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
      if (typeof item === 'number' && finite(item) && !same(item, -0)) return item;
      if (typeof item !== 'object' || apply(has, active, [item])) throw new ErrorType('Value must be lossless JSON');
      const isArray = array(item), parent = proto(item);
      if (parent !== null && parent !== (isArray ? arrayPrototype : objectPrototype)) throw new ErrorType('Value must be plain JSON');
      const result = isArray ? [] : create(null);
      if (isArray) setProto(result, null);
      apply(add, active, [item]);
      const keys = ownKeys(item);
      let entries = 0;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i], field = descriptor(item, key);
        if (!field || !field.enumerable) continue;
        if (typeof key !== 'string' || !own(field, 'value')) throw new ErrorType('Value must contain JSON data properties');
        if (isArray && (!integer(+key) || +key < 0 || +key >= item.length || text(+key) !== key)) throw new ErrorType('Array must contain only dense indexed values');
        put(result, key, copy(field.value)); entries++;
      }
      if (isArray && entries !== item.length) throw new ErrorType('Sparse arrays are not JSON');
      apply(remove, active, [item]);
      return result;
    }
    return stringify(copy(value));
  }
  let index = 0;
  const namespaces = parse(declarations);
  for (let n = 0; n < namespaces.length; n++) {
    const spec = namespaces[n], target = create(null);
    let Rejection = ErrorType;
    if (spec.errorClass) {
      const name = spec.errorClass.name, field = spec.errorClass.memberNameProperty;
      Rejection = class extends ErrorType {
        constructor(message, member) { super(message); put(this, 'name', name); put(this, field, member); }
      };
      put(globalThis, name, Rejection);
    }
    for (let m = 0; m < spec.members.length; m++) {
      const member = spec.members[m], binding = index++;
      put(target, member, (args) => {
        const pending = send(binding, encode(args));
        return apply(then, pending, [parse, (error) => { throw new Rejection(text(error), member); }]);
      });
    }
    put(globalThis, spec.global, target);
  }
  const consoleObject = create(null);
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    put(consoleObject, level, (...args) => {
      let line = '';
      for (let i = 0; i < args.length; i++) {
        if (i) line += ' ';
        const value = args[i];
        line += typeof value === 'object' && value !== null ? encode(value) : text(value);
      }
      log(line);
    });
  }
  put(globalThis, 'console', consoleObject);
  const outcome = evaluate('"use strict"; return (async () => {\n' + program + '\n})()')();
  return apply(then, outcome, [(value) => {
    if (value === undefined) return '{}';
    const result = create(null); put(result, 'value', value);
    try { return encode(result); }
    catch (error) {
      const failure = new ErrorType('Invalid program output: ' + text(error));
      put(failure, 'ptcFailureKind', 'invalid-output'); throw failure;
    }
  }]);
}
`
