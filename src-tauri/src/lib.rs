use base64::{engine::general_purpose, Engine as _};
use chrono::{Duration, Local, NaiveDate, NaiveTime, Timelike};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, process::Command};
use tauri::{Manager, State};
use uuid::Uuid;

struct AppState {
    db_path: PathBuf,
    backup_dir: PathBuf,
    export_dir: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCaseInput {
    full_name: String,
    phone: String,
    age: Option<i64>,
    gender: String,
    address: String,
    doctor: String,
    specialty: String,
    fee: String,
    visit_date: String,
    visit_time: String,
    complaint: String,
    diagnosis: String,
    notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatientQuery {
    search: String,
    archived_only: bool,
    limit: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePatientInput {
    id: String,
    full_name: String,
    phone: String,
    age: Option<i64>,
    gender: String,
    address: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterPatientInput {
    full_name: String,
    phone: String,
    age: Option<i64>,
    gender: String,
    address: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisterPatientResult {
    id: String,
    existed: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddVisitInput {
    patient_id: String,
    visit_type: String,
    booking_source: String,
    doctor: String,
    fee: String,
    clinic_amount: String,
    doctor_amount: String,
    status: String,
    visit_date: String,
    visit_time: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisitStatusInput {
    id: String,
    status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateVisitInput {
    id: String,
    visit_type: String,
    booking_source: String,
    doctor: String,
    fee: String,
    clinic_amount: String,
    doctor_amount: String,
    status: String,
    visit_date: String,
    visit_time: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingsInput {
    whatsapp_number: String,
    phone_number: String,
    operational_start_hour: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BlacklistInput {
    id: String,
    blacklisted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveInput {
    id: String,
    archived: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DoctorQuery {
    active_only: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DoctorInput {
    id: String,
    name: String,
    specialty: String,
    active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportQuery {
    from: String,
    to: String,
    doctor: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Patient {
    id: String,
    full_name: String,
    phone: String,
    age: Option<i64>,
    gender: String,
    address: String,
    archived: bool,
    blacklisted: bool,
    created_at: String,
    updated_at: String,
    doctor: String,
    specialty: String,
    last_visit_date: String,
    last_visit_time: String,
    complaint: String,
    visits_count: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Visit {
    id: String,
    patient_id: String,
    visit_date: String,
    visit_time: String,
    doctor: String,
    specialty: String,
    complaint: String,
    diagnosis: String,
    notes: String,
    fee: String,
    visit_type: String,
    status: String,
    booking_source: String,
    clinic_amount: String,
    doctor_amount: String,
    patient_name: String,
    patient_phone: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PatientDetails {
    patient: Patient,
    visits: Vec<Visit>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddPatientLabInput {
    patient_id: String,
    catalog_id: i64,
    test_name: String,
    price: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PatientLab {
    id: String,
    patient_id: String,
    catalog_id: i64,
    test_name: String,
    price: String,
    created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LabOrderInput {
    patient_id: String,
    discount_type: String,
    discount_value: String,
    paid_amount: String,
    order_date: String,
    order_time: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LabOrderQuery {
    from: String,
    to: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LabOrder {
    id: String,
    patient_id: String,
    patient_name: String,
    patient_phone: String,
    order_date: String,
    order_time: String,
    subtotal: String,
    discount_type: String,
    discount_value: String,
    discount_amount: String,
    net_total: String,
    paid_amount: String,
    remaining_amount: String,
    items_count: i64,
    created_at: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LabOrderItem {
    id: String,
    order_id: String,
    catalog_id: i64,
    test_name: String,
    price: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LabOrderDetails {
    order: LabOrder,
    items: Vec<LabOrderItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NursingOrderInput {
    patient_id: String,
    service_name: String,
    price: String,
    order_date: String,
    order_time: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NursingOrderQuery {
    from: String,
    to: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NursingOrder {
    id: String,
    patient_id: String,
    patient_name: String,
    patient_phone: String,
    service_name: String,
    price: String,
    order_date: String,
    order_time: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Doctor {
    id: String,
    name: String,
    specialty: String,
    active: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Stats {
    total_patients: i64,
    today_visits: i64,
    new_today: i64,
    total_visits: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupItem {
    name: String,
    path: String,
    modified: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveExportInput {
    file_name: String,
    base64_data: String,
    target_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportResult {
    total_visits: i64,
    unique_patients: i64,
    rows: Vec<Visit>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsInfo {
    whatsapp_number: String,
    phone_number: String,
    operational_start_hour: u32,
    backup_path: String,
    database_path: String,
    version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthCheck {
    integrity_ok: bool,
    integrity_message: String,
    foreign_key_issues: i64,
    database_size: u64,
    backup_count: usize,
    backup_writable: bool,
}

fn operational_day_date(start_hour: u32) -> NaiveDate {
    let now = Local::now();
    if now.hour() < start_hour {
        now.date_naive() - Duration::days(1)
    } else {
        now.date_naive()
    }
}

fn meta_value(conn: &Connection, key: &str, fallback: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT value FROM app_meta WHERE key=?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|v| v.unwrap_or_else(|| fallback.to_string()))
}

fn get_operational_start_hour(conn: &Connection) -> Result<u32, String> {
    let raw = meta_value(conn, "operational_start_hour", "11")?;
    Ok(raw.parse::<u32>().unwrap_or(11).min(23))
}

fn validate_patient_fields(
    full_name: &str,
    phone: &str,
    age: Option<i64>,
    address: &str,
) -> Result<(), String> {
    let name = full_name.trim();
    let phone = phone.trim();

    if name.is_empty() && phone.is_empty() {
        return Err("يجب إدخال اسم المريض أو رقم التليفون على الأقل".into());
    }
    if name.len() > 160 {
        return Err("اسم المريض أطول من المسموح".into());
    }
    if phone.len() > 40 {
        return Err("رقم التليفون أطول من المسموح".into());
    }
    if address.len() > 500 {
        return Err("العنوان أطول من المسموح".into());
    }
    if let Some(value) = age {
        if !(0..=130).contains(&value) {
            return Err("السن غير صالح".into());
        }
    }
    Ok(())
}

fn validate_money_field(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Ok(());
    }
    let amount = value
        .trim()
        .parse::<f64>()
        .map_err(|_| format!("{} غير صالح", label))?;
    if !amount.is_finite() || amount < 0.0 || amount > 1_000_000.0 {
        return Err(format!("{} غير صالح", label));
    }
    Ok(())
}

fn validate_visit_fields(
    visit_type: &str,
    doctor: &str,
    fee: &str,
    status: &str,
    visit_date: &str,
    visit_time: &str,
) -> Result<(), String> {
    let allowed_status = ["لم يحدد", "حضر", "لم يحضر", "ملغي", "مؤجل"];
    if !allowed_status.contains(&status.trim()) {
        return Err("حالة الزيارة غير صالحة".into());
    }

    let allowed_type = ["كشف جديد", "استشارة"];
    if !allowed_type.contains(&visit_type.trim()) {
        return Err("نوع الزيارة غير صالح".into());
    }

    if doctor.trim().len() > 160 {
        return Err("اسم الطبيب أطول من المسموح".into());
    }

    NaiveDate::parse_from_str(visit_date.trim(), "%Y-%m-%d")
        .map_err(|_| "تاريخ الزيارة غير صالح".to_string())?;

    if !visit_time.trim().is_empty() {
        NaiveTime::parse_from_str(visit_time.trim(), "%H:%M")
            .map_err(|_| "وقت الزيارة غير صالح".to_string())?;
    }

    if !fee.trim().is_empty() {
        let amount = fee
            .trim()
            .parse::<f64>()
            .map_err(|_| "سعر الكشف غير صالح".to_string())?;
        if !amount.is_finite() || amount < 0.0 || amount > 1_000_000.0 {
            return Err("سعر الكشف غير صالح".into());
        }
    }

    Ok(())
}

fn open_db(state: &AppState) -> Result<Connection, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA trusted_schema=OFF; PRAGMA secure_delete=ON; PRAGMA wal_autocheckpoint=1000;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn init_db(path: &PathBuf) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA trusted_schema=OFF; PRAGMA secure_delete=ON; PRAGMA wal_autocheckpoint=1000;")
        .map_err(|e| e.to_string())?;

    conn.execute_batch(
        r#"
      CREATE TABLE IF NOT EXISTS patients(
        id TEXT PRIMARY KEY, full_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
        age INTEGER, gender TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
        archived INTEGER NOT NULL DEFAULT 0, blacklisted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS visits(
        id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, visit_date TEXT NOT NULL DEFAULT '',
        visit_time TEXT NOT NULL DEFAULT '', doctor TEXT NOT NULL DEFAULT '',
        specialty TEXT NOT NULL DEFAULT '', fee TEXT NOT NULL DEFAULT '',
        visit_type TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'لم يحدد',
        booking_source TEXT NOT NULL DEFAULT 'عادي',
        clinic_amount TEXT NOT NULL DEFAULT '',
        doctor_amount TEXT NOT NULL DEFAULT '',
        complaint TEXT NOT NULL DEFAULT '',
        diagnosis TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY(patient_id) REFERENCES patients(id)
      );
      CREATE TABLE IF NOT EXISTS doctors(
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, specialty TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS patient_labs(
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        catalog_id INTEGER NOT NULL,
        test_name TEXT NOT NULL DEFAULT '',
        price TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE(patient_id,catalog_id),
        FOREIGN KEY(patient_id) REFERENCES patients(id)
      );
      CREATE TABLE IF NOT EXISTS lab_orders(
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        order_date TEXT NOT NULL DEFAULT '',
        order_time TEXT NOT NULL DEFAULT '',
        subtotal TEXT NOT NULL DEFAULT '0',
        discount_type TEXT NOT NULL DEFAULT 'none',
        discount_value TEXT NOT NULL DEFAULT '0',
        discount_amount TEXT NOT NULL DEFAULT '0',
        net_total TEXT NOT NULL DEFAULT '0',
        paid_amount TEXT NOT NULL DEFAULT '0',
        remaining_amount TEXT NOT NULL DEFAULT '0',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(patient_id) REFERENCES patients(id)
      );
      CREATE TABLE IF NOT EXISTS lab_order_items(
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        catalog_id INTEGER NOT NULL,
        test_name TEXT NOT NULL DEFAULT '',
        price TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(order_id) REFERENCES lab_orders(id)
      );
      CREATE TABLE IF NOT EXISTS nursing_orders(
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        service_name TEXT NOT NULL DEFAULT '',
        price TEXT NOT NULL DEFAULT '',
        order_date TEXT NOT NULL DEFAULT '',
        order_time TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(patient_id) REFERENCES patients(id)
      );
    "#,
    )
    .map_err(|e| e.to_string())?;

    // Upgrade old V3 databases: remove UNIQUE(phone) while preserving all IDs and visits.
    let schema: String = conn
        .query_row(
            "SELECT COALESCE(sql,'') FROM sqlite_master WHERE type='table' AND name='patients'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if schema.to_uppercase().contains("UNIQUE") {
        conn.execute_batch("PRAGMA wal_checkpoint(FULL); PRAGMA foreign_keys=OFF;")
            .map_err(|e| e.to_string())?;

        conn.execute_batch(r#"
          BEGIN IMMEDIATE;
          CREATE TABLE patients_v31(
            id TEXT PRIMARY KEY, full_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
            age INTEGER, gender TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
            archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          );
          INSERT INTO patients_v31(id,full_name,phone,age,gender,address,archived,created_at,updated_at)
            SELECT id,COALESCE(full_name,''),COALESCE(phone,''),age,COALESCE(gender,''),COALESCE(address,''),
                   archived,created_at,updated_at
            FROM patients;
          DROP TABLE patients;
          ALTER TABLE patients_v31 RENAME TO patients;
          COMMIT;
        "#).map_err(|e| e.to_string())?;

        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .map_err(|e| e.to_string())?;
    }

    // V3.4: add manual visit fee without losing existing visits.
    let has_fee: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('visits') WHERE name='fee'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if has_fee == 0 {
        conn.execute(
            "ALTER TABLE visits ADD COLUMN fee TEXT NOT NULL DEFAULT ''",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    let has_blacklisted: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('patients') WHERE name='blacklisted'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if has_blacklisted == 0 {
        conn.execute(
            "ALTER TABLE patients ADD COLUMN blacklisted INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    let has_visit_type: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('visits') WHERE name='visit_type'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if has_visit_type == 0 {
        conn.execute(
            "ALTER TABLE visits ADD COLUMN visit_type TEXT NOT NULL DEFAULT ''",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    let has_visit_status: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('visits') WHERE name='status'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if has_visit_status == 0 {
        conn.execute(
            "ALTER TABLE visits ADD COLUMN status TEXT NOT NULL DEFAULT 'لم يحدد'",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    let has_booking_source: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('visits') WHERE name='booking_source'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if has_booking_source == 0 {
        conn.execute(
            "ALTER TABLE visits ADD COLUMN booking_source TEXT NOT NULL DEFAULT 'عادي'",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    let has_clinic_amount: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('visits') WHERE name='clinic_amount'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if has_clinic_amount == 0 {
        conn.execute(
            "ALTER TABLE visits ADD COLUMN clinic_amount TEXT NOT NULL DEFAULT ''",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    let has_doctor_amount: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('visits') WHERE name='doctor_amount'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if has_doctor_amount == 0 {
        conn.execute(
            "ALTER TABLE visits ADD COLUMN doctor_amount TEXT NOT NULL DEFAULT ''",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute_batch(
        r#"
      CREATE INDEX IF NOT EXISTS idx_patients_phone
        ON patients(phone);
      CREATE INDEX IF NOT EXISTS idx_patients_archived_updated
        ON patients(archived, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_visits_patient_date_time
        ON visits(patient_id, visit_date DESC, visit_time DESC);
      CREATE INDEX IF NOT EXISTS idx_visits_date_time
        ON visits(visit_date DESC, visit_time DESC);
      CREATE INDEX IF NOT EXISTS idx_visits_doctor_date
        ON visits(doctor, visit_date DESC, visit_time DESC);
      CREATE INDEX IF NOT EXISTS idx_visits_status
        ON visits(status);
      CREATE INDEX IF NOT EXISTS idx_visits_booking_source
        ON visits(booking_source);
      CREATE INDEX IF NOT EXISTS idx_patient_labs_patient
        ON patient_labs(patient_id);
      CREATE INDEX IF NOT EXISTS idx_lab_orders_date_time
        ON lab_orders(order_date DESC,order_time DESC);
      CREATE INDEX IF NOT EXISTS idx_lab_orders_patient
        ON lab_orders(patient_id,order_date DESC,order_time DESC);
      CREATE INDEX IF NOT EXISTS idx_lab_order_items_order
        ON lab_order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_nursing_orders_date_time
        ON nursing_orders(order_date DESC,order_time DESC);
      CREATE INDEX IF NOT EXISTS idx_nursing_orders_patient
        ON nursing_orders(patient_id,order_date DESC,order_time DESC);
    "#,
    )
    .map_err(|e| e.to_string())?;

    // Seed the requested doctors once. Later edits/deletes remain untouched.
    conn.execute_batch(
        r#"
      CREATE TABLE IF NOT EXISTS app_meta(
        key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT ''
      );
    "#,
    )
    .map_err(|e| e.to_string())?;

    conn.execute_batch(
        r#"
      INSERT OR IGNORE INTO app_meta(key,value) VALUES('contact_whatsapp','01102233167');
      INSERT OR IGNORE INTO app_meta(key,value) VALUES('contact_phone','01107072134');
      INSERT OR IGNORE INTO app_meta(key,value) VALUES('operational_start_hour','11');
    "#,
    )
    .map_err(|e| e.to_string())?;

    let doctors_seeded: Option<String> = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key='doctors_seed_v1'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if doctors_seeded.is_none() {
        conn.execute_batch(r#"
          INSERT OR IGNORE INTO doctors(id,name,specialty,active,created_at,updated_at)
          VALUES
          ('akkad-doc-01','علوي عبد السلام','استشاري الباطنه والجهاز الهضمي',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-02','د.محمد عصام شلبي','استشاري الجراحة العامة و جراحات المناظير و الأورام و القدم السكري',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-03','امير خالد','اخصائي جراحة القدم السكري والاوعية الدموية',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-04','فاطمة شعبان','استشاري طب السمع والاتزان',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-05','ساره عماد','اخصائي التغذية العلاجية',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-06','رشا زمزم','اخصائي التغذية العلاجية',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-07','محمد عبد الوهاب','استشاري جراحة المسالك البولية وامراض الذكورة والعقم',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-08','حسام رشدي','استشاري جراحة المسالك البولية وامراض الذكورة والعقم',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-09','مصطفى الحسيني','اخصائي جراحة المسالك البولية وامراض الذكورة والعقم',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-10','نهال النبوي','اخصائي جراحة الانف والاذن والحنجرة',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-11','دعاء جمال','اخصائي النساء والتوليد',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-12','ساره الجيميلي','استشاري الجلدية',1,datetime('now','localtime'),datetime('now','localtime')),
          ('akkad-doc-13','محمد غازي','اخصائي جراحة العيون والمياه البيضاء والليزك',1,datetime('now','localtime'),datetime('now','localtime'));

          INSERT OR REPLACE INTO app_meta(key,value) VALUES('doctors_seed_v1','1');
        "#).map_err(|e| e.to_string())?;
    }

    conn.execute_batch(
        r#"
      CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
      CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name);
      CREATE INDEX IF NOT EXISTS idx_patients_archived ON patients(archived);
      CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id);
      CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);
      CREATE INDEX IF NOT EXISTS idx_visits_doctor ON visits(doctor);
    "#,
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn patient_select_sql() -> &'static str {
    r#"
    SELECT p.id,p.full_name,p.phone,p.age,p.gender,p.address,p.archived,p.created_at,p.updated_at,
      COALESCE((SELECT v.doctor FROM visits v WHERE v.patient_id=p.id ORDER BY v.visit_date DESC,v.visit_time DESC,v.created_at DESC LIMIT 1),''),
      COALESCE((SELECT v.specialty FROM visits v WHERE v.patient_id=p.id ORDER BY v.visit_date DESC,v.visit_time DESC,v.created_at DESC LIMIT 1),''),
      COALESCE((SELECT v.visit_date FROM visits v WHERE v.patient_id=p.id ORDER BY v.visit_date DESC,v.visit_time DESC,v.created_at DESC LIMIT 1),''),
      COALESCE((SELECT v.visit_time FROM visits v WHERE v.patient_id=p.id ORDER BY v.visit_date DESC,v.visit_time DESC,v.created_at DESC LIMIT 1),''),
      COALESCE((SELECT v.complaint FROM visits v WHERE v.patient_id=p.id ORDER BY v.visit_date DESC,v.visit_time DESC,v.created_at DESC LIMIT 1),''),
      (SELECT COUNT(*) FROM visits v WHERE v.patient_id=p.id),
      p.blacklisted
    FROM patients p
    "#
}

fn map_patient(row: &rusqlite::Row<'_>) -> rusqlite::Result<Patient> {
    Ok(Patient {
        id: row.get(0)?,
        full_name: row.get(1)?,
        phone: row.get(2)?,
        age: row.get(3)?,
        gender: row.get(4)?,
        address: row.get(5)?,
        archived: row.get::<_, i64>(6)? != 0,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        doctor: row.get(9)?,
        specialty: row.get(10)?,
        last_visit_date: row.get(11)?,
        last_visit_time: row.get(12)?,
        complaint: row.get(13)?,
        visits_count: row.get(14)?,
        blacklisted: row.get::<_, i64>(15)? != 0,
    })
}

fn map_visit(row: &rusqlite::Row<'_>) -> rusqlite::Result<Visit> {
    Ok(Visit {
        id: row.get(0)?,
        patient_id: row.get(1)?,
        visit_date: row.get(2)?,
        visit_time: row.get(3)?,
        doctor: row.get(4)?,
        specialty: row.get(5)?,
        complaint: row.get(6)?,
        diagnosis: row.get(7)?,
        notes: row.get(8)?,
        created_at: row.get(9)?,
        fee: row.get(10)?,
        visit_type: row.get(11)?,
        patient_name: row.get(12)?,
        patient_phone: row.get(13)?,
        status: row.get(14)?,
        booking_source: row.get(15)?,
        clinic_amount: row.get(16)?,
        doctor_amount: row.get(17)?,
    })
}

#[tauri::command]
fn save_case(state: State<AppState>, input: AddCaseInput) -> Result<String, String> {
    let mut conn = open_db(&state)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let phone = input.phone.trim().to_string();

    let existing: Option<String> = if phone.is_empty() {
        None
    } else {
        tx.query_row(
            "SELECT id FROM patients WHERE phone=?1 AND archived=0 LIMIT 1",
            params![phone],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
    };

    let patient_id = if let Some(id) = existing {
        tx.execute(
            "UPDATE patients SET full_name=?1,age=?2,gender=?3,address=?4,archived=0,updated_at=?5 WHERE id=?6",
            params![input.full_name.trim(),input.age,input.gender,input.address,now,id]
        ).map_err(|e| e.to_string())?;
        id
    } else {
        let id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO patients(id,full_name,phone,age,gender,address,archived,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,0,?7,?7)",
            params![id,input.full_name.trim(),phone,input.age,input.gender,input.address,now]
        ).map_err(|e| e.to_string())?;
        id
    };

    let visit_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO visits(id,patient_id,visit_date,visit_time,doctor,specialty,fee,complaint,diagnosis,notes,created_at,updated_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)",
        params![visit_id,patient_id,input.visit_date,input.visit_time,input.doctor,input.specialty,input.fee,input.complaint,input.diagnosis,input.notes,now]
    ).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(patient_id)
}

#[tauri::command]
fn register_patient(
    state: State<AppState>,
    input: RegisterPatientInput,
) -> Result<RegisterPatientResult, String> {
    let conn = open_db(&state)?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let phone = input.phone.trim().to_string();

    validate_patient_fields(
        input.full_name.trim(),
        &phone,
        input.age,
        input.address.trim(),
    )?;

    if !phone.is_empty() {
        let existing: Option<(String, i64)> = conn
            .query_row(
                "SELECT id,archived FROM patients WHERE phone=?1 ORDER BY updated_at DESC LIMIT 1",
                params![phone],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if let Some((id, archived)) = existing {
            if archived != 0 {
                conn.execute(
                    "UPDATE patients SET archived=0,updated_at=?1 WHERE id=?2",
                    params![now, id],
                )
                .map_err(|e| e.to_string())?;
            }
            return Ok(RegisterPatientResult { id, existed: true });
        }
    }

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO patients(id,full_name,phone,age,gender,address,archived,blacklisted,created_at,updated_at)
         VALUES(?1,?2,?3,?4,?5,?6,0,0,?7,?7)",
        params![
            id, input.full_name.trim(), phone, input.age,
            input.gender, input.address.trim(), now
        ]
    ).map_err(|e| e.to_string())?;

    Ok(RegisterPatientResult { id, existed: false })
}

#[tauri::command]
fn add_visit(state: State<AppState>, input: AddVisitInput) -> Result<String, String> {
    let allowed_source = ["فيزيتا", "اكشف", "كلينيدو", "عادي"];
    if !allowed_source.contains(&input.booking_source.trim()) {
        return Err("مصدر الحجز غير صالح".into());
    }

    validate_money_field(&input.clinic_amount, "مبلغ العيادات")?;
    validate_money_field(&input.doctor_amount, "مبلغ الطبيب")?;

    validate_visit_fields(
        input.visit_type.trim(),
        input.doctor.trim(),
        input.fee.trim(),
        input.status.trim(),
        input.visit_date.trim(),
        input.visit_time.trim(),
    )?;

    let mut conn = open_db(&state)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let exists: Option<String> = tx
        .query_row(
            "SELECT id FROM patients WHERE id=?1",
            params![input.patient_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if exists.is_none() {
        return Err("ملف المريض غير موجود".into());
    }

    let specialty: String = if input.doctor.trim().is_empty() {
        String::new()
    } else {
        tx.query_row(
            "SELECT specialty FROM doctors WHERE name=?1 LIMIT 1",
            params![input.doctor.trim()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_default()
    };

    let visit_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO visits(
           id,patient_id,visit_date,visit_time,doctor,specialty,fee,visit_type,status,booking_source,clinic_amount,doctor_amount,
           complaint,diagnosis,notes,created_at,updated_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'','','',?13,?13)",
        params![
            visit_id, input.patient_id, input.visit_date, input.visit_time,
            input.doctor.trim(), specialty, input.fee.trim(), input.visit_type.trim(),
            if input.status.trim().is_empty() { "لم يحدد" } else { input.status.trim() },
            input.booking_source.trim(),
            input.clinic_amount.trim(), input.doctor_amount.trim(),
            now
        ]
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE patients SET updated_at=?1 WHERE id=?2",
        params![now, input.patient_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(visit_id)
}

#[tauri::command]
fn get_visit(state: State<AppState>, id: String) -> Result<Visit, String> {
    let conn = open_db(&state)?;
    conn.query_row(
        "SELECT v.id,v.patient_id,v.visit_date,v.visit_time,v.doctor,v.specialty,
                v.complaint,v.diagnosis,v.notes,v.created_at,v.fee,v.visit_type,
                p.full_name,p.phone,v.status,v.booking_source,v.clinic_amount,v.doctor_amount
         FROM visits v
         JOIN patients p ON p.id=v.patient_id
         WHERE v.id=?1",
        params![id],
        map_visit,
    )
    .map_err(|_| "الزيارة غير موجودة".to_string())
}

#[tauri::command]
fn update_visit(state: State<AppState>, input: UpdateVisitInput) -> Result<(), String> {
    let allowed_source = ["فيزيتا", "اكشف", "كلينيدو", "عادي"];
    if !allowed_source.contains(&input.booking_source.trim()) {
        return Err("مصدر الحجز غير صالح".into());
    }

    validate_money_field(&input.clinic_amount, "مبلغ العيادات")?;
    validate_money_field(&input.doctor_amount, "مبلغ الطبيب")?;

    validate_visit_fields(
        input.visit_type.trim(),
        input.doctor.trim(),
        input.fee.trim(),
        input.status.trim(),
        input.visit_date.trim(),
        input.visit_time.trim(),
    )?;

    let mut conn = open_db(&state)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let patient_id: String = tx
        .query_row(
            "SELECT patient_id FROM visits WHERE id=?1",
            params![input.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "الزيارة غير موجودة".to_string())?;

    let specialty: String = if input.doctor.trim().is_empty() {
        String::new()
    } else {
        tx.query_row(
            "SELECT specialty FROM doctors WHERE name=?1 LIMIT 1",
            params![input.doctor.trim()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_default()
    };

    tx.execute(
        "UPDATE visits
         SET visit_date=?1,visit_time=?2,doctor=?3,specialty=?4,fee=?5,visit_type=?6,status=?7,booking_source=?8,clinic_amount=?9,doctor_amount=?10,updated_at=?11
         WHERE id=?12",
        params![
            input.visit_date.trim(), input.visit_time.trim(), input.doctor.trim(), specialty,
            input.fee.trim(), input.visit_type.trim(), input.status.trim(), input.booking_source.trim(),
            input.clinic_amount.trim(), input.doctor_amount.trim(), now, input.id
        ]
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE patients SET updated_at=?1 WHERE id=?2",
        params![now, patient_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_visit(state: State<AppState>, id: String) -> Result<(), String> {
    create_safety_backup(&state, "before-delete-visit")?;
    let mut conn = open_db(&state)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let patient_id: String = tx
        .query_row(
            "SELECT patient_id FROM visits WHERE id=?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "الزيارة غير موجودة".to_string())?;

    tx.execute("DELETE FROM visits WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE patients SET updated_at=?1 WHERE id=?2",
        params![now, patient_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_visit_status(state: State<AppState>, input: VisitStatusInput) -> Result<(), String> {
    let allowed = ["لم يحدد", "حضر", "لم يحضر", "ملغي", "مؤجل"];
    if !allowed.contains(&input.status.trim()) {
        return Err("حالة الزيارة غير صالحة".into());
    }

    let conn = open_db(&state)?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let changed = conn
        .execute(
            "UPDATE visits SET status=?1,updated_at=?2 WHERE id=?3",
            params![input.status.trim(), now, input.id],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err("الزيارة غير موجودة".into());
    }

    Ok(())
}

#[tauri::command]
fn set_patient_blacklisted(state: State<AppState>, input: BlacklistInput) -> Result<(), String> {
    let conn = open_db(&state)?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE patients SET blacklisted=?1,updated_at=?2 WHERE id=?3",
        params![if input.blacklisted { 1 } else { 0 }, now, input.id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_patient_labs(
    state: State<AppState>,
    patient_id: String,
) -> Result<Vec<PatientLab>, String> {
    let conn = open_db(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT id,patient_id,catalog_id,test_name,price,created_at
         FROM patient_labs
         WHERE patient_id=?1
         ORDER BY created_at DESC, rowid DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![patient_id], |row| {
            Ok(PatientLab {
                id: row.get(0)?,
                patient_id: row.get(1)?,
                catalog_id: row.get(2)?,
                test_name: row.get(3)?,
                price: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn add_patient_lab(
    state: State<AppState>,
    input: AddPatientLabInput,
) -> Result<PatientLab, String> {
    if input.catalog_id <= 0 || input.catalog_id > 334 {
        return Err("رقم التحليل غير صالح".into());
    }

    let test_name = input.test_name.trim();
    if test_name.is_empty() || test_name.len() > 300 {
        return Err("اسم التحليل غير صالح".into());
    }

    validate_money_field(input.price.trim(), "سعر التحليل")?;

    let conn = open_db(&state)?;
    let patient_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM patients WHERE id=?1",
            params![input.patient_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if patient_exists == 0 {
        return Err("ملف العميل غير موجود".into());
    }

    let id = Uuid::new_v4().to_string();
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO patient_labs(id,patient_id,catalog_id,test_name,price,created_at)
         VALUES(?1,?2,?3,?4,?5,?6)",
        params![
            id,
            input.patient_id,
            input.catalog_id,
            test_name,
            input.price.trim(),
            now
        ],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "التحليل مضاف بالفعل للعميل".to_string()
        } else {
            e.to_string()
        }
    })?;

    Ok(PatientLab {
        id,
        patient_id: input.patient_id,
        catalog_id: input.catalog_id,
        test_name: test_name.to_string(),
        price: input.price.trim().to_string(),
        created_at: now,
    })
}

#[tauri::command]
fn delete_patient_lab(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = open_db(&state)?;
    conn.execute("DELETE FROM patient_labs WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn parse_lab_money(value: &str, label: &str) -> Result<f64, String> {
    if value.trim().is_empty() {
        return Ok(0.0);
    }
    let amount = value
        .trim()
        .replace(',', ".")
        .parse::<f64>()
        .map_err(|_| format!("{} غير صالح", label))?;
    if !amount.is_finite() || amount < 0.0 || amount > 1_000_000.0 {
        return Err(format!("{} غير صالح", label));
    }
    Ok(amount)
}

fn map_lab_order(row: &rusqlite::Row<'_>) -> rusqlite::Result<LabOrder> {
    Ok(LabOrder {
        id: row.get(0)?,
        patient_id: row.get(1)?,
        patient_name: row.get(2)?,
        patient_phone: row.get(3)?,
        order_date: row.get(4)?,
        order_time: row.get(5)?,
        subtotal: row.get(6)?,
        discount_type: row.get(7)?,
        discount_value: row.get(8)?,
        discount_amount: row.get(9)?,
        net_total: row.get(10)?,
        paid_amount: row.get(11)?,
        remaining_amount: row.get(12)?,
        items_count: row.get(13)?,
        created_at: row.get(14)?,
    })
}

#[tauri::command]
fn finalize_lab_order(
    state: State<AppState>,
    input: LabOrderInput,
) -> Result<LabOrderDetails, String> {
    NaiveDate::parse_from_str(input.order_date.trim(), "%Y-%m-%d")
        .map_err(|_| "تاريخ حالة التحاليل غير صالح".to_string())?;
    if !input.order_time.trim().is_empty() {
        NaiveTime::parse_from_str(input.order_time.trim(), "%H:%M")
            .map_err(|_| "وقت حالة التحاليل غير صالح".to_string())?;
    }

    let discount_type = input.discount_type.trim();
    if !["none", "percent", "amount"].contains(&discount_type) {
        return Err("نوع الخصم غير صالح".into());
    }

    let mut conn = open_db(&state)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let patient: Option<(String, String)> = tx
        .query_row(
            "SELECT full_name,phone FROM patients WHERE id=?1 AND archived=0",
            params![input.patient_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let (patient_name, patient_phone) =
        patient.ok_or_else(|| "ملف المريض غير موجود".to_string())?;

    let mut stmt = tx
        .prepare(
            "SELECT catalog_id,test_name,price
             FROM patient_labs
             WHERE patient_id=?1
             ORDER BY created_at ASC,rowid ASC",
        )
        .map_err(|e| e.to_string())?;

    let raw_items = stmt
        .query_map(params![input.patient_id.clone()], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    if raw_items.is_empty() {
        return Err("أضف تحليل واحد على الأقل قبل الحفظ".into());
    }

    let mut subtotal = 0.0;
    for (_, _, price) in &raw_items {
        subtotal += parse_lab_money(price, "سعر التحليل")?;
    }

    let discount_value = parse_lab_money(&input.discount_value, "قيمة الخصم")?;
    let discount_amount = match discount_type {
        "percent" => {
            if discount_value > 100.0 {
                return Err("نسبة الخصم لا يمكن أن تتجاوز 100%".into());
            }
            subtotal * discount_value / 100.0
        }
        "amount" => {
            if discount_value > subtotal {
                return Err("قيمة الخصم أكبر من إجمالي التحاليل".into());
            }
            discount_value
        }
        _ => 0.0,
    };

    let net_total = (subtotal - discount_amount).max(0.0);
    let paid_amount = parse_lab_money(&input.paid_amount, "المبلغ المدفوع")?;
    if paid_amount > net_total + 0.001 {
        return Err("المبلغ المدفوع أكبر من الصافي بعد الخصم".into());
    }
    let remaining_amount = (net_total - paid_amount).max(0.0);

    let order_id = Uuid::new_v4().to_string();
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    tx.execute(
        "INSERT INTO lab_orders(
           id,patient_id,order_date,order_time,subtotal,discount_type,discount_value,
           discount_amount,net_total,paid_amount,remaining_amount,created_at,updated_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)",
        params![
            order_id,
            input.patient_id,
            input.order_date.trim(),
            input.order_time.trim(),
            format!("{:.2}", subtotal),
            discount_type,
            format!("{:.2}", discount_value),
            format!("{:.2}", discount_amount),
            format!("{:.2}", net_total),
            format!("{:.2}", paid_amount),
            format!("{:.2}", remaining_amount),
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for (catalog_id, test_name, price) in raw_items {
        let item_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO lab_order_items(id,order_id,catalog_id,test_name,price)
             VALUES(?1,?2,?3,?4,?5)",
            params![item_id, order_id, catalog_id, test_name, price],
        )
        .map_err(|e| e.to_string())?;

        items.push(LabOrderItem {
            id: item_id,
            order_id: order_id.clone(),
            catalog_id,
            test_name,
            price,
        });
    }

    tx.execute(
        "DELETE FROM patient_labs WHERE patient_id=?1",
        params![input.patient_id.clone()],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE patients SET updated_at=?1 WHERE id=?2",
        params![now, input.patient_id.clone()],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(LabOrderDetails {
        order: LabOrder {
            id: order_id,
            patient_id: input.patient_id,
            patient_name,
            patient_phone,
            order_date: input.order_date,
            order_time: input.order_time,
            subtotal: format!("{:.2}", subtotal),
            discount_type: discount_type.to_string(),
            discount_value: format!("{:.2}", discount_value),
            discount_amount: format!("{:.2}", discount_amount),
            net_total: format!("{:.2}", net_total),
            paid_amount: format!("{:.2}", paid_amount),
            remaining_amount: format!("{:.2}", remaining_amount),
            items_count: items.len() as i64,
            created_at: now,
        },
        items,
    })
}

#[tauri::command]
fn get_lab_order(state: State<AppState>, id: String) -> Result<LabOrderDetails, String> {
    let conn = open_db(&state)?;
    let order = conn
        .query_row(
            "SELECT o.id,o.patient_id,p.full_name,p.phone,o.order_date,o.order_time,o.subtotal,
                    o.discount_type,o.discount_value,o.discount_amount,o.net_total,o.paid_amount,
                    o.remaining_amount,(SELECT COUNT(*) FROM lab_order_items i WHERE i.order_id=o.id),
                    o.created_at
             FROM lab_orders o
             JOIN patients p ON p.id=o.patient_id
             WHERE o.id=?1",
            params![id],
            map_lab_order,
        )
        .map_err(|_| "حالة التحاليل غير موجودة".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id,order_id,catalog_id,test_name,price
             FROM lab_order_items
             WHERE order_id=?1
             ORDER BY rowid ASC",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(params![order.id.clone()], |r| {
            Ok(LabOrderItem {
                id: r.get(0)?,
                order_id: r.get(1)?,
                catalog_id: r.get(2)?,
                test_name: r.get(3)?,
                price: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(LabOrderDetails { order, items })
}

#[tauri::command]
fn list_lab_orders(
    state: State<AppState>,
    query: LabOrderQuery,
) -> Result<Vec<LabOrder>, String> {
    let conn = open_db(&state)?;

    let from_date = NaiveDate::parse_from_str(query.from.trim(), "%Y-%m-%d")
        .map_err(|_| "تاريخ البداية غير صالح".to_string())?;
    let to_date = NaiveDate::parse_from_str(query.to.trim(), "%Y-%m-%d")
        .map_err(|_| "تاريخ النهاية غير صالح".to_string())?;
    if to_date < from_date {
        return Err("تاريخ النهاية يجب أن يكون بعد أو مساويًا لتاريخ البداية".into());
    }

    let end_date = to_date + Duration::days(1);
    let from_s = from_date.format("%Y-%m-%d").to_string();
    let end_s = end_date.format("%Y-%m-%d").to_string();
    let start_hour = get_operational_start_hour(&conn)?;
    let boundary = format!("{:02}:00", start_hour);

    let mut stmt = conn
        .prepare(
            "SELECT o.id,o.patient_id,p.full_name,p.phone,o.order_date,o.order_time,o.subtotal,
                    o.discount_type,o.discount_value,o.discount_amount,o.net_total,o.paid_amount,
                    o.remaining_amount,(SELECT COUNT(*) FROM lab_order_items i WHERE i.order_id=o.id),
                    o.created_at
             FROM lab_orders o
             JOIN patients p ON p.id=o.patient_id
             WHERE p.archived=0
               AND (o.order_date > ?1 OR (o.order_date=?1 AND COALESCE(NULLIF(o.order_time,''),'00:00') >= ?3))
               AND (o.order_date < ?2 OR (o.order_date=?2 AND COALESCE(NULLIF(o.order_time,''),'00:00') < ?3))
             ORDER BY o.order_date DESC,o.order_time DESC,o.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![from_s, end_s, boundary], map_lab_order)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_patient_lab_orders(
    state: State<AppState>,
    patient_id: String,
) -> Result<Vec<LabOrder>, String> {
    let conn = open_db(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT o.id,o.patient_id,p.full_name,p.phone,o.order_date,o.order_time,o.subtotal,
                    o.discount_type,o.discount_value,o.discount_amount,o.net_total,o.paid_amount,
                    o.remaining_amount,(SELECT COUNT(*) FROM lab_order_items i WHERE i.order_id=o.id),
                    o.created_at
             FROM lab_orders o
             JOIN patients p ON p.id=o.patient_id
             WHERE o.patient_id=?1
             ORDER BY o.order_date DESC,o.order_time DESC,o.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![patient_id], map_lab_order)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn map_nursing_order(row: &rusqlite::Row<'_>) -> rusqlite::Result<NursingOrder> {
    Ok(NursingOrder {
        id: row.get(0)?,
        patient_id: row.get(1)?,
        patient_name: row.get(2)?,
        patient_phone: row.get(3)?,
        service_name: row.get(4)?,
        price: row.get(5)?,
        order_date: row.get(6)?,
        order_time: row.get(7)?,
        created_at: row.get(8)?,
    })
}

#[tauri::command]
fn add_nursing_order(
    state: State<AppState>,
    input: NursingOrderInput,
) -> Result<NursingOrder, String> {
    let service_name = input.service_name.trim();
    if service_name.is_empty() {
        return Err("نوع خدمة التمريض مطلوب".into());
    }
    if service_name.len() > 240 {
        return Err("نوع خدمة التمريض أطول من المسموح".into());
    }

    if input.price.trim().is_empty() {
        return Err("سعر خدمة التمريض مطلوب".into());
    }
    validate_money_field(input.price.trim(), "سعر خدمة التمريض")?;

    NaiveDate::parse_from_str(input.order_date.trim(), "%Y-%m-%d")
        .map_err(|_| "تاريخ خدمة التمريض غير صالح".to_string())?;
    if !input.order_time.trim().is_empty() {
        NaiveTime::parse_from_str(input.order_time.trim(), "%H:%M")
            .map_err(|_| "وقت خدمة التمريض غير صالح".to_string())?;
    }

    let mut conn = open_db(&state)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let patient: Option<(String, String)> = tx
        .query_row(
            "SELECT full_name,phone FROM patients WHERE id=?1 AND archived=0",
            params![input.patient_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let (patient_name, patient_phone) =
        patient.ok_or_else(|| "ملف المريض غير موجود".to_string())?;

    let id = Uuid::new_v4().to_string();
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    tx.execute(
        "INSERT INTO nursing_orders(
           id,patient_id,service_name,price,order_date,order_time,created_at,updated_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?7)",
        params![
            id,
            input.patient_id,
            service_name,
            input.price.trim(),
            input.order_date.trim(),
            input.order_time.trim(),
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE patients SET updated_at=?1 WHERE id=?2",
        params![now, input.patient_id.clone()],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(NursingOrder {
        id,
        patient_id: input.patient_id,
        patient_name,
        patient_phone,
        service_name: service_name.to_string(),
        price: input.price.trim().to_string(),
        order_date: input.order_date,
        order_time: input.order_time,
        created_at: now,
    })
}

#[tauri::command]
fn get_nursing_order(state: State<AppState>, id: String) -> Result<NursingOrder, String> {
    let conn = open_db(&state)?;
    conn.query_row(
        "SELECT n.id,n.patient_id,p.full_name,p.phone,n.service_name,n.price,n.order_date,n.order_time,n.created_at
         FROM nursing_orders n
         JOIN patients p ON p.id=n.patient_id
         WHERE n.id=?1",
        params![id],
        map_nursing_order,
    )
    .map_err(|_| "حالة خدمة التمريض غير موجودة".to_string())
}

#[tauri::command]
fn list_nursing_orders(
    state: State<AppState>,
    query: NursingOrderQuery,
) -> Result<Vec<NursingOrder>, String> {
    let conn = open_db(&state)?;

    let from_date = NaiveDate::parse_from_str(query.from.trim(), "%Y-%m-%d")
        .map_err(|_| "تاريخ البداية غير صالح".to_string())?;
    let to_date = NaiveDate::parse_from_str(query.to.trim(), "%Y-%m-%d")
        .map_err(|_| "تاريخ النهاية غير صالح".to_string())?;
    if to_date < from_date {
        return Err("تاريخ النهاية يجب أن يكون بعد أو مساويًا لتاريخ البداية".into());
    }

    let end_date = to_date + Duration::days(1);
    let from_s = from_date.format("%Y-%m-%d").to_string();
    let end_s = end_date.format("%Y-%m-%d").to_string();
    let start_hour = get_operational_start_hour(&conn)?;
    let boundary = format!("{:02}:00", start_hour);

    let mut stmt = conn
        .prepare(
            "SELECT n.id,n.patient_id,p.full_name,p.phone,n.service_name,n.price,n.order_date,n.order_time,n.created_at
             FROM nursing_orders n
             JOIN patients p ON p.id=n.patient_id
             WHERE p.archived=0
               AND (n.order_date > ?1 OR (n.order_date=?1 AND COALESCE(NULLIF(n.order_time,''),'00:00') >= ?3))
               AND (n.order_date < ?2 OR (n.order_date=?2 AND COALESCE(NULLIF(n.order_time,''),'00:00') < ?3))
             ORDER BY n.order_date DESC,n.order_time DESC,n.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![from_s, end_s, boundary], map_nursing_order)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_patient_nursing_orders(
    state: State<AppState>,
    patient_id: String,
) -> Result<Vec<NursingOrder>, String> {
    let conn = open_db(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT n.id,n.patient_id,p.full_name,p.phone,n.service_name,n.price,n.order_date,n.order_time,n.created_at
             FROM nursing_orders n
             JOIN patients p ON p.id=n.patient_id
             WHERE n.patient_id=?1
             ORDER BY n.order_date DESC,n.order_time DESC,n.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![patient_id], map_nursing_order)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_patient(state: State<AppState>, id: String) -> Result<(), String> {
    create_safety_backup(&state, "before-delete-patient")?;
    let mut conn = open_db(&state)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM nursing_orders WHERE patient_id=?1", params![id.clone()])
        .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM lab_order_items WHERE order_id IN (SELECT id FROM lab_orders WHERE patient_id=?1)",
        params![id.clone()],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM lab_orders WHERE patient_id=?1", params![id.clone()])
        .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM patient_labs WHERE patient_id=?1",
        params![id.clone()],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM visits WHERE patient_id=?1", params![id.clone()])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM patients WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_patients(state: State<AppState>, query: PatientQuery) -> Result<Vec<Patient>, String> {
    let conn = open_db(&state)?;
    let archived = if query.archived_only { 1 } else { 0 };
    let like = format!("%{}%", query.search.trim());
    let limit = query.limit.clamp(1, 5000);
    let sql = format!("{} WHERE p.archived=?1 AND (?2='%%' OR p.full_name LIKE ?2 OR p.phone LIKE ?2) ORDER BY p.updated_at DESC LIMIT ?3", patient_select_sql());
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![archived, like, limit], map_patient)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_patient_details(state: State<AppState>, id: String) -> Result<PatientDetails, String> {
    let conn = open_db(&state)?;
    let sql = format!("{} WHERE p.id=?1", patient_select_sql());
    let patient = conn
        .query_row(&sql, params![id], map_patient)
        .map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id,patient_id,visit_date,visit_time,doctor,specialty,complaint,diagnosis,notes,created_at,fee,visit_type,
                '' AS patient_name,'' AS patient_phone,status,booking_source,clinic_amount,doctor_amount
         FROM visits WHERE patient_id=?1 ORDER BY visit_date DESC,visit_time DESC,created_at DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![patient.id.clone()], map_visit)
        .map_err(|e| e.to_string())?;
    let visits = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(PatientDetails { patient, visits })
}

#[tauri::command]
fn update_patient(state: State<AppState>, input: UpdatePatientInput) -> Result<(), String> {
    validate_patient_fields(
        input.full_name.trim(),
        input.phone.trim(),
        input.age,
        input.address.trim(),
    )?;

    let conn = open_db(&state)?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE patients SET full_name=?1,phone=?2,age=?3,gender=?4,address=?5,updated_at=?6 WHERE id=?7",
        params![input.full_name.trim(),input.phone.trim(),input.age,input.gender,input.address,now,input.id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_patient_archived(state: State<AppState>, input: ArchiveInput) -> Result<(), String> {
    let conn = open_db(&state)?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE patients SET archived=?1,updated_at=?2 WHERE id=?3",
        params![if input.archived { 1 } else { 0 }, now, input.id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_stats(state: State<AppState>) -> Result<Stats, String> {
    let conn = open_db(&state)?;

    let start_hour = get_operational_start_hour(&conn)?;
    let day = operational_day_date(start_hour);
    let next_day = day + Duration::days(1);
    let day_s = day.format("%Y-%m-%d").to_string();
    let next_day_s = next_day.format("%Y-%m-%d").to_string();
    let boundary = format!("{:02}:00", start_hour);
    let start_ts = format!("{} {:02}:00:00", day_s, start_hour);
    let end_ts = format!("{} {:02}:00:00", next_day_s, start_hour);

    let total_patients: i64 = conn
        .query_row("SELECT COUNT(*) FROM patients WHERE archived=0", [], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;

    let today_visits: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM visits v
         JOIN patients p ON p.id=v.patient_id
         WHERE p.archived=0
           AND (v.visit_date > ?1 OR (v.visit_date=?1 AND COALESCE(NULLIF(v.visit_time,''),'00:00') >= ?3))
           AND (v.visit_date < ?2 OR (v.visit_date=?2 AND COALESCE(NULLIF(v.visit_time,''),'00:00') < ?3))",
        params![day_s, next_day_s, boundary],
        |r| r.get(0)
    ).map_err(|e|e.to_string())?;

    let today_lab_orders: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM lab_orders o
         JOIN patients p ON p.id=o.patient_id
         WHERE p.archived=0
           AND (o.order_date > ?1 OR (o.order_date=?1 AND COALESCE(NULLIF(o.order_time,''),'00:00') >= ?3))
           AND (o.order_date < ?2 OR (o.order_date=?2 AND COALESCE(NULLIF(o.order_time,''),'00:00') < ?3))",
        params![day_s, next_day_s, boundary],
        |r| r.get(0)
    ).map_err(|e|e.to_string())?;

    let today_nursing_orders: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM nursing_orders n
         JOIN patients p ON p.id=n.patient_id
         WHERE p.archived=0
           AND (n.order_date > ?1 OR (n.order_date=?1 AND COALESCE(NULLIF(n.order_time,''),'00:00') >= ?3))
           AND (n.order_date < ?2 OR (n.order_date=?2 AND COALESCE(NULLIF(n.order_time,''),'00:00') < ?3))",
        params![day_s, next_day_s, boundary],
        |r| r.get(0)
    ).map_err(|e|e.to_string())?;

    let new_today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM patients
         WHERE archived=0 AND created_at>=?1 AND created_at<?2",
            params![start_ts, end_ts],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let doctor_visits: i64 = conn
        .query_row("SELECT COUNT(*) FROM visits", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let total_lab_orders: i64 = conn
        .query_row("SELECT COUNT(*) FROM lab_orders", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let total_nursing_orders: i64 = conn
        .query_row("SELECT COUNT(*) FROM nursing_orders", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let total_visits = doctor_visits + total_lab_orders + total_nursing_orders;

    Ok(Stats {
        total_patients,
        today_visits: today_visits + today_lab_orders + today_nursing_orders,
        new_today,
        total_visits,
    })
}

#[tauri::command]
fn list_doctors(state: State<AppState>, query: DoctorQuery) -> Result<Vec<Doctor>, String> {
    let conn = open_db(&state)?;
    let sql = if query.active_only {
        "SELECT id,name,specialty,active FROM doctors WHERE active=1 ORDER BY name"
    } else {
        "SELECT id,name,specialty,active FROM doctors ORDER BY active DESC,name"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Doctor {
                id: r.get(0)?,
                name: r.get(1)?,
                specialty: r.get(2)?,
                active: r.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_doctor(state: State<AppState>, input: DoctorInput) -> Result<String, String> {
    if input.name.trim().is_empty() {
        return Err("اسم الطبيب مطلوب".into());
    }
    let conn = open_db(&state)?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let id = if input.id.trim().is_empty() {
        Uuid::new_v4().to_string()
    } else {
        input.id
    };
    conn.execute(
        "INSERT INTO doctors(id,name,specialty,active,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name,specialty=excluded.specialty,active=excluded.active,updated_at=excluded.updated_at",
        params![id,input.name.trim(),input.specialty,if input.active{1}else{0},now]
    ).map_err(|e| if e.to_string().contains("UNIQUE"){"يوجد طبيب بنفس الاسم".into()}else{e.to_string()})?;
    Ok(id)
}

#[tauri::command]
fn delete_doctor(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = open_db(&state)?;
    conn.execute("DELETE FROM doctors WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn run_report(state: State<AppState>, query: ReportQuery) -> Result<ReportResult, String> {
    let conn = open_db(&state)?;

    let from_date = NaiveDate::parse_from_str(query.from.trim(), "%Y-%m-%d")
        .map_err(|_| "تاريخ البداية غير صالح".to_string())?;
    let to_date = NaiveDate::parse_from_str(query.to.trim(), "%Y-%m-%d")
        .map_err(|_| "تاريخ النهاية غير صالح".to_string())?;

    if to_date < from_date {
        return Err("تاريخ النهاية يجب أن يكون بعد أو مساويًا لتاريخ البداية".into());
    }

    let end_date = to_date + Duration::days(1);
    let from_s = from_date.format("%Y-%m-%d").to_string();
    let end_s = end_date.format("%Y-%m-%d").to_string();

    let doctor_like = if query.doctor.trim().is_empty() {
        "%".to_string()
    } else {
        query.doctor.trim().to_string()
    };
    let start_hour = get_operational_start_hour(&conn)?;
    let boundary = format!("{:02}:00", start_hour);

    let mut stmt=conn.prepare(
        "SELECT v.id,v.patient_id,v.visit_date,v.visit_time,v.doctor,v.specialty,v.complaint,v.diagnosis,v.notes,v.created_at,v.fee,v.visit_type,
                p.full_name,p.phone,v.status,v.booking_source,v.clinic_amount,v.doctor_amount
         FROM visits v JOIN patients p ON p.id=v.patient_id
         WHERE p.archived=0
           AND (v.visit_date > ?1 OR (v.visit_date=?1 AND COALESCE(NULLIF(v.visit_time,''),'00:00') >= ?4))
           AND (v.visit_date < ?2 OR (v.visit_date=?2 AND COALESCE(NULLIF(v.visit_time,''),'00:00') < ?4))
           AND (?3='%' OR v.doctor=?3)
         ORDER BY v.visit_date DESC,v.visit_time DESC"
    ).map_err(|e|e.to_string())?;

    let rows_iter = stmt
        .query_map(params![from_s, end_s, doctor_like, boundary], map_visit)
        .map_err(|e| e.to_string())?;
    let rows = rows_iter
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let total_visits = rows.len() as i64;

    let mut ids = std::collections::HashSet::new();
    for v in &rows {
        ids.insert(v.patient_id.clone());
    }

    Ok(ReportResult {
        total_visits,
        unique_patients: ids.len() as i64,
        rows,
    })
}

fn backup_item(path: &PathBuf) -> Result<BackupItem, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default();
    Ok(BackupItem {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path: path.to_string_lossy().to_string(),
        modified,
        size: meta.len(),
    })
}

fn checkpoint_and_copy(state: &AppState, target: &PathBuf) -> Result<(), String> {
    let conn = open_db(state)?;
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
        .map_err(|e| e.to_string())?;
    drop(conn);
    fs::copy(&state.db_path, target).map_err(|e| e.to_string())?;
    Ok(())
}

fn create_safety_backup(state: &AppState, prefix: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(&state.backup_dir).map_err(|e| e.to_string())?;
    let stamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let target = state.backup_dir.join(format!("{}-{}.db", prefix, stamp));
    checkpoint_and_copy(state, &target)?;
    Ok(target)
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<SettingsInfo, String> {
    let conn = open_db(&state)?;

    Ok(SettingsInfo {
        whatsapp_number: meta_value(&conn, "contact_whatsapp", "01102233167")?,
        phone_number: meta_value(&conn, "contact_phone", "01107072134")?,
        operational_start_hour: get_operational_start_hour(&conn)?,
        backup_path: state.backup_dir.to_string_lossy().to_string(),
        database_path: state.db_path.to_string_lossy().to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
fn save_settings(state: State<AppState>, input: SettingsInput) -> Result<SettingsInfo, String> {
    if input.operational_start_hour > 23 {
        return Err("ساعة بداية اليوم غير صالحة".into());
    }

    fn valid_contact(value: &str) -> bool {
        let v = value.trim();
        !v.is_empty()
            && v.len() <= 32
            && v.chars()
                .all(|c| c.is_ascii_digit() || matches!(c, '+' | '-' | ' ' | '(' | ')'))
    }

    if !valid_contact(&input.whatsapp_number) || !valid_contact(&input.phone_number) {
        return Err("رقم التواصل غير صالح".into());
    }

    let mut conn = open_db(&state)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (key, value) in [
        ("contact_whatsapp", input.whatsapp_number.trim().to_string()),
        ("contact_phone", input.phone_number.trim().to_string()),
        (
            "operational_start_hour",
            input.operational_start_hour.to_string(),
        ),
    ] {
        tx.execute(
            "INSERT INTO app_meta(key,value) VALUES(?1,?2)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);

    get_settings(state)
}

#[tauri::command]
fn health_check(state: State<AppState>) -> Result<HealthCheck, String> {
    let conn = open_db(&state)?;

    let integrity_message: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let integrity_ok = integrity_message.eq_ignore_ascii_case("ok");

    let mut fk_stmt = conn
        .prepare("PRAGMA foreign_key_check")
        .map_err(|e| e.to_string())?;
    let fk_rows = fk_stmt
        .query_map([], |_| Ok(()))
        .map_err(|e| e.to_string())?;
    let mut foreign_key_issues = 0i64;
    for row in fk_rows {
        row.map_err(|e| e.to_string())?;
        foreign_key_issues += 1;
    }

    let database_size = fs::metadata(&state.db_path).map(|m| m.len()).unwrap_or(0);

    fs::create_dir_all(&state.backup_dir).map_err(|e| e.to_string())?;
    let backup_count = fs::read_dir(&state.backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|x| x.to_str()) == Some("db"))
        .count();

    let probe = state.backup_dir.join(".clinic-write-test.tmp");
    let backup_writable = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(&probe);

    Ok(HealthCheck {
        integrity_ok,
        integrity_message,
        foreign_key_issues,
        database_size,
        backup_count,
        backup_writable,
    })
}

#[tauri::command]
fn create_backup(state: State<AppState>) -> Result<BackupItem, String> {
    fs::create_dir_all(&state.backup_dir).map_err(|e| e.to_string())?;
    let stamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let target = state
        .backup_dir
        .join(format!("clinic-cases-backup-{}.db", stamp));
    checkpoint_and_copy(&state, &target)?;
    backup_item(&target)
}

#[tauri::command]
fn list_backups(state: State<AppState>) -> Result<Vec<BackupItem>, String> {
    fs::create_dir_all(&state.backup_dir).map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for e in fs::read_dir(&state.backup_dir).map_err(|e| e.to_string())? {
        let p = e.map_err(|e| e.to_string())?.path();
        if p.extension().and_then(|x| x.to_str()) == Some("db") {
            if let Ok(i) = backup_item(&p) {
                items.push(i);
            }
        }
    }
    items.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(items)
}

#[tauri::command]
fn restore_backup(state: State<AppState>, path: String) -> Result<(), String> {
    let backup_root = fs::canonicalize(&state.backup_dir)
        .map_err(|_| "تعذر الوصول إلى مجلد النسخ الاحتياطية".to_string())?;

    let source =
        fs::canonicalize(PathBuf::from(path)).map_err(|_| "ملف النسخة غير موجود".to_string())?;

    if !source.starts_with(&backup_root) {
        return Err("لأسباب الأمان يمكن استعادة النسخ الموجودة داخل مجلد النسخ الاحتياطية فقط".into());
    }

    if source
        .extension()
        .and_then(|x| x.to_str())
        .map(|x| x.eq_ignore_ascii_case("db"))
        != Some(true)
    {
        return Err("امتداد ملف النسخة غير صالح".into());
    }

    let test = Connection::open(&source).map_err(|_| "ملف النسخة غير صالح".to_string())?;

    let quick_check: String = test
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|_| "تعذر فحص سلامة النسخة".to_string())?;

    if !quick_check.eq_ignore_ascii_case("ok") {
        return Err("النسخة الاحتياطية تالفة ولا يمكن استعادتها".into());
    }

    for required_table in ["patients", "visits"] {
        let exists: Option<String> = test
            .query_row(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?1",
                params![required_table],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if exists.is_none() {
            return Err("الملف ليس نسخة صالحة للنظام".into());
        }
    }

    drop(test);

    let safety = state.backup_dir.join(format!(
        "before-restore-{}.db",
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    ));
    checkpoint_and_copy(&state, &safety)?;

    let wal = PathBuf::from(format!("{}-wal", state.db_path.to_string_lossy()));
    let shm = PathBuf::from(format!("{}-shm", state.db_path.to_string_lossy()));
    let _ = fs::remove_file(&wal);
    let _ = fs::remove_file(&shm);

    fs::copy(&source, &state.db_path).map_err(|e| e.to_string())?;
    init_db(&state.db_path)?;
    Ok(())
}

#[tauri::command]
fn save_export(_state: State<AppState>, input: SaveExportInput) -> Result<String, String> {
    const MAX_EXPORT_BYTES: usize = 30 * 1024 * 1024;
    const MAX_BASE64_CHARS: usize = 42 * 1024 * 1024;

    if input.target_path.trim().is_empty() {
        return Err("لم يتم اختيار مكان للحفظ".into());
    }

    if input.base64_data.len() > MAX_BASE64_CHARS {
        return Err("حجم الملف أكبر من الحد المسموح".into());
    }

    let intended_path = PathBuf::from(input.file_name.trim());
    let intended_ext = intended_path
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if intended_ext != "pdf" && intended_ext != "png" {
        return Err("نوع الملف غير مسموح".into());
    }

    let target = PathBuf::from(input.target_path.trim());

    if target.file_name().is_none() {
        return Err("مسار الحفظ غير صالح".into());
    }

    let target_ext = target
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if target_ext != intended_ext {
        return Err("امتداد الملف لا يطابق نوع الملف الذي يتم حفظه".into());
    }

    let parent = target
        .parent()
        .ok_or_else(|| "مسار الحفظ غير صالح".to_string())?;

    if !parent.exists() || !parent.is_dir() {
        return Err("المجلد المختار غير موجود".into());
    }

    let bytes = general_purpose::STANDARD
        .decode(input.base64_data.trim())
        .map_err(|_| "بيانات الملف غير صالحة".to_string())?;

    if bytes.is_empty() || bytes.len() > MAX_EXPORT_BYTES {
        return Err("حجم الملف غير صالح".into());
    }

    let signature_ok = match intended_ext.as_str() {
        "pdf" => bytes.starts_with(b"%PDF-"),
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
        _ => false,
    };

    if !signature_ok {
        return Err("محتوى الملف لا يطابق نوعه".into());
    }

    fs::write(&target, &bytes).map_err(|e| format!("تعذر حفظ الملف: {}", e))?;

    let select_arg = format!("/select,{}", target.to_string_lossy());
    let _ = Command::new("explorer.exe").arg(select_arg).spawn();

    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn open_export_folder(state: State<AppState>) -> Result<(), String> {
    fs::create_dir_all(&state.export_dir).map_err(|e| e.to_string())?;
    Command::new("explorer.exe")
        .arg(&state.export_dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_backup_folder(state: State<AppState>) -> Result<(), String> {
    fs::create_dir_all(&state.backup_dir).map_err(|e| e.to_string())?;
    Command::new("explorer.exe")
        .arg(&state.backup_dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

const DAILY_BACKUP_TASK: &str = "Clinic Cases Daily Backup 4AM";
const CATCHUP_BACKUP_TASK: &str = "Clinic Cases Backup CatchUp";

fn run_hidden_command(program: &str, args: &[String]) -> Result<(), String> {
    let mut cmd = Command::new(program);
    cmd.args(args);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let status = cmd.status().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{} exited with status {}", program, status))
    }
}

fn ensure_backup_tasks() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let action = format!("\\\"{}\\\" --backup-only", exe.to_string_lossy());

    let daily_args = vec![
        "/Create".to_string(),
        "/F".to_string(),
        "/SC".to_string(),
        "DAILY".to_string(),
        "/ST".to_string(),
        "04:00".to_string(),
        "/RL".to_string(),
        "LIMITED".to_string(),
        "/TN".to_string(),
        DAILY_BACKUP_TASK.to_string(),
        "/TR".to_string(),
        action.clone(),
    ];
    run_hidden_command("schtasks.exe", &daily_args)?;

    let catchup_args = vec![
        "/Create".to_string(),
        "/F".to_string(),
        "/SC".to_string(),
        "ONLOGON".to_string(),
        "/RL".to_string(),
        "LIMITED".to_string(),
        "/TN".to_string(),
        CATCHUP_BACKUP_TASK.to_string(),
        "/TR".to_string(),
        action,
    ];
    run_hidden_command("schtasks.exe", &catchup_args)?;

    Ok(())
}

fn automatic_backup_due(state: &AppState) -> Result<bool, String> {
    let now = Local::now();

    if now.hour() < 4 {
        return Ok(false);
    }

    let daily = state
        .backup_dir
        .join(format!("clinic-cases-auto-{}.db", now.format("%Y-%m-%d")));

    if daily.exists() {
        return Ok(false);
    }

    checkpoint_and_copy(state, &daily)?;
    Ok(true)
}

pub fn run() {
    let backup_only = std::env::args().any(|arg| arg == "--backup-only");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("clinic-cases.db");
            init_db(&db_path).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            let documents_dir = app
                .path()
                .document_dir()
                .unwrap_or_else(|_| data_dir.clone());

            let backup_dir = documents_dir.join("Clinic Cases Backups");
            fs::create_dir_all(&backup_dir)?;

            let downloads_dir = app
                .path()
                .download_dir()
                .unwrap_or_else(|_| documents_dir.clone());
            let export_dir = downloads_dir.join("تسجيل حالات عيادات العقاد");
            fs::create_dir_all(&export_dir)?;

            let state = AppState {
                db_path,
                backup_dir,
                export_dir,
            };

            if backup_only {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }

                let _ = automatic_backup_due(&state);

                // Tauri 2: exit through AppHandle, not App.
                app.handle().exit(0);
                return Ok(());
            }

            // Windows schedules the real daily 04:00 backup using local system time.
            let _ = ensure_backup_tasks();

            // Catch-up if Windows/device missed 04:00.
            let _ = automatic_backup_due(&state);

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            register_patient,
            add_visit,
            get_visit,
            update_visit,
            delete_visit,
            list_patient_labs,
            add_patient_lab,
            delete_patient_lab,
            finalize_lab_order,
            get_lab_order,
            list_lab_orders,
            list_patient_lab_orders,
            add_nursing_order,
            get_nursing_order,
            list_nursing_orders,
            list_patient_nursing_orders,
            list_patients,
            get_patient_details,
            update_patient,
            set_patient_archived,
            set_patient_blacklisted,
            set_visit_status,
            delete_patient,
            get_stats,
            list_doctors,
            save_doctor,
            delete_doctor,
            run_report,
            get_settings,
            save_settings,
            health_check,
            create_backup,
            list_backups,
            restore_backup,
            open_backup_folder,
            save_export,
            open_export_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Clinic Cases System");
}

#[cfg(test)]
mod production_tests {
    use super::*;

    fn test_db_path(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("clinic-cases-{}-{}.db", label, Uuid::new_v4()))
    }

    fn cleanup(path: &PathBuf) {
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(PathBuf::from(format!("{}-wal", path.to_string_lossy())));
        let _ = fs::remove_file(PathBuf::from(format!("{}-shm", path.to_string_lossy())));
    }

    #[test]
    fn init_db_creates_required_schema_and_indexes() {
        let path = test_db_path("schema");
        init_db(&path).expect("init_db failed");

        let conn = Connection::open(&path).expect("open failed");

        for table in ["patients", "visits", "doctors", "patient_labs", "lab_orders", "lab_order_items", "nursing_orders", "app_meta"] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    params![table],
                    |row| row.get(0),
                )
                .expect("table query failed");
            assert_eq!(count, 1, "missing table: {}", table);
        }

        for index in [
            "idx_patients_phone",
            "idx_patients_archived_updated",
            "idx_visits_patient_date_time",
            "idx_visits_date_time",
            "idx_visits_doctor_date",
            "idx_visits_status",
            "idx_patient_labs_patient",
            "idx_lab_orders_date_time",
            "idx_lab_orders_patient",
            "idx_lab_order_items_order",
            "idx_nursing_orders_date_time",
            "idx_nursing_orders_patient",
        ] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?1",
                    params![index],
                    |row| row.get(0),
                )
                .expect("index query failed");
            assert_eq!(count, 1, "missing index: {}", index);
        }

        let has_status: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('visits') WHERE name='status'",
                [],
                |row| row.get(0),
            )
            .expect("status query failed");
        assert_eq!(has_status, 1);

        drop(conn);
        cleanup(&path);
    }

    #[test]
    fn patient_validation_rejects_empty_identity() {
        assert!(validate_patient_fields("", "", None, "").is_err());
        assert!(validate_patient_fields("مريض", "", Some(30), "").is_ok());
        assert!(validate_patient_fields("", "01000000000", Some(30), "").is_ok());
    }

    #[test]
    fn visit_validation_rejects_bad_values() {
        assert!(
            validate_visit_fields("كشف جديد", "طبيب", "300", "حضر", "2026-09-28", "13:30").is_ok()
        );

        assert!(
            validate_visit_fields("نوع غير صالح", "طبيب", "300", "حضر", "2026-09-28", "13:30")
                .is_err()
        );

        assert!(
            validate_visit_fields("كشف جديد", "طبيب", "-1", "حضر", "2026-09-28", "13:30").is_err()
        );

        assert!(
            validate_visit_fields("كشف جديد", "طبيب", "300", "حضر", "bad-date", "13:30").is_err()
        );
    }
}
