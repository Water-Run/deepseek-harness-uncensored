import { readFileSync, writeFileSync } from 'node:fs'

const path = 'packages/test-support/client-runtime/src/assembly/bundle-roster.ts'
let text = readFileSync(path, 'utf8')
text = text.replace(
  "import { applyEntryPatches, parseEntryYaml, type PatchOptions, parseEntryYaml } from '@deepseek-ai/cordis-plugin-include'",
  "import { applyEntryPatches, parseEntryYaml, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'",
)
text = text.replace(
  "  const entries = applyEntryPatches([], layers.flatMap(layer => layer.patches).data, (message: string, ...args: unknown[]) => {",
  "  const entries = applyEntryPatches([], layers.flatMap(layer => layer.patches), (message: string, ...args: unknown[]) => {",
)
text = text.replace(
  "  })\n  const anchors = layers.map(layer => layer.manifestPath)",
  "  }).data\n  const anchors = layers.map(layer => layer.manifestPath)",
)
text = text.replace(
  "    const parsed: unknown = yaml.load(readFileSync(file, 'utf8'), { schema: parseEntryYaml })",
  "    const parsed: unknown = parseEntryYaml(readFileSync(file, 'utf8'))",
)
text = text.replace("import * as yaml from 'js-yaml'\n", '')
writeFileSync(path, text)
console.log('client runtime bundle roster adapted')
