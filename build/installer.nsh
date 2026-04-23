; Kill any running UpForge instance and handle missing uninstaller gracefully.
; Electron spawns several helper processes that must all be terminated before
; NSIS can delete the old install directory. We kill by image name and also
; by full path to ensure no stale processes block file deletion.

!macro _KillUpForge
  ; /T kills the entire process tree (including Electron helpers spawned as children).
  ; We also kill helpers individually because they may not share a parent-child tree.
  ExecWait 'taskkill /F /IM "UpForge.exe" /T' $0
  ExecWait 'taskkill /F /IM "UpForge Helper.exe" /T' $0
  ExecWait 'taskkill /F /IM "UpForge Helper (GPU).exe" /T' $0
  ExecWait 'taskkill /F /IM "UpForge Helper (Renderer).exe" /T' $0
  ExecWait 'taskkill /F /IM "UpForge Helper (Plugin).exe" /T' $0
  ExecWait 'taskkill /F /IM "ffmpeg.exe" /T' $0
  ClearErrors
  ; Wait for OS to release file handles after the processes are terminated.
  Sleep 3000
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
  ; Kill again immediately before file extraction in case the app relaunched
  ; between customInit and the actual file installation step.
  !insertmacro _KillUpForge
!macroend

!macro customUninstall
  !insertmacro _KillUpForge
!macroend
