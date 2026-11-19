; Compile against the production directory transaction using a private payload and target.
Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "Desktop directory replacement smoke"
OutFile "${OUTPUT_FILE}"
LoadLanguageFile "${NSISDIR}\Contrib\Language files\English.nlf"
LangString decompressionFailed ${LANG_ENGLISH} "Payload extraction failed"
!define DSH_NSIS_COPYING "${NSISDIR}\COPYING"
!define DSH_STDUTILS_SOURCE "${__FILEDIR__}\..\..\..\..\LICENSES\installer\StdUtils-1.14-sources.tbz2"
!define DSH_UAC_LICENSE "${__FILEDIR__}\..\..\..\..\LICENSES\installer\UAC-0.2.4c-LICENSE.txt"
!define APP_EXECUTABLE_FILENAME "asset.txt"
!define UNINSTALL_FILENAME "Uninstall Fixture.exe"
!ifdef REGISTRATION_FAILED
  !define INSTALL_REGISTRY_KEY "${REGISTRATION_TEST_KEY}\Install"
  !define UNINSTALL_REGISTRY_KEY "${REGISTRATION_TEST_KEY}\Uninstall"
!endif

!macro installApplicationFiles
  !insertmacro dshExtractPayload "${PAYLOAD_FILE}"
  !ifndef MISSING_UNINSTALLER
    File "/oname=${UNINSTALL_FILENAME}" "${__FILE__}"
  !endif
!macroend
!ifdef SOURCE_DLL
  LoadLanguageFile "${NSISDIR}\Contrib\Language files\SimpChinese.nlf"
  !include "${INSTALLER_STRINGS_FILE}"
  !define DSH_INSTALLER_LOG_DIR "${REPORT_DIR}"
  !include "..\..\scripts\installer.nsh"
!else
  !include "..\..\scripts\installer-directories.nsh"
!endif

Section
  InitPluginsDir
  FileOpen $0 "${TARGET_DIR}.plugin-dir.tmp" w
  FileWriteUTF16LE /BOM $0 "$PLUGINSDIR"
  FileClose $0
  Rename "${TARGET_DIR}.plugin-dir.tmp" "${TARGET_DIR}.plugin-dir"
  !ifdef SOURCE_DLL
    File "/oname=$PLUGINSDIR\window-frame.dll" "${SOURCE_DLL}"
  !endif
  StrCpy $INSTDIR "${TARGET_DIR}"
  !insertmacro dshStageApplication
  !ifdef OCCUPIED_LATE
    CreateDirectory $dshFinalDirectory
    FileOpen $0 "$dshFinalDirectory\unrelated.txt" w
    FileWrite $0 "unrelated file"
    FileClose $0
  !else
    ${If} ${FileExists} "$dshFinalDirectory\*.*"
      StrCpy $dshRegisteredDirectory $dshFinalDirectory
    ${EndIf}
  !endif
  !ifdef RESTORE_CONFLICT
    Rename $dshFinalDirectory $dshOldDirectory
    StrCpy $dshOldMoved "1"
    CreateDirectory $dshFinalDirectory
    FileOpen $0 "$dshFinalDirectory\unrelated.txt" w
    FileWrite $0 "unrelated file"
    FileClose $0
    StrCpy $dshDirectorySource $dshNewDirectory
    StrCpy $dshDirectoryDestination $dshFinalDirectory
    !insertmacro dshDirectoryOperation "$dshDirectorySource" "$dshDirectoryDestination" $dshDirectoryError "promote"
    Call dshRollbackDirectories
    !insertmacro dshReportDirectoryFailure
    Rename $dshFinalDirectory "${TARGET_DIR}.conflict"
    Call dshCleanupDirectories
    SetErrorLevel 2
    Quit
  !endif
  !ifdef CANCELLED
    SetErrorLevel 2
    Call dshCleanupDirectories
    Quit
  !endif
  !ifdef MISSING_STAGE
    ; A missing source makes the second rename fail after the old directory moved.
    RMDir /r "\\?\$dshNewDirectory"
  !endif
  !ifdef LOCKED_STAGE
    System::Call 'kernel32::CreateFileW(w "$dshNewDirectory\asset.txt", i 0x80000000, i 1, p 0, i 3, i 0, p 0) p.r9'
  !endif
  Call dshPromoteDirectories
  IfErrors failed
  !ifdef REGISTRATION_FAILED
    !insertmacro customInstall
  !endif
  !ifdef LOCKED_PROMOTED
    System::Call 'kernel32::CreateFileW(w "$dshFinalDirectory\asset.txt", i 0x80000000, i 1, p 0, i 3, i 0, p 0) p.r9'
    ${If} $9 == -1
      SetErrorLevel 3
      Quit
    ${EndIf}
  !endif
  !ifdef ABORT_PROMOTED
    Call dshCleanupDirectories
    !ifdef LOCKED_PROMOTED
      System::Call 'kernel32::CloseHandle(p r9)'
    !endif
    SetErrorLevel 2
    Quit
  !endif
  !insertmacro dshFinishDirectories
  SetErrorLevel 0
  Quit
  failed:
  !ifdef LOCKED_STAGE
    System::Call 'kernel32::CloseHandle(p r9)'
    Call dshCleanupDirectories
  !endif
  SetErrorLevel 2
  Quit
SectionEnd
