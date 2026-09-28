import QRCode from 'qrcode';
import { invoke } from '@tauri-apps/api/core';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
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
  bookingSource: string;
  status: string;
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

type AppSettings = {
  whatsappNumber: string;
  phoneNumber: string;
  operationalStartHour: number;
  backupPath: string;
  databasePath: string;
  version: string;
};

type HealthCheck = {
  integrityOk: boolean;
  integrityMessage: string;
  foreignKeyIssues: number;
  databaseSize: number;
  backupCount: number;
  backupWritable: boolean;
};

type Screen = 'dashboard' | 'patients' | 'today' | 'doctors' | 'reports' | 'archive' | 'backups' | 'settings';

const app = document.querySelector<HTMLDivElement>('#app')!;
let screen: Screen = 'dashboard';
let doctors: Doctor[] = [];
let appSettings: AppSettings = {
  whatsappNumber: '01102233167',
  phoneNumber: '01107072134',
  operationalStartHour: 11,
  backupPath: '',
  databasePath: '',
  version: '5.1.0'
};
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
  const startHour = Number.isFinite(appSettings.operationalStartHour)
    ? Math.max(0, Math.min(23, appSettings.operationalStartHour))
    : 11;
  if (d.getHours() < startHour) d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function operationalStartLabel() {
  return `${String(appSettings.operationalStartHour).padStart(2, '0')}:00`;
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


function visitStatusOptions(current = '') {
  const value = current || 'لم يحدد';
  const options = ['لم يحدد', 'حضر', 'لم يحضر', 'ملغي', 'مؤجل'];
  return options.map(x => `<option value="${esc(x)}" ${x === value ? 'selected' : ''}>${esc(x)}</option>`).join('');
}

function bookingSourceOptions(current = '') {
  const value = current || 'عادي';
  const options = ['فيزيتا', 'اكشف', 'كلينيدو', 'عادي'];
  return options.map(x => `<option value="${esc(x)}" ${x === value ? 'selected' : ''}>${esc(x)}</option>`).join('');
}

document.addEventListener('change', async event => {
  const target = event.target as HTMLElement;
  const select = target.closest<HTMLSelectElement>('select[data-visit-status-id]');
  if (!select) return;

  const visitId = select.dataset.visitStatusId || '';
  if (!visitId) return;

  const previous = select.dataset.previousStatus || 'لم يحدد';
  select.disabled = true;

  try {
    await invoke('set_visit_status', {
      input: { id: visitId, status: select.value }
    });
    select.dataset.previousStatus = select.value;
    toast(`تم تحديث حالة الزيارة إلى: ${select.value}`);
  } catch (err) {
    select.value = previous;
    toast(`تعذر تحديث حالة الزيارة: ${String(err)}`, 'error');
  } finally {
    select.disabled = false;
  }
});


type ExportFormat = 'pdf' | 'png';

function safeExportName(v: string) {
  return v.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

function reportPeriodLabel(from: string, to: string) {
  return from === to ? displayDate(from) : `${displayDate(from)} إلى ${displayDate(to)}`;
}


function visitFeeNumber(v: Visit) {
  const n = Number(String(v.fee || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function reportMetrics(rows: Visit[]) {
  const patientIds = new Set(rows.map(v => v.patientId));
  return {
    totalVisits: rows.length,
    uniquePatients: patientIds.size,
    revenue: rows.reduce((sum, v) => sum + visitFeeNumber(v), 0),
    attended: rows.filter(v => v.status === 'حضر').length,
    noShow: rows.filter(v => v.status === 'لم يحضر').length,
    cancelled: rows.filter(v => v.status === 'ملغي').length,
    postponed: rows.filter(v => v.status === 'مؤجل').length,
    unspecified: rows.filter(v => !v.status || v.status === 'لم يحدد').length,
    newVisits: rows.filter(v => v.visitType === 'كشف جديد').length,
    consultations: rows.filter(v => v.visitType === 'استشارة').length
  };
}

function doctorBreakdown(rows: Visit[]) {
  const map = new Map<string, {count:number; revenue:number; attended:number}>();
  for (const v of rows) {
    const doctor = (v.doctor || '').trim() || 'بدون طبيب';
    const item = map.get(doctor) || { count: 0, revenue: 0, attended: 0 };
    item.count += 1;
    item.revenue += visitFeeNumber(v);
    if (v.status === 'حضر') item.attended += 1;
    map.set(doctor, item);
  }
  return [...map.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], 'ar'));
}

function filteredReportResult(base: ReportResult, status: string, visitType: string): ReportResult {
  const rows = base.rows.filter(v =>
    (!status || (v.status || 'لم يحدد') === status) &&
    (!visitType || v.visitType === visitType)
  );
  const ids = new Set(rows.map(v => v.patientId));
  return {
    totalVisits: rows.length,
    uniquePatients: ids.size,
    rows
  };
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
          <th>مصدر الحجز</th>
          <th>حالة الزيارة</th>
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
            <td>${esc(v.bookingSource || 'عادي')}</td>
            <td>${esc(v.status || 'لم يحدد')}</td>
            <td>${esc(v.doctor || '—')}</td>
            <td class="ltr">${v.fee ? `${esc(v.fee)} ج.م` : '—'}</td>
          </tr>
        `).join('') : `<tr><td colspan="${includePatient ? 9 : 7}">لا توجد بيانات</td></tr>`}
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
          <strong class="ltr">${esc(appSettings.whatsappNumber)}</strong>
        </div>
        <div class="patient-print-footer-item">
          <span class="patient-print-footer-badge phone">☎</span>
          <strong class="ltr">${esc(appSettings.phoneNumber)}</strong>
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

    const selectedPath = await saveDialog({
      title: 'اختيار مكان حفظ الملف',
      defaultPath: fileName,
      filters: [{
        name: format === 'pdf' ? 'PDF' : 'PNG',
        extensions: [format]
      }]
    });

    if (!selectedPath) {
      toast('تم إلغاء الحفظ');
      return;
    }

    const saved = await invoke<string>('save_export', {
      input: { fileName, base64Data, targetPath: selectedPath }
    });
    toast(`تم حفظ الملف بنجاح: ${saved}`);
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
  const metrics = reportMetrics(result.rows);
  const doctorRows = doctorBreakdown(result.rows);

  const doctorSummary = doctorRows.length ? `
    <h3 class="export-section-heading">ملخص الأطباء</h3>
    <table class="export-table">
      <thead>
        <tr><th>الطبيب</th><th>عدد الحالات</th><th>حضر</th><th>التحصيل</th></tr>
      </thead>
      <tbody>
        ${doctorRows.map(([name, item]) => `
          <tr>
            <td>${esc(name)}</td>
            <td>${item.count}</td>
            <td>${item.attended}</td>
            <td class="ltr">${item.revenue.toFixed(2)} ج.م</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '';

  const body = `
    <div class="export-summary export-summary-v48">
      <div><span>الفترة</span><strong>${esc(reportPeriodLabel(from, to))}</strong></div>
      <div><span>الطبيب</span><strong>${esc(doctor || 'كل الأطباء')}</strong></div>
      <div><span>عدد الزيارات</span><strong>${metrics.totalVisits}</strong></div>
      <div><span>عدد المرضى</span><strong>${metrics.uniquePatients}</strong></div>
      <div><span>إجمالي التحصيل</span><strong class="ltr">${metrics.revenue.toFixed(2)} ج.م</strong></div>
      <div><span>حضر</span><strong>${metrics.attended}</strong></div>
      <div><span>لم يحضر</span><strong>${metrics.noShow}</strong></div>
      <div><span>ملغي / مؤجل</span><strong>${metrics.cancelled + metrics.postponed}</strong></div>
    </div>
    ${doctorSummary}
    <h3 class="export-section-heading">تفاصيل الزيارات</h3>
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

async function loadSettings() {
  appSettings = await invoke<AppSettings>('get_settings');
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
          ${navButton('settings','⚙','الإعدادات')}
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
  await Promise.all([loadDoctors(), loadSettings()]);
  if (screen === 'dashboard') return renderDashboard();
  if (screen === 'patients') return renderPatients(false);
  if (screen === 'archive') return renderPatients(true);
  if (screen === 'today') return renderToday();
  if (screen === 'doctors') return renderDoctors();
  if (screen === 'reports') return renderReports();
  if (screen === 'backups') return renderBackups();
  if (screen === 'settings') return renderSettings();
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
  const dayKey = businessDay();

  const [stats, recent, todayReport] = await Promise.all([
    invoke<Stats>('get_stats'),
    invoke<Patient[]>('list_patients', { query: { search: '', archivedOnly: false, limit: 8 } }),
    invoke<ReportResult>('run_report', { query: { from: dayKey, to: dayKey, doctor: '' } })
  ]);

  const numberFee = (v: Visit) => {
    const n = Number(String(v.fee || '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const todayRevenue = todayReport.rows.reduce((sum, v) => sum + numberFee(v), 0);
  const attended = todayReport.rows.filter(v => v.status === 'حضر').length;
  const newVisits = todayReport.rows.filter(v => v.visitType === 'كشف جديد').length;
  const consultations = todayReport.rows.filter(v => v.visitType === 'استشارة').length;

  const doctorMap = new Map<string, {count:number; revenue:number}>();
  for (const visit of todayReport.rows) {
    const doctor = (visit.doctor || '').trim() || 'بدون طبيب';
    const item = doctorMap.get(doctor) || { count: 0, revenue: 0 };
    item.count += 1;
    item.revenue += numberFee(visit);
    doctorMap.set(doctor, item);
  }

  const doctorRows = [...doctorMap.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], 'ar'));

  shell(`
    <div class="stats-grid dashboard-stats-v47">
      <article class="stat"><div class="stat-icon">👥</div><div><span>إجمالي المرضى</span><strong>${stats.totalPatients}</strong></div></article>
      <article class="stat"><div class="stat-icon">◷</div><div><span>حالات اليوم</span><strong>${todayReport.totalVisits}</strong></div></article>
      <article class="stat"><div class="stat-icon">ج.م</div><div><span>تحصيل اليوم</span><strong>${todayRevenue.toFixed(2)}</strong></div></article>
      <article class="stat"><div class="stat-icon">✓</div><div><span>حضر اليوم</span><strong>${attended}</strong></div></article>
      <article class="stat"><div class="stat-icon">＋</div><div><span>كشف جديد</span><strong>${newVisits}</strong></div></article>
      <article class="stat"><div class="stat-icon">↻</div><div><span>استشارة</span><strong>${consultations}</strong></div></article>
    </div>

    <div class="dashboard-grid">
      <section class="card">
        <div class="card-head"><div><h2>حالات الأطباء اليوم</h2><p>${displayDate(dayKey)} • عدد الحالات والتحصيل لكل طبيب</p></div>
          <button class="btn ghost" id="goTodayBtn">فتح حالات اليوم</button>
        </div>
        <div class="doctor-day-grid">
          ${doctorRows.length ? doctorRows.map(([doctor, item]) => `
            <article class="doctor-day-card">
              <div>
                <strong>${esc(doctor)}</strong>
                <span>${item.count} حالة</span>
              </div>
              <b class="ltr">${item.revenue.toFixed(2)} ج.م</b>
            </article>
          `).join('') : `<div class="empty-block">لا توجد حالات مسجلة في اليوم التشغيلي الحالي</div>`}
        </div>
      </section>

      <section class="quick-card">
        <h2>إجراءات سريعة</h2>
        <button class="quick" id="quickNew">＋ <span><b>تسجيل حالة جديدة</b><small>بيانات المريض ثم الزيارة مباشرة</small></span></button>
        <button class="quick" id="quickToday">◷ <span><b>حالات اليوم</b><small>الحضور والإلغاء والتأجيل</small></span></button>
        <button class="quick" id="quickBackup">⟳ <span><b>نسخة احتياطية</b><small>حفظ نسخة من قاعدة البيانات الآن</small></span></button>
      </section>
    </div>

    <section class="card dashboard-recent-card">
      <div class="card-head"><div><h2>آخر ملفات المرضى</h2><p>أحدث الملفات التي تم التعامل معها</p></div>
        <button class="btn ghost" id="allPatientsBtn">عرض الكل</button>
      </div>
      ${patientTable(recent, false)}
    </section>
  `, 'لوحة التحكم', 'حركة العيادة اليوم بشكل مباشر');

  bindPatientActions();
  ensureCaseContextMenu();

  document.querySelector<HTMLButtonElement>('#allPatientsBtn')!.onclick = () => navigate('patients');
  document.querySelector<HTMLButtonElement>('#goTodayBtn')!.onclick = () => navigate('today');
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
  const baseResult = await invoke<ReportResult>('run_report', { query: { from: dayKey, to: dayKey, doctor: '' } });
  const metrics = reportMetrics(baseResult.rows);

  ensureCaseContextMenu();
  shell(`
    <section class="card">
      <div class="card-head">
        <div>
          <h2>حالات اليوم</h2>
          <p>اليوم التشغيلي يبدأ ${operationalStartLabel()} • ${displayDate(dayKey)} • ${baseResult.totalVisits} حالة</p>
        </div>
        <div class="filters">
          <button class="btn ghost small" id="todayImage">تحميل صورة</button>
          <button class="btn primary small" id="todayPdf">تحميل PDF</button>
        </div>
      </div>

      <div class="today-summary-grid">
        <div><span>الحالات</span><strong>${metrics.totalVisits}</strong></div>
        <div><span>التحصيل</span><strong class="ltr">${metrics.revenue.toFixed(2)} ج.م</strong></div>
        <div><span>حضر</span><strong>${metrics.attended}</strong></div>
        <div><span>لم يحضر</span><strong>${metrics.noShow}</strong></div>
        <div><span>ملغي</span><strong>${metrics.cancelled}</strong></div>
        <div><span>مؤجل</span><strong>${metrics.postponed}</strong></div>
      </div>

      <div class="today-filter-panel">
        <label>الطبيب
          <select id="todayDoctorFilter">
            <option value="">كل الأطباء</option>
            ${doctors.filter(d => d.active).map(d => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('')}
          </select>
        </label>
        <label>الحالة
          <select id="todayStatusFilter">
            <option value="">كل الحالات</option>
            <option>حضر</option>
            <option>لم يحضر</option>
            <option>ملغي</option>
            <option>مؤجل</option>
            <option>لم يحدد</option>
          </select>
        </label>
        <label>نوع الزيارة
          <select id="todayTypeFilter">
            <option value="">كل الأنواع</option>
            <option>كشف جديد</option>
            <option>استشارة</option>
          </select>
        </label>
      </div>

      <div id="todayVisitTable">${visitTable(baseResult.rows, true)}</div>

      <div class="today-search-panel">
        <div>
          <strong>البحث في ملفات المرضى</strong>
          <small>ابحث بالاسم أو رقم التليفون لفتح أي ملف قديم</small>
        </div>
        <input class="search-input" id="todayPatientSearch" placeholder="اسم المريض أو رقم التليفون..." />
      </div>
      <div id="todayPatientSearchResults"></div>
    </section>
  `, 'حالات اليوم', 'متابعة الحضور والتحصيل وحالات الأطباء');

  const doctorFilter = document.querySelector<HTMLSelectElement>('#todayDoctorFilter')!;
  const statusFilter = document.querySelector<HTMLSelectElement>('#todayStatusFilter')!;
  const typeFilter = document.querySelector<HTMLSelectElement>('#todayTypeFilter')!;
  const tableHost = document.querySelector<HTMLDivElement>('#todayVisitTable')!;

  const filteredRows = () => baseResult.rows.filter(v =>
    (!doctorFilter.value || v.doctor === doctorFilter.value) &&
    (!statusFilter.value || (v.status || 'لم يحدد') === statusFilter.value) &&
    (!typeFilter.value || v.visitType === typeFilter.value)
  );

  const applyFilters = () => {
    tableHost.innerHTML = visitTable(filteredRows(), true);
    ensureCaseContextMenu();
  };

  doctorFilter.onchange = applyFilters;
  statusFilter.onchange = applyFilters;
  typeFilter.onchange = applyFilters;

  document.querySelector<HTMLButtonElement>('#todayImage')!.onclick = () => {
    const rows = filteredRows();
    const ids = new Set(rows.map(v => v.patientId));
    return exportReportFile({ totalVisits: rows.length, uniquePatients: ids.size, rows }, dayKey, dayKey, doctorFilter.value, 'png');
  };

  document.querySelector<HTMLButtonElement>('#todayPdf')!.onclick = () => {
    const rows = filteredRows();
    const ids = new Set(rows.map(v => v.patientId));
    return exportReportFile({ totalVisits: rows.length, uniquePatients: ids.size, rows }, dayKey, dayKey, doctorFilter.value, 'pdf');
  };

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
          <th>نوع الزيارة</th><th>مصدر الحجز</th><th>حالة الزيارة</th><th>الطبيب</th><th>سعر الكشف</th><th>إجراءات</th>
        </tr></thead>
        <tbody>${rows.length ? rows.map(v => `
          <tr class="visit-context-row" data-patient-id="${esc(v.patientId)}" data-patient-name="${esc(v.patientName || '')}" data-patient-phone="${esc(v.patientPhone || '')}">
            <td>${displayDate(v.visitDate)}</td>
            <td class="ltr">${esc(v.visitTime)}</td>
            ${showPatient ? `<td>${esc(v.patientName || '—')}</td><td class="ltr">${esc(v.patientPhone || '—')}</td>` : ''}
            <td><span class="visit-type-badge">${esc(v.visitType || 'زيارة')}</span></td>
            <td><span class="booking-source-badge">${esc(v.bookingSource || 'عادي')}</span></td>
            <td>
              <select class="visit-status-select" data-visit-status-id="${esc(v.id)}" data-previous-status="${esc(v.status || 'لم يحدد')}">
                ${visitStatusOptions(v.status)}
              </select>
            </td>
            <td>${esc(v.doctor || '—')}</td>
            <td class="ltr">${v.fee ? `${esc(v.fee)} ج.م` : '—'}</td>
            <td>
              <div class="visit-row-actions">
                <button class="icon-action edit" type="button" data-edit-visit="${esc(v.id)}" title="تعديل الزيارة">✎</button>
                <button class="icon-action danger" type="button" data-delete-visit="${esc(v.id)}" title="حذف الزيارة">🗑</button>
              </div>
            </td>
          </tr>`).join('') : `<tr><td colspan="${showPatient ? 10 : 8}" class="empty-row">لا توجد زيارات</td></tr>`}
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
        <div><h2>التقارير</h2><p>تقارير تشغيلية ومالية مع فلاتر الحضور ونوع الزيارة</p></div>
        <button class="btn ghost small" id="openExportsFolder">فتح مجلد التحميلات</button>
      </div>

      <div class="report-quick-ranges">
        <button class="btn ghost small" id="rangeToday">اليوم</button>
        <button class="btn ghost small" id="rangeMonth">الشهر الحالي</button>
        <span>أو اختر الفترة يدويًا</span>
      </div>

      <div class="report-filters report-filters-v48">
        <label>من<input id="reportFrom" type="date" value="${monthFrom}"></label>
        <label>إلى<input id="reportTo" type="date" value="${today()}"></label>
        <label>الطبيب<select id="reportDoctor"><option value="">كل الأطباء</option>${doctors.filter(d=>d.active).map(d=>`<option>${esc(d.name)}</option>`).join('')}</select></label>
        <label>حالة الزيارة
          <select id="reportStatus">
            <option value="">كل الحالات</option>
            <option>حضر</option>
            <option>لم يحضر</option>
            <option>ملغي</option>
            <option>مؤجل</option>
            <option>لم يحدد</option>
          </select>
        </label>
        <label>نوع الزيارة
          <select id="reportVisitType">
            <option value="">كل الأنواع</option>
            <option>كشف جديد</option>
            <option>استشارة</option>
          </select>
        </label>
        <button class="btn primary" id="runReportBtn">عرض التقرير</button>
      </div>

      <div class="report-export-bar">
        <button class="btn ghost small" id="reportImage">تحميل صورة</button>
        <button class="btn primary small" id="reportPdf">تحميل PDF</button>
      </div>

      <div id="reportResult" class="report-result"></div>
    </section>
  `, 'التقارير', 'متابعة الحالات والحضور والتحصيل لأي فترة');

  let currentBaseResult: ReportResult | null = null;
  let currentResult: ReportResult | null = null;

  const queryValues = () => ({
    from: document.querySelector<HTMLInputElement>('#reportFrom')!.value,
    to: document.querySelector<HTMLInputElement>('#reportTo')!.value,
    doctor: document.querySelector<HTMLSelectElement>('#reportDoctor')!.value,
    status: document.querySelector<HTMLSelectElement>('#reportStatus')!.value,
    visitType: document.querySelector<HTMLSelectElement>('#reportVisitType')!.value
  });

  const renderResult = () => {
    if (!currentBaseResult) return;
    const q = queryValues();
    const result = filteredReportResult(currentBaseResult, q.status, q.visitType);
    currentResult = result;
    const metrics = reportMetrics(result.rows);
    const doctorRows = doctorBreakdown(result.rows);

    document.querySelector<HTMLDivElement>('#reportResult')!.innerHTML = `
      <div class="report-stats report-stats-v48">
        <div><span>عدد الزيارات</span><strong>${metrics.totalVisits}</strong></div>
        <div><span>مرضى مختلفون</span><strong>${metrics.uniquePatients}</strong></div>
        <div><span>إجمالي التحصيل</span><strong class="ltr">${metrics.revenue.toFixed(2)} ج.م</strong></div>
        <div><span>حضر</span><strong>${metrics.attended}</strong></div>
        <div><span>لم يحضر</span><strong>${metrics.noShow}</strong></div>
        <div><span>ملغي</span><strong>${metrics.cancelled}</strong></div>
        <div><span>مؤجل</span><strong>${metrics.postponed}</strong></div>
        <div><span>كشف / استشارة</span><strong>${metrics.newVisits} / ${metrics.consultations}</strong></div>
      </div>

      <div class="report-doctor-breakdown">
        <h3>ملخص الأطباء</h3>
        <div class="doctor-day-grid">
          ${doctorRows.length ? doctorRows.map(([name, item]) => `
            <article class="doctor-day-card">
              <div>
                <strong>${esc(name)}</strong>
                <span>${item.count} حالة • حضر ${item.attended}</span>
              </div>
              <b class="ltr">${item.revenue.toFixed(2)} ج.م</b>
            </article>
          `).join('') : `<div class="empty-block">لا توجد بيانات للفلاتر الحالية</div>`}
        </div>
      </div>

      ${visitTable(result.rows, true)}
    `;
  };

  const run = async () => {
    const q = queryValues();
    currentBaseResult = await invoke<ReportResult>('run_report', {
      query: { from: q.from, to: q.to, doctor: q.doctor }
    });
    renderResult();
  };

  document.querySelector<HTMLButtonElement>('#runReportBtn')!.onclick = run;
  document.querySelector<HTMLSelectElement>('#reportStatus')!.onchange = renderResult;
  document.querySelector<HTMLSelectElement>('#reportVisitType')!.onchange = renderResult;

  document.querySelector<HTMLButtonElement>('#rangeToday')!.onclick = async () => {
    const d = businessDay();
    document.querySelector<HTMLInputElement>('#reportFrom')!.value = d;
    document.querySelector<HTMLInputElement>('#reportTo')!.value = d;
    await run();
  };

  document.querySelector<HTMLButtonElement>('#rangeMonth')!.onclick = async () => {
    document.querySelector<HTMLInputElement>('#reportFrom')!.value = monthFrom;
    document.querySelector<HTMLInputElement>('#reportTo')!.value = monthTo;
    await run();
  };

  document.querySelector<HTMLButtonElement>('#reportImage')!.onclick = async () => {
    await run();
    const q = queryValues();
    if (currentResult) await exportReportFile(currentResult, q.from, q.to, q.doctor, 'png');
  };

  document.querySelector<HTMLButtonElement>('#reportPdf')!.onclick = async () => {
    await run();
    const q = queryValues();
    if (currentResult) await exportReportFile(currentResult, q.from, q.to, q.doctor, 'pdf');
  };

  document.querySelector<HTMLButtonElement>('#openExportsFolder')!.onclick = async () => {
    await invoke('open_export_folder');
  };

  await run();
}


async function renderSettings() {
  const hourOptions = Array.from({ length: 24 }, (_, hour) =>
    `<option value="${hour}" ${hour === appSettings.operationalStartHour ? 'selected' : ''}>${String(hour).padStart(2, '0')}:00</option>`
  ).join('');

  shell(`
    <section class="card settings-card">
      <div class="card-head">
        <div>
          <h2>إعدادات النظام</h2>
          <p>الإعدادات العامة المحفوظة داخل قاعدة بيانات البرنامج</p>
        </div>
        <span class="version-badge">V${esc(appSettings.version)}</span>
      </div>

      <form id="settingsForm">
        <div class="settings-grid">
          <label>رقم واتساب في الطباعة
            <input class="ltr" name="whatsappNumber" value="${esc(appSettings.whatsappNumber)}" maxlength="32">
          </label>

          <label>رقم الهاتف في الطباعة
            <input class="ltr" name="phoneNumber" value="${esc(appSettings.phoneNumber)}" maxlength="32">
          </label>

          <label>بداية اليوم التشغيلي
            <select name="operationalStartHour">${hourOptions}</select>
          </label>

          <label class="span2">مجلد النسخ الاحتياطية
            <input class="ltr" value="${esc(appSettings.backupPath)}" readonly>
          </label>

          <label class="span2">قاعدة البيانات المحلية
            <input class="ltr" value="${esc(appSettings.databasePath)}" readonly>
          </label>
        </div>

        <div class="settings-note">
          مكان النسخ الاحتياطية ثابت ومؤمّن حاليًا حتى لا يتم استرجاع ملفات من مسارات غير موثوقة.
        </div>

        <div class="form-actions settings-actions">
          <button type="button" class="btn ghost" id="openSettingsBackupFolder">فتح مجلد النسخ</button>
          <button type="button" class="btn ghost" id="healthCheckBtn">فحص النظام</button>
          <button type="submit" class="btn primary">حفظ الإعدادات</button>
        </div>
      </form>

      <div id="healthResult" class="health-result"></div>
    </section>
  `, 'الإعدادات', 'أرقام التواصل وبداية اليوم وفحص سلامة النظام');

  document.querySelector<HTMLButtonElement>('#openSettingsBackupFolder')!.onclick = async () => {
    await invoke('open_backup_folder');
  };

  document.querySelector<HTMLButtonElement>('#healthCheckBtn')!.onclick = async () => {
    const box = document.querySelector<HTMLDivElement>('#healthResult')!;
    box.innerHTML = '<div class="health-running">جاري فحص قاعدة البيانات والنسخ الاحتياطية...</div>';

    try {
      const health = await invoke<HealthCheck>('health_check');
      const ok = health.integrityOk && health.foreignKeyIssues === 0 && health.backupWritable;
      box.innerHTML = `
        <div class="health-card ${ok ? 'ok' : 'warn'}">
          <strong>${ok ? '✓ النظام سليم' : '⚠ يحتاج مراجعة'}</strong>
          <div class="health-grid">
            <span>سلامة قاعدة البيانات: <b>${health.integrityOk ? 'سليم' : esc(health.integrityMessage)}</b></span>
            <span>مشاكل العلاقات: <b>${health.foreignKeyIssues}</b></span>
            <span>حجم قاعدة البيانات: <b>${(health.databaseSize / 1024 / 1024).toFixed(2)} MB</b></span>
            <span>عدد النسخ الاحتياطية: <b>${health.backupCount}</b></span>
            <span>النسخ قابل للكتابة: <b>${health.backupWritable ? 'نعم' : 'لا'}</b></span>
          </div>
        </div>`;
    } catch (err) {
      box.innerHTML = `<div class="health-card warn"><strong>تعذر الفحص</strong><span>${esc(String(err))}</span></div>`;
    }
  };

  document.querySelector<HTMLFormElement>('#settingsForm')!.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);

    try {
      const saved = await invoke<AppSettings>('save_settings', { input: {
        whatsappNumber: String(fd.get('whatsappNumber') || '').trim(),
        phoneNumber: String(fd.get('phoneNumber') || '').trim(),
        operationalStartHour: Number(fd.get('operationalStartHour') || 11)
      }});

      appSettings = saved;
      activeBusinessDay = businessDay();
      toast('تم حفظ الإعدادات');
      await renderScreen();
    } catch (err) {
      toast(`تعذر حفظ الإعدادات: ${String(err)}`, 'error');
    }
  };
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
    <div class="modal-backdrop" id="patientModalBackdrop" data-patient-id="${esc(p.id)}">
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
          <div><h2>تسجيل حالة جديدة</h2><p>الخطوة 1 من 2 — بيانات المريض، وبعد الحفظ يتم فتح تسجيل الزيارة تلقائيًا</p></div>
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
            <button type="submit" class="btn primary">التالي: بيانات الزيارة</button>
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

      const details = await invoke<PatientDetails>('get_patient_details', { id: result.id });
      close();
      toast(result.existed
        ? 'المريض موجود بالفعل — أكمل بيانات الزيارة لتسجيل الحالة'
        : 'تم حفظ بيانات المريض — أكمل بيانات الزيارة لتسجيل الحالة');
      await renderScreen();
      await openVisitModal(details.patient);
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
            <label>مصدر الحجز
              <select name=\"bookingSource\">${bookingSourceOptions('عادي')}</select>
            </label>
            <label>سعر الكشف
              <input class="ltr" name="fee" type="number" min="0" step="0.01" placeholder="يكتب يدويًا">
            </label>
            <label>حالة الزيارة
              <select name="visitStatus">
                <option value="لم يحدد">لم يحدد</option>
                <option value="حضر">حضر</option>
                <option value="لم يحضر">لم يحضر</option>
                <option value="ملغي">ملغي</option>
                <option value="مؤجل">مؤجل</option>
              </select>
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
        bookingSource: String(fd.get('bookingSource')||'عادي'),
        doctor: String(fd.get('doctor')||'').trim(),
        fee: String(fd.get('fee')||'').trim(),
        status: String(fd.get('visitStatus')||'لم يحدد'),
        visitDate: String(fd.get('visitDate')||''),
        visitTime: String(fd.get('visitTime')||'')
      }});

      close();
      toast('تم حفظ الحالة وإضافتها إلى حالات اليوم والتقارير');
      await renderScreen();
      await openPatient(patient.id);
    } catch (err) {
      toast(`تعذر حفظ الزيارة: ${String(err)}`, 'error');
    }
  };
}


async function openEditVisitModal(visitId: string) {
  const visit = await invoke<Visit>('get_visit', { id: visitId });
  const reopenPatientId = document.querySelector<HTMLElement>('#patientModalBackdrop')?.dataset.patientId || '';
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;

  const visitDoctors = doctors.filter(d => d.active || d.name === visit.doctor);
  const doctorSelect = `<option value="">— اختر الطبيب —</option>` + visitDoctors.map(d =>
    `<option value="${esc(d.name)}" ${d.name === visit.doctor ? 'selected' : ''}>${esc(d.name)}</option>`
  ).join('');

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal form-modal">
        <div class="modal-head">
          <div><h2>تعديل الزيارة</h2><p>تعديل الزيارة فقط بدون تغيير ملف المريض</p></div>
          <button class="modal-close" id="closeEditVisit">×</button>
        </div>

        <form id="editVisitForm">
          <div class="form-grid">
            <label class="span2">نوع الزيارة
              <select name="visitType">
                <option value="كشف جديد" ${visit.visitType === 'كشف جديد' ? 'selected' : ''}>كشف جديد</option>
                <option value="استشارة" ${visit.visitType === 'استشارة' ? 'selected' : ''}>استشارة</option>
              </select>
            </label>
            <label class="span2">الطبيب
              <select name="doctor">${doctorSelect}</select>
            </label>
            <label>مصدر الحجز
              <select name=\"bookingSource\">${bookingSourceOptions(visit.bookingSource)}</select>
            </label>
            <label>سعر الكشف
              <input class="ltr" name="fee" type="number" min="0" step="0.01" value="${esc(visit.fee || '')}">
            </label>
            <label>حالة الزيارة
              <select name="status">${visitStatusOptions(visit.status)}</select>
            </label>
            <label>التاريخ
              <input name="visitDate" type="date" value="${esc(visit.visitDate)}">
            </label>
            <label>الوقت
              <input name="visitTime" type="time" value="${esc(visit.visitTime)}">
            </label>
          </div>

          <div class="form-actions">
            <button type="button" class="btn ghost" id="cancelEditVisit">إلغاء</button>
            <button class="btn primary">حفظ التعديل</button>
          </div>
        </form>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';
  document.querySelector<HTMLButtonElement>('#closeEditVisit')!.onclick = close;
  document.querySelector<HTMLButtonElement>('#cancelEditVisit')!.onclick = close;

  document.querySelector<HTMLFormElement>('#editVisitForm')!.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);

    try {
      await invoke('update_visit', { input: {
        id: visit.id,
        visitType: String(fd.get('visitType') || ''),
        bookingSource: String(fd.get('bookingSource') || 'عادي'),
        doctor: String(fd.get('doctor') || '').trim(),
        fee: String(fd.get('fee') || '').trim(),
        status: String(fd.get('status') || 'لم يحدد'),
        visitDate: String(fd.get('visitDate') || ''),
        visitTime: String(fd.get('visitTime') || '')
      }});

      close();
      toast('تم تعديل الزيارة');
      await renderScreen();
      if (reopenPatientId) await openPatient(reopenPatientId);
    } catch (err) {
      toast(`تعذر تعديل الزيارة: ${String(err)}`, 'error');
    }
  };
}

document.addEventListener('click', async event => {
  const target = event.target as HTMLElement;

  const editBtn = target.closest<HTMLButtonElement>('[data-edit-visit]');
  if (editBtn) {
    event.preventDefault();
    event.stopPropagation();
    const id = editBtn.dataset.editVisit || '';
    if (id) await openEditVisitModal(id);
    return;
  }

  const deleteBtn = target.closest<HTMLButtonElement>('[data-delete-visit]');
  if (!deleteBtn) return;

  event.preventDefault();
  event.stopPropagation();

  const id = deleteBtn.dataset.deleteVisit || '';
  if (!id) return;

  try {
    const visit = await invoke<Visit>('get_visit', { id });
    const reopenPatientId = document.querySelector<HTMLElement>('#patientModalBackdrop')?.dataset.patientId || '';

    if (!confirm(`حذف زيارة ${displayDate(visit.visitDate)} فقط؟ ملف المريض لن يتم حذفه.`)) return;

    await invoke('delete_visit', { id });
    toast('تم حذف الزيارة');
    await renderScreen();

    if (reopenPatientId) await openPatient(reopenPatientId);
  } catch (err) {
    toast(`تعذر حذف الزيارة: ${String(err)}`, 'error');
  }
});

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
