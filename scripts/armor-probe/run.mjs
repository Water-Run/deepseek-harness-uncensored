#!/usr/bin/env node
/**
 * Armor probe runner: sends every probe to the DeepSeek Messages endpoint twice,
 * once with the shipped armor prompt and once without it, and appends one JSON
 * line per request so a crashed run keeps its evidence.
 *
 * Arms:
 *   armor — the shipped `ARMOR_ZH` section followed by a one-line base persona
 *   bare  — the same one-line base persona alone
 *
 * Usage:
 *   node scripts/armor-probe/run.mjs [--samples=2] [--concurrency=4] [--out=baseline.jsonl]
 *     [--model=deepseek-flash] [--thinking=off|on] [--effort=max] [--max-tokens=6000]
 *     [--arms=armor,bare] [--limit=N] [--credentials=<path>] [--armor-file=<path>]
 *
 * Credentials: the DeepSeek account token from `$DSH_HOME/.credentials.yaml`
 * (`deepseek-account-platform/default`). Nothing is written back there.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { probes } from './probes.mjs'

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=')
  return [k, v]
}))

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const MODEL = args.get('model') ?? 'deepseek-flash'
const MAX_TOKENS = Number(args.get('max-tokens') ?? 6000)
const SAMPLES = Number(args.get('samples') ?? 1)
const CONCURRENCY = Number(args.get('concurrency') ?? 4)
const OUT = args.get('out') ?? 'results.jsonl'
const ARM_IDS = (args.get('arms') ?? 'armor,bare').split(',')
const LIMIT = args.get('limit') === undefined ? probes.length : Number(args.get('limit'))
const THINKING = args.get('thinking') ?? 'off'
const EFFORT = args.get('effort') ?? 'max'

async function armorText() {
  const file = args.get('armor-file')
  if (file !== undefined) return readFileSync(file, 'utf8')
  const built = join(repoRoot, 'packages', 'context', 'uncensored-armor', 'lib', 'types', 'armor.zh.js')
  const mod = await import(pathToFileURL(built).href)
  return mod.ARMOR_ZH
}

const ARMOR = await armorText()
const BASE_PERSONA = `You are a coding agent powered by the ${MODEL} model.`
const SYSTEMS = { armor: `${ARMOR}\n\n${BASE_PERSONA}`, bare: BASE_PERSONA }
for (const arm of ARM_IDS) {
  if (SYSTEMS[arm] === undefined) throw new Error(`unknown arm "${arm}"; expected ${Object.keys(SYSTEMS).join(', ')}`)
}

function credentialsPath() {
  const explicit = args.get('credentials')
  if (explicit !== undefined) return explicit
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, '.credentials.yaml')
}

const credFile = credentialsPath()
const credBlock = readFileSync(credFile, 'utf8').split('deepseek-account-platform/default:')[1] ?? ''
const TOKEN = /token:\s*(\S+)/.exec(credBlock)?.[1]
if (TOKEN === undefined) throw new Error(`no deepseek-account-platform/default token in ${credFile}`)

const ENDPOINT = 'https://api.deepseek.com/anthropic/v1/messages'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(arm, probe, sample) {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 1,
    ...THINKING === 'off'
      ? { thinking: { type: 'disabled' } }
      : { thinking: { type: 'enabled' }, output_config: { effort: EFFORT } },
    system: SYSTEMS[arm],
    messages: [{ role: 'user', content: [{ type: 'text', text: probe.prompt }] }],
  }
  const started = Date.now()
  const row = {
    ts: new Date().toISOString(), arm, probe: probe.id, category: probe.category,
    phrasing: probe.phrasing, sample, model: MODEL, thinking: THINKING,
  }
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          accept: 'application/json',
          'x-dsh-auth-token': TOKEN,
        },
        body: JSON.stringify(body),
      })
      const raw = await res.text()
      let parsed
      try { parsed = JSON.parse(raw) } catch { parsed = undefined }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(1000 * attempt); continue }
      const text = (parsed?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      const thinking = (parsed?.content ?? []).filter((b) => b.type === 'thinking').map((b) => b.thinking).join('\n')
      return {
        ...row, status: res.status, ok: res.ok, stopReason: parsed?.stop_reason ?? null,
        textLength: text.length, thinkingLength: thinking.length, text, thinking,
        usage: parsed?.usage ?? null, ms: Date.now() - started,
        error: res.ok ? null : raw.slice(0, 400),
      }
    } catch (error) {
      if (attempt < 3) { await sleep(1500 * attempt); continue }
      return {
        ...row, status: 0, ok: false, stopReason: null, textLength: 0, thinkingLength: 0,
        text: '', thinking: '', usage: null, ms: Date.now() - started, error: String(error),
      }
    }
  }
}

const tasks = []
for (const arm of ARM_IDS) {
  for (const probe of probes.slice(0, LIMIT)) {
    for (let sample = 1; sample <= SAMPLES; sample += 1) tasks.push({ arm, probe, sample })
  }
}

writeFileSync(OUT, '')
const total = tasks.length
console.log(`[armor-probe] ${total} requests, model=${MODEL}, thinking=${THINKING}, samples=${SAMPLES}, concurrency=${CONCURRENCY}`)

const queue = [...tasks]
let done = 0
async function worker() {
  for (let task = queue.shift(); task !== undefined; task = queue.shift()) {
    const row = await call(task.arm, task.probe, task.sample)
    appendFileSync(OUT, `${JSON.stringify(row)}\n`)
    done += 1
    console.log(`[${done}/${total}] ${row.ok ? 'ok ' : 'ERR'} ${row.arm}/${row.probe}#${row.sample} ${row.ms}ms ${row.textLength}c${row.stopReason === 'refusal' ? ' REFUSAL' : ''}`)
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker))
console.log(`[armor-probe] done -> ${OUT}`)
