# Clinic Cases System — Single-operator production hardening

Scope: one local Windows operator. NO extra accounts, access roles, online login, or patient-data upload.

## Changes tested in GitHub Actions

- Archive precisely 13 old workflow definitions that were failing before jobs started. Files remain available under `.github/workflow-archive/2026-10-14-invalid-push-workflows/` for rollback.
- Separate the existing patient-print CSS into `src/patientPrint.css` without changing its contents or ordering.
- Verify print exports retain the clinic name, slogan, address, WhatsApp and phone labels, and hide the creation event only within the exported document.
- Add a Rust unit test using **synthetic data in temporary folders** to checkpoint SQLite, package the DB in a ZIP, restore it into a different folder, verify row equality/integrity, and reject a corrupted ZIP without modifying data.
- Run npm frontend build, all Rust unit tests, Windows NSIS build; publish the installer only after all pass.

## Human acceptance checks before using real patient data

1. Close the Windows app on the old computer. Use a TEST database and make a ZIP full backup, including one sample attachment. Copy it to a DIFFERENT Windows computer by USB or other controlled storage.
2. Install this exact Windows EXE on the second computer. Use its supported ZIP restore process and confirm the sample patient, visit, attachment, PIN recovery and report match. Keep original backup untouched.
3. Print/export one sample patient to PNG and PDF and inspect for clinic header/address clarity, no creation-folder row, no overlap or clipping over multiple pages.
4. Restart the program, verify the locked single-operator PIN unlock, patient lookup and the clinic logo wallpaper/UI.
5. Confirm automatic backup task, manual full backup, free disk space and restore-point availability.

The GitHub runner cannot prove print appearance on your display nor complete a physical second-PC transfer. Do not label the system production-certified until these checks pass.

## Rollback

Keep the previous working installer. Revert the hardening commit (or restore archived workflows as needed), and do not replace your real local database when rolling back code. No patient records are stored in this repository or GitHub Actions artifacts.
