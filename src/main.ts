import QRCode from 'qrcode';
import { invoke } from '@tauri-apps/api/core';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import './style.css';

type Patient = {
  id: string;
  fullName: string;
  phone: string;
  age: number | null;
  gender: string;
  address: string;
  archived: boolean;
  blacklisted: boolean;
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
  visitType: string;
  patientName: string;
  patientPhone: string;
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
let activeBusinessDay = '';

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

function businessDay() {
  const d = new Date();
  if (d.getHours() < 11) d.setDate(d.getDate() - 1);
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


type ExportFormat = 'pdf' | 'png';

function safeExportName(v: string) {
  return v.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

function reportPeriodLabel(from: string, to: string) {
  return from === to ? displayDate(from) : `${displayDate(from)} إلى ${displayDate(to)}`;
}

function exportVisitRows(rows: Visit[], includePatient: boolean) {
  return `
    <table class="export-table">
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>الوقت</th>
          ${includePatient ? '<th>المريض</th><th>رقم التليفون</th>' : ''}
          <th>نوع الزيارة</th>
          <th>الطبيب</th>
          <th>سعر الكشف</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map(v => `
          <tr>
            <td>${esc(displayDate(v.visitDate))}</td>
            <td class="ltr">${esc(v.visitTime || '—')}</td>
            ${includePatient ? `<td>${esc(v.patientName || '—')}</td><td class="ltr">${esc(v.patientPhone || '—')}</td>` : ''}
            <td>${esc(v.visitType || 'زيارة')}</td>
            <td>${esc(v.doctor || '—')}</td>
            <td class="ltr">${v.fee ? `${esc(v.fee)} ج.م` : '—'}</td>
          </tr>
        `).join('') : `<tr><td colspan="${includePatient ? 7 : 5}">لا توجد بيانات</td></tr>`}
      </tbody>
    </table>`;
}

function exportSheet(title: string, subtitle: string, body: string) {
  return `
    <div class="export-document">
      <div class="export-brand">
        <div>
          <h1>عيادات العقاد التخصصية</h1>
          <p>رعاية تليق بك</p>
        </div>
        <div class="export-ak-mark">AK</div>
      </div>
      <div class="export-rule"></div>
      <div class="export-title">
        <h2>${esc(title)}</h2>
        <p>${esc(subtitle)}</p>
      </div>
      ${body}
      <div class="export-footer">تم إنشاء الملف من نظام عيادات العقاد التخصصية</div>
    </div>`;
}


function patientExportSheet(title: string, subtitle: string, body: string) {
  return `
    <div class="export-document patient-export-document">
      <div class="patient-print-brand">
        <img src="/patient-print-logo.jpg" alt="لوجو عيادات العقاد التخصصية" />
        <div class="patient-print-slogan">رعاية تليق بك</div>
      </div>

      <div class="export-rule"></div>

      <div class="export-title patient-export-title">
        <h2>${esc(title)}</h2>
        <p>${esc(subtitle)}</p>
      </div>

      ${body}

      <div class="patient-print-footer">
        <div class="patient-print-footer-item">
          <span class="patient-print-footer-badge wa">WA</span>
          <strong class="ltr">01102233167</strong>
        </div>
        <div class="patient-print-footer-item">
          <span class="patient-print-footer-badge phone">☎</span>
          <strong class="ltr">01107072134</strong>
        </div>
      </div>
    </div>`;
}

function buildPatientQrPayload(details: PatientDetails) {
  const p = details.patient;
  const lastVisit = details.visits?.[0];
  return [
    'Clinic Cases System',
    `Patient ID: ${p.id}`,
    `Name: ${p.fullName || ''}`,
    `Phone: ${p.phone || ''}`,
    `Doctor: ${lastVisit?.doctor || ''}`,
    `Visit Type: ${lastVisit?.visitType || ''}`,
    `Created At: ${p.createdAt || ''}`
  ].join(' | ');
}


async function captureAndSaveExport(html: string, baseName: string, format: ExportFormat) {
  const host = document.createElement('div');
  host.className = 'export-capture-host';
  host.innerHTML = html;
  document.body.appendChild(host);

  try {
    if ('fonts' in document) {
      await (document as Document & {fonts?: FontFaceSet}).fonts?.ready;
    }
    await new Promise(resolve => setTimeout(resolve, 80));

    const canvas = await html2canvas(host, {
      scale: 1.6,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true
    });

    let fileName = '';
    let base64Data = '';

    if (format === 'png') {
      fileName = `${safeExportName(baseName)}.png`;
      base64Data = canvas.toDataURL('image/png', 1).split(',')[1];
    } else {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const drawWidth = pageWidth - (margin * 2);
      const drawHeight = canvas.height * drawWidth / canvas.width;
      const image = canvas.toDataURL('image/jpeg', 0.92);

      let remaining = drawHeight;
      let y = margin;
      pdf.addImage(image, 'JPEG', margin, y, drawWidth, drawHeight);
      remaining -= (pageHeight - margin * 2);

      while (remaining > 0) {
        pdf.addPage();
        y = margin - (drawHeight - remaining);
        pdf.addImage(image, 'JPEG', margin, y, drawWidth, drawHeight);
        remaining -= (pageHeight - margin * 2);
      }

      fileName = `${safeExportName(baseName)}.pdf`;
      base64Data = pdf.output('datauristring').split(',')[1];
    }

    const saved = await invoke<string>('save_export', {
      input: { fileName, base64Data }
    });
    toast(`تم تنزيل الملف بنجاح في Downloads: ${saved}`);
  } catch (err) {
    toast(`تعذر إنشاء الملف: ${String(err)}`, 'error');
  } finally {
    host.remove();
  }
}

async function exportPatientFile(details: PatientDetails, format: ExportFormat) {
  const p = details.patient;
  const qrPayload = buildPatientQrPayload(details);
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 170,
    margin: 1,
    color: {
      dark: '#0a2342',
      light: '#ffffff'
    }
  });

  const body = `
    <div class="patient-export-top">
      <div class="export-patient-grid patient-export-grid">
        <div><span>اسم المريض</span><strong>${esc(p.fullName || '—')}</strong></div>
        <div><span>رقم التليفون</span><strong class="ltr">${esc(p.phone || '—')}</strong></div>
        <div><span>السن</span><strong>${p.age ?? '—'}</strong></div>
        <div><span>النوع</span><strong>${esc(p.gender || '—')}</strong></div>
        <div class="wide"><span>العنوان</span><strong>${esc(p.address || '—')}</strong></div>
        <div><span>الحالة</span><strong>${p.blacklisted ? 'Black List' : 'عادي'}</strong></div>
        <div><span>عدد الزيارات</span><strong>${p.visitsCount}</strong></div>
        <div><span>الكود</span><strong class="ltr">${esc(p.id)}</strong></div>
      </div>
      <div class="patient-qr-box">
        <img src="${qrDataUrl}" alt="QR Code" />
        <div class="patient-qr-caption">QR فريد للحالة</div>
        <small class="ltr">${esc(p.id)}</small>
      </div>
    </div>
    <h3 class="export-section-heading">سجل الزيارات</h3>
    ${exportVisitRows(details.visits, false)}
  `;
  await captureAndSaveExport(
    patientExportSheet('ملف المريض', p.fullName || 'بدون اسم', body),
    `ملف المريض - ${p.fullName || p.phone || p.id}`,
    format
  );
}

async function exportReportFile(result: ReportResult, from: string, to: string, doctor: string, format: ExportFormat) {
  const body = `
    <div class="export-summary">
      <div><span>الفترة</span><strong>${esc(reportPeriodLabel(from, to))}</strong></div>
      <div><span>الطبيب</span><strong>${esc(doctor || 'كل الأطباء')}</strong></div>
      <div><span>عدد الزيارات</span><strong>${result.totalVisits}</strong></div>
      <div><span>عدد المرضى</span><strong>${result.uniquePatients}</strong></div>
    </div>
    ${exportVisitRows(result.rows, true)}
  `;
  await captureAndSaveExport(
    exportSheet('ملخص الحالات والتقرير', reportPeriodLabel(from, to), body),
    `تقرير الحالات - ${from} - ${to}`,
    format
  );
}


let caseMenuPatientId = '';
let caseMenuPatientPhone = '';
let caseMenuBound = false;

async function exportPatientById(id: string, format: ExportFormat) {
  const details = await invoke<PatientDetails>('get_patient_details', { id });
  await exportPatientFile(details, format);
}

function closeCaseContextMenu() {
  document.querySelector<HTMLDivElement>('#caseContextMenu')?.classList.remove('show');
}

function ensureCaseContextMenu() {
  if (caseMenuBound) return;
  caseMenuBound = true;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="caseContextMenu" class="case-context-menu" dir="rtl">
      <button data-action="open">فتح ملف المريض</button>
      <button data-action="edit">تعديل البيانات</button>
      <button data-action="pdf">طباعة / تحميل PDF</button>
      <button data-action="png">تحميل صورة</button>
      <button data-action="copy">نسخ رقم التليفون</button>
    </div>
  `);

  const menu = document.querySelector<HTMLDivElement>('#caseContextMenu')!;

  const openMenu = (x: number, y: number, id: string, phone: string) => {
    caseMenuPatientId = id;
    caseMenuPatientPhone = phone;
    menu.style.left = `${Math.min(x, window.innerWidth - 230)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 260)}px`;
    menu.classList.add('show');
  };

  document.addEventListener('contextmenu', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.patient-file-card, .visit-context-row');
    if (!target) return;

    const id = target.dataset.patientId || '';
    if (!id) return;

    event.preventDefault();
    openMenu(event.clientX, event.clientY, id, target.dataset.patientPhone || '');
  });

  menu.addEventListener('click', async (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!btn || !caseMenuPatientId) return;

    const action = btn.dataset.action || '';
    closeCaseContextMenu();

    try {
      if (action === 'open') {
        openPatient(caseMenuPatientId);
      } else if (action === 'edit') {
        openEditPatient(caseMenuPatientId);
      } else if (action === 'pdf') {
        await exportPatientById(caseMenuPatientId, 'pdf');
      } else if (action === 'png') {
        await exportPatientById(caseMenuPatientId, 'png');
      } else if (action === 'copy') {
        if (caseMenuPatientPhone) {
          await navigator.clipboard.writeText(caseMenuPatientPhone);
          toast('تم نسخ رقم التليفون');
        } else {
          toast('لا يوجد رقم تليفون مسجل', 'error');
        }
      }
    } catch (err) {
      toast(`تعذر تنفيذ الإجراء: ${String(err)}`, 'error');
    }
  });

  document.addEventListener('click', () => closeCaseContextMenu());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCaseContextMenu();
  });
  document.addEventListener('scroll', () => closeCaseContextMenu(), true);
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
          ${navButton('today','◷','حالات اليوم')}
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
        <div class="system-watermark" aria-hidden="true"></div>
        <section class="clinic-header">
          <div class="clinic-identity">
            <img class="clinic-logo" src="/clinic-logo-emblem.png" alt="لوجو عيادات العقاد التخصصية" />
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
            <button class="btn primary" id="globalNewCase">＋ تسجيل مريض</button>
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

  activeBusinessDay = businessDay();
  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(() => {
    updateClock();
    updateConnectionStatus();

    const nowBusinessDay = businessDay();
    if (nowBusinessDay !== activeBusinessDay) {
      activeBusinessDay = nowBusinessDay;
      renderScreen().catch(err => toast(`تعذر تحديث اليوم الجديد: ${String(err)}`, 'error'));
    }
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
    <div class="patient-files-grid">
      ${rows.length ? rows.map(p => `
        <article class="patient-file-card ${p.blacklisted ? 'is-blacklisted' : ''}" data-patient-id="${esc(p.id)}" data-patient-phone="${esc(p.phone || '')}">
          <button class="patient-file-open patient-open" data-id="${esc(p.id)}" title="فتح ملف المريض">
            <span class="patient-file-icon">
              <span class="patient-file-fold"></span>
              <span class="patient-file-logo">AK</span>
              <span class="patient-file-lines"></span>
            </span>
            <strong>${esc(p.fullName || 'بدون اسم')}</strong>
            <span class="patient-file-phone ltr">${esc(p.phone || 'بدون رقم')}</span>
            <small>${p.visitsCount} زيارة ${p.blacklisted ? '• Black List' : ''}</small>
          </button>
          <div class="patient-file-actions">
            ${archived
              ? `<button class="icon-action restore" data-restore="${esc(p.id)}" title="استعادة">↶</button>`
              : `<button class="icon-action edit" data-edit="${esc(p.id)}" title="تعديل">✎</button>`
            }
          </div>
        </article>
      `).join('') : `<div class="empty-block">لا توجد ملفات مرضى</div>`}
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
      <article class="stat"><div class="stat-icon">◷</div><div><span>حالات اليوم</span><strong>${stats.todayVisits}</strong></div></article>
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
        <button class="quick" id="quickNew">＋ <span><b>تسجيل مريض جديد</b><small>إنشاء ملف بيانات للمريض</small></span></button>
        <button class="quick" id="quickToday">◷ <span><b>حالات اليوم</b><small>عرض الحالات المسجلة اليوم</small></span></button>
        <button class="quick" id="quickBackup">⟳ <span><b>نسخة احتياطية</b><small>حفظ نسخة من قاعدة البيانات الآن</small></span></button>
      </section>
    </div>
  `, 'لوحة التحكم', 'نظرة سريعة على حركة العيادة اليوم');
  bindPatientActions();
      ensureCaseContextMenu();
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
          ${!archived ? `<button class="btn primary small" id="newFromPatients">＋ مريض جديد</button>` : ''}
        </div>
      </div>
      <div id="patientTable">${patientTable(rows, archived)}</div>
    </section>
  `, archived ? 'الأرشيف' : 'المرضى', archived ? 'الملفات التي تم أرشفتها بدون حذف' : 'كل ملفات المرضى وسجل زياراتهم');
  bindPatientActions();
      ensureCaseContextMenu();
  const input = document.querySelector<HTMLInputElement>('#patientSearch')!;
  let timer: number | undefined;
  input.oninput = () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const data = await invoke<Patient[]>('list_patients', { query: { search: input.value.trim(), archivedOnly: archived, limit: 500 } });
      document.querySelector<HTMLDivElement>('#patientTable')!.innerHTML = patientTable(data, archived);
      bindPatientActions();
      ensureCaseContextMenu();
    }, 180);
  };
  const n = document.querySelector<HTMLButtonElement>('#newFromPatients');
  if (n) n.onclick = () => openCaseModal();
}

async function renderToday() {
  const dayKey = businessDay();
  const result = await invoke<ReportResult>('run_report', { query: { from: dayKey, to: dayKey, doctor: '' } });

  ensureCaseContextMenu();
  shell(`
    <section class="card">
      <div class="card-head">
        <div>
          <h2>حالات اليوم</h2>
          <p>اليوم التشغيلي يبدأ 11:00 صباحًا • ${displayDate(dayKey)} • ${result.totalVisits} حالة</p>
        </div>
        <div class="filters">
          <button class="btn ghost small" id="todayImage">تحميل صورة</button>
          <button class="btn primary small" id="todayPdf">تحميل PDF</button>
        </div>
      </div>

      <div class="today-search-panel">
        <div>
          <strong>البحث في ملفات المرضى</strong>
          <small>ابحث بالاسم أو رقم التليفون لفتح أي ملف قديم</small>
        </div>
        <input class="search-input" id="todayPatientSearch" placeholder="اسم المريض أو رقم التليفون..." />
      </div>
      <div id="todayPatientSearchResults"></div>

      ${visitTable(result.rows, true)}
    </section>
  `, 'حالات اليوم', 'بعد الساعة 11 صباحًا يبدأ يوم جديد تلقائيًا');

  document.querySelector<HTMLButtonElement>('#todayImage')!.onclick = () =>
    exportReportFile(result, dayKey, dayKey, '', 'png');
  document.querySelector<HTMLButtonElement>('#todayPdf')!.onclick = () =>
    exportReportFile(result, dayKey, dayKey, '', 'pdf');

  const search = document.querySelector<HTMLInputElement>('#todayPatientSearch')!;
  const results = document.querySelector<HTMLDivElement>('#todayPatientSearchResults')!;
  let timer: number | undefined;

  search.oninput = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const q = search.value.trim();
      if (!q) {
        results.innerHTML = '';
        return;
      }

      const rows = await invoke<Patient[]>('list_patients', {
        query: { search: q, archivedOnly: false, limit: 24 }
      });

      results.innerHTML = `
        <div class="today-search-results-title">نتائج البحث</div>
        ${patientTable(rows, false)}
      `;
      bindPatientActions();
      ensureCaseContextMenu();
    }, 180);
  };
}

function visitTable(rows: Visit[], showPatient = false) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>التاريخ</th><th>الوقت</th>
          ${showPatient ? '<th>المريض</th><th>رقم التليفون</th>' : ''}
          <th>نوع الزيارة</th><th>الطبيب</th><th>سعر الكشف</th>
        </tr></thead>
        <tbody>${rows.length ? rows.map(v => `
          <tr class="visit-context-row" data-patient-id="${esc(v.patientId)}" data-patient-name="${esc(v.patientName || '')}" data-patient-phone="${esc(v.patientPhone || '')}">
            <td>${displayDate(v.visitDate)}</td>
            <td class="ltr">${esc(v.visitTime)}</td>
            ${showPatient ? `<td>${esc(v.patientName || '—')}</td><td class="ltr">${esc(v.patientPhone || '—')}</td>` : ''}
            <td><span class="visit-type-badge">${esc(v.visitType || 'زيارة')}</span></td>
            <td>${esc(v.doctor || '—')}</td>
            <td class="ltr">${v.fee ? `${esc(v.fee)} ج.م` : '—'}</td>
          </tr>`).join('') : `<tr><td colspan="${showPatient ? 7 : 5}" class="empty-row">لا توجد زيارات</td></tr>`}
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
              <button class="icon-action edit" data-doctor-edit="${esc(d.id)}" title="تعديل">✎</button>
              <button class="icon-action danger" data-doctor-delete="${esc(d.id)}" title="حذف">🗑</button>
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
  document.querySelectorAll<HTMLButtonElement>('[data-doctor-delete]').forEach(b => b.onclick = async () => {
    const d = doctors.find(x => x.id === b.dataset.doctorDelete);
    if (!d) return;
    if (!confirm(`حذف الطبيب ${d.name} من القائمة؟ الزيارات القديمة لن تُحذف.`)) return;
    await invoke('delete_doctor', { id: d.id });
    toast('تم حذف الطبيب');
    await renderScreen();
  });
}

async function renderReports() {
  const activeDay = businessDay();
  const [activeYear, activeMonth] = activeDay.split('-').map(Number);
  const monthFrom = `${activeYear}-${String(activeMonth).padStart(2,'0')}-01`;
  const monthLast = new Date(activeYear, activeMonth, 0).getDate();
  const monthTo = `${activeYear}-${String(activeMonth).padStart(2,'0')}-${String(monthLast).padStart(2,'0')}`;

  shell(`
    <section class="card">
      <div class="card-head">
        <div><h2>التقارير</h2><p>يومي أو شهري أو أي فترة تختارها</p></div>
        <button class="btn ghost small" id="openExportsFolder">فتح مجلد التحميلات</button>
      </div>

      <div class="report-quick-ranges">
        <button class="btn ghost small" id="rangeToday">اليوم</button>
        <button class="btn ghost small" id="rangeMonth">الشهر الحالي</button>
        <span>أو اختر الفترة يدويًا</span>
      </div>

      <div class="report-filters">
        <label>من<input id="reportFrom" type="date" value="${monthFrom}"></label>
        <label>إلى<input id="reportTo" type="date" value="${today()}"></label>
        <label>الطبيب<select id="reportDoctor"><option value="">كل الأطباء</option>${doctors.filter(d=>d.active).map(d=>`<option>${esc(d.name)}</option>`).join('')}</select></label>
        <button class="btn primary" id="runReportBtn">عرض التقرير</button>
      </div>

      <div class="report-export-bar">
        <button class="btn ghost small" id="reportImage">تحميل صورة</button>
        <button class="btn primary small" id="reportPdf">تحميل PDF</button>
      </div>

      <div id="reportResult" class="report-result"></div>
    </section>
  `, 'التقارير', 'ملخص الحالات لأي مدة تختارها');

  let currentResult: ReportResult | null = null;

  const queryValues = () => ({
    from: (document.querySelector<HTMLInputElement>('#reportFrom')!).value,
    to: (document.querySelector<HTMLInputElement>('#reportTo')!).value,
    doctor: (document.querySelector<HTMLSelectElement>('#reportDoctor')!).value
  });

  const run = async () => {
    const q = queryValues();
    const result = await invoke<ReportResult>('run_report', { query: q });
    currentResult = result;
    document.querySelector<HTMLDivElement>('#reportResult')!.innerHTML = `
      <div class="report-stats">
        <div><span>عدد الزيارات</span><strong>${result.totalVisits}</strong></div>
        <div><span>مرضى مختلفون</span><strong>${result.uniquePatients}</strong></div>
        <div><span>الفترة</span><strong class="small-value">${esc(reportPeriodLabel(q.from, q.to))}</strong></div>
      </div>
      ${visitTable(result.rows, true)}
    `;
  };

  document.querySelector<HTMLButtonElement>('#runReportBtn')!.onclick = run;

  document.querySelector<HTMLButtonElement>('#rangeToday')!.onclick = async () => {
    const d = businessDay();
    (document.querySelector<HTMLInputElement>('#reportFrom')!).value = d;
    (document.querySelector<HTMLInputElement>('#reportTo')!).value = d;
    await run();
  };

  document.querySelector<HTMLButtonElement>('#rangeMonth')!.onclick = async () => {
    (document.querySelector<HTMLInputElement>('#reportFrom')!).value = monthFrom;
    (document.querySelector<HTMLInputElement>('#reportTo')!).value = monthTo;
    await run();
  };

  document.querySelector<HTMLButtonElement>('#reportImage')!.onclick = async () => {
    if (!currentResult) await run();
    const q = queryValues();
    if (currentResult) await exportReportFile(currentResult, q.from, q.to, q.doctor, 'png');
  };

  document.querySelector<HTMLButtonElement>('#reportPdf')!.onclick = async () => {
    if (!currentResult) await run();
    const q = queryValues();
    if (currentResult) await exportReportFile(currentResult, q.from, q.to, q.doctor, 'pdf');
  };

  document.querySelector<HTMLButtonElement>('#openExportsFolder')!.onclick = async () => {
    await invoke('open_export_folder');
  };

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
          <div>
            <h2>${esc(p.fullName || "بدون اسم")} ${p.blacklisted ? '<span class="blacklist-badge">Black List</span>' : ''}</h2>
            <p class="ltr patient-phone">📞 ${esc(p.phone || "بدون رقم تليفون")}</p>
          </div>
          <button class="modal-close" id="closePatient">×</button>
        </div>

        <div class="patient-summary">
          <div><span>رقم التليفون</span><strong class="ltr">${esc(p.phone || '—')}</strong></div>
          <div><span>السن</span><strong>${p.age ?? '—'}</strong></div>
          <div><span>النوع</span><strong>${esc(p.gender || '—')}</strong></div>
          <div><span>العنوان</span><strong>${esc(p.address || '—')}</strong></div>
          <div><span>عدد الزيارات</span><strong>${p.visitsCount}</strong></div>
        </div>

        <div class="profile-actions">
          <button class="btn ghost small" id="patientExportImage">تحميل صورة</button>
          <button class="btn ghost small" id="patientExportPdf">تحميل PDF</button>
          <button class="btn ghost small" id="editPatientFromDetails">✎ تعديل البيانات</button>
          <button class="btn ${p.blacklisted ? 'ghost' : 'danger-outline'} small" id="toggleBlacklist">
            ${p.blacklisted ? 'إزالة من Black List' : '⛔ إضافة إلى Black List'}
          </button>
          <button class="btn danger-outline small" id="deletePatient">🗑 حذف المريض</button>
          <button class="btn primary small" id="addVisitToPatient">＋ إضافة زيارة</button>
        </div>

        <div class="modal-toolbar">
          <h3>سجل الزيارات</h3>
        </div>
        ${visitTable(details.visits)}
      </section>
    </div>`;

  const close = () => root.innerHTML='';
  document.querySelector<HTMLButtonElement>('#closePatient')!.onclick = close;
  document.querySelector<HTMLDivElement>('#patientModalBackdrop')!.onclick = e => {
    if (e.target === e.currentTarget) close();
  };

  document.querySelector<HTMLButtonElement>('#patientExportImage')!.onclick = () =>
    exportPatientFile(details, 'png');
  document.querySelector<HTMLButtonElement>('#patientExportPdf')!.onclick = () =>
    exportPatientFile(details, 'pdf');

  document.querySelector<HTMLButtonElement>('#editPatientFromDetails')!.onclick = () => {
    close();
    openEditPatient(id);
  };

  document.querySelector<HTMLButtonElement>('#toggleBlacklist')!.onclick = async () => {
    await invoke('set_patient_blacklisted', { input: { id, blacklisted: !p.blacklisted } });
    toast(!p.blacklisted ? 'تمت إضافة المريض إلى Black List' : 'تمت إزالة المريض من Black List');
    close();
    await renderScreen();
  };

  document.querySelector<HTMLButtonElement>('#deletePatient')!.onclick = async () => {
    if (!confirm(`حذف ملف ${p.fullName || 'المريض'} نهائيًا بكل زياراته؟`)) return;
    if (!confirm('تأكيد أخير: الحذف نهائي ولا يمكن التراجع عنه إلا من نسخة احتياطية.')) return;
    await invoke('delete_patient', { id });
    close();
    toast('تم حذف ملف المريض');
    await renderScreen();
  };

  document.querySelector<HTMLButtonElement>('#addVisitToPatient')!.onclick = () => {
    if (p.blacklisted && !confirm('هذا المريض موجود في Black List. هل تريد تسجيل زيارة رغم ذلك؟')) return;
    close();
    openVisitModal(p);
  };
}

