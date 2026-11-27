import { readFileSync, writeFileSync } from 'node:fs'

for (const path of [
  'packages/test-support/client-runtime/src/assembly/bundle-roster.ts',
]) {
  let text = readFileSync(path, 'utf8')
  text = text.replace(
    /import \{([^}]*)\} from '@deepseek-ai\/cordis-plugin-include'/,
    (match, names) => {
      const list = names.split(',').map(item => item.trim()).filter(Boolean)
      if (!list.includes('parseEntryYaml')) list.push('parseEntryYaml')
      return `import { ${list.join(', ')} } from '@deepseek-ai/cordis-plugin-include'`
    },
  )
  text = text.replace(/\bentryListSchema\b/g, 'parseEntryYaml')
  text = text.replace(/applyEntryPatches\(([^)]*)\)(?!\.data)/g, 'applyEntryPatches($1).data')
  writeFileSync(path, text)
  console.log(`patched include usage in ${path}`)
}
