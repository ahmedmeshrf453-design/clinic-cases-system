!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\Clinic Cases System.lnk" "$INSTDIR\clinic-cases-system.exe" "" "$INSTDIR\clinic-cases-system.exe" 0 SW_SHOWNORMAL "" "Clinic Cases System"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'schtasks.exe /Delete /F /TN "Clinic Cases Daily Backup 4AM"'
  nsExec::ExecToLog 'schtasks.exe /Delete /F /TN "Clinic Cases Backup CatchUp"'
  Delete "$DESKTOP\Clinic Cases System.lnk"
!macroend