function doctorOptions(selected = '') {
  return `<option value="">— اختر الطبيب —</option>` + doctors.filter(d=>d.active).map(d =>
    `<option value="${esc(d.name)}" data-specialty="${esc(d.specialty)}" ${d.name===selected?'selected':''}>${esc(d.name)}</option>`
  ).join('');
}

async function openCaseModal(existing?: Patient) {
  if (existing) return openVisitModal(existing);
  return openPatientRegistrationModal();
}

async function openPatientRegistrationModal() {
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;
  root.innerHTML = `
    <div class="modal-backdrop" id="caseBackdrop">
      <section class="modal form-modal">
        <div class="modal-head">
          <div><h2>تسجيل مريض</h2><p>بيانات المريض فقط — لو رقم التليفون موجود هيفتح الملف الموجود</p></div>
          <button class="modal-close" id="closeCase">×</button>
        </div>
        <form id="patientRegisterForm">
          <div class="section-title">بيانات المريض</div>
          <div class="patient-register-grid">
            <label class="field-name">الاسم بالكامل<input name="fullName"></label>
            <label class="field-phone">رقم التليفون<input class="ltr" name="phone" inputmode="tel"></label>
            <label class="field-age">السن<input name="age" type="number" min="0" max="130"></label>
            <label class="field-gender">النوع<select name="gender"><option value="">—</option><option>ذكر</option><option>أنثى</option></select></label>
            <label class="field-address">العنوان (اختياري)<input name="address"></label>
          </div>
          <div class="form-actions">
            <button type="button" class="btn ghost" id="cancelCase">إلغاء</button>
            <button type="submit" class="btn primary">حفظ وفتح الملف</button>
          </div>
        </form>
      </section>
    </div>`;

  const close = () => root.innerHTML='';
  document.querySelector<HTMLButtonElement>('#closeCase')!.onclick = close;
  document.querySelector<HTMLButtonElement>('#cancelCase')!.onclick = close;

  document.querySelector<HTMLFormElement>('#patientRegisterForm')!.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const rawAge = String(fd.get('age')||'').trim();

    try {
      const result = await invoke<{id:string, existed:boolean}>('register_patient', { input: {
        fullName: String(fd.get('fullName')||'').trim(),
        phone: String(fd.get('phone')||'').trim(),
        age: rawAge ? Number(rawAge) : null,
        gender: String(fd.get('gender')||''),
        address: String(fd.get('address')||'').trim()
      }});

      close();
      toast(result.existed ? 'رقم التليفون موجود — تم فتح ملف المريض' : 'تم إنشاء ملف المريض');
      await renderScreen();
      await openPatient(result.id);
    } catch (err) {
      toast(`تعذر الحفظ: ${String(err)}`, 'error');
    }
  };
}

