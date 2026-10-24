import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

const preload = pathToFileURL(join(import.meta.dirname, 'uncensored-home.mjs')).href

function launchHomes(env: Record<string, string | undefined>): { dsh: string; uncensored: string } {
  const output = execFileSync(process.execPath, [
    '--import', preload, '-e', 'process.stdout.write(JSON.stringify({ dsh: process.env.DSH_HOME, uncensored: process.env.DSH_UNCENSORED_HOME }))',
  ], { encoding: 'utf8', env: Object.fromEntries(Object.entries({ ...process.env, ...env }).filter(([, value]) => value !== undefined)) })
  return JSON.parse(output) as { dsh: string; uncensored: string }
}

it('ignores an inherited DSH_HOME, including a custom official home', () => {
  const fallback = join(homedir(), '.dsh-uncensored')
  for (const inherited of ['~/.dsh', resolve('custom-official-home')]) {
    expect(launchHomes({ DSH_HOME: inherited, DSH_UNCENSORED_HOME: undefined })).toEqual({ dsh: fallback, uncensored: fallback })
  }
  expect(launchHomes({ DSH_HOME: '~/.dsh', DSH_UNCENSORED_HOME: '  ' })).toEqual({ dsh: fallback, uncensored: fallback })
})

it('exports DSH_UNCENSORED_HOME as the home every child resolves', () => {
  const own = resolve('own-uncensored-home')
  expect(launchHomes({ DSH_HOME: resolve('custom-official-home'), DSH_UNCENSORED_HOME: own })).toEqual({ dsh: own, uncensored: own })
  expect(launchHomes({ DSH_HOME: undefined, DSH_UNCENSORED_HOME: '~/private-dshu' }))
    .toEqual({ dsh: join(homedir(), 'private-dshu'), uncensored: join(homedir(), 'private-dshu') })
})
