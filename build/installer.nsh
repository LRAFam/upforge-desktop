; Kill any running UpForge instance and handle missing uninstaller gracefully.
; Error code 2 (ERROR_FILE_NOT_FOUND) occurs when the previous version's
; uninstall.exe cannot be found — this pre-emptively cleans the registry so
; the installer can proceed fresh instead of showing an error dialog.

!macro customInit
  ExecWait 'taskkill /F /IM "UpForge.exe" /T' $0
  ClearErrors
  Sleep 800

  ; Check if a previous installation is registered but uninstaller is missing.
  ; If so, clean the registry so the installer doesn't try to run a ghost uninstaller.
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\gg.upforge.desktop" "UninstallString"
  ${If} $R0 != ""
    ${IfNot} ${FileExists} $R0
      ; Uninstaller binary not found — remove stale registry entries so install proceeds cleanly.
      DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\gg.upforge.desktop"
      ClearErrors
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ExecWait 'taskkill /F /IM "UpForge.exe" /T' $0
  ClearErrors
  Sleep 1000
!macroend

!macro customUninstall
  ExecWait 'taskkill /F /IM "UpForge.exe" /T' $0
  ClearErrors
  Sleep 1000
!macroend
