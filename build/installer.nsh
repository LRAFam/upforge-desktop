; Kill any running UpForge instance at installer startup (.onInit), before
; electron-builder's built-in process-running check triggers the dialog.
; This prevents the "UpForge cannot be closed" error on reinstall.

!macro customInit
  ExecWait 'taskkill /F /IM "UpForge.exe" /T' $0
  ClearErrors
  Sleep 800
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
