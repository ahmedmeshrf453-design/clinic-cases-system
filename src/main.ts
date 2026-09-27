import { invoke } from '@tauri-apps/api/core';
import './style.css';

type Patient = {
  id: string;
  fullName: string;
  phone: string;
  age: number | null;
  gender: string;
  address: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  doctor: string;
  specialty: string;
  lastVisitDate: string;
  lastVisitTime: string;
  complaint: string;
  visitsCount: number;
};

type Visit = {
  id: string;
  patientId: string;
  visitDate: string;
  visitTime: string;
  doctor: string;
  specialty: string;
  complaint: string;
  diagnosis: string;
  notes: string;
  fee: string;
  createdAt: string;
};

type PatientDetails = { patient: Patient; visits: Visit[] };

type Doctor = {
  id: string;
  name: string;
  specialty: string;
  active: boolean;
};

type Stats = {
  totalPatients: number;
  todayVisits: number;
  newToday: number;
  totalVisits: number;
};

type BackupItem = {
  name: string;
  path: string;
  modified: string;
  size: number;
};

type ReportResult = {
  totalVisits: number;
  uniquePatients: number;
  rows: Visit[];
};

type Screen = 'dashboard' | 'patients' | 'today' | 'doctors' | 'reports' | 'archive' | 'backups';

const app = document.querySelector<HTMLDivElement>('#app')!;
let screen: Screen = 'dashboard';
let doctors: Doctor[] = [];
let refreshTimer: number | undefined;

function esc(v: unknown) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]!));
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function timeNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function displayDate(v: string) {
  if (!v) return '—';
  const [y,m,d] = v.split('-');
  return y && m && d ? `${d}/${m}/${y}` : v;
}

function navButton(id: Screen, icon: string, label: string) {
  return `<button class="nav ${screen===id?'active':''}" data-screen="${id}">
    <span class="nav-icon">${icon}</span><span>${label}</span>
  </button>`;
}

async function loadDoctors() {
  doctors = await invoke<Doctor[]>('list_doctors', { query: { activeOnly: false } });
}

