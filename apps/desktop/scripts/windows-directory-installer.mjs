/** Adapt the pinned NSIS template to stage and rename complete application directories. */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import stdUtils from '../../../LICENSES/installer/stdutils-1.14.json' with { type: 'json' }
import uac from '../../../LICENSES/installer/uac-0.2.4c.json' with { type: 'json' }

const require = createRequire(import.meta.url)
const templates = join(dirname(require.resolve('app-builder-lib/package.json')), 'templates/nsis')
const patched = Symbol.for('@deepseek-ai/dsh-desktop/directory-installer')

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Desktop NSIS template changed: ${before}`)
  return source.replace(before, after)
}

function replaceWinShellCalls(source) {
  const call = "System::Call '$PLUGINSDIR\\window-frame.dll::"
  const result = source
    .replaceAll(/WinShell::SetLnkAUMI ("[^"\r\n]+") ("[^"\r\n]+")/gu,
      (_match, path, appId) => `${call}InstallerSetShortcutAppId(w ${path}, w ${appId}) i ?c'`)
    .replaceAll(/WinShell::UninstShortcut ("[^"\r\n]+")/gu,
      (_match, path) => `${call}InstallerUnpinShortcut(w ${path}) v ?c'`)
    .replaceAll(/WinShell::UninstAppUserModelId ("[^"\r\n]+")/gu,
      (_match, appId) => `${call}InstallerClearJumpList(w ${appId}) v ?c'`)
  if (result.includes('WinShell::')) throw new Error('Desktop NSIS template contains an unhandled WinShell call')
  return result
}

/**
 * Keep the pinned shortcut flow while using the native Windows shell helper.
 * @param {string} source - Pinned electron-builder include/installer.nsh contents.
 * @returns {string} Shortcut macros that unpin before renaming an existing link.
 */
export function directoryInstallerShortcuts(source) {
  let result = source.replaceAll('\r\n', '\n')
  for (const [name, indent] of [['StartMenu', '      '], ['Desktop', '        ']]) {
    const rename = `${indent}Rename $old${name}Link $new${name}Link`
    const unpin = `${indent}WinShell::UninstShortcut "$old${name}Link"`
    result = replaceOnce(result, `${rename}\n${unpin}`, `${unpin}\n${rename}`)
  }
  return replaceWinShellCalls(result)
}

/**
 * Preserve upstream registration and uninstall UI while replacing payload installation.
 * @param {string} source - Pinned electron-builder installSection.nsh contents.
 * @returns {string} Section with staging before shutdown and directory promotion before registration.
 */
export function directoryInstallSection(source) {
  let result = source.replaceAll('\r\n', '\n')
  result = replaceOnce(result, '!include installer.nsh', `!include installer.nsh
!macroundef extractUsing7za
!macro extractUsing7za FILE
  !insertmacro dshExtractPayload "\${FILE}"
!macroend
!macroundef uninstallOldVersion
!macro uninstallOldVersion ROOT_KEY
  !insertmacro readReg $R4 "\${ROOT_KEY}" "\${INSTALL_REGISTRY_KEY}" InstallLocation
  \${If} $R4 == $INSTDIR
    StrCpy $R0 0
    ClearErrors
  \${Else}
    Push "\${ROOT_KEY}"
    Call uninstallOldVersion
  \${EndIf}
!macroend`)
  result = replaceOnce(result, '!insertmacro setLinkVars', `!insertmacro setLinkVars
!insertmacro dshStageApplication`)
  result = replaceOnce(result, '!insertmacro installApplicationFiles', 'Call dshPromoteDirectories\nIfErrors 0 +3\n  SetErrorLevel 2\n  Quit')
  result = replaceOnce(result, '!ifdef UNINSTALLER_ICON\n  File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"\n!endif\n', '')
  // The staging macro uses the upstream installer macro, including its signed uninstaller.
  return result
}

/**
 * Clean staged directories on upstream Quit paths, including silent installers.
 * @param {string} source - Pinned NSIS helper source.
 * @returns {string} Helper with cleanup before installer exits.
 */
export function directoryInstallerExits(source) {
  return source.replaceAll(/^(\s*)Quit\s*$/gm, '$1!ifndef BUILD_UNINSTALLER\n$1Call dshCleanupDirectories\n$1!endif\n$1Quit')
}

