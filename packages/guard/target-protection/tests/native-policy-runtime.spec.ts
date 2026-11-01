/** Real native execution consumes compiled rules and retains them through process-tree shutdown. @module */
import { Context } from '@deepseek-ai/cordis'
import { probe, spawn, type ContainerRequest, type MxcProcess } from '@microsoft/mxc-sdk/v1'
import { buildCommandLine, extendWin32ProcessBindings, isNullPtr, type CurrentTokenProcessBindings, type NativePtr } from '@deepseek-ai/dsh-win32-process'
import { brandString } from '@deepseek-ai/dsh-brand'
import { mkdtemp, mkdir, writeFile, readFile, link, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Readable } from 'node:stream'
import { describe, expect, it, onTestFinished } from 'vitest'
import { z } from 'zod'
import TargetProtection, { type TargetRuleId } from '../src/index.ts'
import { compileNativeFilePolicy } from '../src/native-file-policy.ts'

const supported = process.platform === 'win32' && probe().tier === 'base-container'

interface ProcessObserver extends CurrentTokenProcessBindings {
  openProcess(access: number, inherit: number, pid: number): NativePtr | null
  terminateProcess(handle: NativePtr, code: number): number
}

async function capture(stream: Readable | null): Promise<string> {
  if (stream === null) throw new Error('Native stdout is missing')
  const chunks: Uint8Array[] = []
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) throw new Error('Expected native output bytes')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function fixture(source: string) {
  const root = await mkdtemp(join(tmpdir(), 'dshu-native-runtime-')), ctx = new Context()
  const workspace = join(root, 'work'), production = join(workspace, 'production'), audit = join(workspace, 'audit')
  const temporary = join(root, 'temporary'), owner = join(root, 'owner.txt'), script = join(root, 'program.cjs')
  for (const path of [workspace, production, audit, temporary]) await mkdir(path)
  await writeFile(owner, 'owner-preserve')
  await writeFile(join(production, 'data.txt'), 'production-preserve')
  await writeFile(join(audit, 'data.txt'), 'audit-preserve')
  await link(join(production, 'data.txt'), join(workspace, 'production-link.txt'))
  await link(join(audit, 'data.txt'), join(workspace, 'audit-link.txt'))
  await writeFile(script, `const root=${JSON.stringify(root)};\n${source}\n`)
  const releases: (() => void)[] = []
  onTestFinished(async () => {
    for (const release of releases) release()
    await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true })
  })
  await ctx.plugin(TargetProtection, { path: join(root, 'rules.sqlite'), hostsFile: '', ownerPaths: [owner] })
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [
    { id: brandString<TargetRuleId>('63ac174b-3be7-4d04-bbc4-6c85f52cfe30'), name: 'production', enabled: true,
      kind: 'server', environment: 'production', protection: 'full', match: 'path', address: production },
    { id: brandString<TargetRuleId>('1f207c4b-08a4-4e89-ac0e-0a8080b4ecf0'), name: 'audit', enabled: true,
      kind: 'server', environment: 'production', protection: 'audit', match: 'path', address: audit },
  ] }, 1)
  const constraints = await ctx.targetProtection.nativeFileConstraints()
  const files = await compileNativeFilePolicy(constraints, { readonlyPaths: [root, dirname(process.execPath)],
    readwritePaths: [workspace, audit, temporary], maxEntries: 1000, maxPaths: 200 }, new AbortController().signal)
  const request: ContainerRequest = {
    command: buildCommandLine(process.execPath, [script]), workingDirectory: workspace,
    containment: { type: 'processcontainer', config: { filesystem: { enumeratePaths: files.enumeratePaths } } },
    filesystem: { readonlyPaths: files.readonlyPaths, readwritePaths: files.readwritePaths, deniedPaths: files.deniedPaths },
    network: { egress: { default: 'deny' }, ingress: { default: 'deny', hostLoopback: 'deny' } },
    ui: { disable: false, clipboard: 'none', allowInputInjection: false }, timeoutMs: 15000,
    environment: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, SystemDrive: process.env.SystemDrive,
      LOCALAPPDATA: temporary, USERPROFILE: temporary, TEMP: temporary, TMP: temporary },
  }
  const check = probe(request)
  expect(check.tier).toBe('base-container')
  expect(check.needsDaclAugmentation).toBe(false)
  return { root, ctx, request, files, releases }
}