function shell(content: string, title: string, subtitle: string) {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">AK</div>
          <div>
            <strong>نظام الحالات</strong>
            <small>عيادات العقاد التخصصية</small>
          </div>
        </div>

        <nav>
          ${navButton('dashboard','⌂','الرئيسية')}
          ${navButton('patients','◉','المرضى')}
          ${navButton('today','◷','زيارات اليوم')}
          ${navButton('doctors','⚕','الأطباء')}
          ${navButton('reports','▤','التقارير')}
          ${navButton('archive','▣','الأرشيف')}
          ${navButton('backups','⟳','النسخ الاحتياطية')}
        </nav>

        <div class="sidebar-footer">
          <span class="online-dot"></span>
          يعمل أوفلاين بالكامل
          <small>SQLite محلي على هذا الكمبيوتر</small>
        </div>
      </aside>

      <main class="main">
        <section class="clinic-header">
          <div class="clinic-identity">
            <img class="clinic-logo" src="/clinic-logo-header.jpg" alt="لوجو عيادات العقاد التخصصية" />
            <div class="clinic-copy">
              <strong class="clinic-name">عيادات العقاد التخصصية</strong>
              <span class="clinic-slogan">رعاية تليق بك</span>
            </div>
          </div>

          <div class="system-meta">
            <div class="connection-panel">
              <div class="connection-badge" id="connectionBadge">
                <span class="connection-dot"></span>
                <strong id="connectionText">فحص الاتصال...</strong>
              </div>
              <small>النظام يعمل محليًا على هذا الجهاز</small>
            </div>

            <div class="live-clock-panel">
              <div class="clock-main" id="clockTime">--:--:--</div>
              <div class="clock-date" id="clockDate"></div>
              <div class="clock-day" id="clockDay"></div>
              <div class="clock-zone" id="clockZone"></div>
            </div>
          </div>
        </section>

        <div class="clinic-divider"></div>

        <header class="topbar page-topbar">
          <div>
            <h1>${title}</h1>
            <p>${subtitle}</p>
          </div>
          <div class="top-actions">
            <button class="btn primary" id="globalNewCase">＋ تسجيل حالة</button>
          </div>
        </header>

        <section id="screenContent">${content}</section>
      </main>
    </div>

    <div id="modalRoot"></div>
    <div id="toastRoot"></div>
  `;

  document.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach(btn => {
    btn.onclick = () => navigate(btn.dataset.screen as Screen);
  });

  document.querySelector<HTMLButtonElement>('#globalNewCase')!.onclick = () => openCaseModal();

  window.ononline = updateConnectionStatus;
  window.onoffline = updateConnectionStatus;

  updateClock();
  updateConnectionStatus();

  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(() => {
    updateClock();
    updateConnectionStatus();
  }, 1000);
}

function timezoneOffsetLabel(d: Date) {
  const minutes = -d.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

function updateClock() {
  const d = new Date();

  const t = document.querySelector<HTMLElement>('#clockTime');
  const dt = document.querySelector<HTMLElement>('#clockDate');
  const day = document.querySelector<HTMLElement>('#clockDay');
  const zone = document.querySelector<HTMLElement>('#clockZone');

  if (t) {
    t.textContent = d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  if (dt) {
    dt.textContent = d.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  if (day) {
    day.textContent = d.toLocaleDateString('ar-EG', {
      weekday: 'long'
    });
  }

  if (zone) {
    const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Windows';
    zone.textContent = `Windows Sync • ${systemZone} • ${timezoneOffsetLabel(d)}`;
  }
}

function updateConnectionStatus() {
  const badge = document.querySelector<HTMLElement>('#connectionBadge');
  const text = document.querySelector<HTMLElement>('#connectionText');

  if (!badge || !text) return;

  if (navigator.onLine) {
    badge.classList.remove('offline');
    badge.classList.add('online');
    text.textContent = 'الجهاز متصل';
  } else {
    badge.classList.remove('online');
    badge.classList.add('offline');
    text.textContent = 'الجهاز غير متصل';
  }
}

function toast(message: string, type: 'ok'|'error'='ok') {
  const root = document.querySelector<HTMLDivElement>('#toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

async function navigate(next: Screen) {
  screen = next;
  await renderScreen();
}

async function renderScreen() {
  await loadDoctors();
  if (screen === 'dashboard') return renderDashboard();
  if (screen === 'patients') return renderPatients(false);
  if (screen === 'archive') return renderPatients(true);
  if (screen === 'today') return renderToday();
  if (screen === 'doctors') return renderDoctors();
  if (screen === 'reports') return renderReports();
  if (screen === 'backups') return renderBackups();
}

function patientTable(rows: Patient[], archived: boolean) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>المريض</th><th>الهاتف</th><th>السن/النوع</th><th>الطبيب</th>
          <th>التخصص</th><th>آخر زيارة</th><th>الزيارات</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(p => `
            <tr>
              <td><button class="link patient-open" data-id="${esc(p.id)}">${esc(p.fullName || 'بدون اسم')}</button></td>
              <td class="ltr">${esc(p.phone)}</td>
              <td>${p.age ?? '—'} ${p.gender ? `• ${esc(p.gender)}` : ''}</td>
              <td>${esc(p.doctor || '—')}</td>
              <td>${esc(p.specialty || '—')}</td>
              <td>${displayDate(p.lastVisitDate)} ${p.lastVisitTime ? `<small>${esc(p.lastVisitTime)}</small>`:''}</td>
              <td><span class="count-badge">${p.visitsCount}</span></td>
              <td class="row-actions">
                ${archived
                  ? `<button class="icon-action restore" data-restore="${esc(p.id)}" title="استعادة">↶</button>`
                  : `<button class="icon-action edit" data-edit="${esc(p.id)}" title="تعديل">✎</button>
                     <button class="icon-action archive" data-archive="${esc(p.id)}" title="أرشفة">▣</button>`
                }
              </td>
            </tr>
          `).join('') : `<tr><td colspan="8" class="empty-row">لا توجد بيانات</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function bindPatientActions() {
  document.querySelectorAll<HTMLButtonElement>('.patient-open').forEach(b => b.onclick = () => openPatient(b.dataset.id!));
  document.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(b => b.onclick = () => openEditPatient(b.dataset.edit!));
  document.querySelectorAll<HTMLButtonElement>('[data-archive]').forEach(b => b.onclick = async () => {
    if (!confirm('أرشفة ملف المريض؟ لن يتم حذف أي بيانات.')) return;
    await invoke('set_patient_archived', { input: { id: b.dataset.archive, archived: true } });
    toast('تم نقل الملف إلى الأرشيف');
    await renderScreen();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-restore]').forEach(b => b.onclick = async () => {
    await invoke('set_patient_archived', { input: { id: b.dataset.restore, archived: false } });
    toast('تمت استعادة ملف المريض');
    await renderScreen();
  });
}

