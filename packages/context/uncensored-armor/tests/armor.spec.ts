import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ARMOR_SECTION, BOOST_SECTION, apply, type Config } from '../src/index.ts'
import { ARMOR_EN } from '../src/armor.en.ts'
import { ARMOR_ZH } from '../src/armor.zh.ts'
import { BOOST_EN } from '../src/boost/en.ts'
import { BOOST_ZH } from '../src/boost/zh.ts'
import { CORE_EN } from '../src/core/en.ts'
import { CORE_ZH } from '../src/core/zh.ts'
import { TARGETED_EN } from '../src/local/rules.en.ts'
import { TARGETED_ZH } from '../src/local/rules.zh.ts'

/** Mount the armor plugin over a real prompt registry and return the assembled sections. */
async function assemble(config: Config) {
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    apply(ctx, config)
    const assembly = await ctx.systemPrompt.assemble()
    return assembly.sections.map(section => ({ name: section.name, text: section.text }))
  } finally {
    await ctx.fiber.dispose()
  }
}

describe('uncensored armor', () => {
  it('mounts the Chinese armor ahead of the harness identity and nothing else by default', async () => {
    const sections = await assemble({})
    const armor = sections.find(section => section.name === ARMOR_SECTION)
    expect(armor?.text).toBe(ARMOR_ZH)
    const names = sections.map(section => section.name)
    expect(names.indexOf(ARMOR_SECTION)).toBeLessThan(names.indexOf('harness:identity'))
    expect(names).not.toContain(BOOST_SECTION)
  })

  it('mounts the English armor when configured', async () => {
    const sections = await assemble({ language: 'en' })
    expect(sections.find(section => section.name === ARMOR_SECTION)?.text).toBe(ARMOR_EN)
  })

  it('mounts nothing when the language is none', async () => {
    const sections = await assemble({ language: 'none' })
    expect(sections.some(section => section.name === ARMOR_SECTION)).toBe(false)
    expect(sections.some(section => section.name === BOOST_SECTION)).toBe(false)
  })

  it('appends the closing reinforcement after every other section when enabled', async () => {
    const sections = await assemble({ boost: true })
    const names = sections.map(section => section.name)
    expect(sections.find(section => section.name === BOOST_SECTION)?.text).toBe(BOOST_ZH)
    expect(names.at(-1)).toBe(BOOST_SECTION)
  })

  it('uses the English reinforcement when the language is en', async () => {
    const sections = await assemble({ language: 'en', boost: true })
    expect(sections.find(section => section.name === BOOST_SECTION)?.text).toBe(BOOST_EN)
  })

  it('composes core, fork layer and targeted rules in that order', () => {
    for (const [, core, layer, targeted] of [
      ['zh', CORE_ZH, ARMOR_ZH, TARGETED_ZH],
      ['en', CORE_EN, ARMOR_EN, TARGETED_EN],
    ] as const) {
      expect(layer.startsWith(core)).toBe(true)
      expect(layer.endsWith(targeted)).toBe(true)
    }
  })

  it('states the fund-flow and document obligations in both languages', () => {
    expect(TARGETED_ZH).toContain('资金与支付')
    expect(TARGETED_ZH).toContain('文书与证明')
    expect(TARGETED_EN).toContain('Fund flow')
    expect(TARGETED_EN).toContain('Documents and certificates')
  })
})