describe.skipIf(!supported)('Windows native target policy with MXC', () => {
  it('enforces generated full, readonly, owner and hard-link restrictions while allowing ordinary work', async () => {
    const h = await fixture(`
const fs=require('node:fs'); const result={};
for(const [name,path] of Object.entries({owner:root+'/owner.txt',production:root+'/work/production/data.txt',alias:root+'/work/production-link.txt',audit:root+'/work/audit/data.txt'})) {
  try { result[name]=fs.readFileSync(path,'utf8'); } catch(error) { result[name]=error.code; }
}
for(const [name,path] of Object.entries({work:root+'/work/output.txt',productionWrite:root+'/work/production/data.txt',auditWrite:root+'/work/audit/data.txt',auditAliasWrite:root+'/work/audit-link.txt',futureOwner:root+'/rules.sqlite-wal'})) {
  try { fs.writeFileSync(path,'changed'); result[name]='written'; } catch(error) { result[name]=error.code; }
}
console.log(JSON.stringify(result));`)
    let child: MxcProcess | undefined
    const closed = Promise.withResolvers<boolean>()
    const release = h.ctx.targetProtection.retainNativeExecution(h.files.revision, async () => { child?.kill(); await closed.promise })
    h.releases.push(release)
    try {
      child = await spawn(h.request)
      const output = capture(child.standardOutput), errors = capture(child.standardError)
      const result = await child.wait()
      expect(result.timedOut).toBe(false)
      expect(result.exitCode, await errors).toBe(0)
      expect(await errors).toBe('')
      expect(JSON.parse(await output)).toEqual({ owner: 'EPERM', production: 'EPERM', alias: 'EPERM', audit: 'audit-preserve',
        work: 'written', productionWrite: 'EPERM', auditWrite: 'EPERM', auditAliasWrite: 'EPERM', futureOwner: 'EPERM' })
      expect(await readFile(join(h.root, 'work', 'production', 'data.txt'), 'utf8')).toBe('production-preserve')
      expect(await readFile(join(h.root, 'work', 'audit', 'data.txt'), 'utf8')).toBe('audit-preserve')
      expect(await readFile(join(h.root, 'work', 'output.txt'), 'utf8')).toBe('changed')
    } finally {
      if (child !== undefined) { child.kill(); await child.wait(); child.dispose() }
      release(); closed.resolve(true)
    }
  })

  it('commits new rules only after a real command and its detached descendant have stopped', async () => {
    const h = await fixture(`
const fs=require('node:fs');
if(process.argv[2]==='child') { console.log('ready'); setInterval(()=>fs.writeFileSync(root+'/work/heartbeat.txt','running'),25); }
else {
 const child=require('node:child_process').spawn(process.execPath,[__filename,'child'],{stdio:['ignore','pipe','ignore'],windowsHide:true,detached:true});
 child.stdout.once('data',()=>console.log(JSON.stringify({child:child.pid})));
 setInterval(()=>{},1000);
}`)
    let child: MxcProcess | undefined, ended = false
    const closed = Promise.withResolvers<boolean>()
    const release = h.ctx.targetProtection.retainNativeExecution(h.files.revision, async () => {
      if (!ended) child?.kill()
      await closed.promise
    })
    h.releases.push(release)
    let processHandle: NativePtr | null = null
    const api = extendWin32ProcessBindings(({ kernel32, bind }) => ({
      openProcess: bind(kernel32, 'OpenProcess', 'void *', ['uint32', 'int', 'uint32']),
      terminateProcess: bind(kernel32, 'TerminateProcess', 'int', ['void *', 'uint32']),
    })) as ProcessObserver
    try {
      child = await spawn(h.request)
      const stdout = child.standardOutput, errors = capture(child.standardError)
      if (stdout === null) throw new Error('Native stdout is missing')
      const ready = await new Promise<number>((resolve, reject) => {
        let text = ''
        stdout.on('data', (chunk: Buffer) => {
          text += chunk.toString('utf8')
          if (!text.includes('\n')) return
          try {
            const value = z.object({ child: z.number().int().min(1).max(0xffff_ffff) }).strict().parse(JSON.parse(text.trim()))
            resolve(value.child)
          } catch (error) { reject(error instanceof Error ? error : new Error('Invalid native readiness result', { cause: error })) }
        })
        stdout.once('error', reject)
        stdout.once('end', () => { void errors.then((text) => { reject(new Error(`Native workload ended before readiness: ${text}`)) }, reject) })
      })
      // Hold the exact kernel process object before cancellation; PID reuse cannot change this observation or cleanup.
      processHandle = api.openProcess(0x00100001, 0, ready)
      if (isNullPtr(processHandle)) throw new Error('Could not retain the owned native descendant')
      const descendant = processHandle
      const completion = child.wait().then((result) => {
        expect(api.waitForSingleObject(descendant, 0)).toBe(0)
        ended = true; release(); closed.resolve(true)
        return result
      }).catch((error: unknown) => {
        closed.reject(error)
        throw error
      })
      void completion.catch(() => {}) // The configuration call observes the same failure through the native closure promise.
      const changed = await h.ctx.targetProtection.configure({ mainlandEnabled: true, rules: [] }, h.files.revision)
      expect(changed.revision).toBe(h.files.revision + 1)
      expect(api.waitForSingleObject(processHandle, 0)).toBe(0)
      expect((await completion).timedOut).toBe(false)
      expect(await errors).toBe('')
    } finally {
      if (child !== undefined) { if (!ended) child.kill(); await child.wait(); child.dispose() }
      if (!isNullPtr(processHandle)) {
        if (api.waitForSingleObject(processHandle, 0) !== 0) {
          expect(api.terminateProcess(processHandle, 1)).toBe(1)
          expect(api.waitForSingleObject(processHandle, 5000)).toBe(0)
        }
        expect(api.closeHandle(processHandle)).toBe(1)
      }
      release(); closed.resolve(true)
    }
  })
})
