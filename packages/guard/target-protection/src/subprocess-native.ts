/** Opt-in Windows native process provider; unsupported execution never uses an ordinary-process fallback. @module */
import { Context, Service } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { mkdtemp, mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { Duplex } from 'node:stream'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import { bindManagedProcess, targetEnvironment, validateSubprocessSpec } from '@deepseek-ai/dsh-subprocess-local/managed'
import { logSpillFailure, prepareManagedProcessBinding } from '@deepseek-ai/dsh-subprocess-local/output'
import type { SubprocessHandle, SubprocessSpawnSpec, SubprocessTerminalHandle, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { credentialRef, isCredentialRefName } from '@deepseek-ai/dsh-credentials'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import type { Upstream } from '@deepseek-ai/dsh-security-proxy-local'
import type TargetProtection from './index.ts'
import { canonicalLocalPath, localPathContains } from './file-identity.ts'
import { compileNativeFilePolicy } from './native-file-policy.ts'
import { createNativeHostExecution, type NativeHostExecution, type NativeHostStart } from './native-host.ts'
import { launchNativeBroker } from './native-launch.ts'
import { startNativeGateway, type NativeGateway } from './native-gateway.ts'
import { requireNativeRuntime } from './native-runtime.ts'
import { TARGET_REFUSAL_REASONS } from './network-decision.ts'
import { createNativeTerminal } from './native-terminal-host.ts'

/** Explicit deployment grants and bounded preparation for the native command service. */
export interface NativeSubprocessConfig {
  readonlyPaths: string[]
  readwritePaths: string[]
  temporaryRoot: string
  /** Gateway mode enforces egress but does not claim complete inbound isolation. */
  network: 'disabled' | 'gateway'
  /** Inspect HTTP/1.1 over TLS with an execution-private CA; other CONNECT protocols are refused. */
  httpsInspection?: boolean
  maxHttpsCertificates?: number
  httpsCertificateLifetimeMs?: number
  proxy?: { protocol: 'http' | 'https'; host: string; port: number; username?: string; passwordRef?: string } | undefined
  /** Maximum retained executions, including output settlement and cleanup. */
  maxProcesses?: number
  maxPolicyEntries?: number
  maxPolicyPaths?: number
  preparationTimeoutMs?: number
  startupTimeoutMs?: number
  connectTimeoutMs?: number
  requestTimeoutMs?: number
  diagnosticMaxBytes?: number
  cleanupRetries?: number
  cleanupRetryMs?: number
  terminalStartupTimeoutMs?: number
  terminalRequestTimeoutMs?: number
  maxTerminalRequests?: number
}

type Config = Required<Omit<NativeSubprocessConfig, 'proxy'>> & Pick<NativeSubprocessConfig, 'proxy'>
const milliseconds = () => schema.natural().min(1).max(MAX_TIMER_DELAY_MS)

/** Native command service with explicit file grants, immutable rules and independent whole-range ownership. */
export default class NativeTargetSubprocess extends LocalSubprocessRuntime {
  static inject = ['targetProtection', 'credentials']
  static Config: schema<NativeSubprocessConfig, Config> = schema.object({
    readonlyPaths: schema.array(String).required(), readwritePaths: schema.array(String).required(),
    temporaryRoot: schema.string().required(), network: schema.union(['disabled', 'gateway']).required(),
    httpsInspection: schema.boolean().default(false), maxHttpsCertificates: schema.natural().min(1).max(4096).default(64),
    httpsCertificateLifetimeMs: schema.natural().min(1000).max(MAX_TIMER_DELAY_MS).default(86400000),
    proxy: schema.union([schema.const(undefined), schema.object({ protocol: schema.union(['http', 'https']).required(),
      host: schema.string().required(), port: schema.natural().min(1).max(65535).required(),
      username: schema.string(), passwordRef: schema.string(),
    })]),
    maxProcesses: schema.natural().min(1).max(1024).default(16),
    maxPolicyEntries: schema.natural().min(1).max(1000000).default(100000),
    maxPolicyPaths: schema.natural().min(1).max(100000).default(10000),
    preparationTimeoutMs: milliseconds().default(30000), startupTimeoutMs: milliseconds().default(10000),
    connectTimeoutMs: milliseconds().default(8000), requestTimeoutMs: milliseconds().default(60000),
    diagnosticMaxBytes: schema.natural().min(1).max(1048576).default(16384),
    cleanupRetries: schema.natural().max(100).default(4), cleanupRetryMs: schema.natural().max(30000).default(100),
    terminalStartupTimeoutMs: milliseconds().default(30000), terminalRequestTimeoutMs: milliseconds().default(5000),
    maxTerminalRequests: schema.natural().min(1).max(1024).default(64),
  })
  private readonly nativeConfig: Config
  private readonly protection: TargetProtection
  private readonly executions = new Map<NativeHostExecution, Promise<void>>()
  private readonly nativeControls = new Set<Duplex>()
  private privateRoot: string | undefined
  private closing = false
  private closureFailure: Error | undefined

  /** @param ctx - Mandatory rule and credential owners. @param config - Explicit deployment policy and resource limits. */
  constructor(ctx: Context, config: NativeSubprocessConfig) {
    super(ctx)
    requireNativeRuntime(process.platform, process.versions.node, 'pkg' in process)
    this.nativeConfig = NativeTargetSubprocess.Config(config)
    if (this.nativeConfig.httpsInspection && config.network !== 'gateway') throw new Error('HTTPS inspection requires the native gateway.')
    this.protection = ctx.targetProtection
    for (const path of [...config.readonlyPaths, ...config.readwritePaths, config.temporaryRoot]) {
      if (!isAbsolute(path)) throw new Error('Native subprocess grants and temporaryRoot must be absolute local paths.')
      canonicalLocalPath(path)
    }
    const root = canonicalLocalPath(config.temporaryRoot)
    if ([...config.readonlyPaths, ...config.readwritePaths].some(path => localPathContains(canonicalLocalPath(path), root))) {
      throw new Error('Native temporaryRoot must be outside all deployment file grants.')
    }
    if (config.proxy !== undefined) {
      const proxy = config.proxy, authority = new URL(`${proxy.protocol}://${proxy.host.includes(':') ? `[${proxy.host}]` : proxy.host}:${proxy.port}`)
      if (config.network !== 'gateway' || authority.username !== '' || authority.password !== '' || authority.pathname !== '/'
        || authority.search !== '' || authority.hash !== '' || /[\r\n:]/u.test(proxy.username ?? '')
        || ((proxy.username ?? '') !== '') !== (proxy.passwordRef !== undefined)
        || proxy.passwordRef !== undefined && !isCredentialRefName(proxy.passwordRef)) {
        throw new Error('Native proxy requires a gateway route, plain hostname and paired username/credential reference.')
      }
    }
    ctx.effect(() => {
      const stop = () => {
        for (const execution of this.executions.keys()) {
          try { execution.launch.owner.terminateForHostExit() }
          catch (_terminationFailed) { /* Continue synchronous final termination for the remaining owned ranges. */ }
        }
      }
      process.prependListener('exit', stop)
      return async () => {
        this.closing = true
        const outcomes = await Promise.allSettled([...this.executions.keys()].map(execution => execution.dispose()))
        await Promise.allSettled(this.executions.values())
        await Promise.all([...this.nativeControls].map(control => new Promise<void>((resolve) => {
          if (control.closed) resolve()
          else { control.once('close', () => { resolve() }); control.destroy() }
        })))
        this.nativeControls.clear()
        const failures = outcomes.filter(outcome => outcome.status === 'rejected').map((outcome): unknown => outcome.reason)
        if (failures.length > 0) { stop(); throw new AggregateError(failures, 'Native execution shutdown could not be confirmed.') }
        process.off('exit', stop)
      }
    }, 'target-native-subprocess.ranges')
  }

  /** Create the owner-private parent before accepting commands. */
  protected async [Service.init](): Promise<void> {
    this.nativeConfig.readonlyPaths = await Promise.all(this.nativeConfig.readonlyPaths
      .map(async path => canonicalLocalPath(await realpath(path))))
    this.nativeConfig.readwritePaths = await Promise.all(this.nativeConfig.readwritePaths.map(async (path) => {
      const resolved = canonicalLocalPath(await realpath(path))
      if (!(await stat(resolved)).isDirectory()) throw new Error('Native write grants must name existing directories.')
      return resolved
    }))
    await this.upstream()
    await mkdir(this.nativeConfig.temporaryRoot, { recursive: true, mode: 0o700 })
    const root = canonicalLocalPath(await realpath(this.nativeConfig.temporaryRoot))
    if ([...this.nativeConfig.readonlyPaths, ...this.nativeConfig.readwritePaths]
      .some(path => localPathContains(canonicalLocalPath(path), root))) {
      throw new Error('Native temporaryRoot resolves inside a deployment grant.')
    }
    this.privateRoot = root
  }

  private assertActive(): string {
    if (this.closing || this.privateRoot === undefined) throw new HarnessError('Native execution is not available.', 'TARGET_NATIVE_UNAVAILABLE')
    if (this.closureFailure !== undefined) throw this.closureFailure
    return this.privateRoot
  }

  protected override async authorizeExecutable(candidate: string, signal: AbortSignal): Promise<void> {
    this.assertActive()
    const checked = await this.protection.checkLocalFile(candidate, 'metadata', signal)
    if (!checked.decision.allowed) throw new HarnessError(TARGET_REFUSAL_REASONS[checked.decision.code], checked.decision.code)
  }

  override async resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string> {
    this.assertActive()
    const bounded = AbortSignal.any([this.protection.executionSignal(), ...signal === undefined ? [] : [signal]])
    return super.resolveExecutable(command, env, bounded)
  }

  private async upstream(): Promise<Upstream | undefined> {
    const proxy = this.nativeConfig.proxy
    if (proxy === undefined) return undefined
    const secret = proxy.passwordRef === undefined ? undefined : await this.ctx.credentials.resolve(credentialRef(proxy.passwordRef))
    if (proxy.passwordRef !== undefined && secret === undefined) {
      throw new HarnessError('Native proxy credential is not configured.', 'TARGET_NATIVE_PROXY_CREDENTIAL')
    }
    return { ...proxy, username: proxy.username ?? '', password: secret?.value }
  }

  private async prepare(spec: SubprocessSpawnSpec, execution: NativeHostExecution, signal: AbortSignal): Promise<NativeHostStart> {
    const root = this.assertActive(), config = this.nativeConfig
    const bounded = AbortSignal.any([signal, this.protection.executionSignal(), AbortSignal.timeout(config.preparationTimeoutMs)])
    bounded.throwIfAborted()
    const directory = await mkdtemp(join(root, 'execution-'))
    let gateway: NativeGateway | undefined, release: (() => void) | undefined
    const cleanup = async () => {
      const canonical = canonicalLocalPath(directory)
      try {
        if (canonical === root || !localPathContains(root, canonical)) throw new Error('Native private directory escaped its owner root.')
        await rm(directory, { recursive: true, force: true, maxRetries: config.cleanupRetries, retryDelay: config.cleanupRetryMs })
      }
      finally { await gateway?.close(); release?.() }
    }
    try {
      const files = await compileNativeFilePolicy(await this.protection.nativeFileConstraints(), {
        readonlyPaths: config.readonlyPaths, readwritePaths: [...config.readwritePaths, directory],
        maxEntries: config.maxPolicyEntries, maxPaths: config.maxPolicyPaths,
      }, bounded)
      const stop = async () => { execution.launch.owner.signal('SIGKILL'); await execution.launch.owner.waitForExit() }
      if (config.network === 'gateway') {
        const upstream = await this.upstream()
        bounded.throwIfAborted()
        gateway = await startNativeGateway(this.protection, { revision: files.revision, sessionId: null, tool: 'subprocess',
          ...upstream === undefined ? {} : { upstream }, stopExecution: stop,
          connectTimeoutMs: config.connectTimeoutMs, requestTimeoutMs: config.requestTimeoutMs,
          ...config.httpsInspection ? { httpsInspection: { maxCertificates: config.maxHttpsCertificates,
            certificateLifetimeMs: config.httpsCertificateLifetimeMs, handshakeTimeoutMs: config.connectTimeoutMs,
            requestTimeoutMs: config.requestTimeoutMs } } : {},
        }, signal)
      } else release = this.protection.retainNativeExecution(files.revision, stop)
      bounded.throwIfAborted()
      const environment = targetEnvironment(spec)
      for (const key of Object.keys(environment)) {
        if (/^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|NODE_USE_ENV_PROXY|TEMP|TMP|TMPDIR|HOME|USERPROFILE|LOCALAPPDATA)$/iu.test(key)) {
          Reflect.deleteProperty(environment, key)
        }
      }
      Object.assign(environment, { TEMP: directory, TMP: directory, TMPDIR: directory, HOME: directory,
        USERPROFILE: directory, LOCALAPPDATA: directory })
      if (gateway !== undefined) Object.assign(environment, { HTTP_PROXY: gateway.url, HTTPS_PROXY: gateway.url,
        http_proxy: gateway.url, https_proxy: gateway.url, NO_PROXY: '', no_proxy: '', NODE_USE_ENV_PROXY: '1' })
      if (gateway?.certificate !== undefined) {
        const certificatePath = join(directory, 'https-ca.pem')
        await writeFile(certificatePath, gateway.certificate, { flag: 'wx', mode: 0o600 })
        for (const key of Object.keys(environment)) {
          if (/^(NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE)$/iu.test(key)) {
            Reflect.deleteProperty(environment, key)
          }
        }
        Object.assign(environment, { NODE_EXTRA_CA_CERTS: certificatePath, SSL_CERT_FILE: certificatePath,
          REQUESTS_CA_BUNDLE: certificatePath, CURL_CA_BUNDLE: certificatePath })
      }
      const carrier = launchNativeBroker(spec.graceMs, bounded)
      return { carrier, environment, config: { cwd: spec.cwd, temporaryRoot: directory,
        files: { readonlyPaths: files.readonlyPaths, readwritePaths: files.readwritePaths,
          deniedPaths: files.deniedPaths, enumeratePaths: files.enumeratePaths },
        proxyUrl: gateway?.url ?? null, startupTimeoutMs: config.startupTimeoutMs, timeoutMs: 0,
      }, release: cleanup }
    } catch (error) { await cleanup(); throw error }
  }

  override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    this.assertActive()
    validateSubprocessSpec(spec)
    if (this.executions.size >= this.nativeConfig.maxProcesses) throw new HarnessError('Native execution capacity is full.', 'TARGET_NATIVE_CAPACITY')
    const binding = prepareManagedProcessBinding({ onSpillFailure: logSpillFailure(this.ctx.logger, 'target-native-subprocess') })
    const execution = createNativeHostExecution(spec, signal => this.prepare(spec, execution, signal),
      this.nativeConfig.diagnosticMaxBytes, (error) => { this.ctx.logger.error(error) })
    const finished = (async () => {
      await Promise.allSettled([execution.settled])
      await execution.launch.owner.waitForExit()
      this.executions.delete(execution)
    })()
    this.executions.set(execution, finished)
    void finished.catch((error: unknown) => {
      this.closureFailure = new HarnessError('Native cleanup failed. Stop the affected work and restart the Host before retrying.',
        'TARGET_NATIVE_SHUTDOWN_UNCONFIRMED', { cause: error })
      this.ctx.logger.error(this.closureFailure)
    })
    try {
      const handle = bindManagedProcess(spec, execution.launch, binding)
      if (handle.control !== undefined) {
        const control = handle.control
        this.nativeControls.add(control)
        control.once('close', () => { this.nativeControls.delete(control) })
      }
      return handle
    } catch (error) { void execution.dispose().catch((failure: unknown) => { this.ctx.logger.error(failure) }); throw error }
  }

  override async spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    this.assertActive()
    spec.signal?.throwIfAborted()
    return createNativeTerminal(spec, request => this.spawn(request), {
      startupTimeoutMs: this.nativeConfig.terminalStartupTimeoutMs,
      requestTimeoutMs: this.nativeConfig.terminalRequestTimeoutMs,
      maxRequests: this.nativeConfig.maxTerminalRequests, diagnosticMaxBytes: this.nativeConfig.diagnosticMaxBytes,
    })
  }
}
