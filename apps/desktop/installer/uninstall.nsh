; Uninstall retains the profile by default. Explicit cleanup is limited to Electron data and updater downloads.
!include FileFunc.nsh
Var UnTarget
Var UnHome
Var UnOfficialHome

; The helper refuses unsafe roots, the installation and the Harness home, and never descends into reparse points;
; a locked file leaves residue and never fails the uninstall. customCheckAppRunning extracts window-frame.dll first.
Function un.RemoveData
  System::Call '$PLUGINSDIR\window-frame.dll::UninstallRemoveDataV2(w "$UnTarget", w "$INSTDIR", w "$UnHome", w "$UnOfficialHome") ?c'
FunctionEnd

Function un.CleanData
  ${If} ${isUpdated}
    Return
  ${EndIf}
  ; The installer runs an older uninstaller with /KEEP_APP_DATA when replacing it from another directory.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/KEEP_APP_DATA" $R1
  ${IfNot} ${Errors}
    Return
  ${EndIf}
  StrCpy $R1 0
  System::Call '$PLUGINSDIR\window-frame.dll::UninstallDeleteAppDataRequested() i.R1 ?c'
  ${If} $R1 != 1
    Return
  ${EndIf}
  ; Match the independent DSHU launcher; the official DSH_HOME is not this product's data root.
  ReadEnvStr $UnHome DSH_UNCENSORED_HOME
  ${If} $UnHome == ""
    StrCpy $UnHome "$PROFILE\.dsh-uncensored"
  ${EndIf}
  ; The official home is retained too, even if the user placed it inside a DSHU data candidate.
  ReadEnvStr $UnOfficialHome DSH_HOME
  ${If} $UnOfficialHome == ""
    StrCpy $UnOfficialHome "$PROFILE\.dsh"
  ${EndIf}
  ClearErrors
  StrCpy $UnTarget "$APPDATA\${PRODUCT_FILENAME}"
  Call un.RemoveData
  !ifdef APP_PACKAGE_NAME
  !if "${APP_PACKAGE_NAME}" != "@deepseek-ai/dsh-desktop"
    ; Electron derives user data from the package name; a scoped name nests it one directory deeper.
    StrCpy $UnTarget "$APPDATA\${APP_PACKAGE_NAME}"
    Call un.RemoveData
    System::Call '$PLUGINSDIR\window-frame.dll::UninstallRemoveEmptyParents(w "$UnTarget", w "$APPDATA") ?c'
  !endif
  !endif
  StrCpy $UnTarget "$LOCALAPPDATA\${DSH_UPDATER_CACHE_NAME}"
  Call un.RemoveData
FunctionEnd