/** Install the build-only NSIS adapter without replacing electron-builder's signed bootstrap path. */
export function installWindowsDirectoryInstaller() {
  // The package entry initializes the platform classes before their mutually dependent leaves.
  require('app-builder-lib')
  const { NsisTarget } = require('app-builder-lib/out/targets/nsis/NsisTarget.js')
  const { getPath7za } = require('app-builder-lib/out/toolsets/7zip.js')
  const { getMakeNsisPath, getNsisPluginsPath } = require('app-builder-lib/out/toolsets/windows.js')
  const prototype = NsisTarget.prototype
  if (prototype[patched]) return
  prototype[patched] = true
  const compute = prototype.computeFinalScript
  prototype.computeFinalScript = async function (source, ...args) {
    const directory = join(this.outDir, '.nsis-directory-installer')
    await mkdir(directory, { recursive: true })
    const section = join(directory, 'installSection.nsh')
    const shortcuts = join(directory, 'installer-shortcuts.nsh')
    await writeFile(shortcuts, directoryInstallerShortcuts(await readFile(join(templates, 'include', 'installer.nsh'), 'utf8')))
    await writeFile(section, replaceOnce(directoryInstallSection(await readFile(join(templates, 'installSection.nsh'), 'utf8')),
      '!include installer.nsh', `!include "${shortcuts}"`))
    const sourceTool = await getPath7za()
    const tool = join(directory, '7za.exe')
    await copyFile(sourceTool, tool)
    await this.packager.signIf(tool)
    const compiler = await getMakeNsisPath(this.packager.config.toolsets?.nsis, this.options.customNsisBinary)
    const copying = await readFile(join(compiler.env?.NSISDIR ?? dirname(compiler.path), 'COPYING'))
    if (copying.toString('utf8').trim() === '') throw new Error('Desktop NSIS toolset has an empty COPYING notice')
    const notice = join(directory, 'nsis-installer-COPYING.txt')
    await writeFile(notice, copying)
    for (const name of ['LICENSE.txt', 'COPYING']) {
      const bytes = await readFile(join(dirname(dirname(sourceTool)), name))
      if (bytes.toString('utf8').trim() === '') throw new Error(`Desktop 7-Zip toolset has an empty ${name} notice`)
      await writeFile(join(directory, name), bytes)
    }
    const pluginArch = this.isUnicodeEnabled ? 'x86-unicode' : 'x86-ansi'
    const plugins = await getNsisPluginsPath(this.packager.config.toolsets?.nsis, this.options.customNsisResources)
    const pinned = [
      { plugin: 'StdUtils.dll', digests: stdUtils.pluginSha256, file: stdUtils.archive, sha256: stdUtils.archiveSha256 },
      { plugin: 'UAC.dll', digests: uac.pluginSha256, file: uac.license, sha256: uac.licenseSha256 },
    ]
    for (const { plugin, digests, file, sha256 } of pinned) {
      const binary = await readFile(join(plugins, pluginArch, plugin))
      if (createHash('sha256').update(binary).digest('hex') !== digests[pluginArch]) {
        throw new Error(`Desktop NSIS toolset has an unreviewed ${plugin} for ${pluginArch}`)
      }
      const supplement = await readFile(new URL(`../../../LICENSES/installer/${file}`, import.meta.url))
      if (createHash('sha256').update(supplement).digest('hex') !== sha256) {
        throw new Error(`Desktop NSIS supplement differs from the pinned release: ${file}`)
      }
      await writeFile(join(directory, file), supplement)
      await writeFile(join(directory, plugin), binary)
    }
    let adapted = replaceOnce(source, '!include "installSection.nsh"', `!include "${section}"`)
    for (const helper of ['allowOnlyOneInstallerInstance.nsh', 'installUtil.nsh']) {
      const path = join(directory, helper)
      await writeFile(path, directoryInstallerExits(await readFile(join(templates, 'include', helper), 'utf8')))
      adapted = replaceOnce(adapted, `!include "${helper}"`, `!include "${path}"`)
    }
    const uninstaller = join(directory, 'uninstaller.nsh')
    await writeFile(uninstaller, directoryUninstaller(await readFile(join(templates, 'uninstaller.nsh'), 'utf8')))
    adapted = replaceOnce(adapted, '!include "uninstaller.nsh"', `!include "${uninstaller}"`)
    return [
      `!define DSH_UPDATER_CACHE_NAME "${this.packager.appInfo.updaterCacheDirName}"`,
      `!define DSH_SEVENZIP_PATH "${tool}"`,
      `!define DSH_SEVENZIP_LICENSE_DIR "${directory}"`,
      `!define DSH_NSIS_COPYING "${notice}"`,
      `!define DSH_STDUTILS_SOURCE "${join(directory, stdUtils.archive)}"`,
      `!define DSH_UAC_LICENSE "${join(directory, uac.license)}"`,
      await compute.call(this, adapted, ...args),
    ].join('\n')
  }
}

/**
 * Keep user-data removal in the native helper, which refuses unsafe roots and never follows links.
 * @param {string} source - Pinned upstream uninstaller source.
 * @returns {string} Uninstaller with long-path application removal and no upstream RMDir data removal.
 */
export function directoryUninstaller(source) {
  const normalized = source.replaceAll('\r\n', '\n')
  const start = normalized.indexOf('  Var /GLOBAL isDeleteAppData\n')
  const end = normalized.indexOf('  DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"', start)
  if (start < 0 || end < 0) throw new Error('NSIS uninstaller data removal template changed')
  return replaceWinShellCalls(
    replaceOnce(normalized.slice(0, start) + normalized.slice(end), 'RMDir /r $INSTDIR', 'RMDir /r "\\\\?\\$INSTDIR"'),
  )
}
