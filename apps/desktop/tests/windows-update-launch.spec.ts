import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { launchWindowsUpdateInstaller } from '../src/updates/electron-updater/launch-installer.ts'

it('settles after process creation even if the executable exits immediately', async () => {
  // Node rejects the installer flags and exits without reading or changing any app data.
  await expect(launchWindowsUpdateInstaller(process.execPath)).resolves.toBeUndefined()
})

it('rejects when the OS cannot create the installer process', async () => {
  const missing = join(tmpdir(), `missing-installer-${randomUUID()}.exe`)
  await expect(launchWindowsUpdateInstaller(missing)).rejects.toMatchObject({ code: 'ENOENT' })
})