async function openVisitModal(patient: Patient) {
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;
  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal form-modal">
        <div class="modal-head">
          <div>
            <h2>إضافة زيارة</h2>
            <p>${esc(patient.fullName || 'بدون اسم')} • <span class="ltr">${esc(patient.phone || 'بدون رقم')}</span></p>
          </div>
          <button class="modal-close" id="closeVisit">×</button>
        </div>

        <form id="visitForm">
          <div class="form-grid">
            <label class="span2">نوع الزيارة
              <select name="visitType">
                <option value="كشف جديد">كشف جديد</option>
                <option value="استشارة">استشارة</option>
              </select>
            </label>
            <label class="span2">الطبيب
              <select name="doctor">${doctorOptions(patient.doctor || '')}</select>
            </label>
            <label>سعر الكشف
              <input class="ltr" name="fee" type="number" min="0" step="0.01" placeholder="يكتب يدويًا">
            </label>
            <label>التاريخ
              <input name="visitDate" type="date" value="${today()}">
            </label>
            <label>الوقت
              <input name="visitTime" type="time" value="${timeNow()}">
            </label>
          </div>

          <div class="form-actions">
            <button type="button" class="btn ghost" id="cancelVisit">إلغاء</button>
            <button type="submit" class="btn primary">حفظ الزيارة</button>
          </div>
        </form>
      </section>
    </div>`;

  const close = () => root.innerHTML='';
  document.querySelector<HTMLButtonElement>('#closeVisit')!.onclick = close;
  document.querySelector<HTMLButtonElement>('#cancelVisit')!.onclick = close;

  document.querySelector<HTMLFormElement>('#visitForm')!.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);

    try {
      await invoke('add_visit', { input: {
        patientId: patient.id,
        visitType: String(fd.get('visitType')||''),
        doctor: String(fd.get('doctor')||'').trim(),
        fee: String(fd.get('fee')||'').trim(),
        visitDate: String(fd.get('visitDate')||''),
        visitTime: String(fd.get('visitTime')||'')
      }});

      close();
      toast('تم حفظ الزيارة');
      await renderScreen();
      await openPatient(patient.id);
    } catch (err) {
      toast(`تعذر حفظ الزيارة: ${String(err)}`, 'error');
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
          <label class="span2">العنوان (اختياري)<input name="address" value="${esc(p.address)}"></label>
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
