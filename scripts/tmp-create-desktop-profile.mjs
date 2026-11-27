import { mkdtempSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPluginProfile } from '../apps/desktop/src/project-manager.ts'

const root = mkdtempSync(join(tmpdir(), 'dshu-desktop-profile-'))
const profile = join(root, '.dsh-uncensored', 'profiles', 'desktop')
mkdirSync(join(root, '.dsh-uncensored', 'profiles'), { recursive: true })
createPluginProfile(profile)
console.log(root)
