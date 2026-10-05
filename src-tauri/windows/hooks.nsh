!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog 'taskkill.exe /F /IM clinic-cases-system.exe'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Delete "$DESKTOP\Clinic Cases System.lnk"
  CreateShortCut "$DESKTOP\تسجيل حالات عيادات العقاد التخصصية.lnk" "$INSTDIR\clinic-cases-system.exe" "" "$INSTDIR\clinic-cases-system.exe" 0 SW_SHOWNORMAL "" "تسجيل حالات عيادات العقاد التخصصية"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'schtasks.exe /Delete /F /TN "Clinic Cases Daily Backup 4AM"'
  nsExec::ExecToLog 'schtasks.exe /Delete /F /TN "Clinic Cases Backup CatchUp"'
  Delete "$DESKTOP\Clinic Cases System.lnk"
  Delete "$DESKTOP\تسجيل حالات عيادات العقاد التخصصية.lnk"
!macroend
