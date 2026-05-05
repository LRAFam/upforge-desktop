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
  Sleep 2000
!macroend

; customCheckAppRunning completely replaces the built-in process-check in
; allowOnlyOneInstallerInstance.nsh (the one that shows the
; "cannot be closed, please close manually and click Retry" dialog).
; We kill silently — no dialog is ever shown to the user.
!macro customCheckAppRunning
  !insertmacro _KillUpForge
!macroend

!macro customInit
  ; Kill all processes first so file handles are released.
  ; IMPORTANT: Do NOT delete the install directory or registry key here.
  ; If we remove the directory before NSIS calls the old uninstaller, NSIS
  ; cannot find the uninstaller binary and shows "Failed to uninstall old
  ; application files.: 2" (ERROR_FILE_NOT_FOUND). Instead we let NSIS call
  ; the old uninstaller normally — it works because all processes are killed.
  !insertmacro _KillUpForge

  ; Only do manual cleanup when the old uninstaller binary is genuinely missing
  ; (e.g. partial/corrupted install). This prevents the "Failed to uninstall"
  ; dialog in those rare cases without breaking the normal upgrade path.
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\gg.upforge.desktop" "UninstallString"
  ${If} $R0 != ""
    ; NSIS stores the UninstallString as: "C:\...\Uninstall UpForge.exe" — strip quotes
    StrCpy $R1 $R0 1 0
    ${If} $R1 == '"'
      StrCpy $R0 $R0 "" 1           ; strip leading quote
      StrCpy $R2 $R0 1 -1
      ${If} $R2 == '"'
        StrLen $R3 $R0
        IntOp $R3 $R3 - 1
        StrCpy $R0 $R0 $R3          ; strip trailing quote
      ${EndIf}
    ${EndIf}
    ; If the uninstaller binary exists on disk, leave everything alone —
    ; NSIS will call it automatically and uninstall cleanly.
    IfFileExists "$R0" customInit_done customInit_cleanup
  ${Else}
    ; No registry entry — fresh install, nothing to clean up.
    Goto customInit_done
  ${EndIf}

  customInit_cleanup:
    ; Uninstaller binary is missing. Clean up manually to avoid the error dialog.
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\gg.upforge.desktop" "InstallLocation"
    ${If} $R0 != ""
      StrCpy $R1 $R0 1 -1
      ${If} $R1 == "\"
        StrLen $R2 $R0
        IntOp $R2 $R2 - 1
        StrCpy $R0 $R0 $R2
      ${EndIf}
      RMDir /r "$R0"
    ${EndIf}
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\gg.upforge.desktop"
    ClearErrors

  customInit_done:
    ClearErrors
!macroend

!macro customInstall
  ; Kill once more right before file extraction in case the app relaunched
  ; between customInit and the actual install step.
  !insertmacro _KillUpForge
!macroend

!macro customUninstall
  !insertmacro _KillUpForge
!macroend