async function renderDashboard() {
  const [stats, recent] = await Promise.all([
    invoke<Stats>('get_stats'),
    invoke<Patient[]>('list_patients', { query: { search: '', archivedOnly: false, limit: 8 } })
  ]);
  shell(`
    <div class="stats-grid">
      <article class="stat"><div class="stat-icon">👥</div><div><span>إجمالي المرضى</span><strong>${stats.totalPatients}</strong></div></article>
      <article class="stat"><div class="stat-icon">◷</div><div><span>زيارات اليوم</span><strong>${stats.todayVisits}</strong></div></article>
      <article class="stat"><div class="stat-icon">＋</div><div><span>مرضى جدد اليوم</span><strong>${stats.newToday}</strong></div></article>
      <article class="stat"><div class="stat-icon">▤</div><div><span>إجمالي الزيارات</span><strong>${stats.totalVisits}</strong></div></article>
    </div>
    <div class="dashboard-grid">
      <section class="card">
        <div class="card-head"><div><h2>آخر الحالات</h2><p>أحدث الملفات التي تم التعامل معها</p></div>
          <button class="btn ghost" id="allPatientsBtn">عرض الكل</button>
        </div>
        ${patientTable(recent, false)}
      </section>
      <section class="quick-card">
        <h2>إجراءات سريعة</h2>
        <button class="quick" id="quickNew">＋ <span><b>تسجيل حالة جديدة</b><small>مريض جديد أو زيارة جديدة</small></span></button>
        <button class="quick" id="quickToday">◷ <span><b>زيارات اليوم</b><small>عرض الحالات المسجلة اليوم</small></span></button>
        <button class="quick" id="quickBackup">⟳ <span><b>نسخة احتياطية</b><small>حفظ نسخة من قاعدة البيانات الآن</small></span></button>
      </section>
    </div>
  `, 'لوحة التحكم', 'نظرة سريعة على حركة العيادة اليوم');
  bindPatientActions();
  document.querySelector<HTMLButtonElement>('#allPatientsBtn')!.onclick = () => navigate('patients');
  document.querySelector<HTMLButtonElement>('#quickNew')!.onclick = () => openCaseModal();
  document.querySelector<HTMLButtonElement>('#quickToday')!.onclick = () => navigate('today');
  document.querySelector<HTMLButtonElement>('#quickBackup')!.onclick = async () => {
    const item = await invoke<BackupItem>('create_backup');
    toast(`تم إنشاء النسخة: ${item.name}`);
  };
}

async function renderPatients(archived: boolean) {
  const rows = await invoke<Patient[]>('list_patients', { query: { search: '', archivedOnly: archived, limit: 500 } });
  shell(`
    <section class="card">
      <div class="card-head toolbar">
        <div>
          <h2>${archived ? 'أرشيف المرضى' : 'ملفات المرضى'}</h2>
          <p>${archived ? 'الملفات المؤرشفة قابلة للاستعادة' : 'بحث وفتح وتعديل ملفات المرضى'}</p>
        </div>
        <div class="filters">
          <input class="search-input" id="patientSearch" placeholder="بحث بالاسم أو رقم الهاتف..." />
          ${!archived ? `<button class="btn primary small" id="newFromPatients">＋ مريض / زيارة</button>` : ''}
        </div>
      </div>
      <div id="patientTable">${patientTable(rows, archived)}</div>
    </section>
  `, archived ? 'الأرشيف' : 'المرضى', archived ? 'الملفات التي تم أرشفتها بدون حذف' : 'كل ملفات المرضى وسجل زياراتهم');
  bindPatientActions();
  const input = document.querySelector<HTMLInputElement>('#patientSearch')!;
  let timer: number | undefined;
  input.oninput = () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const data = await invoke<Patient[]>('list_patients', { query: { search: input.value.trim(), archivedOnly: archived, limit: 500 } });
      document.querySelector<HTMLDivElement>('#patientTable')!.innerHTML = patientTable(data, archived);
      bindPatientActions();
    }, 180);
  };
  const n = document.querySelector<HTMLButtonElement>('#newFromPatients');
  if (n) n.onclick = () => openCaseModal();
}

