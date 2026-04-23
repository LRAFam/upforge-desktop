; Kill any running UpForge instance and handle missing uninstaller gracefully.
; Electron spawns several helper processes that must all be terminated before
; NSIS can delete the old install directory. We kill by image name for each one.

!macro _KillUpForge
  ExecWait 'taskkill /F /IM "UpForge.exe" /T' $0
  ExecWait 'taskkill /F /IM "UpForge Helper.exe" /T' $0
  ExecWait 'taskkill /F /IM "UpForge Helper (GPU).exe" /T' $0
  ExecWait 'taskkill /F /IM "UpForge Helper (Renderer).exe" /T' $0
  ExecWait 'taskkill /F /IM "UpForge Helper (Plugin).exe" /T' $0
  ExecWait 'taskkill /F /IM "ffmpeg.exe" /T' $0
  ClearErrors
  Sleep 2000
!macroend

!macro customInit
  !insertmacro _KillUpForge

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
  !insertmacro _KillUpForge
!macroend

!macro customUninstall
  !insertmacro _KillUpForge
!macroend
