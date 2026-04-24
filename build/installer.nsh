; Kill any running UpForge instance and handle missing uninstaller gracefully.
; Electron spawns several helper processes that must all be terminated before
; NSIS can delete the old install directory.
;
; NOTE: nsExec::ExecToStack runs commands silently (no visible cmd.exe window).
; ExecWait must NOT be used here — it flashes a terminal window for every call.

!macro _KillUpForge
  ; Kill by image name silently. /T terminates the whole process tree.
  ; nsExec::ExecToStack discards stdout/stderr but never shows a window.
  nsExec::ExecToStack 'taskkill /F /IM "UpForge.exe" /T'
  Pop $0 ; exit code
  Pop $1 ; stdout (discarded)

  nsExec::ExecToStack 'taskkill /F /IM "UpForge Helper.exe" /T'
  Pop $0
  Pop $1

  nsExec::ExecToStack 'taskkill /F /IM "UpForge Helper (GPU).exe" /T'
  Pop $0
  Pop $1

  nsExec::ExecToStack 'taskkill /F /IM "UpForge Helper (Renderer).exe" /T'
  Pop $0
  Pop $1

  nsExec::ExecToStack 'taskkill /F /IM "UpForge Helper (Plugin).exe" /T'
  Pop $0
  Pop $1

  nsExec::ExecToStack 'taskkill /F /IM "ffmpeg.exe" /T'
  Pop $0
  Pop $1

  ClearErrors
  ; Give the OS time to release all file handles before we touch the install dir.
  Sleep 4000
!macroend

; customCheckAppRunning completely replaces the built-in process-check in
; allowOnlyOneInstallerInstance.nsh (the one that shows the
; "cannot be closed, please close manually and click Retry" dialog).
; We kill silently — no dialog is ever shown to the user.
!macro customCheckAppRunning
  !insertmacro _KillUpForge
!macroend

!macro customInit
  !insertmacro _KillUpForge

  ; If a previous install is registered but the uninstaller binary is gone,
  ; remove the stale registry key so the installer won't try to run a ghost uninstaller.
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\gg.upforge.desktop" "UninstallString"
  ${If} $R0 != ""
    ${IfNot} ${FileExists} $R0
      DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\gg.upforge.desktop"
      ClearErrors
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ; Kill once more right before file extraction in case the app relaunched
  ; between customInit and the actual install step.
  !insertmacro _KillUpForge
!macroend

!macro customUninstall
  !insertmacro _KillUpForge
!macroend