async function renderToday() {
  const result = await invoke<ReportResult>('run_report', { query: { from: today(), to: today(), doctor: '' } });
  shell(`
    <section class="card">
      <div class="card-head">
        <div><h2>زيارات اليوم</h2><p>${displayDate(today())} — ${result.totalVisits} زيارة</p></div>
      </div>
      ${visitTable(result.rows)}
    </section>
  `, 'زيارات اليوم', 'كل الزيارات المسجلة في تاريخ اليوم');
}

function visitTable(rows: Visit[]) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>التاريخ</th><th>الوقت</th><th>الطبيب</th><th>التخصص</th><th>سعر الكشف</th><th>الشكوى</th><th>التشخيص</th></tr></thead>
        <tbody>${rows.length ? rows.map(v => `
          <tr>
            <td>${displayDate(v.visitDate)}</td><td class="ltr">${esc(v.visitTime)}</td>
            <td>${esc(v.doctor || '—')}</td><td>${esc(v.specialty || '—')}</td>
            <td class="ltr">${v.fee ? `${esc(v.fee)} ج.م` : '—'}</td>
            <td>${esc(v.complaint || '—')}</td><td>${esc(v.diagnosis || '—')}</td>
          </tr>`).join('') : `<tr><td colspan="7" class="empty-row">لا توجد زيارات</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function renderDoctors() {
  shell(`
    <section class="card">
      <div class="card-head toolbar">
        <div><h2>الأطباء</h2><p>قائمة الأطباء المستخدمة أثناء تسجيل الزيارة</p></div>
        <button class="btn primary small" id="addDoctorBtn">＋ إضافة طبيب</button>
      </div>
      <div class="doctor-grid">
        ${doctors.length ? doctors.map(d => `
          <article class="doctor-card ${d.active?'':'inactive'}">
            <div class="doctor-avatar">⚕</div>
            <div class="doctor-info"><strong>${esc(d.name)}</strong><span>${esc(d.specialty || 'بدون تخصص')}</span></div>
            <div class="doctor-actions">
              <button class="icon-action edit" data-doctor-edit="${esc(d.id)}">✎</button>
              <button class="switch ${d.active?'on':''}" data-doctor-toggle="${esc(d.id)}" data-active="${d.active}">${d.active?'نشط':'غير نشط'}</button>
            </div>
          </article>`).join('') : `<div class="empty-block">لم يتم إضافة أطباء بعد</div>`}
      </div>
    </section>
  `, 'الأطباء', 'إدارة قائمة الأطباء والتخصصات');
  document.querySelector<HTMLButtonElement>('#addDoctorBtn')!.onclick = () => openDoctorModal();
  document.querySelectorAll<HTMLButtonElement>('[data-doctor-edit]').forEach(b => {
    const d = doctors.find(x => x.id === b.dataset.doctorEdit);
    if (d) b.onclick = () => openDoctorModal(d);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-doctor-toggle]').forEach(b => b.onclick = async () => {
    const d = doctors.find(x => x.id === b.dataset.doctorToggle);
    if (!d) return;
    await invoke('save_doctor', { input: { id: d.id, name: d.name, specialty: d.specialty, active: !d.active } });
    await renderScreen();
  });
}

async function renderReports() {
  const from = today().slice(0,8) + '01';
  shell(`
    <section class="card">
      <div class="card-head"><div><h2>التقارير</h2><p>فلترة الزيارات حسب التاريخ والطبيب</p></div></div>
      <div class="report-filters">
        <label>من<input id="reportFrom" type="date" value="${from}"></label>
        <label>إلى<input id="reportTo" type="date" value="${today()}"></label>
        <label>الطبيب<select id="reportDoctor"><option value="">كل الأطباء</option>${doctors.filter(d=>d.active).map(d=>`<option>${esc(d.name)}</option>`).join('')}</select></label>
        <button class="btn primary" id="runReportBtn">عرض التقرير</button>
      </div>
      <div id="reportResult" class="report-result"></div>
    </section>
  `, 'التقارير', 'تقارير الزيارات بدون أي اتصال بالإنترنت');
  const run = async () => {
    const result = await invoke<ReportResult>('run_report', { query: {
      from: (document.querySelector<HTMLInputElement>('#reportFrom')!).value,
      to: (document.querySelector<HTMLInputElement>('#reportTo')!).value,
      doctor: (document.querySelector<HTMLSelectElement>('#reportDoctor')!).value
    }});
    document.querySelector<HTMLDivElement>('#reportResult')!.innerHTML = `
      <div class="report-stats">
        <div><span>عدد الزيارات</span><strong>${result.totalVisits}</strong></div>
        <div><span>مرضى مختلفون</span><strong>${result.uniquePatients}</strong></div>
      </div>
      ${visitTable(result.rows)}
    `;
  };
  document.querySelector<HTMLButtonElement>('#runReportBtn')!.onclick = run;
  await run();
}

async function renderBackups() {
  const backups = await invoke<BackupItem[]>('list_backups');
  shell(`
    <section class="card">
      <div class="card-head toolbar">
        <div><h2>النسخ الاحتياطية</h2><p>نسخة تلقائية يوميًا الساعة 4:00 صباحًا • الحفظ في Documents / Clinic Cases Backups</p></div>
        <div class="filters">
          <button class="btn ghost small" id="openBackupFolder">فتح المجلد</button>
          <button class="btn primary small" id="backupNow">＋ إنشاء نسخة الآن</button>
        </div>
      </div>
      <div class="backup-list">
        ${backups.length ? backups.map(b => `
          <article class="backup-row">
            <div><strong>${esc(b.name)}</strong><small>${esc(b.modified)} • ${(b.size/1024/1024).toFixed(2)} MB</small></div>
            <button class="btn danger-outline small" data-restore-backup="${esc(b.path)}">استعادة هذه النسخة</button>
          </article>
        `).join('') : `<div class="empty-block">لا توجد نسخ احتياطية حتى الآن</div>`}
      </div>
    </section>
  `, 'النسخ الاحتياطية', 'حماية البيانات واستعادتها عند الحاجة');
  document.querySelector<HTMLButtonElement>('#backupNow')!.onclick = async () => {
    const item = await invoke<BackupItem>('create_backup');
    toast(`تم إنشاء النسخة: ${item.name}`);
    await renderScreen();
  };
  document.querySelector<HTMLButtonElement>('#openBackupFolder')!.onclick = async () => {
    await invoke('open_backup_folder');
  };
  document.querySelectorAll<HTMLButtonElement>('[data-restore-backup]').forEach(b => b.onclick = async () => {
    if (!confirm('سيتم استبدال قاعدة البيانات الحالية بهذه النسخة. تم إنشاء نسخة أمان تلقائيًا قبل الاستعادة. هل تريد المتابعة؟')) return;
    try {
      await invoke('restore_backup', { path: b.dataset.restoreBackup });
      toast('تمت استعادة النسخة بنجاح');
      setTimeout(() => navigate('dashboard'), 600);
    } catch (e) {
      toast(`فشل الاستعادة: ${String(e)}`, 'error');
    }
  });
}

async function openPatient(id: string) {
  const details = await invoke<PatientDetails>('get_patient_details', { id });
  const p = details.patient;
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;
  root.innerHTML = `
    <div class="modal-backdrop" id="patientModalBackdrop">
      <section class="modal wide">
        <div class="modal-head">
          <div><h2>${esc(p.fullName || "بدون اسم")}</h2><p class="ltr">${esc(p.phone || "بدون رقم")}</p></div>
          <button class="modal-close" id="closePatient">×</button>
        </div>
        <div class="patient-summary">
          <div><span>السن</span><strong>${p.age ?? '—'}</strong></div>
          <div><span>النوع</span><strong>${esc(p.gender || '—')}</strong></div>
          <div><span>العنوان</span><strong>${esc(p.address || '—')}</strong></div>
          <div><span>عدد الزيارات</span><strong>${p.visitsCount}</strong></div>
        </div>
        <div class="modal-toolbar">
          <h3>سجل الزيارات</h3>
          <div><button class="btn ghost small" id="editPatientFromDetails">تعديل البيانات</button>
          <button class="btn primary small" id="addVisitToPatient">＋ إضافة زيارة</button></div>
        </div>
        ${visitTable(details.visits)}
      </section>
    </div>`;
  document.querySelector<HTMLButtonElement>('#closePatient')!.onclick = () => root.innerHTML='';
  document.querySelector<HTMLDivElement>('#patientModalBackdrop')!.onclick = e => { if (e.target === e.currentTarget) root.innerHTML=''; };
  document.querySelector<HTMLButtonElement>('#editPatientFromDetails')!.onclick = () => { root.innerHTML=''; openEditPatient(id); };
  document.querySelector<HTMLButtonElement>('#addVisitToPatient')!.onclick = () => { root.innerHTML=''; openCaseModal(p); };
}

function doctorOptions(selected = '') {
  return `<option value="">— اختر الطبيب —</option>` + doctors.filter(d=>d.active).map(d =>
    `<option value="${esc(d.name)}" data-specialty="${esc(d.specialty)}" ${d.name===selected?'selected':''}>${esc(d.name)}</option>`
  ).join('');
}

async function openCaseModal(existing?: Patient) {
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;
  root.innerHTML = `
    <div class="modal-backdrop" id="caseBackdrop">
      <section class="modal form-modal">
        <div class="modal-head">
          <div><h2>${existing ? 'إضافة زيارة جديدة' : 'تسجيل حالة جديدة'}</h2><p>${existing ? `لملف: ${esc(existing.fullName)}` : 'لو رقم الهاتف موجود سيتم إضافة زيارة لنفس المريض تلقائيًا'}</p></div>
          <button class="modal-close" id="closeCase">×</button>
        </div>
        <form id="caseForm">
          <div class="section-title">بيانات المريض</div>
          <div class="form-grid">
            <label class="span2">الاسم بالكامل<input name="fullName" value="${esc(existing?.fullName || '')}"></label>
            <label>رقم الهاتف<input class="ltr" name="phone" value="${esc(existing?.phone || '')}"></label>
            <label>السن<input name="age" type="number" min="0" max="130" value="${existing?.age ?? ''}"></label>
            <label>النوع<select name="gender"><option value="">—</option><option ${existing?.gender==='ذكر'?'selected':''}>ذكر</option><option ${existing?.gender==='أنثى'?'selected':''}>أنثى</option></select></label>
            <label class="span2">العنوان<input name="address" value="${esc(existing?.address || '')}"></label>
          </div>
          <div class="section-title">بيانات الزيارة</div>
          <div class="form-grid">
            <label>الطبيب<select id="doctorSelect" name="doctor">${doctorOptions(existing?.doctor || '')}</select></label>
            <label>التخصص<input id="specialtyInput" name="specialty" value="${esc(existing?.specialty || '')}" readonly placeholder="يظهر تلقائيًا بعد اختيار الطبيب"></label>
            <label>سعر الكشف<input class="ltr" name="fee" type="number" min="0" step="0.01" placeholder="يكتب يدويًا"></label>
            <label>تاريخ الزيارة<input name="visitDate" type="date" value="${today()}"></label>
            <label>وقت الزيارة<input name="visitTime" type="time" value="${timeNow()}"></label>
            <label class="span2">الشكوى الرئيسية<textarea name="complaint" rows="2"></textarea></label>
            <label class="span2">التشخيص<textarea name="diagnosis" rows="2"></textarea></label>
            <label class="span2">ملاحظات<textarea name="notes" rows="2"></textarea></label>
          </div>
          <div class="form-actions">
            <button type="button" class="btn ghost" id="cancelCase">إلغاء</button>
            <button type="submit" class="btn primary">حفظ الحالة</button>
          </div>
        </form>
      </section>
    </div>`;
  const close = () => root.innerHTML='';
  document.querySelector<HTMLButtonElement>('#closeCase')!.onclick = close;
  document.querySelector<HTMLButtonElement>('#cancelCase')!.onclick = close;
  const ds = document.querySelector<HTMLSelectElement>('#doctorSelect')!;
  ds.onchange = () => {
    const opt = ds.selectedOptions[0];
    const sp = opt?.dataset.specialty || '';
    document.querySelector<HTMLInputElement>('#specialtyInput')!.value = sp;
  };
  document.querySelector<HTMLFormElement>('#caseForm')!.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const rawAge = String(fd.get('age')||'').trim();
    try {
      await invoke('save_case', { input: {
        fullName: String(fd.get('fullName')||'').trim(),
        phone: String(fd.get('phone')||'').trim(),
        age: rawAge ? Number(rawAge) : null,
        gender: String(fd.get('gender')||''),
        address: String(fd.get('address')||'').trim(),
        doctor: String(fd.get('doctor')||'').trim(),
        specialty: String(fd.get('specialty')||'').trim(),
        fee: String(fd.get('fee')||'').trim(),
        visitDate: String(fd.get('visitDate')||''),
        visitTime: String(fd.get('visitTime')||''),
        complaint: String(fd.get('complaint')||'').trim(),
        diagnosis: String(fd.get('diagnosis')||'').trim(),
        notes: String(fd.get('notes')||'').trim()
      }});
      close();
      toast('تم حفظ الحالة والزيارة بنجاح');
      await renderScreen();
    } catch (err) {
      toast(`تعذر الحفظ: ${String(err)}`, 'error');
    }
  };
}

async function openEditPatient(id: string) {
  const d = await invoke<PatientDetails>('get_patient_details', { id });
  const p = d.patient;
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;
  root.innerHTML = `
    <div class="modal-backdrop"><section class="modal">
      <div class="modal-head"><div><h2>تعديل بيانات المريض</h2><p>لا يؤثر على سجل الزيارات السابق</p></div><button class="modal-close" id="closeEdit">×</button></div>
      <form id="editPatientForm">
        <div class="form-grid">
          <label class="span2">الاسم بالكامل<input name="fullName" value="${esc(p.fullName)}"></label>
          <label>رقم الهاتف<input class="ltr" name="phone" value="${esc(p.phone)}"></label>
          <label>السن<input name="age" type="number" min="0" max="130" value="${p.age ?? ''}"></label>
          <label>النوع<select name="gender"><option value="">—</option><option ${p.gender==='ذكر'?'selected':''}>ذكر</option><option ${p.gender==='أنثى'?'selected':''}>أنثى</option></select></label>
          <label class="span2">العنوان<input name="address" value="${esc(p.address)}"></label>
        </div>
        <div class="form-actions"><button type="button" class="btn ghost" id="cancelEdit">إلغاء</button><button class="btn primary">حفظ التعديل</button></div>
      </form>
    </section></div>`;
  const close=()=>root.innerHTML='';
  document.querySelector<HTMLButtonElement>('#closeEdit')!.onclick=close;
  document.querySelector<HTMLButtonElement>('#cancelEdit')!.onclick=close;
  document.querySelector<HTMLFormElement>('#editPatientForm')!.onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget as HTMLFormElement);
    const age=String(fd.get('age')||'').trim();
    try {
      await invoke('update_patient',{input:{id,fullName:String(fd.get('fullName')||'').trim(),phone:String(fd.get('phone')||'').trim(),age:age?Number(age):null,gender:String(fd.get('gender')||''),address:String(fd.get('address')||'').trim()}});
      close(); toast('تم تعديل بيانات المريض'); await renderScreen();
    } catch(err){ toast(`تعذر التعديل: ${String(err)}`,'error'); }
  };
}

function openDoctorModal(doctor?: Doctor) {
  const root=document.querySelector<HTMLDivElement>('#modalRoot')!;
  root.innerHTML=`
    <div class="modal-backdrop"><section class="modal compact">
      <div class="modal-head"><div><h2>${doctor?'تعديل الطبيب':'إضافة طبيب'}</h2></div><button class="modal-close" id="closeDoctor">×</button></div>
      <form id="doctorForm">
        <div class="form-grid one">
          <label>اسم الطبيب<input name="name" required value="${esc(doctor?.name||'')}"></label>
          <label>التخصص<input name="specialty" value="${esc(doctor?.specialty||'')}"></label>
        </div>
        <div class="form-actions"><button type="button" class="btn ghost" id="cancelDoctor">إلغاء</button><button class="btn primary">حفظ</button></div>
      </form>
    </section></div>`;
  const close=()=>root.innerHTML='';
  document.querySelector<HTMLButtonElement>('#closeDoctor')!.onclick=close;
  document.querySelector<HTMLButtonElement>('#cancelDoctor')!.onclick=close;
  document.querySelector<HTMLFormElement>('#doctorForm')!.onsubmit=async e=>{
    e.preventDefault(); const fd=new FormData(e.currentTarget as HTMLFormElement);
    await invoke('save_doctor',{input:{id:doctor?.id||'',name:String(fd.get('name')||'').trim(),specialty:String(fd.get('specialty')||'').trim(),active:doctor?.active??true}});
    close(); toast('تم حفظ الطبيب'); await renderScreen();
  };
}

renderScreen().catch(e => {
  app.innerHTML = `<div class="fatal"><h2>تعذر تشغيل النظام</h2><p>${esc(String(e))}</p></div>`;
});
