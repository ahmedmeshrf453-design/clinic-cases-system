!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\Clinic Cases System.lnk" "$INSTDIR\clinic-cases-system.exe" "" "$INSTDIR\clinic-cases-system.exe" 0 SW_SHOWNORMAL "" "Clinic Cases System"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$DESKTOP\Clinic Cases System.lnk"
!macroend
