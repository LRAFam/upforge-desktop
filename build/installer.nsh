; Kill any running UpForge instance before installing or uninstalling.
; This prevents "file in use" errors during reinstall/uninstall.

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
