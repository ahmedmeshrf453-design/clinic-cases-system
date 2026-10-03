import QRCode from 'qrcode';
import { invoke } from '@tauri-apps/api/core';
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import './style.css';
import { LAB_TESTS, type LabTestItem } from './labCatalog';
import { LAB2LAB_SOURCE } from './lab2labCatalog';
import { LAB2LAB_ARABIC } from './lab2labArabic';

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
  clinicAmount: string;
  doctorAmount: string;
  visitType: string;
  bookingSource: string;
  status: string;
  patientName: string;
  patientPhone: string;
  createdAt: string;
};

type PatientDetails = { patient: Patient; visits: Visit[] };

type PatientLab = {
  id: string;
  patientId: string;
  catalogId: number;
  testName: string;
  price: string;
  createdAt: string;
};



type NursingOrder = {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  serviceName: string;
  price: string;
  orderDate: string;
  orderTime: string;
  createdAt: string;
};

type RadiologyOrder = {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  radiologyName: string;
  centerName: string;
  price: string;
  discountPercent: string;
  discountAmount: string;
  netTotal: string;
  orderDate: string;
  orderTime: string;
  createdAt: string;
};

type LabOrder = {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  orderDate: string;
  orderTime: string;
  subtotal: string;
  discountType: string;
  discountValue: string;
  discountAmount: string;
  netTotal: string;
  paidAmount: string;
  remainingAmount: string;
  itemsCount: number;
  createdAt: string;
};

type LabOrderItem = {
  id: string;
  orderId: string;
  catalogId: number;
  testName: string;
  price: string;
};

type LabOrderDetails = {
  order: LabOrder;
  items: LabOrderItem[];
};

type PatientFileSnapshot = {
  details: PatientDetails;
  labOrders: LabOrderDetails[];
  nursingOrders: NursingOrder[];
  radiologyOrders: RadiologyOrder[];
};

function displaySavedDateTime(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const [datePart, timePart = ''] = raw.split(' ');
  const time = timePart ? timePart.slice(0, 5) : '';
  return `${displayDate(datePart)}${time ? ` • ${time}` : ''}`;
}

async function loadPatientFile(patientId: string): Promise<PatientFileSnapshot> {
  const [details, labOrders, nursingOrders, radiologyOrders] = await Promise.all([
    invoke<PatientDetails>('get_patient_details', { id: patientId }),
    invoke<LabOrder[]>('list_patient_lab_orders', { patientId }),
    invoke<NursingOrder[]>('list_patient_nursing_orders', { patientId }),
    invoke<RadiologyOrder[]>('list_patient_radiology_orders', { patientId })
  ]);

  const labDetails = await Promise.all(
    labOrders.map(order => invoke<LabOrderDetails>('get_lab_order', { id: order.id }))
  );

  return {
    details,
    labOrders: labDetails,
    nursingOrders,
    radiologyOrders
  };
}

function patientFileTimelineHtml(file: PatientFileSnapshot, interactive = true) {
  const p = file.details.patient;

  const items: Array<{
    kind: 'created' | 'visit' | 'lab' | 'nursing' | 'radiology';
    id: string;
    savedAt: string;
    serviceAt: string;
    icon: string;
    title: string;
    subtitle: string;
    detail: string;
    money: string;
  }> = [];

  items.push({
    kind: 'created',
    id: p.id,
    savedAt: p.createdAt,
    serviceAt: p.createdAt,
    icon: '📁',
    title: 'إنشاء ملف المريض',
    subtitle: 'تم حفظ بيانات المريض الأساسية',
    detail: `رقم الملف: ${p.id.slice(0, 8).toUpperCase()}`,
    money: ''
  });

  file.details.visits.forEach(v => {
    const fee = moneyNumber(v.fee);
    const clinicAmount = moneyNumber(v.clinicAmount);
    const doctorAmount = moneyNumber(v.doctorAmount);
    items.push({
      kind: 'visit',
      id: v.id,
      savedAt: v.createdAt,
      serviceAt: `${v.visitDate || ''} ${v.visitTime || ''}`.trim(),
      icon: v.visitType === 'استشارة' ? '↻' : '🩺',
      title: `${v.visitType || 'زيارة'}${v.doctor ? ` — ${v.doctor}` : ''}`,
      subtitle: [v.specialty, `مصدر الحجز: ${v.bookingSource || 'عادي'}`].filter(Boolean).join(' • '),
      detail: `تاريخ الخدمة: ${displayDate(v.visitDate)}${v.visitTime ? ` • ${v.visitTime}` : ''}`,
      money: [
        fee ? `الكشف ${fee.toFixed(2)} ج.م` : '',
        clinicAmount ? `العيادات ${clinicAmount.toFixed(2)} ج.م` : '',
        doctorAmount ? `الطبيب ${doctorAmount.toFixed(2)} ج.م` : ''
      ].filter(Boolean).join(' • ')
    });
  });

  file.labOrders.forEach(d => {
    const o = d.order;
    const names = d.items.map(item => item.testName).filter(Boolean);
    items.push({
      kind: 'lab',
      id: o.id,
      savedAt: o.createdAt,
      serviceAt: `${o.orderDate || ''} ${o.orderTime || ''}`.trim(),
      icon: '🧪',
      title: `تحاليل — ${d.items.length} تحليل`,
      subtitle: names.length ? names.join('، ') : 'حالة تحاليل',
      detail: `تاريخ الخدمة: ${displayDate(o.orderDate)}${o.orderTime ? ` • ${o.orderTime}` : ''}`,
      money: `الصافي ${moneyNumber(o.netTotal).toFixed(2)} ج.م • المدفوع ${moneyNumber(o.paidAmount).toFixed(2)} ج.م • المتبقي ${moneyNumber(o.remainingAmount).toFixed(2)} ج.م`
    });
  });

  file.nursingOrders.forEach(o => {
    items.push({
      kind: 'nursing',
      id: o.id,
      savedAt: o.createdAt,
      serviceAt: `${o.orderDate || ''} ${o.orderTime || ''}`.trim(),
      icon: '✚',
      title: `خدمة تمريض — ${o.serviceName || 'بدون اسم'}`,
      subtitle: 'خدمة تمريض مسجلة بملف المريض',
      detail: `تاريخ الخدمة: ${displayDate(o.orderDate)}${o.orderTime ? ` • ${o.orderTime}` : ''}`,
      money: `${moneyNumber(o.price).toFixed(2)} ج.م`
    });
  });

  file.radiologyOrders.forEach(o => {
    items.push({
      kind: 'radiology',
      id: o.id,
      savedAt: o.createdAt,
      serviceAt: `${o.orderDate || ''} ${o.orderTime || ''}`.trim(),
      icon: '🩻',
      title: `أشعة — ${o.radiologyName || 'بدون اسم'}`,
      subtitle: o.centerName ? `المركز: ${o.centerName}` : 'حالة أشعة مسجلة بملف المريض',
      detail: `تاريخ الخدمة: ${displayDate(o.orderDate)}${o.orderTime ? ` • ${o.orderTime}` : ''} • خصم ${moneyNumber(o.discountPercent).toFixed(0)}%`,
      money: `السعر ${moneyNumber(o.price).toFixed(2)} ج.م • الصافي ${moneyNumber(o.netTotal).toFixed(2)} ج.م`
    });
  });

  items.sort((a, b) => (b.savedAt || b.serviceAt).localeCompare(a.savedAt || a.serviceAt));

  return `
    <div class="patient-file-timeline">
      ${items.map(item => `
        <article class="patient-file-event ${item.kind}">
          <div class="patient-file-event-icon">${item.icon}</div>
          <div class="patient-file-event-main">
            <div class="patient-file-event-head">
              <strong>${esc(item.title)}</strong>
              <span>حفظ بالنظام: ${esc(displaySavedDateTime(item.savedAt))}</span>
            </div>
            <small>${esc(item.subtitle || '—')}</small>
            <p>${esc(item.detail || '')}</p>
            ${item.money ? `<b class="patient-file-event-money ltr">${esc(item.money)}</b>` : ''}
          </div>
          ${interactive && item.kind !== 'created' ? `
            <button
              class="btn ghost small patient-file-open-event"
              data-patient-file-kind="${item.kind}"
              data-patient-file-id="${esc(item.id)}"
            >فتح</button>
          ` : ''}
        </article>
      `).join('')}
    </div>`;
}

function patientFileClinicHeaderHtml(p: Patient) {
  return `
    <section class="patient-file-clinic-banner">
      <img src="/sidebar-clinic-logo.jpg" alt="لوجو عيادات العقاد التخصصية">
      <div class="patient-file-clinic-copy">
        <strong>${esc(appSettings.clinicName)}</strong>
        <span>${esc(appSettings.clinicAddress)}</span>
        <small>
          واتساب: <span class="ltr">${esc(appSettings.whatsappNumber)}</span>
          • تليفون: <span class="ltr">${esc(appSettings.phoneNumber)}</span>
        </small>
      </div>
      <div class="patient-file-number">
        <span>رقم الملف</span>
        <strong class="ltr">${esc(p.id.slice(0, 8).toUpperCase())}</strong>
      </div>
    </section>`;
}

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
  clinicName: string;
  clinicSlogan: string;
  clinicAddress: string;
  whatsappNumber: string;
  phoneNumber: string;
  operationalStartHour: number;
  backupHour: number;
  backupPath: string;
  exportPath: string;
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

type Lab2LabAuthStatus = { pinSet: boolean };
type Lab2LabPriceRow = { id: number; testName: string; price: string; updatedAt: string };


type SecurityStatus={pinSet:boolean;autoLockMinutes:number};
type PatientAttachment={id:string;patientId:string;originalName:string;fileType:string;note:string;storedPath:string;createdAt:string};
type CashierItem={serviceType:string;serviceId:string;patientId:string;patientName:string;patientPhone:string;serviceLabel:string;serviceDate:string;charge:number;paid:number;remaining:number};
type FinancialCategory={serviceType:string;label:string;count:number;charges:number;paid:number;remaining:number};
type FinancialSummary={totalCharges:number;totalPaid:number;totalRemaining:number;categories:FinancialCategory[]};
type AuditEntry={id:number;action:string;entityType:string;entityId:string;details:string;createdAt:string};
type UnifiedSearchResult={kind:string;patientId:string;title:string;subtitle:string};
type SystemAlert={kind:string;title:string;detail:string;patientId:string;serviceType:string;serviceId:string};

type Screen = 'dashboard' | 'patients' | 'today' | 'doctors' | 'labs' | 'lab2lab' | 'nursing' | 'radiology' | 'cashier' | 'finance' | 'alerts' | 'audit' | 'security' | 'reports' | 'archive' | 'backups' | 'settings';

const app = document.querySelector<HTMLDivElement>('#app')!;
let screen: Screen = 'dashboard';
let doctors: Doctor[] = [];
let appSettings: AppSettings = {
  clinicName: 'عيادات العقاد التخصصية',
  clinicSlogan: 'رعاية تليق بك',
  clinicAddress: '59 شارع فيصل الرئيسي - ناصية شارع الوفاء والأمل - أمام أسماك عروس البحر وعنتر الكبابجي - فيصل - الجيزة',
  whatsappNumber: '01102233167',
  phoneNumber: '01107072134',
  operationalStartHour: 11,
  backupHour: 4,
  backupPath: '',
  exportPath: '',
  databasePath: '',
  version: '6.8.0'
};

let refreshTimer: number | undefined;
let activeBusinessDay = '';
let sidebarPatientsTotal = 0;
let screenHistory: Screen[] = [];
let lab2labSessionPin = '';
let v7SecurityStatus:SecurityStatus={pinSet:false,autoLockMinutes:10};
let v7LastActivityAt=Date.now();
let v7SecurityTimer:number|undefined;

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



function bookingSourceOptions(current = '') {
  const value = current || 'عادي';
  const options = ['فيزيتا', 'اكشف', 'كلينيدو', 'عادي'];
  return options.map(x => `<option value="${esc(x)}" ${x === value ? 'selected' : ''}>${esc(x)}</option>`).join('');
}


type ExportFormat = 'pdf' | 'png';

function safeExportName(v: string) {
  return v.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

function reportPeriodLabel(from: string, to: string) {
  return from === to ? displayDate(from) : `${displayDate(from)} إلى ${displayDate(to)}`;
}


function moneyNumber(value: string) {
  const n = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}


function radiologyOrderRowsHtml(rows: RadiologyOrder[], showPatient = true) {
  return `
    <div class="table-wrap radiology-orders-table-wrap">
      <table class="radiology-orders-table">
        <thead>
          <tr>
            <th>التاريخ</th><th>الوقت</th>
            ${showPatient ? '<th>المريض</th><th>رقم التليفون</th>' : ''}
            <th>اسم الأشعة</th><th>المركز</th><th>السعر</th><th>الخصم</th><th>الصافي</th><th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(order => `
            <tr>
              <td>${esc(displayDate(order.orderDate))}</td>
              <td class="ltr">${esc(order.orderTime || '—')}</td>
              ${showPatient ? `<td>${esc(order.patientName || '—')}</td><td class="ltr">${esc(order.patientPhone || '—')}</td>` : ''}
              <td>${esc(order.radiologyName || '—')}</td>
              <td>${esc(order.centerName || '—')}</td>
              <td class="ltr">${moneyNumber(order.price).toFixed(2)} ج.م</td>
              <td class="ltr">${moneyNumber(order.discountPercent).toFixed(0)}%</td>
              <td class="ltr">${moneyNumber(order.netTotal).toFixed(2)} ج.م</td>
              <td>
                <div class="visit-row-actions">
                  <button class="icon-action" data-open-radiology-order="${esc(order.id)}" title="فتح">⌕</button>
                </div>
              </td>
            </tr>
          `).join('') : `<tr><td colspan="${showPatient ? 10 : 8}" class="empty-row">لا توجد حالات أشعة</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function openRadiologyOrderDetails(orderId: string) {
  const order = await invoke<RadiologyOrder>('get_radiology_order', { id: orderId });
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;

  root.innerHTML = `
    <div class="modal-backdrop" id="radiologyOrderBackdrop">
      <section class="modal radiology-order-details-modal">
        <div class="modal-head">
          <div class="patient-feature-title">
            <div class="patient-feature-title-icon radiology">🩻</div>
            <div>
              <h2>حالة أشعة</h2>
              <p>${esc(order.patientName || 'بدون اسم')} • <span class="ltr">${esc(order.patientPhone || 'بدون رقم')}</span></p>
            </div>
          </div>
          <button class="modal-close" id="closeRadiologyOrder">×</button>
        </div>

        <div class="radiology-detail-grid">
          <div><span>اسم الأشعة</span><strong>${esc(order.radiologyName)}</strong></div>
          <div><span>اسم المركز</span><strong>${esc(order.centerName)}</strong></div>
          <div><span>السعر</span><strong class="ltr">${moneyNumber(order.price).toFixed(2)} ج.م</strong></div>
          <div><span>نسبة الخصم</span><strong class="ltr">${moneyNumber(order.discountPercent).toFixed(0)}%</strong></div>
          <div><span>قيمة الخصم</span><strong class="ltr">${moneyNumber(order.discountAmount).toFixed(2)} ج.م</strong></div>
          <div class="net"><span>الصافي</span><strong class="ltr">${moneyNumber(order.netTotal).toFixed(2)} ج.م</strong></div>
          <div><span>التاريخ</span><strong>${displayDate(order.orderDate)}</strong></div>
          <div><span>الوقت</span><strong class="ltr">${esc(order.orderTime || '—')}</strong></div>
        </div>

        <div class="form-actions">
          <button class="btn ghost" id="radiologyOrderPatient">👤 ملف المريض</button>
          <button class="btn primary" id="radiologyOrderCloseBottom">إغلاق</button>
        </div>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';
  document.querySelector<HTMLButtonElement>('#closeRadiologyOrder')!.onclick = close;
  document.querySelector<HTMLButtonElement>('#radiologyOrderCloseBottom')!.onclick = close;
  document.querySelector<HTMLDivElement>('#radiologyOrderBackdrop')!.onclick = e => {
    if (e.target === e.currentTarget) close();
  };
  document.querySelector<HTMLButtonElement>('#radiologyOrderPatient')!.onclick = async () => {
    close();
    await openPatient(order.patientId);
  };
}

function bindRadiologyOrderActions() {
  document.querySelectorAll<HTMLButtonElement>('[data-open-radiology-order]').forEach(button => {
    button.onclick = () => openRadiologyOrderDetails(button.dataset.openRadiologyOrder || '');
  });
}

async function openRadiologyPatientRegistrationModal() {
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;

  root.innerHTML = `
    <div class="modal-backdrop" id="radiologyPatientRegisterBackdrop">
      <section class="modal form-modal radiology-patient-register-modal">
        <div class="modal-head">
          <div class="patient-feature-title">
            <div class="patient-feature-title-icon radiology">🩻</div>
            <div>
              <h2>تسجيل مريض أشعة</h2>
              <p>تسجيل بيانات المريض ثم فتح حالة الأشعة مباشرة</p>
            </div>
          </div>
          <button class="modal-close" id="closeRadiologyPatientRegister">×</button>
        </div>

        <form id="radiologyPatientRegisterForm">
          <div class="section-title">بيانات المريض</div>
          <div class="patient-register-grid">
            <label class="field-name">الاسم بالكامل<input name="fullName" autocomplete="off"></label>
            <label class="field-phone">رقم التليفون<input class="ltr" name="phone" inputmode="tel" autocomplete="off"></label>
            <label class="field-age">السن<input name="age" type="number" min="0" max="130"></label>
            <label class="field-gender">النوع<select name="gender"><option value="">—</option><option>ذكر</option><option>أنثى</option></select></label>
            <label class="field-address">العنوان (اختياري)<input name="address" autocomplete="off"></label>
          </div>

          <div class="lab-patient-register-note">
            بعد حفظ بيانات المريض سيفتح تسجيل الأشعة تلقائيًا.
          </div>

          <div class="form-actions">
            <button type="button" class="btn ghost" id="cancelRadiologyPatientRegister">إلغاء</button>
            <button type="submit" class="btn primary">حفظ وفتح الأشعة</button>
          </div>
        </form>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';
  document.querySelector<HTMLButtonElement>('#closeRadiologyPatientRegister')!.onclick = close;
  document.querySelector<HTMLButtonElement>('#cancelRadiologyPatientRegister')!.onclick = close;
  document.querySelector<HTMLDivElement>('#radiologyPatientRegisterBackdrop')!.onclick = e => {
    if (e.target === e.currentTarget) close();
  };

  document.querySelector<HTMLFormElement>('#radiologyPatientRegisterForm')!.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const rawAge = String(fd.get('age') || '').trim();

    try {
      const result = await invoke<{id:string, existed:boolean}>('register_patient', {
        input: {
          fullName: String(fd.get('fullName') || '').trim(),
          phone: String(fd.get('phone') || '').trim(),
          age: rawAge ? Number(rawAge) : null,
          gender: String(fd.get('gender') || ''),
          address: String(fd.get('address') || '').trim()
        }
      });

      close();
      toast(result.existed ? 'المريض مسجل بالفعل — تم فتح الأشعة' : 'تم إنشاء ملف المريض وفتح الأشعة');
      await renderScreen();
      await openPatientRadiologyPanel(result.id);
    } catch (err) {
      toast(`تعذر تسجيل المريض: ${String(err)}`, 'error');
    }
  };
}

async function openPatientRadiologyPanel(patientId: string) {
  const [details, history] = await Promise.all([
    invoke<PatientDetails>('get_patient_details', { id: patientId }),
    invoke<RadiologyOrder[]>('list_patient_radiology_orders', { patientId })
  ]);
  const p = details.patient;
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;

  root.innerHTML = `
    <div class="modal-backdrop" id="radiologyFeatureBackdrop">
      <section class="modal wide patient-feature-modal radiology-service-modal">
        <div class="modal-head">
          <div class="patient-feature-title">
            <div class="patient-feature-title-icon radiology">🩻</div>
            <div>
              <h2>الأشعة</h2>
              <p>${esc(p.fullName || 'بدون اسم')} • <span class="ltr">${esc(p.phone || 'بدون رقم')}</span></p>
            </div>
          </div>
          <button class="modal-close" id="closeRadiologyFeature">×</button>
        </div>

        <form id="radiologyServiceForm">
          <div class="radiology-entry-grid">
            <label>اسم الأشعة
              <input name="radiologyName" autocomplete="off" placeholder="مثال: X-Ray / CT / MRI...">
            </label>
            <label>اسم المركز
              <input name="centerName" autocomplete="off" placeholder="اسم مركز الأشعة">
            </label>
            <label>السعر
              <input id="radiologyPrice" name="price" class="ltr" type="number" min="0" step="0.01" placeholder="0.00">
            </label>
            <label>نسبة الخصم %
              <input id="radiologyDiscount" name="discountPercent" class="ltr" type="number" min="0" max="100" step="0.01" value="0">
            </label>
            <label>الصافي بعد الخصم
              <div class="radiology-net-preview ltr" id="radiologyNetPreview">0.00 ج.م</div>
            </label>
            <label>التاريخ
              <input name="orderDate" type="date" value="${today()}">
            </label>
            <label>الوقت
              <input name="orderTime" type="time" value="${timeNow()}">
            </label>
          </div>

          <div class="form-actions radiology-finish-actions">
            <button class="btn primary" type="submit">✓ حفظ حالة الأشعة</button>
            <button class="btn ghost" type="button" id="backToPatientProfile">← رجوع لملف المريض</button>
          </div>
        </form>

        <section class="radiology-history-section">
          <div class="lab-order-history-head">
            <strong>سجل الأشعة السابقة</strong>
            <span>${history.length} حالة</span>
          </div>
          ${radiologyOrderRowsHtml(history, false)}
        </section>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';
  const priceInput = document.querySelector<HTMLInputElement>('#radiologyPrice')!;
  const discountInput = document.querySelector<HTMLInputElement>('#radiologyDiscount')!;
  const netHost = document.querySelector<HTMLElement>('#radiologyNetPreview')!;

  const updateNet = () => {
    const price = Math.max(0, moneyNumber(priceInput.value));
    const discount = Math.max(0, Math.min(100, moneyNumber(discountInput.value)));
    netHost.textContent = `${(price * (1 - discount / 100)).toFixed(2)} ج.م`;
  };
  priceInput.oninput = updateNet;
  discountInput.oninput = updateNet;

  document.querySelector<HTMLButtonElement>('#closeRadiologyFeature')!.onclick = close;
  document.querySelector<HTMLDivElement>('#radiologyFeatureBackdrop')!.onclick = e => {
    if (e.target === e.currentTarget) close();
  };
  document.querySelector<HTMLButtonElement>('#backToPatientProfile')!.onclick = async () => {
    close();
    await openPatient(patientId);
  };

  document.querySelector<HTMLFormElement>('#radiologyServiceForm')!.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    try {
      const order = await invoke<RadiologyOrder>('add_radiology_order', {
        input: {
          patientId,
          radiologyName: String(fd.get('radiologyName') || '').trim(),
          centerName: String(fd.get('centerName') || '').trim(),
          price: String(fd.get('price') || '').trim(),
          discountPercent: String(fd.get('discountPercent') || '0').trim(),
          orderDate: String(fd.get('orderDate') || ''),
          orderTime: String(fd.get('orderTime') || '')
        }
      });
      close();
      toast('تم حفظ حالة الأشعة وإضافتها إلى ملف المريض');
      await renderScreen();
      await openRadiologyOrderDetails(order.id);
    } catch (err) {
      toast(`تعذر حفظ حالة الأشعة: ${String(err)}`, 'error');
    }
  };

  bindRadiologyOrderActions();
}

async function renderRadiologyServices() {
  const dayKey = businessDay();
  const rows = await invoke<RadiologyOrder[]>('list_radiology_orders', {
    query: { from: dayKey, to: dayKey }
  });

  shell(`
    <section class="card radiology-main-card">
      <div class="card-head toolbar">
        <div>
          <h2>الأشعة</h2>
          <p>${displayDate(dayKey)} • تسجيل ومتابعة حالات الأشعة</p>
        </div>
        <button class="btn primary small" id="registerRadiologyPatient">＋ تسجيل حالة أشعة</button>
      </div>

      <div class="nursing-main-summary">
        <div>
          <span>حالات اليوم</span>
          <strong>${rows.length}</strong>
        </div>
      </div>

      <div class="today-case-section-head radiology">
        <h3>حالات الأشعة اليوم</h3>
        <span>${rows.length} حالة</span>
      </div>

      ${radiologyOrderRowsHtml(rows, true)}
    </section>
  `, 'الأشعة', 'اسم الأشعة والمركز والسعر والخصم والصافي');

  document.querySelector<HTMLButtonElement>('#registerRadiologyPatient')!.onclick = () => {
    openRadiologyPatientRegistrationModal();
  };
  bindRadiologyOrderActions();
}


function nursingOrderRowsHtml(rows: NursingOrder[], showPatient = true) {
  return `
    <div class="table-wrap nursing-orders-table-wrap">
      <table class="nursing-orders-table">
        <thead>
          <tr>
            <th>التاريخ</th><th>الوقت</th>
            ${showPatient ? '<th>المريض</th><th>رقم التليفون</th>' : ''}
            <th>الخدمة</th><th>السعر</th><th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(order => `
            <tr>
              <td>${esc(displayDate(order.orderDate))}</td>
              <td class="ltr">${esc(order.orderTime || '—')}</td>
              ${showPatient ? `<td>${esc(order.patientName || '—')}</td><td class="ltr">${esc(order.patientPhone || '—')}</td>` : ''}
              <td>${esc(order.serviceName || '—')}</td>
              <td class="ltr">${moneyNumber(order.price).toFixed(2)} ج.م</td>
              <td>
                <div class="visit-row-actions">
                  <button class="icon-action" data-open-nursing-order="${esc(order.id)}" title="فتح">⌕</button>
                  <button class="icon-action" data-nursing-order-pdf="${esc(order.id)}" title="PDF للطباعة">PDF</button>
                  <button class="icon-action" data-nursing-order-png="${esc(order.id)}" title="صورة">▧</button>
                </div>
              </td>
            </tr>
          `).join('') : `<tr><td colspan="${showPatient ? 7 : 5}" class="empty-row">لا توجد حالات خدمات تمريض</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function nursingOrderReceiptHtml(order: NursingOrder) {
  return patientExportSheet(
    'إيصال خدمة تمريض',
    `${order.patientName || 'بدون اسم'} • ${displayDate(order.orderDate)} ${order.orderTime || ''}`,
    `
      <div class="export-patient-summary">
        <div><span>المريض</span><strong>${esc(order.patientName || '—')}</strong></div>
        <div><span>الهاتف</span><strong class="ltr">${esc(order.patientPhone || '—')}</strong></div>
        <div><span>رقم العملية</span><strong class="ltr">${esc(order.id.slice(0, 8))}</strong></div>
      </div>

      <div class="nursing-receipt-service">
        <span>نوع الخدمة</span>
        <strong>${esc(order.serviceName)}</strong>
      </div>

      <div class="nursing-receipt-price">
        <span>السعر</span>
        <strong class="ltr">${moneyNumber(order.price).toFixed(2)} ج.م</strong>
      </div>
    `
  );
}

async function exportNursingOrder(order: NursingOrder, format: ExportFormat) {
  await captureAndSaveExport(
    nursingOrderReceiptHtml(order),
    `تمريض-${order.patientName || 'مريض'}-${order.orderDate}-${order.id.slice(0, 8)}`,
    format
  );
}

async function openNursingOrderDetails(orderId: string) {
  const order = await invoke<NursingOrder>('get_nursing_order', { id: orderId });
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;

  root.innerHTML = `
    <div class="modal-backdrop" id="nursingOrderBackdrop">
      <section class="modal nursing-order-details-modal">
        <div class="modal-head">
          <div class="patient-feature-title">
            <div class="patient-feature-title-icon nursing">✚</div>
            <div>
              <h2>حالة خدمة تمريض</h2>
              <p>${esc(order.patientName || 'بدون اسم')} • <span class="ltr">${esc(order.patientPhone || 'بدون رقم')}</span></p>
            </div>
          </div>
          <button class="modal-close" id="closeNursingOrder">×</button>
        </div>

        <div class="nursing-order-meta">
          <span>${displayDate(order.orderDate)}</span>
          <span class="ltr">${esc(order.orderTime || '—')}</span>
        </div>

        <div class="nursing-order-detail-card">
          <span>نوع الخدمة</span>
          <strong>${esc(order.serviceName)}</strong>
        </div>

        <div class="nursing-order-detail-card price">
          <span>السعر</span>
          <strong class="ltr">${moneyNumber(order.price).toFixed(2)} ج.م</strong>
        </div>

        <div class="form-actions">
          <button class="btn ghost" id="nursingOrderPatient">👤 ملف المريض</button>
          <button class="btn ghost" id="nursingOrderPng">تنزيل صورة</button>
          <button class="btn primary" id="nursingOrderPdf">PDF للطباعة</button>
          <button class="btn ghost" id="nursingOrderCloseBottom">إغلاق</button>
        </div>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';
  document.querySelector<HTMLButtonElement>('#closeNursingOrder')!.onclick = close;
  document.querySelector<HTMLButtonElement>('#nursingOrderCloseBottom')!.onclick = close;
  document.querySelector<HTMLDivElement>('#nursingOrderBackdrop')!.onclick = e => {
    if (e.target === e.currentTarget) close();
  };
  document.querySelector<HTMLButtonElement>('#nursingOrderPatient')!.onclick = async () => {
    close(); await openPatient(order.patientId);
  };
  document.querySelector<HTMLButtonElement>('#nursingOrderPng')!.onclick = () => exportNursingOrder(order, 'png');
  document.querySelector<HTMLButtonElement>('#nursingOrderPdf')!.onclick = () => exportNursingOrder(order, 'pdf');
}

function bindNursingOrderActions() {
  document.querySelectorAll<HTMLButtonElement>('[data-open-nursing-order]').forEach(button => {
    button.onclick = () => openNursingOrderDetails(button.dataset.openNursingOrder || '');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-nursing-order-pdf]').forEach(button => {
    button.onclick = async () => {
      const order = await invoke<NursingOrder>('get_nursing_order', { id: button.dataset.nursingOrderPdf || '' });
      await exportNursingOrder(order, 'pdf');
    };
  });
  document.querySelectorAll<HTMLButtonElement>('[data-nursing-order-png]').forEach(button => {
    button.onclick = async () => {
      const order = await invoke<NursingOrder>('get_nursing_order', { id: button.dataset.nursingOrderPng || '' });
      await exportNursingOrder(order, 'png');
    };
  });
}

function labOrderStatus(order: LabOrder) {
  const paid = moneyNumber(order.paidAmount);
  const remaining = moneyNumber(order.remainingAmount);
  if (remaining <= 0.0001) return 'مدفوع';
  if (paid <= 0.0001) return 'غير مدفوع';
  return 'دفع جزئي';
}

function labOrderRowsHtml(rows: LabOrder[], showPatient = true) {
  return `
    <div class="table-wrap lab-orders-table-wrap">
      <table class="lab-orders-table">
        <thead>
          <tr>
            <th>التاريخ</th><th>الوقت</th>
            ${showPatient ? '<th>المريض</th><th>رقم التليفون</th>' : ''}
            <th>التحاليل</th><th>الإجمالي</th><th>الخصم</th><th>الصافي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(order => `
            <tr>
              <td>${esc(displayDate(order.orderDate))}</td>
              <td class="ltr">${esc(order.orderTime || '—')}</td>
              ${showPatient ? `<td>${esc(order.patientName || '—')}</td><td class="ltr">${esc(order.patientPhone || '—')}</td>` : ''}
              <td>${order.itemsCount}</td>
              <td class="ltr">${moneyNumber(order.subtotal).toFixed(2)} ج.م</td>
              <td class="ltr">${moneyNumber(order.discountAmount).toFixed(2)} ج.م</td>
              <td class="ltr">${moneyNumber(order.netTotal).toFixed(2)} ج.م</td>
              <td class="ltr">${moneyNumber(order.paidAmount).toFixed(2)} ج.م</td>
              <td class="ltr">${moneyNumber(order.remainingAmount).toFixed(2)} ج.م</td>
              <td><span class="lab-payment-status ${moneyNumber(order.remainingAmount) > 0 ? 'due' : 'paid'}">${labOrderStatus(order)}</span></td>
              <td>
                <div class="visit-row-actions">
                  <button class="icon-action" data-open-lab-order="${esc(order.id)}" title="فتح">⌕</button>
                  <button class="icon-action" data-lab-order-pdf="${esc(order.id)}" title="PDF للطباعة">PDF</button>
                  <button class="icon-action" data-lab-order-png="${esc(order.id)}" title="صورة">▧</button>
                </div>
              </td>
            </tr>
          `).join('') : `<tr><td colspan="${showPatient ? 12 : 10}" class="empty-row">لا توجد حالات تحاليل</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function labOrderReceiptHtml(details: LabOrderDetails) {
  const o = details.order;
  return patientExportSheet(
    'إيصال تحاليل',
    `${o.patientName || 'بدون اسم'} • ${displayDate(o.orderDate)} ${o.orderTime || ''}`,
    `
      <div class="export-patient-summary">
        <div><span>المريض</span><strong>${esc(o.patientName || '—')}</strong></div>
        <div><span>الهاتف</span><strong class="ltr">${esc(o.patientPhone || '—')}</strong></div>
        <div><span>رقم العملية</span><strong class="ltr">${esc(o.id.slice(0, 8))}</strong></div>
      </div>

      <table class="export-table">
        <thead><tr><th>التحليل</th><th>السعر</th></tr></thead>
        <tbody>
          ${details.items.map(item => `
            <tr>
              <td class="ltr">${esc(item.testName)}</td>
              <td class="ltr">${moneyNumber(item.price).toFixed(2)} ج.م</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="lab-receipt-money">
        <div><span>إجمالي التحاليل</span><strong class="ltr">${moneyNumber(o.subtotal).toFixed(2)} ج.م</strong></div>
        <div><span>الخصم</span><strong class="ltr">${moneyNumber(o.discountAmount).toFixed(2)} ج.م</strong></div>
        <div><span>الصافي بعد الخصم</span><strong class="ltr">${moneyNumber(o.netTotal).toFixed(2)} ج.م</strong></div>
        <div><span>المدفوع</span><strong class="ltr">${moneyNumber(o.paidAmount).toFixed(2)} ج.م</strong></div>
        <div class="remaining"><span>المتبقي</span><strong class="ltr">${moneyNumber(o.remainingAmount).toFixed(2)} ج.م</strong></div>
      </div>
    `
  );
}

async function exportLabOrder(details: LabOrderDetails, format: ExportFormat) {
  const o = details.order;
  await captureAndSaveExport(
    labOrderReceiptHtml(details),
    `تحاليل-${o.patientName || 'مريض'}-${o.orderDate}-${o.id.slice(0, 8)}`,
    format
  );
}

async function openLabOrderDetails(orderId: string) {
  const details = await invoke<LabOrderDetails>('get_lab_order', { id: orderId });
  const o = details.order;
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;

  root.innerHTML = `
    <div class="modal-backdrop" id="labOrderBackdrop">
      <section class="modal wide lab-order-details-modal">
        <div class="modal-head">
          <div class="patient-feature-title">
            <div class="patient-feature-title-icon labs">🧪</div>
            <div>
              <h2>حالة تحاليل محفوظة</h2>
              <p>${esc(o.patientName || 'بدون اسم')} • <span class="ltr">${esc(o.patientPhone || 'بدون رقم')}</span></p>
            </div>
          </div>
          <button class="modal-close" id="closeLabOrder">×</button>
        </div>

        <div class="lab-order-meta">
          <span>${displayDate(o.orderDate)}</span>
          <span class="ltr">${esc(o.orderTime || '—')}</span>
          <span>${details.items.length} تحليل</span>
          <span class="lab-payment-status ${moneyNumber(o.remainingAmount) > 0 ? 'due' : 'paid'}">${labOrderStatus(o)}</span>
        </div>

        <div class="lab-order-item-list">
          ${details.items.map(item => `
            <div class="lab-order-item-row">
              <strong class="ltr">${esc(item.testName)}</strong>
              <b class="ltr">${moneyNumber(item.price).toFixed(2)} ج.م</b>
            </div>
          `).join('')}
        </div>

        <div class="lab-order-money-grid">
          <div><span>الإجمالي</span><strong class="ltr">${moneyNumber(o.subtotal).toFixed(2)} ج.م</strong></div>
          <div><span>الخصم</span><strong class="ltr">${moneyNumber(o.discountAmount).toFixed(2)} ج.م</strong></div>
          <div><span>الصافي</span><strong class="ltr">${moneyNumber(o.netTotal).toFixed(2)} ج.م</strong></div>
          <div><span>المدفوع</span><strong class="ltr">${moneyNumber(o.paidAmount).toFixed(2)} ج.م</strong></div>
          <div class="remaining"><span>المتبقي</span><strong class="ltr">${moneyNumber(o.remainingAmount).toFixed(2)} ج.م</strong></div>
        </div>

        <div class="form-actions">
          <button class="btn ghost" id="labOrderPatient">👤 ملف المريض</button>
          <button class="btn ghost" id="labOrderPng">تنزيل صورة</button>
          <button class="btn primary" id="labOrderPdf">PDF للطباعة</button>
          <button class="btn ghost" id="labOrderCloseBottom">إغلاق</button>
        </div>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';
  document.querySelector<HTMLButtonElement>('#closeLabOrder')!.onclick = close;
  document.querySelector<HTMLButtonElement>('#labOrderCloseBottom')!.onclick = close;
  document.querySelector<HTMLDivElement>('#labOrderBackdrop')!.onclick = e => {
    if (e.target === e.currentTarget) close();
  };
  document.querySelector<HTMLButtonElement>('#labOrderPatient')!.onclick = async () => {
    close(); await openPatient(o.patientId);
  };
  document.querySelector<HTMLButtonElement>('#labOrderPng')!.onclick = () => exportLabOrder(details, 'png');
  document.querySelector<HTMLButtonElement>('#labOrderPdf')!.onclick = () => exportLabOrder(details, 'pdf');
}

function bindLabOrderActions() {
  document.querySelectorAll<HTMLButtonElement>('[data-open-lab-order]').forEach(button => {
    button.onclick = () => openLabOrderDetails(button.dataset.openLabOrder || '');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-lab-order-pdf]').forEach(button => {
    button.onclick = async () => {
      const d = await invoke<LabOrderDetails>('get_lab_order', { id: button.dataset.labOrderPdf || '' });
      await exportLabOrder(d, 'pdf');
    };
  });
  document.querySelectorAll<HTMLButtonElement>('[data-lab-order-png]').forEach(button => {
    button.onclick = async () => {
      const d = await invoke<LabOrderDetails>('get_lab_order', { id: button.dataset.labOrderPng || '' });
      await exportLabOrder(d, 'png');
    };
  });
}

async function exportTodayCombined(
  visits: Visit[],
  labOrders: LabOrder[],
  nursingOrders: NursingOrder[],
  dayKey: string,
  format: ExportFormat
) {
  const visitMetrics = reportMetrics(visits);
  const labPaid = labOrders.reduce((sum, o) => sum + moneyNumber(o.paidAmount), 0);
  const labRemaining = labOrders.reduce((sum, o) => sum + moneyNumber(o.remainingAmount), 0);
  const nursingTotal = nursingOrders.reduce((sum, o) => sum + moneyNumber(o.price), 0);
  const totalCases = visits.length + labOrders.length + nursingOrders.length;
  const totalCollection = visitMetrics.revenue + labPaid + nursingTotal;
  const clinicTotal = visitMetrics.clinicTotal + labPaid + nursingTotal;

  const labRows = labOrders.length ? `
    <h3>حالات التحاليل</h3>
    <table class="export-table">
      <thead><tr><th>المريض</th><th>الهاتف</th><th>التحاليل</th><th>الصافي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
      <tbody>${labOrders.map(o => `
        <tr>
          <td>${esc(o.patientName || '—')}</td>
          <td class="ltr">${esc(o.patientPhone || '—')}</td>
          <td>${o.itemsCount}</td>
          <td class="ltr">${moneyNumber(o.netTotal).toFixed(2)} ج.م</td>
          <td class="ltr">${moneyNumber(o.paidAmount).toFixed(2)} ج.م</td>
          <td class="ltr">${moneyNumber(o.remainingAmount).toFixed(2)} ج.م</td>
        </tr>
      `).join('')}</tbody>
    </table>` : '';

  const nursingRows = nursingOrders.length ? `
    <h3>خدمات التمريض</h3>
    <table class="export-table">
      <thead><tr><th>المريض</th><th>الهاتف</th><th>الخدمة</th><th>السعر</th></tr></thead>
      <tbody>${nursingOrders.map(o => `
        <tr>
          <td>${esc(o.patientName || '—')}</td>
          <td class="ltr">${esc(o.patientPhone || '—')}</td>
          <td>${esc(o.serviceName)}</td>
          <td class="ltr">${moneyNumber(o.price).toFixed(2)} ج.م</td>
        </tr>
      `).join('')}</tbody>
    </table>` : '';

  const body = `
    <div class="report-stats export-report-stats">
      <div><span>إجمالي الحالات</span><strong>${totalCases}</strong></div>
      <div><span>إجمالي التحصيل</span><strong>${totalCollection.toFixed(2)} ج.م</strong></div>
      <div><span>مبلغ العيادات</span><strong>${clinicTotal.toFixed(2)} ج.م</strong></div>
      <div><span>مبلغ الأطباء</span><strong>${visitMetrics.doctorTotal.toFixed(2)} ج.م</strong></div>
      <div><span>متبقي التحاليل</span><strong>${labRemaining.toFixed(2)} ج.م</strong></div>
    </div>
    <h3>الكشوفات والاستشارات</h3>
    ${exportVisitRows(visits, true)}
    ${labRows}
    ${nursingRows}
  `;

  await captureAndSaveExport(
    exportSheet('حالات اليوم', displayDate(dayKey), body),
    `حالات-اليوم-${dayKey}`,
    format
  );
}

function visitFeeNumber(v: Visit) {
  return moneyNumber(v.fee);
}

function reportMetrics(rows: Visit[]) {
  const patientIds = new Set(rows.map(v => v.patientId));
  return {
    totalVisits: rows.length,
    uniquePatients: patientIds.size,
    revenue: rows.reduce((sum, v) => sum + visitFeeNumber(v), 0),
    clinicTotal: rows.reduce((sum, v) => sum + moneyNumber(v.clinicAmount), 0),
    doctorTotal: rows.reduce((sum, v) => sum + moneyNumber(v.doctorAmount), 0),
    newVisits: rows.filter(v => v.visitType === 'كشف جديد').length,
    consultations: rows.filter(v => v.visitType === 'استشارة').length
  };
}

function doctorBreakdown(rows: Visit[]) {
  const map = new Map<string, {count:number; revenue:number; clinicTotal:number; doctorTotal:number}>();
  for (const v of rows) {
    const doctor = (v.doctor || '').trim() || 'بدون طبيب';
    const item = map.get(doctor) || { count: 0, revenue: 0, clinicTotal: 0, doctorTotal: 0 };
    item.count += 1;
    item.revenue += visitFeeNumber(v);
    item.clinicTotal += moneyNumber(v.clinicAmount);
    item.doctorTotal += moneyNumber(v.doctorAmount);
    map.set(doctor, item);
  }
  return [...map.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], 'ar'));
}

function filteredReportResult(base: ReportResult, visitType: string, bookingSource = ''): ReportResult {
  const rows = base.rows.filter(v =>
    (!visitType || v.visitType === visitType) &&
    (!bookingSource || (v.bookingSource || 'عادي') === bookingSource)
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
          <th>الطبيب</th>
          <th>سعر الكشف</th>
          <th>مبلغ العيادات</th>
          <th>مبلغ الطبيب</th>
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
            <td>${esc(v.doctor || '—')}</td>
            <td class="ltr">${v.fee ? `${esc(v.fee)} ج.م` : '—'}</td>
            <td class="ltr">${v.clinicAmount ? `${esc(v.clinicAmount)} ج.م` : '—'}</td>
            <td class="ltr">${v.doctorAmount ? `${esc(v.doctorAmount)} ج.م` : '—'}</td>
          </tr>
        `).join('') : `<tr><td colspan="${includePatient ? 10 : 8}">لا توجد بيانات</td></tr>`}
      </tbody>
    </table>`;
}

function exportSheet(title: string, subtitle: string, body: string) {
  return `
    <div class="export-document">
      <div class="export-brand">
        <div>
          <h1>${esc(appSettings.clinicName)}</h1>
          <p>${esc(appSettings.clinicSlogan)}</p>
        </div>
        <div class="export-ak-mark">AK</div>
      </div>
      <div class="export-rule"></div>
      <div class="export-title">
        <h2>${esc(title)}</h2>
        <p>${esc(subtitle)}</p>
      </div>
      ${body}
      <div class="export-footer">تم إنشاء الملف من نظام ${esc(appSettings.clinicName)}</div>
    </div>`;
}


function patientExportSheet(title: string, subtitle: string, body: string) {
  return `
    <div class="export-document patient-export-document">
      <div class="patient-print-brand">
        <img src="/patient-print-logo.jpg" alt="لوجو عيادات العقاد التخصصية" />
        <div>
          <div class="patient-print-slogan">${esc(appSettings.clinicSlogan)}</div>
          <div class="patient-print-address">${esc(appSettings.clinicAddress)}</div>
        </div>
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
        <div class="patient-print-footer-address">${esc(appSettings.clinicAddress)}</div>
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

async function exportPatientFile(file: PatientFileSnapshot, format: ExportFormat) {
  const details = file.details;
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

  const totalActivities =
    details.visits.length +
    file.labOrders.length +
    file.nursingOrders.length +
    file.radiologyOrders.length;

  const body = `
    <div class="patient-export-top">
      <div class="export-patient-grid patient-export-grid">
        <div><span>اسم المريض</span><strong>${esc(p.fullName || '—')}</strong></div>
        <div><span>رقم التليفون</span><strong class="ltr">${esc(p.phone || '—')}</strong></div>
        <div><span>السن</span><strong>${p.age ?? '—'}</strong></div>
        <div><span>النوع</span><strong>${esc(p.gender || '—')}</strong></div>
        <div class="wide"><span>العنوان</span><strong>${esc(p.address || '—')}</strong></div>
        <div><span>الحالة</span><strong>${p.blacklisted ? 'Black List' : p.archived ? 'مؤرشف' : 'نشط'}</strong></div>
        <div><span>رقم الملف</span><strong class="ltr">${esc(p.id.slice(0, 8).toUpperCase())}</strong></div>
        <div><span>تاريخ إنشاء الملف</span><strong>${esc(displaySavedDateTime(p.createdAt))}</strong></div>
        <div><span>آخر تحديث</span><strong>${esc(displaySavedDateTime(p.updatedAt))}</strong></div>
        <div><span>كشف / استشارة</span><strong>${details.visits.length}</strong></div>
        <div><span>حالات تحاليل</span><strong>${file.labOrders.length}</strong></div>
        <div><span>خدمات تمريض</span><strong>${file.nursingOrders.length}</strong></div>
        <div><span>أشعة</span><strong>${file.radiologyOrders.length}</strong></div>
        <div><span>إجمالي الأنشطة</span><strong>${totalActivities}</strong></div>
      </div>

      <div class="patient-qr-box">
        <img src="${qrDataUrl}" alt="QR Code" />
        <div class="patient-qr-caption">QR ملف المريض</div>
        <small class="ltr">${esc(p.id)}</small>
      </div>
    </div>

    <h3 class="export-section-heading">السجل الكامل للمريض</h3>
    ${patientFileTimelineHtml(file, false)}
  `;

  await captureAndSaveExport(
    patientExportSheet(
      'ملف المريض الكامل',
      `${p.fullName || 'بدون اسم'} • ملف رقم ${p.id.slice(0, 8).toUpperCase()}`,
      body
    ),
    `ملف المريض الكامل - ${p.fullName || p.phone || p.id}`,
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
        <tr><th>الطبيب</th><th>عدد الحالات</th><th>إجمالي الكشف</th><th>مبلغ العيادات</th><th>مبلغ الطبيب</th></tr>
      </thead>
      <tbody>
        ${doctorRows.map(([name, item]) => `
          <tr>
            <td>${esc(name)}</td>
            <td>${item.count}</td>
            <td class="ltr">${item.revenue.toFixed(2)} ج.م</td>
            <td class="ltr">${item.clinicTotal.toFixed(2)} ج.م</td>
            <td class="ltr">${item.doctorTotal.toFixed(2)} ج.م</td>
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
      <div><span>إجمالي الكشف</span><strong class="ltr">${metrics.revenue.toFixed(2)} ج.م</strong></div>
      <div><span>مبلغ العيادات</span><strong class="ltr">${metrics.clinicTotal.toFixed(2)} ج.م</strong></div>
      <div><span>مبلغ الأطباء</span><strong class="ltr">${metrics.doctorTotal.toFixed(2)} ج.م</strong></div>
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
  const file = await loadPatientFile(id);
  await exportPatientFile(file, format);
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

function navButton(id: Screen, icon: string, label: string, count?: number) {
  return `<button class="nav ${screen===id?'active':''}" data-screen="${id}">
    <span class="nav-icon">${icon}</span>
    <span class="nav-label">${label}</span>
    ${typeof count === 'number' ? `<span class="nav-count">${count}</span>` : ''}
  </button>`;
}

async function loadDoctors() {
  doctors = await invoke<Doctor[]>('list_doctors', { query: { activeOnly: false } });
}

async function loadSettings() {
  appSettings = await invoke<AppSettings>('get_settings');
}

async function loadSidebarPatientsTotal() {
  const stats = await invoke<Stats>('get_stats');
  sidebarPatientsTotal = stats.totalPatients;
}

function serviceDockHtml() {
  const action = (key: string, icon: string, label: string, hint: string) =>
    `<button class="service-hub-btn service-action-btn" data-service-action="${key}" title="${esc(hint)}">
      <span class="service-hub-icon">${icon}</span>
      <span class="service-hub-copy"><strong>${label}</strong><small>${hint}</small></span>
    </button>`;

  const nav = (target: Screen, icon: string, label: string) =>
    `<button class="service-hub-btn service-nav-btn ${screen === target ? 'active' : ''}" data-service-screen="${target}" title="فتح ${label}">
      <span class="service-hub-icon">${icon}</span>
      <span class="service-hub-copy"><strong>${label}</strong></span>
    </button>`;

  return `
    <section class="service-hub" aria-label="مركز الوصول السريع">
      <div class="service-hub-group quick">
        <div class="service-hub-group-title">
          <span>تسجيل سريع</span>
          <small>إنشاء حالة جديدة مباشرة</small>
        </div>
        <div class="service-hub-buttons quick-buttons">
          ${action('visit','🩺','كشف / استشارة','تسجيل حالة عيادة')}
          ${action('lab-case','🧪','تحاليل','تسجيل مريض تحاليل')}
          ${action('nursing-case','✚','تمريض','تسجيل خدمة تمريض')}
          ${action('radiology-case','🩻','أشعة','تسجيل حالة أشعة')}
        </div>
      </div>

      <div class="service-hub-group navigation">
        <div class="service-hub-group-title">
          <span>التنقل بين الأقسام</span>
          <small>كل الخدمات مرتبطة ببعض</small>
        </div>
        <div class="service-hub-buttons nav-buttons">
          ${nav('dashboard','⌂','الرئيسية')}
          ${nav('patients','👥','المرضى')}
          ${nav('today','◷','حالات اليوم')}
          ${nav('doctors','⚕','الأطباء')}
          ${nav('labs','🧪','التحاليل')}
          ${nav('lab2lab','L2L','أسعار Lab 2 Lab')}
          ${nav('nursing','✚','خدمات التمريض')}
          ${nav('radiology','🩻','الأشعة')}
          ${nav('cashier','💵','الكاشير')}
          ${nav('finance','📊','المالية')}
          ${nav('alerts','🔔','التنبيهات')}
          ${nav('audit','🧾','سجل العمليات')}
          ${nav('reports','▤','التقارير')}
        </div>
      </div>

      <div class="service-hub-group system">
        <div class="service-hub-group-title">
          <span>إدارة النظام</span>
          <small>الحفظ والإعدادات</small>
        </div>
        <div class="service-hub-buttons system-buttons">
          ${nav('archive','▣','الأرشيف')}
          ${nav('backups','⟳','النسخ الاحتياطية')}
          ${nav('settings','⚙','الإعدادات')}
        </div>
      </div>
    </section>`;
}

function shell(content: string, title: string, subtitle: string) {
  app.innerHTML = `
    <div class="app-shell modern-shell-v66">
      <aside class="sidebar modern-sidebar">
        <div class="modern-sidebar-brand">
          <img src="/sidebar-clinic-logo.jpg" alt="لوجو عيادات العقاد التخصصية">
          <div>
            <strong>نظام الحالات</strong>
            <small>${esc(appSettings.clinicName)}</small>
          </div>
        </div>

        <nav class="modern-sidebar-nav">
          ${navButton('dashboard','⌂','الرئيسية')}
          ${navButton('patients','👥','المرضى', sidebarPatientsTotal)}
          ${navButton('today','◷','حالات اليوم')}
          ${navButton('doctors','⚕','الأطباء')}
          ${navButton('labs','🧪','التحاليل')}
          ${navButton('lab2lab','L2L','أسعار Lab 2 Lab')}
          ${navButton('nursing','✚','خدمات التمريض')}
          ${navButton('radiology','🩻','الأشعة')}
          ${navButton('cashier','💵','الكاشير')}
          ${navButton('finance','📊','التقارير المالية')}
          ${navButton('alerts','🔔','التنبيهات')}
          ${navButton('audit','🧾','Audit Log')}
          ${navButton('security','🔐','الحماية')}
          ${navButton('reports','▤','التقارير')}
          ${navButton('archive','▣','الأرشيف')}
          ${navButton('backups','⟳','النسخ الاحتياطية')}
          ${navButton('settings','⚙','الإعدادات')}
        </nav>

        <div class="sidebar-footer modern-sidebar-footer">
          <div><span class="online-dot"></span> يعمل أوفلاين بالكامل</div>
          <small>SQLite محلي على هذا الكمبيوتر</small>
        </div>
      </aside>

      <main class="main modern-main">
        <div class="system-watermark" aria-hidden="true"></div>

        <section class="clinic-header modern-app-header">
          <div class="clinic-identity modern-header-brand">
            <img class="clinic-logo" src="/sidebar-clinic-logo.jpg" alt="لوجو عيادات العقاد التخصصية" />
            <div class="clinic-copy">
              <strong class="clinic-name">${esc(appSettings.clinicName)}</strong>
              <span class="clinic-slogan">${esc(appSettings.clinicSlogan)}</span>
            </div>
          </div>

          <div class="modern-header-tools">
            <div class="global-patient-search-wrap">
              <span class="global-search-icon">⌕</span>
              <input id="globalPatientSearch" type="search" autocomplete="off" placeholder="البحث عن مريض بالاسم أو الهاتف..." />
              <div class="global-patient-search-results" id="globalPatientSearchResults"></div>
            </div>

            <div class="connection-panel modern-connection-panel">
              <div class="connection-badge" id="connectionBadge">
                <span class="connection-dot"></span>
                <strong id="connectionText">فحص الاتصال...</strong>
              </div>
              <small>البيانات محفوظة محليًا</small>
            </div>

            <div class="live-clock-panel modern-clock-panel">
              <div class="clock-main" id="clockTime">--:--:--</div>
              <div class="clock-date" id="clockDate"></div>
              <div class="clock-day" id="clockDay"></div>
              <div class="clock-zone" id="clockZone"></div>
            </div>
          </div>
        </section>

        <header class="topbar page-topbar modern-page-topbar">
          <div>
            <h1>${title}</h1>
            <p>${subtitle}</p>
          </div>
          <div class="top-actions">
            ${screen !== 'dashboard' ? `
              <button class="page-back-btn" id="pageBackBtn" type="button" title="رجوع">
                <span class="back-arrow-glyph">←</span>
                <span>رجوع</span>
              </button>
            ` : ''}
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

  const pageBackBtn = document.querySelector<HTMLButtonElement>('#pageBackBtn');
  if (pageBackBtn) pageBackBtn.onclick = () => goBackScreen();

  const globalSearch = document.querySelector<HTMLInputElement>('#globalPatientSearch')!;
  const globalResults = document.querySelector<HTMLDivElement>('#globalPatientSearchResults')!;
  let globalSearchTimer: number | undefined;

  const closeGlobalSearch = () => {
    globalResults.innerHTML = '';
    globalResults.classList.remove('show');
  };

  globalSearch.oninput = () => {
    window.clearTimeout(globalSearchTimer);
    globalSearchTimer = window.setTimeout(async () => {
      const q = globalSearch.value.trim();
      if (!q) {
        closeGlobalSearch();
        return;
      }

      try {
        const rows = await invoke<UnifiedSearchResult[]>('unified_search', { input: { search: q, limit: 12 } });
        globalResults.innerHTML = rows.length ? rows.map(r => `
          <button type="button" class="global-patient-result" data-global-patient="${esc(r.patientId)}">
            <span class="global-patient-result-avatar">${esc((r.title || 'م').trim().charAt(0) || 'م')}</span>
            <span><strong>${esc(r.title || 'بدون اسم')}</strong><small>${esc(r.kind)} • ${esc(r.subtitle || '')}</small></span>
          </button>
        `).join('') : `<div class="global-search-empty">لا توجد نتيجة مطابقة</div>`;

        globalResults.classList.add('show');

        globalResults.querySelectorAll<HTMLButtonElement>('[data-global-patient]').forEach(button => {
          button.onclick = async () => {
            const patientId = button.dataset.globalPatient || '';
            closeGlobalSearch();
            globalSearch.value = '';
            if (patientId) await openPatient(patientId);
          };
        });
      } catch {
        closeGlobalSearch();
      }
    }, 180);
  };

  document.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (!target.closest('.global-patient-search-wrap')) closeGlobalSearch();
  }, { once: true });

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

async function navigate(next: Screen, remember = true) {
  if (screen === 'lab2lab' && next !== 'lab2lab') lab2labSessionPin = '';
  if (next === screen) {
    await renderScreen();
    return;
  }
  if (remember) screenHistory.push(screen);
  screen = next;
  await renderScreen();
}

async function goBackScreen() {
  if (screen === 'lab2lab') lab2labSessionPin = '';
  const previous = screenHistory.pop() || 'dashboard';
  screen = previous;
  await renderScreen();
}

function ensureModalBackArrow() {
  const root = document.querySelector<HTMLDivElement>('#modalRoot');
  if (!root || !root.children.length) return;

  const head = root.querySelector<HTMLElement>('.modal-head');
  if (!head || head.querySelector('.modal-back-arrow')) return;

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'modal-back-arrow';
  back.title = 'رجوع';
  back.setAttribute('aria-label', 'رجوع');
  back.textContent = '← رجوع';

  back.onclick = async () => {
    const patientBack = root.querySelector<HTMLButtonElement>('#backToPatientProfile');
    if (patientBack) {
      patientBack.click();
      return;
    }

    const patientContext = root.querySelector<HTMLElement>('[data-back-patient-id]');
    const patientId = patientContext?.dataset.backPatientId || '';
    if (patientId) {
      root.innerHTML = '';
      await openPatient(patientId);
      return;
    }

    const preferred = root.querySelector<HTMLButtonElement>(
      '#cancelVisit, #cancelEditVisit, #cancelEdit, #cancelDoctor, #cancelCase, #cancelLabPatientRegister, #cancelNursingPatientRegister, #cancelRadiologyPatientRegister, #labOrderCloseBottom, #nursingOrderCloseBottom, #radiologyOrderCloseBottom'
    );
    if (preferred) {
      preferred.click();
      return;
    }

    const close = head.querySelector<HTMLButtonElement>('.modal-close');
    if (close) close.click();
    else root.innerHTML = '';
  };

  head.prepend(back);
}

const modalBackObserver = new MutationObserver(() => {
  queueMicrotask(ensureModalBackArrow);
});

if (document.body) {
  modalBackObserver.observe(document.body, { childList: true, subtree: true });
} else {
  window.addEventListener('DOMContentLoaded', () => {
    modalBackObserver.observe(document.body, { childList: true, subtree: true });
  }, { once: true });
}


async function openPatientAttachments(patientId:string){
  const [details,rows]=await Promise.all([invoke<PatientDetails>('get_patient_details',{id:patientId}),invoke<PatientAttachment[]>('list_patient_attachments',{patientId})]);
  const p=details.patient; const root=document.querySelector<HTMLDivElement>('#modalRoot')!;
  root.innerHTML=`<div class="modal-backdrop" data-back-patient-id="${esc(patientId)}"><section class="modal wide v7-attachments-modal">
    <div class="modal-head"><div class="patient-feature-title"><div class="patient-feature-title-icon attachments">📎</div><div><h2>مرفقات ملف المريض</h2><p>${esc(p.fullName||'بدون اسم')}</p></div></div><button class="modal-close" id="closeAttachments">×</button></div>
    <div class="v7-attachment-toolbar"><select id="attachmentCategory"><option>تقرير طبي</option><option>نتيجة تحاليل</option><option>أشعة</option><option>روشتة</option><option>صورة</option><option>ملف طبي</option></select><input id="attachmentNote" placeholder="ملاحظة اختيارية..." maxlength="500"><button class="btn primary" id="addAttachment">📎 إضافة ملف</button></div>
    <div class="v7-attachment-list">${rows.length?rows.map(a=>`<article class="v7-attachment-row"><div class="v7-attachment-icon">📄</div><div><strong>${esc(a.originalName)}</strong><small>${esc(a.fileType||'ملف')} • ${esc(displaySavedDateTime(a.createdAt))}</small>${a.note?`<p>${esc(a.note)}</p>`:''}</div><div class="v7-attachment-actions"><button class="btn ghost small" data-open-attachment="${esc(a.id)}">إظهار الملف</button><button class="btn danger-outline small" data-delete-attachment="${esc(a.id)}">حذف</button></div></article>`).join(''):'<div class="empty-block">لا توجد مرفقات داخل الملف.</div>'}</div>
    <div class="form-actions"><button class="btn ghost" id="attachmentsBack">← رجوع لملف المريض</button></div>
  </section></div>`;
  const close=()=>root.innerHTML=''; document.querySelector<HTMLButtonElement>('#closeAttachments')!.onclick=close; document.querySelector<HTMLButtonElement>('#attachmentsBack')!.onclick=async()=>{close();await openPatient(patientId)};
  document.querySelector<HTMLButtonElement>('#addAttachment')!.onclick=async()=>{const selected=await openDialog({multiple:false,directory:false,filters:[{name:'ملفات طبية',extensions:['pdf','png','jpg','jpeg']}]}); if(!selected||Array.isArray(selected))return; const fileType=document.querySelector<HTMLSelectElement>('#attachmentCategory')!.value; const note=document.querySelector<HTMLInputElement>('#attachmentNote')!.value.trim(); try{await invoke('add_patient_attachment',{input:{patientId,sourcePath:selected,fileType,note}});toast('تم حفظ المرفق داخل ملف المريض');await openPatientAttachments(patientId)}catch(err){toast(`تعذر حفظ المرفق: ${String(err)}`,'error')}};
  document.querySelectorAll<HTMLButtonElement>('[data-open-attachment]').forEach(b=>b.onclick=()=>invoke('open_patient_attachment',{id:b.dataset.openAttachment||''}).catch(err=>toast(String(err),'error')));
  document.querySelectorAll<HTMLButtonElement>('[data-delete-attachment]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف هذا المرفق نهائيًا؟'))return;try{await invoke('delete_patient_attachment',{id:b.dataset.deleteAttachment||''});toast('تم حذف المرفق');await openPatientAttachments(patientId)}catch(err){toast(`تعذر حذف المرفق: ${String(err)}`,'error')}});
}

function cashierTableHtml(rows:CashierItem[]){return `<div class="table-wrap"><table class="v7-cashier-table"><thead><tr><th>التاريخ</th><th>المريض</th><th>الخدمة</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>إجراء</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${esc(displayDate(r.serviceDate))}</td><td><strong>${esc(r.patientName)}</strong><small class="ltr">${esc(r.patientPhone||'')}</small></td><td>${esc(r.serviceLabel)}</td><td class="ltr">${r.charge.toFixed(2)} ج.م</td><td class="ltr">${r.paid.toFixed(2)} ج.م</td><td class="ltr ${r.remaining>0.009?'v7-due':'v7-paid'}">${r.remaining.toFixed(2)} ج.م</td><td>${r.remaining>0.009?`<button class="btn primary small" data-cashier-pay="${esc(r.serviceType)}" data-service-id="${esc(r.serviceId)}" data-patient-id="${esc(r.patientId)}" data-remaining="${r.remaining}">تحصيل</button>`:'<span class="v7-paid-badge">تم السداد</span>'}</td></tr>`).join(''):'<tr><td colspan="7" class="empty-row">لا توجد خدمات في الفترة</td></tr>'}</tbody></table></div>`}
function openCashierPaymentModal(item:{patientId:string;serviceType:string;serviceId:string;remaining:number},onSaved:()=>Promise<void>){const root=document.querySelector<HTMLDivElement>('#modalRoot')!;root.innerHTML=`<div class="modal-backdrop"><section class="modal compact"><div class="modal-head"><div><h2>تحصيل مبلغ</h2><p>المتبقي ${item.remaining.toFixed(2)} ج.م</p></div><button class="modal-close" id="closeCashierPayment">×</button></div><form id="cashierPaymentForm"><div class="form-grid one"><label>المبلغ<input class="ltr" name="amount" type="number" min="0.01" max="${item.remaining}" step="0.01" value="${item.remaining.toFixed(2)}"></label><label>طريقة الدفع<select name="paymentMethod"><option>نقدي</option><option>فيزا</option><option>إنستاباي</option><option>محفظة</option><option>أخرى</option></select></label><label>ملاحظات<input name="notes" maxlength="300"></label></div><div class="form-actions"><button type="button" class="btn ghost" id="cancelCashierPayment">إلغاء</button><button class="btn primary">✓ حفظ التحصيل</button></div></form></section></div>`;const close=()=>root.innerHTML='';document.querySelector<HTMLButtonElement>('#closeCashierPayment')!.onclick=close;document.querySelector<HTMLButtonElement>('#cancelCashierPayment')!.onclick=close;document.querySelector<HTMLFormElement>('#cashierPaymentForm')!.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget as HTMLFormElement);try{await invoke('record_cashier_payment',{input:{patientId:item.patientId,serviceType:item.serviceType,serviceId:item.serviceId,amount:String(fd.get('amount')||''),paymentMethod:String(fd.get('paymentMethod')||''),notes:String(fd.get('notes')||'').trim()}});close();toast('تم تسجيل التحصيل');await onSaved()}catch(err){toast(`تعذر تسجيل التحصيل: ${String(err)}`,'error')}}}
async function renderCashier(){const day=businessDay();shell(`<section class="card"><div class="card-head toolbar"><div><h2>الكاشير والحسابات</h2><p>تحصيل ومتابعة المتبقي لكل خدمات المريض</p></div><div class="filters"><label>من<input id="cashierFrom" type="date" value="${day}"></label><label>إلى<input id="cashierTo" type="date" value="${day}"></label><button class="btn primary small" id="cashierRefresh">عرض</button></div></div><div id="cashierSummary"></div><div id="cashierRows"></div></section>`,'الكاشير','حساب موحد لكل الخدمات');const from=document.querySelector<HTMLInputElement>('#cashierFrom')!,to=document.querySelector<HTMLInputElement>('#cashierTo')!,host=document.querySelector<HTMLDivElement>('#cashierRows')!,summary=document.querySelector<HTMLDivElement>('#cashierSummary')!;const load=async()=>{const rows=await invoke<CashierItem[]>('list_cashier_items',{query:{from:from.value,to:to.value}});const charges=rows.reduce((s,r)=>s+r.charge,0),paid=rows.reduce((s,r)=>s+r.paid,0),remaining=rows.reduce((s,r)=>s+r.remaining,0);summary.innerHTML=`<div class="v7-money-grid"><div><span>إجمالي الخدمات</span><strong>${charges.toFixed(2)} ج.م</strong></div><div><span>المدفوع</span><strong>${paid.toFixed(2)} ج.م</strong></div><div><span>المتبقي</span><strong>${remaining.toFixed(2)} ج.م</strong></div></div>`;host.innerHTML=cashierTableHtml(rows);host.querySelectorAll<HTMLButtonElement>('[data-cashier-pay]').forEach(b=>b.onclick=()=>openCashierPaymentModal({patientId:b.dataset.patientId||'',serviceType:b.dataset.cashierPay||'',serviceId:b.dataset.serviceId||'',remaining:Number(b.dataset.remaining||0)},load))};document.querySelector<HTMLButtonElement>('#cashierRefresh')!.onclick=()=>load().catch(err=>toast(String(err),'error'));await load()}
async function renderFinance(){const day=businessDay();shell(`<section class="card"><div class="card-head toolbar"><div><h2>التقارير المالية المنفصلة</h2><p>العيادة • التحاليل • التمريض • الأشعة</p></div><div class="filters"><label>من<input id="financeFrom" type="date" value="${day}"></label><label>إلى<input id="financeTo" type="date" value="${day}"></label><button class="btn primary small" id="financeRun">عرض</button></div></div><div id="financeHost"></div></section>`,'التقارير المالية','الإجمالي والمدفوع والمتبقي حسب الخدمة');const run=async()=>{const from=document.querySelector<HTMLInputElement>('#financeFrom')!.value,to=document.querySelector<HTMLInputElement>('#financeTo')!.value,r=await invoke<FinancialSummary>('financial_report',{query:{from,to}});document.querySelector<HTMLDivElement>('#financeHost')!.innerHTML=`<div class="v7-money-grid"><div><span>إجمالي الخدمات</span><strong>${r.totalCharges.toFixed(2)} ج.م</strong></div><div><span>إجمالي المدفوع</span><strong>${r.totalPaid.toFixed(2)} ج.م</strong></div><div><span>إجمالي المتبقي</span><strong>${r.totalRemaining.toFixed(2)} ج.م</strong></div></div><div class="v7-finance-grid">${r.categories.map(c=>`<article><strong>${esc(c.label)}</strong><span>${c.count} حالة</span><b>الإجمالي ${c.charges.toFixed(2)} ج.م</b><b>المدفوع ${c.paid.toFixed(2)} ج.م</b><b class="${c.remaining>0?'v7-due':''}">المتبقي ${c.remaining.toFixed(2)} ج.م</b></article>`).join('')}</div>`};document.querySelector<HTMLButtonElement>('#financeRun')!.onclick=()=>run().catch(err=>toast(String(err),'error'));await run()}
async function renderAudit(){const rows=await invoke<AuditEntry[]>('list_audit_logs',{limit:500});shell(`<section class="card"><div class="card-head"><div><h2>Audit Log</h2><p>سجل قراءة فقط للعمليات</p></div></div><div class="table-wrap"><table><thead><tr><th>التاريخ والوقت</th><th>العملية</th><th>النوع</th><th>المعرف</th><th>التفاصيل</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td class="ltr">${esc(x.createdAt)}</td><td>${esc(x.action)}</td><td>${esc(x.entityType)}</td><td class="ltr">${esc(x.entityId)}</td><td>${esc(x.details)}</td></tr>`).join(''):'<tr><td colspan="5" class="empty-row">لا توجد عمليات بعد</td></tr>'}</tbody></table></div></section>`,'Audit Log','من أضاف أو عدّل أو حذف أو حصّل')}
async function renderAlerts(){const rows=await invoke<SystemAlert[]>('list_system_alerts');shell(`<section class="card"><div class="card-head"><div><h2>التنبيهات</h2><p>متبقيات وحالات حماية تحتاج متابعة</p></div><span class="v7-alert-count">${rows.length}</span></div><div class="v7-alert-list">${rows.length?rows.map(a=>`<article class="v7-alert-row"><span class="v7-alert-icon">${a.kind==='حماية'?'🔐':'🔔'}</span><div><strong>${esc(a.title)}</strong><p>${esc(a.detail)}</p></div>${a.patientId?`<button class="btn ghost small" data-alert-patient="${esc(a.patientId)}">ملف المريض</button>`:''}</article>`).join(''):'<div class="empty-block">لا توجد تنبيهات حالية ✅</div>'}</div></section>`,'التنبيهات','ما يحتاج متابعة داخل النظام');document.querySelectorAll<HTMLButtonElement>('[data-alert-patient]').forEach(b=>b.onclick=()=>openPatient(b.dataset.alertPatient||''))}

async function renderSecurity(){v7SecurityStatus=await invoke<SecurityStatus>('security_status');shell(`<section class="card v7-security-card"><div class="card-head"><div><h2>حماية البيانات</h2><p>PIN وقفل تلقائي للجلسة</p></div><span class="v7-security-state">${v7SecurityStatus.pinSet?'🔐 مفعّل':'🔓 غير مفعّل'}</span></div><form id="securityForm" class="v7-security-form">${v7SecurityStatus.pinSet?'<label>PIN الحالي<input name="currentPin" type="password" inputmode="numeric" maxlength="8"></label>':''}<label>PIN الجديد<input name="newPin" type="password" inputmode="numeric" maxlength="8" placeholder="4 إلى 8 أرقام"></label><label>القفل التلقائي بعد<select name="autoLockMinutes">${[1,5,10,15,30,60,120].map(x=>`<option value="${x}" ${x===v7SecurityStatus.autoLockMinutes?'selected':''}>${x} دقيقة</option>`).join('')}</select></label><button class="btn primary">حفظ إعدادات الحماية</button></form><div class="v7-security-notes">PIN لا يُحفظ كنص صريح؛ يتم حفظ Hash مع Salt محلي.</div></section>`,'الحماية','قفل النظام تلقائيًا عند عدم الاستخدام');document.querySelector<HTMLFormElement>('#securityForm')!.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget as HTMLFormElement);try{v7SecurityStatus=await invoke<SecurityStatus>('set_security_pin',{input:{currentPin:String(fd.get('currentPin')||''),newPin:String(fd.get('newPin')||''),autoLockMinutes:Number(fd.get('autoLockMinutes')||10)}});v7LastActivityAt=Date.now();toast('تم حفظ إعدادات الحماية');await renderSecurity()}catch(err){toast(`تعذر الحفظ: ${String(err)}`,'error')}}}
function showV7LockScreen(){app.innerHTML=`<div class="v7-lock-screen"><div class="v7-lock-card"><div class="v7-lock-icon">🔐</div><h1>النظام مقفول</h1><p>أدخل PIN الحماية للمتابعة</p><form id="v7UnlockForm"><input id="v7UnlockPin" type="password" inputmode="numeric" maxlength="8" autofocus placeholder="PIN"><button class="btn primary">فتح النظام</button></form><div id="v7LockError"></div></div></div>`;document.querySelector<HTMLFormElement>('#v7UnlockForm')!.onsubmit=async e=>{e.preventDefault();const pin=document.querySelector<HTMLInputElement>('#v7UnlockPin')!.value.trim();try{const ok=await invoke<boolean>('verify_security_pin',{input:{pin}});if(!ok){document.querySelector<HTMLDivElement>('#v7LockError')!.textContent='PIN غير صحيح';return}v7LastActivityAt=Date.now();await renderScreen()}catch(err){document.querySelector<HTMLDivElement>('#v7LockError')!.textContent=String(err)}}}
async function startV7App(){v7SecurityStatus=await invoke<SecurityStatus>('security_status');const activity=()=>{v7LastActivityAt=Date.now()};['pointerdown','keydown','touchstart'].forEach(name=>window.addEventListener(name,activity,{passive:true}));window.clearInterval(v7SecurityTimer);v7SecurityTimer=window.setInterval(()=>{if(!v7SecurityStatus.pinSet)return;const idle=Date.now()-v7LastActivityAt;if(idle>=v7SecurityStatus.autoLockMinutes*60000&&!document.querySelector('.v7-lock-screen'))showV7LockScreen()},15000);if(v7SecurityStatus.pinSet)showV7LockScreen();else await renderScreen()}

async function renderScreen() {
  await Promise.all([loadDoctors(), loadSettings(), loadSidebarPatientsTotal()]);
  if (screen === 'dashboard') return renderDashboard();
  if (screen === 'patients') return renderPatients(false);
  if (screen === 'archive') return renderPatients(true);
  if (screen === 'today') return renderToday();
  if (screen === 'doctors') return renderDoctors();
  if (screen === 'labs') return renderLabPrices();
  if (screen === 'lab2lab') return renderLab2Lab();
  if (screen === 'nursing') return renderNursingServices();
  if (screen === 'radiology') return renderRadiologyServices();
  if (screen === 'cashier') return renderCashier();
  if (screen === 'finance') return renderFinance();
  if (screen === 'alerts') return renderAlerts();
  if (screen === 'audit') return renderAudit();
  if (screen === 'security') return renderSecurity();
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
              ? `
                <button class="icon-action restore" data-restore="${esc(p.id)}" title="استعادة">↶</button>
                <button class="icon-action delete-patient-card" data-delete-patient-card="${esc(p.id)}" data-delete-patient-name="${esc(p.fullName || 'المريض')}" title="حذف المريض نهائيًا">🗑</button>
              `
              : `
                <button class="icon-action edit" data-edit="${esc(p.id)}" title="تعديل">✎</button>
                <button class="icon-action" data-archive="${esc(p.id)}" title="أرشفة">▣</button>
                <button class="icon-action delete-patient-card" data-delete-patient-card="${esc(p.id)}" data-delete-patient-name="${esc(p.fullName || 'المريض')}" title="حذف المريض نهائيًا">🗑</button>
              `
            }
          </div>
        </article>
      `).join('') : `<div class="empty-block">لا توجد ملفات مرضى</div>`}
    </div>`;
}

function bindPatientActions() {
  document.querySelectorAll<HTMLButtonElement>('.patient-open').forEach(b => b.onclick = () => openPatient(b.dataset.id!));
  document.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(b => b.onclick = () => openEditPatient(b.dataset.edit!));
  document.querySelectorAll<HTMLButtonElement>('[data-delete-patient-card]').forEach(b => b.onclick = async event => {
    event.stopPropagation();
    const id = b.dataset.deletePatientCard || '';
    const name = b.dataset.deletePatientName || 'المريض';
    if (!id) return;
    if (!confirm(`حذف ملف ${name} نهائيًا بكل بياناته؟`)) return;
    if (!confirm('تأكيد أخير: سيتم حذف الزيارات والتحاليل وخدمات التمريض والأشعة الخاصة بالمريض.')) return;
    try {
      await invoke('delete_patient', { id });
      toast('تم حذف ملف المريض نهائيًا');
      await renderScreen();
    } catch (err) {
      toast(`تعذر حذف المريض: ${String(err)}`, 'error');
    }
  });
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

  const [todayReport, todayLabOrders, todayNursingOrders, todayRadiologyOrders] = await Promise.all([
    invoke<ReportResult>('run_report', { query: { from: dayKey, to: dayKey, doctor: '' } }),
    invoke<LabOrder[]>('list_lab_orders', { query: { from: dayKey, to: dayKey } }),
    invoke<NursingOrder[]>('list_nursing_orders', { query: { from: dayKey, to: dayKey } }),
    invoke<RadiologyOrder[]>('list_radiology_orders', { query: { from: dayKey, to: dayKey } })
  ]);

  const clinicToday = todayReport.rows.length;
  const labPatientsToday = todayLabOrders.length;
  const nursingPatientsToday = todayNursingOrders.length;
  const radiologyPatientsToday = todayRadiologyOrders.length;
  const totalToday = clinicToday + labPatientsToday + nursingPatientsToday + radiologyPatientsToday;

  const unifiedRows = [
    ...todayReport.rows.map(v => ({
      kind: 'clinic',
      kindLabel: v.visitType || 'كشف / استشارة',
      icon: '🩺',
      sortKey: `${v.visitDate || ''} ${v.visitTime || ''} ${v.createdAt || ''}`,
      time: v.visitTime || '—',
      patientId: v.patientId,
      patientName: v.patientName || '—',
      patientPhone: v.patientPhone || '',
      provider: v.doctor || '—',
      status: 'محفوظ',
      action: `<button class="dash-row-action" data-dash-open-patient="${esc(v.patientId)}">فتح الملف</button>`
    })),
    ...todayLabOrders.map(o => ({
      kind: 'lab',
      kindLabel: 'تحاليل',
      icon: '🧪',
      sortKey: `${o.orderDate || ''} ${o.orderTime || ''} ${o.createdAt || ''}`,
      time: o.orderTime || '—',
      patientId: o.patientId,
      patientName: o.patientName || '—',
      patientPhone: o.patientPhone || '',
      provider: `${o.itemsCount} تحليل`,
      status: labOrderStatus(o),
      action: `<button class="dash-row-action" data-dash-open-lab="${esc(o.id)}">فتح الحالة</button>`
    })),
    ...todayNursingOrders.map(o => ({
      kind: 'nursing',
      kindLabel: 'خدمة تمريض',
      icon: '✚',
      sortKey: `${o.orderDate || ''} ${o.orderTime || ''} ${o.createdAt || ''}`,
      time: o.orderTime || '—',
      patientId: o.patientId,
      patientName: o.patientName || '—',
      patientPhone: o.patientPhone || '',
      provider: o.serviceName || '—',
      status: 'محفوظ',
      action: `<button class="dash-row-action" data-dash-open-nursing="${esc(o.id)}">فتح الحالة</button>`
    })),
    ...todayRadiologyOrders.map(o => ({
      kind: 'radiology',
      kindLabel: 'أشعة',
      icon: '🩻',
      sortKey: `${o.orderDate || ''} ${o.orderTime || ''} ${o.createdAt || ''}`,
      time: o.orderTime || '—',
      patientId: o.patientId,
      patientName: o.patientName || '—',
      patientPhone: o.patientPhone || '',
      provider: `${o.radiologyName || 'أشعة'}${o.centerName ? ` • ${o.centerName}` : ''}`,
      status: 'محفوظ',
      action: `<button class="dash-row-action" data-dash-open-radiology="${esc(o.id)}">فتح الحالة</button>`
    }))
  ].sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  shell(`
    <section class="v66-dashboard">
      <div class="v66-dashboard-topline">
        <div class="v66-business-day-card">
          <span class="v66-date-icon">▣</span>
          <div>
            <strong>${displayDate(dayKey)}</strong>
            <small>اليوم التشغيلي يبدأ ${operationalStartLabel()}</small>
          </div>
        </div>
      </div>

      <div class="v66-primary-actions">
        <button class="v66-action-card clinic" id="v66NewVisit">
          <span class="v66-action-icon">🩺</span>
          <span class="v66-action-copy">
            <strong>كشف / استشارة</strong>
            <small>تسجيل حالة عيادة جديدة</small>
          </span>
          <span class="v66-action-arrow">‹</span>
        </button>

        <button class="v66-action-card labs" id="v66NewLab">
          <span class="v66-action-icon">🧪</span>
          <span class="v66-action-copy">
            <strong>تحاليل</strong>
            <small>تسجيل مريض تحاليل</small>
          </span>
          <span class="v66-action-arrow">‹</span>
        </button>

        <button class="v66-action-card nursing" id="v66NewNursing">
          <span class="v66-action-icon">✚</span>
          <span class="v66-action-copy">
            <strong>تمريض</strong>
            <small>تسجيل خدمة تمريض</small>
          </span>
          <span class="v66-action-arrow">‹</span>
        </button>

        <button class="v66-action-card radiology" id="v66NewRadiology">
          <span class="v66-action-icon">🩻</span>
          <span class="v66-action-copy">
            <strong>أشعة</strong>
            <small>تسجيل حالة أشعة</small>
          </span>
          <span class="v66-action-arrow">‹</span>
        </button>
      </div>

      <div class="v66-stats-grid">
        <button class="v66-stat-card" data-v66-stat-filter="clinic">
          <span class="v66-stat-icon clinic">🩺</span>
          <span><small>تسجيلات العيادة اليوم</small><strong>${clinicToday}</strong></span>
        </button>
        <button class="v66-stat-card" data-v66-stat-filter="lab">
          <span class="v66-stat-icon labs">🧪</span>
          <span><small>تسجيلات التحاليل اليوم</small><strong>${labPatientsToday}</strong></span>
        </button>
        <button class="v66-stat-card" data-v66-stat-filter="nursing">
          <span class="v66-stat-icon nursing">✚</span>
          <span><small>تسجيلات التمريض اليوم</small><strong>${nursingPatientsToday}</strong></span>
        </button>
        <button class="v66-stat-card" data-v66-stat-filter="radiology">
          <span class="v66-stat-icon radiology">🩻</span>
          <span><small>تسجيلات الأشعة اليوم</small><strong>${radiologyPatientsToday}</strong></span>
        </button>
        <button class="v66-stat-card total" data-v66-stat-filter="all">
          <span class="v66-stat-icon total">▥</span>
          <span><small>إجمالي تسجيلات اليوم</small><strong>${totalToday}</strong></span>
        </button>
      </div>

      <section class="v66-today-card">
        <div class="v66-today-card-head">
          <div>
            <h2>تسجيلات اليوم</h2>
            <p>جميع الحالات المسجلة اليوم في العيادة والتحاليل والتمريض والأشعة</p>
          </div>
          <button class="btn ghost small" id="v66OpenToday">فتح شاشة حالات اليوم</button>
        </div>

        <div class="v66-today-toolbar">
          <div class="v66-filter-tabs">
            <button class="active" data-v66-filter="all">الكل (${totalToday})</button>
            <button data-v66-filter="clinic">العيادة (${clinicToday})</button>
            <button data-v66-filter="lab">التحاليل (${labPatientsToday})</button>
            <button data-v66-filter="nursing">التمريض (${nursingPatientsToday})</button>
            <button data-v66-filter="radiology">الأشعة (${radiologyPatientsToday})</button>
          </div>

          <div class="v66-today-search">
            <span>⌕</span>
            <input id="v66TodaySearch" type="search" placeholder="بحث في تسجيلات اليوم..." />
          </div>
        </div>

        <div class="v66-today-table-wrap">
          <table class="v66-today-table">
            <thead>
              <tr>
                <th>#</th>
                <th>وقت التسجيل</th>
                <th>نوع الخدمة</th>
                <th>اسم المريض</th>
                <th>رقم الملف</th>
                <th>الطبيب / مقدم الخدمة</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody id="v66TodayRows">
              ${unifiedRows.map((row, index) => `
                <tr
                  data-v66-row
                  data-v66-kind="${row.kind}"
                  data-v66-search="${esc(`${row.patientName} ${row.patientPhone}`.toLowerCase())}"
                >
                  <td>${index + 1}</td>
                  <td class="ltr">${esc(row.time)}</td>
                  <td><span class="v66-service-badge ${row.kind}">${row.icon} ${esc(row.kindLabel)}</span></td>
                  <td>${esc(row.patientName)}</td>
                  <td class="ltr">${esc((row.patientId || '').slice(0, 8).toUpperCase())}</td>
                  <td>${esc(row.provider)}</td>
                  <td><span class="v66-status-badge">${esc(row.status)}</span></td>
                  <td>${row.action}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="v66-empty-state ${unifiedRows.length ? '' : 'show'}" id="v66TodayEmpty">
            <div class="v66-empty-icon">▤</div>
            <strong>لا توجد تسجيلات اليوم حتى الآن</strong>
            <span>ستظهر هنا جميع الحالات المسجلة في العيادة والتحاليل والتمريض لهذا اليوم</span>
          </div>
        </div>
      </section>
    </section>
  `, 'لوحة التحكم', 'تسجيلات اليوم فقط بدون إحصائيات تراكمية');

  ensureCaseContextMenu();

  document.querySelector<HTMLButtonElement>('#v66NewVisit')!.onclick = () => openCaseModal();
  document.querySelector<HTMLButtonElement>('#v66NewLab')!.onclick = () => openLabPatientRegistrationModal();
  document.querySelector<HTMLButtonElement>('#v66NewNursing')!.onclick = () => openNursingPatientRegistrationModal();
  document.querySelector<HTMLButtonElement>('#v66NewRadiology')!.onclick = () => openRadiologyPatientRegistrationModal();
  document.querySelector<HTMLButtonElement>('#v66OpenToday')!.onclick = () => navigate('today');

  document.querySelectorAll<HTMLButtonElement>('[data-dash-open-patient]').forEach(button => {
    button.onclick = () => openPatient(button.dataset.dashOpenPatient || '');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-dash-open-lab]').forEach(button => {
    button.onclick = () => openLabOrderDetails(button.dataset.dashOpenLab || '');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-dash-open-nursing]').forEach(button => {
    button.onclick = () => openNursingOrderDetails(button.dataset.dashOpenNursing || '');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-dash-open-radiology]').forEach(button => {
    button.onclick = () => openRadiologyOrderDetails(button.dataset.dashOpenRadiology || '');
  });

  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-v66-filter]')];
  const rows = [...document.querySelectorAll<HTMLTableRowElement>('[data-v66-row]')];
  const search = document.querySelector<HTMLInputElement>('#v66TodaySearch')!;
  const empty = document.querySelector<HTMLDivElement>('#v66TodayEmpty')!;
  let activeFilter = 'all';

  const apply = () => {
    const q = search.value.trim().toLowerCase();
    let visible = 0;

    rows.forEach(row => {
      const kind = row.dataset.v66Kind || '';
      const searchable = row.dataset.v66Search || '';
      const okKind = activeFilter === 'all' || kind === activeFilter;
      const okSearch = !q || searchable.includes(q);
      const show = okKind && okSearch;
      row.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });

    empty.classList.toggle('show', visible === 0);
  };

  const setFilter = (filter: string) => {
    activeFilter = filter;
    tabs.forEach(tab => tab.classList.toggle('active', (tab.dataset.v66Filter || '') === activeFilter));
    apply();
  };

  tabs.forEach(tab => {
    tab.onclick = () => setFilter(tab.dataset.v66Filter || 'all');
  });

  document.querySelectorAll<HTMLButtonElement>('[data-v66-stat-filter]').forEach(card => {
    card.onclick = () => setFilter(card.dataset.v66StatFilter || 'all');
  });

  search.oninput = apply;
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
  const [baseResult, labOrders, nursingOrders] = await Promise.all([
    invoke<ReportResult>('run_report', { query: { from: dayKey, to: dayKey, doctor: '' } }),
    invoke<LabOrder[]>('list_lab_orders', { query: { from: dayKey, to: dayKey } }),
    invoke<NursingOrder[]>('list_nursing_orders', { query: { from: dayKey, to: dayKey } })
  ]);

  const metrics = reportMetrics(baseResult.rows);
  const labPaid = labOrders.reduce((sum, o) => sum + moneyNumber(o.paidAmount), 0);
  const labRemaining = labOrders.reduce((sum, o) => sum + moneyNumber(o.remainingAmount), 0);
  const nursingTotal = nursingOrders.reduce((sum, o) => sum + moneyNumber(o.price), 0);
  const totalCases = baseResult.totalVisits + labOrders.length + nursingOrders.length;
  const totalCollection = metrics.revenue + labPaid + nursingTotal;
  const clinicTotal = metrics.clinicTotal + labPaid + nursingTotal;

  ensureCaseContextMenu();
  shell(`
    <section class="card">
      <div class="card-head">
        <div>
          <h2>حالات اليوم</h2>
          <p>اليوم التشغيلي يبدأ ${operationalStartLabel()} • ${displayDate(dayKey)} • ${totalCases} حالة</p>
        </div>
        <div class="filters">
          <button class="btn ghost small" id="todayImage">تحميل صورة</button>
          <button class="btn primary small" id="todayPdf">PDF للطباعة</button>
        </div>
      </div>

      <div class="today-summary-grid today-summary-grid-v62">
        <div><span>إجمالي الحالات</span><strong>${totalCases}</strong></div>
        <div><span>إجمالي التحصيل</span><strong class="ltr">${totalCollection.toFixed(2)} ج.م</strong></div>
        <div><span>مبلغ العيادات</span><strong class="ltr">${clinicTotal.toFixed(2)} ج.م</strong></div>
        <div><span>مبلغ الأطباء</span><strong class="ltr">${metrics.doctorTotal.toFixed(2)} ج.م</strong></div>
        <div><span>متبقي التحاليل</span><strong class="ltr">${labRemaining.toFixed(2)} ج.م</strong></div>
      </div>

      <div class="today-filter-panel">
        <label>الطبيب
          <select id="todayDoctorFilter">
            <option value="">كل الأطباء</option>
            ${doctors.filter(d => d.active).map(d => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('')}
          </select>
        </label>
        <label>نوع الحالة
          <select id="todayTypeFilter">
            <option value="">كل الأنواع</option>
            <option>كشف جديد</option>
            <option>استشارة</option>
            <option>تحاليل</option>
            <option>خدمات تمريض</option>
          </select>
        </label>
        <label>مصدر الحجز
          <select id="todaySourceFilter">
            <option value="">كل المصادر</option>
            <option>عادي</option>
            <option>فيزيتا</option>
            <option>اكشف</option>
            <option>كلينيدو</option>
          </select>
        </label>
      </div>

      <div id="todayCasesHost"></div>

      <div class="today-search-panel">
        <div>
          <strong>البحث في ملفات المرضى</strong>
          <small>ابحث بالاسم أو رقم التليفون لفتح أي ملف قديم</small>
        </div>
        <input class="search-input" id="todayPatientSearch" placeholder="اسم المريض أو رقم التليفون..." />
      </div>
      <div id="todayPatientSearchResults"></div>
    </section>
  `, 'حالات اليوم', 'الكشوفات والاستشارات والتحاليل وخدمات التمريض');

  const doctorFilter = document.querySelector<HTMLSelectElement>('#todayDoctorFilter')!;
  const typeFilter = document.querySelector<HTMLSelectElement>('#todayTypeFilter')!;
  const sourceFilter = document.querySelector<HTMLSelectElement>('#todaySourceFilter')!;
  const host = document.querySelector<HTMLDivElement>('#todayCasesHost')!;

  const visibleVisits = () => baseResult.rows.filter(v =>
    typeFilter.value !== 'تحاليل' &&
    typeFilter.value !== 'خدمات تمريض' &&
    (!doctorFilter.value || v.doctor === doctorFilter.value) &&
    (!typeFilter.value || v.visitType === typeFilter.value) &&
    (!sourceFilter.value || (v.bookingSource || 'عادي') === sourceFilter.value)
  );

  const visibleLabs = () => {
    if (typeFilter.value && typeFilter.value !== 'تحاليل') return [];
    if (doctorFilter.value || sourceFilter.value) return [];
    return labOrders;
  };

  const visibleNursing = () => {
    if (typeFilter.value && typeFilter.value !== 'خدمات تمريض') return [];
    if (doctorFilter.value || sourceFilter.value) return [];
    return nursingOrders;
  };

  const applyFilters = () => {
    const visits = visibleVisits();
    const labs = visibleLabs();
    const nursing = visibleNursing();

    host.innerHTML = `
      ${visits.length || (!typeFilter.value || typeFilter.value === 'كشف جديد' || typeFilter.value === 'استشارة') ? `
        <div class="today-case-section-head"><h3>الكشوفات والاستشارات</h3><span>${visits.length} حالة</span></div>
        ${visitTable(visits, true)}
      ` : ''}

      ${labs.length || typeFilter.value === 'تحاليل' || !typeFilter.value ? `
        <div class="today-case-section-head labs"><h3>حالات التحاليل</h3><span>${labs.length} حالة</span></div>
        ${labOrderRowsHtml(labs, true)}
      ` : ''}

      ${nursing.length || typeFilter.value === 'خدمات تمريض' || !typeFilter.value ? `
        <div class="today-case-section-head nursing"><h3>خدمات التمريض</h3><span>${nursing.length} حالة</span></div>
        ${nursingOrderRowsHtml(nursing, true)}
      ` : ''}
    `;

    ensureCaseContextMenu();
    bindLabOrderActions();
    bindNursingOrderActions();
  };

  doctorFilter.onchange = applyFilters;
  typeFilter.onchange = applyFilters;
  sourceFilter.onchange = applyFilters;
  applyFilters();

  document.querySelector<HTMLButtonElement>('#todayImage')!.onclick = () =>
    exportTodayCombined(visibleVisits(), visibleLabs(), visibleNursing(), dayKey, 'png');
  document.querySelector<HTMLButtonElement>('#todayPdf')!.onclick = () =>
    exportTodayCombined(visibleVisits(), visibleLabs(), visibleNursing(), dayKey, 'pdf');

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
          <th>نوع الزيارة</th><th>مصدر الحجز</th><th>الطبيب</th><th>سعر الكشف</th><th>مبلغ العيادات</th><th>مبلغ الطبيب</th><th>إجراءات</th>
        </tr></thead>
        <tbody>${rows.length ? rows.map(v => `
          <tr class="visit-context-row" data-patient-id="${esc(v.patientId)}" data-patient-name="${esc(v.patientName || '')}" data-patient-phone="${esc(v.patientPhone || '')}">
            <td>${displayDate(v.visitDate)}</td>
            <td class="ltr">${esc(v.visitTime)}</td>
            ${showPatient ? `<td>${esc(v.patientName || '—')}</td><td class="ltr">${esc(v.patientPhone || '—')}</td>` : ''}
            <td><span class="visit-type-badge">${esc(v.visitType || 'زيارة')}</span></td>
            <td><span class="booking-source-badge">${esc(v.bookingSource || 'عادي')}</span></td>
            <td>${esc(v.doctor || '—')}</td>
            <td class="ltr">${v.fee ? `${esc(v.fee)} ج.م` : '—'}</td>
            <td class="ltr">${v.clinicAmount ? `${esc(v.clinicAmount)} ج.م` : '—'}</td>
            <td class="ltr">${v.doctorAmount ? `${esc(v.doctorAmount)} ج.م` : '—'}</td>
            <td>
              <div class="visit-row-actions">
                <button class="icon-action edit" type="button" data-edit-visit="${esc(v.id)}" title="تعديل الزيارة">✎</button>
                <button class="icon-action danger" type="button" data-delete-visit="${esc(v.id)}" title="حذف الزيارة">🗑</button>
              </div>
            </td>
          </tr>`).join('') : `<tr><td colspan="${showPatient ? 11 : 9}" class="empty-row">لا توجد زيارات</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function doctorInitials(name: string) {
  const cleaned = String(name || '').replace(/^د[./\s-]*/u, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map(part => part.charAt(0)).join('') || 'DR';
}

function doctorSourceSummary(rows: Visit[]) {
  const sources = ['عادي', 'فيزيتا', 'اكشف', 'كلينيدو'];
  return sources.map(source => {
    const sourceRows = rows.filter(v => (v.bookingSource || 'عادي') === source);
    return {
      source,
      count: sourceRows.length,
      totalFee: sourceRows.reduce((sum, v) => sum + moneyNumber(v.fee), 0),
      clinicAmount: sourceRows.reduce((sum, v) => sum + moneyNumber(v.clinicAmount), 0),
      doctorAmount: sourceRows.reduce((sum, v) => sum + moneyNumber(v.doctorAmount), 0),
    };
  });
}

function doctorReadOnlyVisitTable(rows: Visit[]) {
  return `
    <div class="table-wrap doctor-profile-table">
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>الوقت</th>
            <th>المريض</th>
            <th>رقم التليفون</th>
            <th>نوع الزيارة</th>
            <th>المصدر</th>
            <th>سعر الكشف</th>
            <th>مبلغ العيادات</th>
            <th>مبلغ الطبيب</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(v => `
            <tr>
              <td>${esc(displayDate(v.visitDate))}</td>
              <td class="ltr">${esc(v.visitTime || '—')}</td>
              <td>${esc(v.patientName || '—')}</td>
              <td class="ltr">${esc(v.patientPhone || '—')}</td>
              <td>${esc(v.visitType || 'زيارة')}</td>
              <td><span class="booking-source-badge">${esc(v.bookingSource || 'عادي')}</span></td>
              <td class="ltr">${v.fee ? `${esc(v.fee)} ج.م` : '—'}</td>
              <td class="ltr">${v.clinicAmount ? `${esc(v.clinicAmount)} ج.م` : '—'}</td>
              <td class="ltr">${v.doctorAmount ? `${esc(v.doctorAmount)} ج.م` : '—'}</td>
            </tr>
          `).join('') : `<tr><td colspan="9" class="empty-row">لا توجد حالات في الفترة المختارة</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function exportDoctorProfileReport(
  doctor: Doctor,
  result: ReportResult,
  from: string,
  to: string,
  format: ExportFormat
) {
  const metrics = reportMetrics(result.rows);
  const sources = doctorSourceSummary(result.rows);

  const sourceTable = `
    <h3 class="export-section-heading">ملخص حسب مصدر الحجز</h3>
    <table class="export-table">
      <thead>
        <tr>
          <th>المصدر</th>
          <th>عدد الحالات</th>
          <th>إجمالي الكشف</th>
          <th>مبلغ العيادات</th>
          <th>مبلغ الطبيب</th>
        </tr>
      </thead>
      <tbody>
        ${sources.map(item => `
          <tr>
            <td>${esc(item.source)}</td>
            <td>${item.count}</td>
            <td class="ltr">${item.totalFee.toFixed(2)} ج.م</td>
            <td class="ltr">${item.clinicAmount.toFixed(2)} ج.م</td>
            <td class="ltr">${item.doctorAmount.toFixed(2)} ج.م</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;

  const body = `
    <div class="export-summary export-summary-v48">
      <div><span>الطبيب</span><strong>${esc(doctor.name)}</strong></div>
      <div><span>الفترة</span><strong>${esc(reportPeriodLabel(from, to))}</strong></div>
      <div><span>عدد الحالات</span><strong>${metrics.totalVisits}</strong></div>
      <div><span>إجمالي الكشف</span><strong class="ltr">${metrics.revenue.toFixed(2)} ج.م</strong></div>
      <div><span>إجمالي مبلغ العيادات</span><strong class="ltr">${metrics.clinicTotal.toFixed(2)} ج.م</strong></div>
      <div><span>إجمالي مبلغ الطبيب</span><strong class="ltr">${metrics.doctorTotal.toFixed(2)} ج.م</strong></div>
    </div>
    ${sourceTable}
    <h3 class="export-section-heading">تفاصيل الحالات</h3>
    ${exportVisitRows(result.rows, true)}
  `;

  await captureAndSaveExport(
    exportSheet(`تقرير الطبيب - ${doctor.name}`, reportPeriodLabel(from, to), body),
    `تقرير الطبيب - ${doctor.name} - ${from} - ${to}`,
    format
  );
}

async function openDoctorProfile(doctor: Doctor) {
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;
  const activeDay = businessDay();
  const [year, month] = activeDay.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal doctor-profile-modal">
        <div class="modal-head doctor-profile-head">
          <div class="doctor-profile-identity">
            <div class="doctor-profile-avatar">${esc(doctorInitials(doctor.name))}</div>
            <div>
              <h2>${esc(doctor.name)}</h2>
              <p>${esc(doctor.specialty || 'بدون تخصص')}</p>
            </div>
          </div>
          <button class="modal-close" id="closeDoctorProfile">×</button>
        </div>

        <div class="doctor-period-bar">
          <button class="btn ghost small" id="doctorTodayRange">اليوم</button>
          <button class="btn ghost small" id="doctorMonthRange">الشهر الحالي</button>
          <label>من<input id="doctorFrom" type="date" value="${activeDay}"></label>
          <label>إلى<input id="doctorTo" type="date" value="${activeDay}"></label>
          <button class="btn primary small" id="doctorRunRange">عرض الفترة</button>
        </div>

        <div class="doctor-profile-export-bar">
          <div class="doctor-profile-source-filter">
            <button class="btn ghost small active" data-doctor-source-filter="">كل المصادر</button>
            <button class="btn ghost small" data-doctor-source-filter="عادي">عادي</button>
            <button class="btn ghost small" data-doctor-source-filter="فيزيتا">فيزيتا</button>
            <button class="btn ghost small" data-doctor-source-filter="اكشف">اكشف</button>
            <button class="btn ghost small" data-doctor-source-filter="كلينيدو">كلينيدو</button>
          </div>
          <div class="doctor-profile-export-actions">
            <button class="btn ghost small" id="doctorProfilePng">تحميل صورة</button>
            <button class="btn primary small" id="doctorProfilePdf">تحميل PDF</button>
          </div>
        </div>

        <div id="doctorProfileBody">
          <div class="empty-block">جاري تحميل بيانات الطبيب...</div>
        </div>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';
  document.querySelector<HTMLButtonElement>('#closeDoctorProfile')!.onclick = close;

  const fromInput = document.querySelector<HTMLInputElement>('#doctorFrom')!;
  const toInput = document.querySelector<HTMLInputElement>('#doctorTo')!;
  const body = document.querySelector<HTMLDivElement>('#doctorProfileBody')!;

  let currentResult: ReportResult = { totalVisits: 0, uniquePatients: 0, rows: [] };
  let selectedDoctorSource = '';

  const renderSourceDetails = () => {
    const filteredRows = currentResult.rows.filter(v =>
      !selectedDoctorSource || (v.bookingSource || 'عادي') === selectedDoctorSource
    );
    const detailHost = document.querySelector<HTMLDivElement>('#doctorSourceDetails');
    const countHost = document.querySelector<HTMLElement>('#doctorSourceDetailsCount');
    const labelHost = document.querySelector<HTMLElement>('#doctorSourceDetailsLabel');
    if (detailHost) detailHost.innerHTML = doctorReadOnlyVisitTable(filteredRows);
    if (countHost) countHost.textContent = `${filteredRows.length} حالة`;
    if (labelHost) labelHost.textContent = selectedDoctorSource ? `المصدر: ${selectedDoctorSource}` : 'كل المصادر';

    document.querySelectorAll<HTMLButtonElement>('[data-doctor-source-filter]').forEach(button => {
      button.classList.toggle('active', (button.dataset.doctorSourceFilter || '') === selectedDoctorSource);
    });
    document.querySelectorAll<HTMLElement>('[data-doctor-source-card]').forEach(card => {
      card.classList.toggle('selected', (card.dataset.doctorSourceCard || '') === selectedDoctorSource);
    });
  };

  const render = async () => {
    const from = fromInput.value;
    const to = toInput.value;
    if (!from || !to) {
      toast('حدد تاريخ البداية والنهاية', 'error');
      return;
    }

    body.innerHTML = `<div class="empty-block">جاري تحميل البيانات...</div>`;

    try {
      currentResult = await invoke<ReportResult>('run_report', {
        query: { from, to, doctor: doctor.name }
      });

      const metrics = reportMetrics(currentResult.rows);
      const sources = doctorSourceSummary(currentResult.rows);

      body.innerHTML = `
        <div class="doctor-profile-total-grid">
          <article><span>إجمالي الحالات</span><strong>${metrics.totalVisits}</strong></article>
          <article><span>إجمالي الكشف</span><strong class="ltr">${metrics.revenue.toFixed(2)} ج.م</strong></article>
          <article><span>إجمالي مبلغ الطبيب</span><strong class="ltr">${metrics.doctorTotal.toFixed(2)} ج.م</strong></article>
          <article><span>إجمالي مبلغ العيادات</span><strong class="ltr">${metrics.clinicTotal.toFixed(2)} ج.م</strong></article>
        </div>

        <div class="doctor-source-grid">
          ${sources.map(item => `
            <article class="doctor-source-card" data-doctor-source-card="${esc(item.source)}" role="button" tabindex="0">
              <div class="doctor-source-icon">⌁</div>
              <div class="doctor-source-name">${esc(item.source)}</div>
              <strong>${item.count} حالة</strong>
              <div class="doctor-source-money">
                <span>للطبيب <b class="ltr">${item.doctorAmount.toFixed(2)} ج.م</b></span>
                <span>للعيادات <b class="ltr">${item.clinicAmount.toFixed(2)} ج.م</b></span>
                <span>إجمالي الكشف <b class="ltr">${item.totalFee.toFixed(2)} ج.م</b></span>
              </div>
            </article>
          `).join('')}
        </div>

        <div class="doctor-profile-section-head">
          <div>
            <h3>تفاصيل الحالات</h3>
            <p>${esc(reportPeriodLabel(from, to))} • <span id="doctorSourceDetailsLabel">كل المصادر</span></p>
          </div>
          <strong id="doctorSourceDetailsCount">${currentResult.totalVisits} حالة</strong>
        </div>

        <div id="doctorSourceDetails">${doctorReadOnlyVisitTable(currentResult.rows)}</div>
      `;

      document.querySelectorAll<HTMLElement>('[data-doctor-source-card]').forEach(card => {
        const apply = () => {
          selectedDoctorSource = card.dataset.doctorSourceCard || '';
          renderSourceDetails();
        };
        card.onclick = apply;
        card.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            apply();
          }
        };
      });

      renderSourceDetails();
    } catch (err) {
      body.innerHTML = `<div class="empty-block">تعذر تحميل بيانات الطبيب</div>`;
      toast(`تعذر تحميل التقرير: ${String(err)}`, 'error');
    }
  };

  document.querySelector<HTMLButtonElement>('#doctorTodayRange')!.onclick = async () => {
    const day = businessDay();
    fromInput.value = day;
    toInput.value = day;
    await render();
  };

  document.querySelector<HTMLButtonElement>('#doctorMonthRange')!.onclick = async () => {
    fromInput.value = monthStart;
    toInput.value = activeDay;
    await render();
  };

  document.querySelector<HTMLButtonElement>('#doctorRunRange')!.onclick = render;

  document.querySelectorAll<HTMLButtonElement>('[data-doctor-source-filter]').forEach(button => {
    button.onclick = () => {
      selectedDoctorSource = button.dataset.doctorSourceFilter || '';
      renderSourceDetails();
    };
  });

  document.querySelector<HTMLButtonElement>('#doctorProfilePng')!.onclick = async () => {
    await render();
    await exportDoctorProfileReport(doctor, currentResult, fromInput.value, toInput.value, 'png');
  };

  document.querySelector<HTMLButtonElement>('#doctorProfilePdf')!.onclick = async () => {
    await render();
    await exportDoctorProfileReport(doctor, currentResult, fromInput.value, toInput.value, 'pdf');
  };

  await render();
}

async function openLabPatientRegistrationModal() {
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;

  root.innerHTML = `
    <div class="modal-backdrop" id="labPatientRegisterBackdrop">
      <section class="modal form-modal lab-patient-register-modal">
        <div class="modal-head">
          <div class="patient-feature-title">
            <div class="patient-feature-title-icon labs">🧪</div>
            <div>
              <h2>تسجيل مريض تحاليل</h2>
              <p>تسجيل بيانات المريض فقط بدون كشف أو زيارة طبيب</p>
            </div>
          </div>
          <button class="modal-close" id="closeLabPatientRegister">×</button>
        </div>

        <form id="labPatientRegisterForm">
          <div class="section-title">بيانات المريض</div>

          <div class="patient-register-grid">
            <label class="field-name">الاسم بالكامل<input name="fullName" autocomplete="off"></label>
            <label class="field-phone">رقم التليفون<input class="ltr" name="phone" inputmode="tel" autocomplete="off"></label>
            <label class="field-age">السن<input name="age" type="number" min="0" max="130"></label>
            <label class="field-gender">النوع<select name="gender"><option value="">—</option><option>ذكر</option><option>أنثى</option></select></label>
            <label class="field-address">العنوان (اختياري)<input name="address" autocomplete="off"></label>
          </div>

          <div class="lab-patient-register-note">
            لن يتم إنشاء كشف أو زيارة للطبيب. بعد الحفظ سيفتح سجل التحاليل للمريض مباشرة.
          </div>

          <div class="form-actions">
            <button type="button" class="btn ghost" id="cancelLabPatientRegister">إلغاء</button>
            <button type="submit" class="btn primary">حفظ وفتح التحاليل</button>
          </div>
        </form>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';

  document.querySelector<HTMLButtonElement>('#closeLabPatientRegister')!.onclick = close;
  document.querySelector<HTMLButtonElement>('#cancelLabPatientRegister')!.onclick = close;
  document.querySelector<HTMLDivElement>('#labPatientRegisterBackdrop')!.onclick = e => {
    if (e.target === e.currentTarget) close();
  };

  document.querySelector<HTMLFormElement>('#labPatientRegisterForm')!.onsubmit = async e => {
    e.preventDefault();

    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const rawAge = String(fd.get('age') || '').trim();

    try {
      const result = await invoke<{id:string, existed:boolean}>('register_patient', {
        input: {
          fullName: String(fd.get('fullName') || '').trim(),
          phone: String(fd.get('phone') || '').trim(),
          age: rawAge ? Number(rawAge) : null,
          gender: String(fd.get('gender') || ''),
          address: String(fd.get('address') || '').trim()
        }
      });

      close();
      toast(result.existed
        ? 'المريض مسجل بالفعل — تم فتح سجل التحاليل'
        : 'تم إنشاء ملف المريض وفتح التحاليل بدون كشف');

      await renderScreen();
      await openPatientFeaturePanel(result.id, 'labs');
    } catch (err) {
      toast(`تعذر تسجيل المريض: ${String(err)}`, 'error');
    }
  };
}

async function openNursingPatientRegistrationModal() {
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;

  root.innerHTML = `
    <div class="modal-backdrop" id="nursingPatientRegisterBackdrop">
      <section class="modal form-modal nursing-patient-register-modal">
        <div class="modal-head">
          <div class="patient-feature-title">
            <div class="patient-feature-title-icon nursing">✚</div>
            <div>
              <h2>تسجيل مريض خدمة تمريض</h2>
              <p>تسجيل بيانات المريض فقط بدون كشف أو زيارة طبيب</p>
            </div>
          </div>
          <button class="modal-close" id="closeNursingPatientRegister">×</button>
        </div>

        <form id="nursingPatientRegisterForm">
          <div class="section-title">بيانات المريض</div>

          <div class="patient-register-grid">
            <label class="field-name">الاسم بالكامل<input name="fullName" autocomplete="off"></label>
            <label class="field-phone">رقم التليفون<input class="ltr" name="phone" inputmode="tel" autocomplete="off"></label>
            <label class="field-age">السن<input name="age" type="number" min="0" max="130"></label>
            <label class="field-gender">النوع<select name="gender"><option value="">—</option><option>ذكر</option><option>أنثى</option></select></label>
            <label class="field-address">العنوان (اختياري)<input name="address" autocomplete="off"></label>
          </div>

          <div class="lab-patient-register-note">
            لن يتم إنشاء كشف. بعد الحفظ سيفتح تسجيل خدمة التمريض مباشرة.
          </div>

          <div class="form-actions">
            <button type="button" class="btn ghost" id="cancelNursingPatientRegister">إلغاء</button>
            <button type="submit" class="btn primary">حفظ وفتح خدمة التمريض</button>
          </div>
        </form>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';

  document.querySelector<HTMLButtonElement>('#closeNursingPatientRegister')!.onclick = close;
  document.querySelector<HTMLButtonElement>('#cancelNursingPatientRegister')!.onclick = close;
  document.querySelector<HTMLDivElement>('#nursingPatientRegisterBackdrop')!.onclick = e => {
    if (e.target === e.currentTarget) close();
  };

  document.querySelector<HTMLFormElement>('#nursingPatientRegisterForm')!.onsubmit = async e => {
    e.preventDefault();

    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const rawAge = String(fd.get('age') || '').trim();

    try {
      const result = await invoke<{id:string, existed:boolean}>('register_patient', {
        input: {
          fullName: String(fd.get('fullName') || '').trim(),
          phone: String(fd.get('phone') || '').trim(),
          age: rawAge ? Number(rawAge) : null,
          gender: String(fd.get('gender') || ''),
          address: String(fd.get('address') || '').trim()
        }
      });

      close();
      toast(result.existed
        ? 'المريض مسجل بالفعل — تم فتح خدمة التمريض'
        : 'تم إنشاء ملف المريض وفتح خدمة التمريض');

      await renderScreen();
      await openPatientFeaturePanel(result.id, 'nursing');
    } catch (err) {
      toast(`تعذر تسجيل المريض: ${String(err)}`, 'error');
    }
  };
}

async function renderNursingServices() {
  const dayKey = businessDay();
  const rows = await invoke<NursingOrder[]>('list_nursing_orders', {
    query: { from: dayKey, to: dayKey }
  });

  shell(`
    <section class="card nursing-main-card">
      <div class="card-head toolbar">
        <div>
          <h2>خدمات التمريض</h2>
          <p>${displayDate(dayKey)} • تسجيل ومتابعة حالات خدمات التمريض</p>
        </div>
        <button class="btn primary small" id="registerNursingPatient">＋ تسجيل حالة تمريض</button>
      </div>

      <div class="nursing-main-summary">
        <div>
          <span>حالات اليوم</span>
          <strong>${rows.length}</strong>
        </div>
      </div>

      <div class="today-case-section-head nursing">
        <h3>حالات خدمات التمريض اليوم</h3>
        <span>${rows.length} حالة</span>
      </div>

      ${nursingOrderRowsHtml(rows, true)}
    </section>
  `, 'خدمات التمريض', 'تسجيل الخدمة والسعر يدويًا');

  document.querySelector<HTMLButtonElement>('#registerNursingPatient')!.onclick = () => {
    openNursingPatientRegistrationModal();
  };

  bindNursingOrderActions();
}

function renderLabPrices() {
  const priceRowsHtml = (rows: LabTestItem[]) => {
    if (!rows.length) {
      return `<div class="lab-prices-empty">لا يوجد تحليل مطابق للبحث</div>`;
    }

    return rows.map(item => `
      <div class="lab-price-row">
        <div class="lab-price-name">
          <strong class="ltr">${esc(item.name)}</strong>
          ${item.arabic ? `<small>${esc(item.arabic)}</small>` : ''}
        </div>
        <div class="lab-price-value ${item.price ? '' : 'missing'}">
          ${item.price ? `${esc(item.price)} ج.م` : 'غير محدد'}
        </div>
      </div>
    `).join('');
  };

  shell(`
    <section class="card lab-prices-card">
      <div class="card-head lab-prices-head">
        <div>
          <h2>أسعار التحاليل</h2>
          <p>قائمة أسعار التحاليل فقط</p>
        </div>

        <div class="lab-prices-head-actions">
          <button class="lab-patient-register-btn" id="registerLabPatient">
            <span class="lab-patient-register-icon">👤＋</span>
            <span>تسجيل مريض تحاليل</span>
          </button>
          <div class="lab-prices-count">${LAB_TESTS.length} تحليل</div>
        </div>
      </div>

      <div class="lab-prices-search">
        <span class="lab-prices-search-icon">⌕</span>
        <input
          id="mainLabPriceSearch"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="ابحث باسم التحليل بالعربي أو الإنجليزي..."
        >
        <button class="btn ghost small" id="clearMainLabPriceSearch">مسح</button>
      </div>

      <div class="lab-price-table-head">
        <span>اسم التحليل</span>
        <span>السعر</span>
      </div>

      <div class="lab-price-list" id="mainLabPriceList">
        ${priceRowsHtml(LAB_TESTS)}
      </div>
    </section>
  `, 'التحاليل', 'أسعار التحاليل');

  const input = document.querySelector<HTMLInputElement>('#mainLabPriceSearch')!;
  const list = document.querySelector<HTMLDivElement>('#mainLabPriceList')!;

  const renderRows = () => {
    list.innerHTML = priceRowsHtml(searchLabTests(input.value));
  };

  input.oninput = renderRows;

  document.querySelector<HTMLButtonElement>('#registerLabPatient')!.onclick = () => {
    openLabPatientRegistrationModal();
  };

  document.querySelector<HTMLButtonElement>('#clearMainLabPriceSearch')!.onclick = () => {
    input.value = '';
    renderRows();
    input.focus();
  };
}


async function renderLab2Lab() {
  const auth = await invoke<Lab2LabAuthStatus>('lab2lab_auth_status');

  if (!auth.pinSet) {
    shell(`
      <section class="card lab2lab-lock-card">
        <div class="lab2lab-lock-hero">
          <div class="lab2lab-lock-icon">L2L</div>
          <div>
            <h2>إنشاء الرقم السري لأسعار Lab 2 Lab</h2>
            <p>هذا القسم خاص بأسعار Lab 2 Lab فقط.</p>
          </div>
        </div>
        <form id="lab2labSetupForm" class="lab2lab-pin-form">
          <label>رقم سري جديد
            <input id="lab2labNewPin" class="ltr" inputmode="numeric" maxlength="8" autocomplete="new-password" type="password" placeholder="من 4 إلى 8 أرقام">
          </label>
          <label>تأكيد الرقم السري
            <input id="lab2labConfirmPin" class="ltr" inputmode="numeric" maxlength="8" autocomplete="new-password" type="password" placeholder="أعد كتابة الرقم السري">
          </label>
          <button class="btn primary" type="submit">حفظ وفتح Lab 2 Lab</button>
        </form>
      </section>
    `, 'أسعار Lab 2 Lab', 'قسم مستقل ومحمي برقم سري');

    document.querySelector<HTMLFormElement>('#lab2labSetupForm')!.onsubmit = async event => {
      event.preventDefault();
      const pin = document.querySelector<HTMLInputElement>('#lab2labNewPin')!.value.trim();
      const confirmPin = document.querySelector<HTMLInputElement>('#lab2labConfirmPin')!.value.trim();
      if (pin !== confirmPin) {
        toast('تأكيد الرقم السري غير مطابق', 'error');
        return;
      }
      try {
        await invoke('setup_lab2lab_pin', { input: { pin } });
        lab2labSessionPin = pin;
        toast('تم إنشاء الرقم السري');
        await renderScreen();
      } catch (err) {
        toast(String(err), 'error');
      }
    };
    return;
  }

  if (!lab2labSessionPin) {
    shell(`
      <section class="card lab2lab-lock-card">
        <div class="lab2lab-lock-hero">
          <div class="lab2lab-lock-icon">L2L</div>
          <div>
            <h2>أسعار Lab 2 Lab</h2>
            <p>أدخل الرقم السري لفتح قائمة الأسعار.</p>
          </div>
        </div>
        <form id="lab2labUnlockForm" class="lab2lab-pin-form compact">
          <label>الرقم السري
            <input id="lab2labPin" class="ltr" inputmode="numeric" maxlength="8" autocomplete="current-password" type="password" autofocus placeholder="••••">
          </label>
          <button class="btn primary" type="submit">فتح القائمة</button>
        </form>
      </section>
    `, 'أسعار Lab 2 Lab', 'القائمة محمية برقم سري');

    document.querySelector<HTMLFormElement>('#lab2labUnlockForm')!.onsubmit = async event => {
      event.preventDefault();
      const pin = document.querySelector<HTMLInputElement>('#lab2labPin')!.value.trim();
      try {
        const ok = await invoke<boolean>('verify_lab2lab_pin', { input: { pin } });
        if (!ok) {
          toast('الرقم السري غير صحيح', 'error');
          document.querySelector<HTMLInputElement>('#lab2labPin')!.select();
          return;
        }
        lab2labSessionPin = pin;
        await renderScreen();
      } catch (err) {
        toast(String(err), 'error');
      }
    };
    return;
  }

  let rows: Lab2LabPriceRow[] = [];
  try {
    await invoke('seed_lab2lab_prices', {
      input: { pin: lab2labSessionPin, items: LAB2LAB_SOURCE }
    });
    rows = await invoke<Lab2LabPriceRow[]>('list_lab2lab_prices', {
      input: { search: '', pin: lab2labSessionPin }
    });
  } catch (err) {
    lab2labSessionPin = '';
    toast(`تعذر فتح قائمة Lab 2 Lab: ${String(err)}`, 'error');
    await renderScreen();
    return;
  }

  shell(`
    <section class="card lab2lab-card">
      <div class="card-head lab2lab-head">
        <div class="lab2lab-title-wrap">
          <div class="lab2lab-badge">L2L</div>
          <div>
            <h2>أسعار Lab 2 Lab</h2>
            <p>${rows.length} تحليل • الأسعار من القائمة المرفوعة</p>
          </div>
        </div>
        <div class="lab2lab-head-actions">
          <button class="btn ghost small" id="changeLab2LabPin">تغيير الرقم السري</button>
          <button class="btn ghost small" id="lockLab2Lab">🔒 قفل</button>
        </div>
      </div>

      <div class="lab2lab-search-wrap">
        <label class="lab2lab-search-box">
          <span>⌕</span>
          <input id="lab2labSearch" type="search" autocomplete="off" spellcheck="false" placeholder="اكتب بالعربي أو الإنجليزي، أو اختر من القائمة...">
        </label>
        <div class="lab2lab-dropdown" id="lab2labDropdown"></div>
      </div>

      <div class="lab2lab-help">كل تحليل يظهر بالعربي والإنجليزي • البحث يعمل بالاسمين.</div>

      <section class="lab2lab-selected empty" id="lab2labSelected">
        <div class="lab2lab-selected-placeholder">
          <span class="lab2lab-selected-icon">L2L</span>
          <strong>ابحث عن تحليل واختره من القائمة</strong>
          <small>سيظهر السعر هنا مع أيقونة تعديل السعر.</small>
        </div>
      </section>
    </section>
  `, 'أسعار Lab 2 Lab', 'بحث وتعديل أسعار Lab 2 Lab');

  const searchInput = document.querySelector<HTMLInputElement>('#lab2labSearch')!;
  const dropdown = document.querySelector<HTMLDivElement>('#lab2labDropdown')!;
  const selectedHost = document.querySelector<HTMLElement>('#lab2labSelected')!;
  let selected: Lab2LabPriceRow | null = null;
  const arabicNameFor = (id: number) => LAB2LAB_ARABIC[id] || '';

  const norm = (value: string) => value.trim().toLocaleLowerCase();
  const matchingRows = () => {
    const q = norm(searchInput.value);
    if (!q) return rows;
    return rows.filter(row => norm(row.testName).includes(q) || norm(arabicNameFor(row.id)).includes(q));
  };

  const closeDropdown = () => {
    dropdown.innerHTML = '';
    dropdown.classList.remove('show');
  };

  const renderSelected = () => {
    if (!selected) return;
    selectedHost.classList.remove('empty');
    selectedHost.innerHTML = `
      <div class="lab2lab-selected-main">
        <span>اسم التحليل</span>
        <strong class="ltr">${esc(selected.testName)}</strong>
        <small dir="rtl" style="display:block;margin-top:6px;font-size:14px;color:#526b7a;font-weight:800">${esc(arabicNameFor(selected.id))}</small>
      </div>
      <div class="lab2lab-price-main">
        <span>سعر Lab 2 Lab</span>
        <strong class="ltr">${esc(selected.price)}</strong>
      </div>
      <button class="lab2lab-edit-btn" id="editLab2LabPrice" title="تعديل السعر" aria-label="تعديل السعر">✎</button>
    `;

    document.querySelector<HTMLButtonElement>('#editLab2LabPrice')!.onclick = () => {
      const root = document.querySelector<HTMLDivElement>('#modalRoot')!;
      root.innerHTML = `
        <div class="modal-backdrop" id="lab2labEditBackdrop">
          <section class="modal lab2lab-edit-modal">
            <div class="modal-head">
              <div><h2>تعديل سعر Lab 2 Lab</h2><p class="ltr">${esc(selected!.testName)}</p></div>
              <button class="modal-close" id="closeLab2LabEdit">×</button>
            </div>
            <form id="lab2labEditForm">
              <label>السعر
                <input id="lab2labPriceInput" class="ltr" value="${esc(selected!.price)}" maxlength="64" autocomplete="off">
              </label>
              <div class="form-actions">
                <button class="btn primary" type="submit">حفظ السعر</button>
                <button class="btn ghost" type="button" id="cancelLab2LabEdit">إلغاء</button>
              </div>
            </form>
          </section>
        </div>`;
      const close = () => root.innerHTML = '';
      document.querySelector<HTMLButtonElement>('#closeLab2LabEdit')!.onclick = close;
      document.querySelector<HTMLButtonElement>('#cancelLab2LabEdit')!.onclick = close;
      document.querySelector<HTMLDivElement>('#lab2labEditBackdrop')!.onclick = e => {
        if (e.target === e.currentTarget) close();
      };
      const priceInput = document.querySelector<HTMLInputElement>('#lab2labPriceInput')!;
      setTimeout(() => priceInput.select(), 0);
      document.querySelector<HTMLFormElement>('#lab2labEditForm')!.onsubmit = async event => {
        event.preventDefault();
        const price = priceInput.value.trim();
        try {
          const updated = await invoke<Lab2LabPriceRow>('update_lab2lab_price', {
            input: { id: selected!.id, price, pin: lab2labSessionPin }
          });
          rows = rows.map(row => row.id === updated.id ? updated : row);
          selected = updated;
          close();
          renderSelected();
          toast('تم تعديل سعر Lab 2 Lab');
        } catch (err) {
          toast(String(err), 'error');
        }
      };
    };
  };

  const chooseRow = (row: Lab2LabPriceRow) => {
    selected = row;
    searchInput.value = row.testName;
    closeDropdown();
    renderSelected();
  };

  const renderDropdown = () => {
    const matches = matchingRows();
    dropdown.innerHTML = matches.length ? matches.map(row => `
      <button type="button" class="lab2lab-option" data-lab2lab-id="${row.id}">
        <span class="ltr">${esc(row.testName)}</span>
        <strong class="ltr">${esc(row.price)}</strong>
      </button>
    `).join('') : '<div class="lab2lab-no-result">لا يوجد تحليل مطابق</div>';
    dropdown.classList.add('show');
    dropdown.querySelectorAll<HTMLButtonElement>('[data-lab2lab-id]').forEach(button => {
      button.onclick = () => {
        const row = rows.find(item => item.id === Number(button.dataset.lab2labId));
        if (row) chooseRow(row);
      };
    });
  };

  searchInput.oninput = renderDropdown;
  searchInput.onfocus = renderDropdown;
  searchInput.onclick = renderDropdown;
  searchInput.onblur = () => window.setTimeout(closeDropdown, 180);
  document.addEventListener('click', event => {
    if (!(event.target as HTMLElement).closest('.lab2lab-search-wrap')) closeDropdown();
  }, { once: true });

  document.querySelector<HTMLButtonElement>('#lockLab2Lab')!.onclick = async () => {
    lab2labSessionPin = '';
    await renderScreen();
  };

  document.querySelector<HTMLButtonElement>('#changeLab2LabPin')!.onclick = () => {
    const root = document.querySelector<HTMLDivElement>('#modalRoot')!;
    root.innerHTML = `
      <div class="modal-backdrop" id="lab2labChangePinBackdrop">
        <section class="modal lab2lab-edit-modal">
          <div class="modal-head">
            <div><h2>تغيير الرقم السري</h2><p>أدخل الرقم الجديد من 4 إلى 8 أرقام.</p></div>
            <button class="modal-close" id="closeLab2LabPin">×</button>
          </div>
          <form id="lab2labChangePinForm" class="lab2lab-pin-form">
            <label>الرقم السري الجديد
              <input id="lab2labChangeNew" class="ltr" inputmode="numeric" maxlength="8" type="password" autocomplete="new-password">
            </label>
            <label>تأكيد الرقم السري
              <input id="lab2labChangeConfirm" class="ltr" inputmode="numeric" maxlength="8" type="password" autocomplete="new-password">
            </label>
            <div class="form-actions">
              <button class="btn primary" type="submit">حفظ الرقم الجديد</button>
              <button class="btn ghost" type="button" id="cancelLab2LabPin">إلغاء</button>
            </div>
          </form>
        </section>
      </div>`;
    const close = () => root.innerHTML = '';
    document.querySelector<HTMLButtonElement>('#closeLab2LabPin')!.onclick = close;
    document.querySelector<HTMLButtonElement>('#cancelLab2LabPin')!.onclick = close;
    document.querySelector<HTMLDivElement>('#lab2labChangePinBackdrop')!.onclick = e => {
      if (e.target === e.currentTarget) close();
    };
    document.querySelector<HTMLFormElement>('#lab2labChangePinForm')!.onsubmit = async event => {
      event.preventDefault();
      const newPin = document.querySelector<HTMLInputElement>('#lab2labChangeNew')!.value.trim();
      const confirmPin = document.querySelector<HTMLInputElement>('#lab2labChangeConfirm')!.value.trim();
      if (newPin !== confirmPin) {
        toast('تأكيد الرقم السري غير مطابق', 'error');
        return;
      }
      try {
        await invoke('change_lab2lab_pin', { input: { currentPin: lab2labSessionPin, newPin } });
        lab2labSessionPin = newPin;
        close();
        toast('تم تغيير الرقم السري');
      } catch (err) {
        toast(String(err), 'error');
      }
    };
  };

  setTimeout(() => searchInput.focus(), 0);
}

async function renderDoctors() {
  const dayKey = businessDay();
  const todayReport = await invoke<ReportResult>('run_report', {
    query: { from: dayKey, to: dayKey, doctor: '' }
  });

  const todayByDoctor = new Map<string, { count: number; doctorAmount: number }>();
  for (const visit of todayReport.rows) {
    const name = (visit.doctor || '').trim();
    if (!name) continue;
    const item = todayByDoctor.get(name) || { count: 0, doctorAmount: 0 };
    item.count += 1;
    item.doctorAmount += moneyNumber(visit.doctorAmount);
    todayByDoctor.set(name, item);
  }

  shell(`
    <section class="card">
      <div class="card-head toolbar">
        <div>
          <h2>الأطباء</h2>
          <p>اضغط على أي دكتور لفتح ملفه والإحصائيات والحسابات</p>
        </div>
        <button class="btn primary small" id="addDoctorBtn">＋ إضافة طبيب</button>
      </div>

      <div class="doctor-icon-grid">
        ${doctors.length ? doctors.map(d => {
          const todayItem = todayByDoctor.get(d.name) || { count: 0, doctorAmount: 0 };
          return `
            <article class="doctor-icon-card ${d.active ? '' : 'inactive'}" data-doctor-open="${esc(d.id)}" role="button" tabindex="0">
              <div class="doctor-icon-visual">
                <span class="doctor-icon-symbol">⚕</span>
                <span class="doctor-icon-initials">${esc(doctorInitials(d.name))}</span>
              </div>

              <div class="doctor-icon-copy">
                <strong>${esc(d.name)}</strong>
                <span>${esc(d.specialty || 'بدون تخصص')}</span>
              </div>

              <div class="doctor-icon-today">
                <span>${todayItem.count} حالة اليوم</span>
                <b class="ltr">${todayItem.doctorAmount.toFixed(2)} ج.م للطبيب</b>
              </div>

              <div class="doctor-icon-actions">
                <button class="icon-action edit" data-doctor-edit="${esc(d.id)}" title="تعديل">✎</button>
                <button class="icon-action danger" data-doctor-delete="${esc(d.id)}" title="حذف">🗑</button>
                <button class="switch ${d.active ? 'on' : ''}" data-doctor-toggle="${esc(d.id)}" data-active="${d.active}">
                  ${d.active ? 'نشط' : 'غير نشط'}
                </button>
              </div>
            </article>`;
        }).join('') : `<div class="empty-block">لم يتم إضافة أطباء بعد</div>`}
      </div>
    </section>
  `, 'الأطباء', 'ملفات الأطباء وملخص الحالات والحسابات');

  document.querySelector<HTMLButtonElement>('#addDoctorBtn')!.onclick = () => openDoctorModal();

  document.querySelectorAll<HTMLElement>('[data-doctor-open]').forEach(card => {
    const doctor = doctors.find(d => d.id === card.dataset.doctorOpen);
    if (!doctor) return;

    const open = () => openDoctorProfile(doctor);
    card.onclick = event => {
      if ((event.target as HTMLElement).closest('button')) return;
      open();
    };
    card.onkeydown = event => {
      if ((event.key === 'Enter' || event.key === ' ') && !(event.target as HTMLElement).closest('button')) {
        event.preventDefault();
        open();
      }
    };
  });

  document.querySelectorAll<HTMLButtonElement>('[data-doctor-edit]').forEach(button => {
    const doctor = doctors.find(d => d.id === button.dataset.doctorEdit);
    if (!doctor) return;
    button.onclick = event => {
      event.stopPropagation();
      openDoctorModal(doctor);
    };
  });

  document.querySelectorAll<HTMLButtonElement>('[data-doctor-toggle]').forEach(button => {
    button.onclick = async event => {
      event.stopPropagation();
      const doctor = doctors.find(d => d.id === button.dataset.doctorToggle);
      if (!doctor) return;
      await invoke('save_doctor', {
        input: {
          id: doctor.id,
          name: doctor.name,
          specialty: doctor.specialty,
          active: !doctor.active
        }
      });
      await renderScreen();
    };
  });

  document.querySelectorAll<HTMLButtonElement>('[data-doctor-delete]').forEach(button => {
    button.onclick = async event => {
      event.stopPropagation();
      const doctor = doctors.find(d => d.id === button.dataset.doctorDelete);
      if (!doctor) return;
      if (!confirm(`حذف الطبيب ${doctor.name} من القائمة؟ الزيارات القديمة لن تُحذف.`)) return;
      await invoke('delete_doctor', { id: doctor.id });
      toast('تم حذف الطبيب');
      await renderScreen();
    };
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
        <div><h2>التقارير</h2><p>تقارير تشغيلية ومالية مع فلتر نوع الزيارة</p></div>
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
        <label>نوع الزيارة
          <select id="reportVisitType">
            <option value="">كل الأنواع</option>
            <option>كشف جديد</option>
            <option>استشارة</option>
          </select>
        </label>
        <label>مصدر الحجز
          <select id="reportBookingSource">
            <option value="">كل المصادر</option>
            <option>عادي</option>
            <option>فيزيتا</option>
            <option>اكشف</option>
            <option>كلينيدو</option>
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
  `, 'التقارير', 'متابعة الحالات والتحصيل لأي فترة');

  let currentBaseResult: ReportResult | null = null;
  let currentResult: ReportResult | null = null;

  const queryValues = () => ({
    from: document.querySelector<HTMLInputElement>('#reportFrom')!.value,
    to: document.querySelector<HTMLInputElement>('#reportTo')!.value,
    doctor: document.querySelector<HTMLSelectElement>('#reportDoctor')!.value,
    visitType: document.querySelector<HTMLSelectElement>('#reportVisitType')!.value,
    bookingSource: document.querySelector<HTMLSelectElement>('#reportBookingSource')!.value
  });

  const renderResult = () => {
    if (!currentBaseResult) return;
    const q = queryValues();
    const result = filteredReportResult(currentBaseResult, q.visitType, q.bookingSource);
    currentResult = result;
    const metrics = reportMetrics(result.rows);
    const doctorRows = doctorBreakdown(result.rows);

    document.querySelector<HTMLDivElement>('#reportResult')!.innerHTML = `
      <div class="report-stats report-stats-v48">
        <div><span>عدد الزيارات</span><strong>${metrics.totalVisits}</strong></div>
        <div><span>مرضى مختلفون</span><strong>${metrics.uniquePatients}</strong></div>
        <div><span>إجمالي الكشف</span><strong class="ltr">${metrics.revenue.toFixed(2)} ج.م</strong></div>
        <div><span>مبلغ العيادات</span><strong class="ltr">${metrics.clinicTotal.toFixed(2)} ج.م</strong></div>
        <div><span>مبلغ الأطباء</span><strong class="ltr">${metrics.doctorTotal.toFixed(2)} ج.م</strong></div>
        <div><span>كشف / استشارة</span><strong>${metrics.newVisits} / ${metrics.consultations}</strong></div>
      </div>

      <div class="report-doctor-breakdown">
        <h3>ملخص الأطباء</h3>
        <div class="doctor-day-grid">
          ${doctorRows.length ? doctorRows.map(([name, item]) => `
            <article class="doctor-day-card">
              <div>
                <strong>${esc(name)}</strong>
                <span>${item.count} حالة</span>
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
  document.querySelector<HTMLSelectElement>('#reportVisitType')!.onchange = renderResult;
  document.querySelector<HTMLSelectElement>('#reportBookingSource')!.onchange = renderResult;

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

  const backupHourOptions = Array.from({ length: 24 }, (_, hour) =>
    `<option value="${hour}" ${hour === appSettings.backupHour ? 'selected' : ''}>${String(hour).padStart(2, '0')}:00</option>`
  ).join('');

  shell(`
    <section class="settings-workspace">
      <div class="settings-hero">
        <div>
          <span class="settings-kicker">إعدادات التطبيق</span>
          <h2>إدارة بيانات العيادة وتشغيل النظام</h2>
          <p>كل الإعدادات الأساسية في مكان واحد، ومحفوظة محليًا داخل قاعدة بيانات البرنامج.</p>
        </div>
        <div class="settings-version-box">
          <span>الإصدار الحالي</span>
          <strong>V${esc(appSettings.version)}</strong>
          <small>Windows • Offline • SQLite</small>
        </div>
      </div>

      <form id="settingsForm" class="settings-sections">
        <section class="settings-section-card">
          <div class="settings-section-head">
            <div class="settings-section-icon identity">AK</div>
            <div><h3>بيانات العيادة</h3><p>تظهر في واجهة البرنامج والطباعة وملفات المرضى.</p></div>
          </div>
          <div class="settings-grid settings-grid-v67">
            <label>اسم العيادة<input name="clinicName" value="${esc(appSettings.clinicName)}" maxlength="120"></label>
            <label>الشعار النصي<input name="clinicSlogan" value="${esc(appSettings.clinicSlogan)}" maxlength="160"></label>
            <label>رقم واتساب<input class="ltr" name="whatsappNumber" value="${esc(appSettings.whatsappNumber)}" maxlength="32"></label>
            <label>رقم الهاتف<input class="ltr" name="phoneNumber" value="${esc(appSettings.phoneNumber)}" maxlength="32"></label>
            <label class="span2">عنوان العيادة<textarea name="clinicAddress" rows="2" maxlength="500">${esc(appSettings.clinicAddress)}</textarea></label>
          </div>
        </section>

        <section class="settings-section-card">
          <div class="settings-section-head">
            <div class="settings-section-icon operation">◷</div>
            <div><h3>التشغيل اليومي</h3><p>تحديد اليوم التشغيلي وموعد النسخة الاحتياطية التلقائية.</p></div>
          </div>
          <div class="settings-grid settings-grid-v67">
            <label>بداية اليوم التشغيلي
              <select name="operationalStartHour">${hourOptions}</select>
              <small>أي تسجيل قبل هذا الوقت يُحسب ضمن اليوم التشغيلي السابق.</small>
            </label>
            <label>موعد النسخة الاحتياطية اليومية
              <select name="backupHour">${backupHourOptions}</select>
              <small>يتم جدولة نسخة يومية على Windows مع Catch-up عند فتح الجهاز.</small>
            </label>
          </div>
          <div class="settings-operational-preview">
            <div><span>اليوم التشغيلي الحالي</span><strong>${displayDate(businessDay())}</strong></div>
            <div><span>يبدأ الساعة</span><strong class="ltr">${operationalStartLabel()}</strong></div>
            <div><span>النسخ التلقائي</span><strong class="ltr">${String(appSettings.backupHour).padStart(2, '0')}:00</strong></div>
          </div>
        </section>

        <section class="settings-section-card">
          <div class="settings-section-head">
            <div class="settings-section-icon storage">▣</div>
            <div><h3>البيانات والنسخ الاحتياطية</h3><p>المسارات محمية للقراءة فقط، مع أدوات النسخ والفحص.</p></div>
          </div>

          <div class="settings-path-list">
            <div class="settings-path-row">
              <div><span>مجلد النسخ الاحتياطية</span><code class="ltr">${esc(appSettings.backupPath)}</code></div>
              <button type="button" class="btn ghost small" id="openSettingsBackupFolder">فتح المجلد</button>
            </div>
            <div class="settings-path-row">
              <div><span>مجلد الملفات المصدّرة</span><code class="ltr">${esc(appSettings.exportPath)}</code></div>
              <button type="button" class="btn ghost small" id="openSettingsExportFolder">فتح المجلد</button>
            </div>
            <div class="settings-path-row">
              <div><span>قاعدة البيانات المحلية</span><code class="ltr">${esc(appSettings.databasePath)}</code></div>
              <span class="settings-lock-badge">محمي</span>
            </div>
          </div>

          <div class="settings-tool-grid">
            <button type="button" class="settings-tool-card backup" id="settingsBackupNow">
              <span class="tool-icon">⟳</span><span><strong>نسخة احتياطية الآن</strong><small>إنشاء نسخة فورية من قاعدة البيانات</small></span>
            </button>
            <button type="button" class="settings-tool-card health" id="healthCheckBtn">
              <span class="tool-icon">✓</span><span><strong>فحص سلامة النظام</strong><small>قاعدة البيانات والعلاقات والنسخ</small></span>
            </button>
            <button type="button" class="settings-tool-card backups" id="goBackupsFromSettings">
              <span class="tool-icon">▣</span><span><strong>إدارة النسخ</strong><small>فتح شاشة النسخ والاستعادة</small></span>
            </button>
          </div>

          <div id="healthResult" class="health-result settings-health-result"></div>
        </section>

        <section class="settings-section-card">
          <div class="settings-section-head">
            <div class="settings-section-icon about">i</div>
            <div><h3>معلومات النظام</h3><p>حالة التشغيل والحماية المحلية.</p></div>
          </div>
          <div class="settings-info-grid">
            <div><span>وضع التشغيل</span><strong>Offline بالكامل</strong></div>
            <div><span>قاعدة البيانات</span><strong>SQLite محلية</strong></div>
            <div><span>النسخ اليومية</span><strong>مفعلة</strong></div>
            <div><span>الإصدار</span><strong>V${esc(appSettings.version)}</strong></div>
          </div>
        </section>

        <div class="settings-save-bar">
          <div><strong>حفظ التغييرات</strong><small>سيتم تطبيق بيانات العيادة ومواعيد التشغيل فورًا.</small></div>
          <button type="submit" class="btn primary settings-save-btn">حفظ كل الإعدادات</button>
        </div>
      </form>
    </section>
  `, 'الإعدادات', 'بيانات العيادة والتشغيل والنسخ الاحتياطية وفحص النظام');

  document.querySelector<HTMLButtonElement>('#openSettingsBackupFolder')!.onclick = async () => {
    try { await invoke('open_backup_folder'); }
    catch (err) { toast(`تعذر فتح مجلد النسخ: ${String(err)}`, 'error'); }
  };

  document.querySelector<HTMLButtonElement>('#openSettingsExportFolder')!.onclick = async () => {
    try { await invoke('open_export_folder'); }
    catch (err) { toast(`تعذر فتح مجلد الملفات: ${String(err)}`, 'error'); }
  };

  const runSettingsHealthCheck = async () => {
    const box = document.querySelector<HTMLDivElement>('#healthResult')!;
    box.innerHTML = '<div class="health-running">جاري فحص قاعدة البيانات والنسخ الاحتياطية...</div>';
    try {
      const health = await invoke<HealthCheck>('health_check');
      const ok = health.integrityOk && health.foreignKeyIssues === 0 && health.backupWritable;
      box.innerHTML = `
        <div class="health-card ${ok ? 'ok' : 'warn'} settings-health-card">
          <div class="settings-health-title">
            <strong>${ok ? '✓ النظام سليم' : '⚠ يحتاج مراجعة'}</strong>
            <span>${ok ? 'تم اجتياز فحص سلامة البيانات' : 'راجع نتائج الفحص بالأسفل'}</span>
          </div>
          <div class="health-grid">
            <span>سلامة قاعدة البيانات <b>${health.integrityOk ? 'سليم' : esc(health.integrityMessage)}</b></span>
            <span>مشاكل العلاقات <b>${health.foreignKeyIssues}</b></span>
            <span>حجم قاعدة البيانات <b>${(health.databaseSize / 1024 / 1024).toFixed(2)} MB</b></span>
            <span>عدد النسخ الاحتياطية <b>${health.backupCount}</b></span>
            <span>مجلد النسخ قابل للكتابة <b>${health.backupWritable ? 'نعم' : 'لا'}</b></span>
          </div>
        </div>`;
    } catch (err) {
      box.innerHTML = `<div class="health-card warn"><strong>تعذر الفحص</strong><span>${esc(String(err))}</span></div>`;
    }
  };

  document.querySelector<HTMLButtonElement>('#settingsBackupNow')!.onclick = async () => {
    const button = document.querySelector<HTMLButtonElement>('#settingsBackupNow')!;
    button.disabled = true;
    try {
      await invoke('create_backup');
      toast('تم إنشاء نسخة احتياطية جديدة');
      await runSettingsHealthCheck();
    } catch (err) {
      toast(`تعذر إنشاء النسخة: ${String(err)}`, 'error');
    } finally {
      button.disabled = false;
    }
  };

  document.querySelector<HTMLButtonElement>('#goBackupsFromSettings')!.onclick = () => navigate('backups');
  document.querySelector<HTMLButtonElement>('#healthCheckBtn')!.onclick = runSettingsHealthCheck;

  document.querySelector<HTMLFormElement>('#settingsForm')!.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    try {
      const saved = await invoke<AppSettings>('save_settings', { input: {
        clinicName: String(fd.get('clinicName') || '').trim(),
        clinicSlogan: String(fd.get('clinicSlogan') || '').trim(),
        clinicAddress: String(fd.get('clinicAddress') || '').trim(),
        whatsappNumber: String(fd.get('whatsappNumber') || '').trim(),
        phoneNumber: String(fd.get('phoneNumber') || '').trim(),
        operationalStartHour: Number(fd.get('operationalStartHour') || 11),
        backupHour: Number(fd.get('backupHour') || 4)
      }});
      appSettings = saved;
      activeBusinessDay = businessDay();
      toast('تم حفظ كل إعدادات النظام');
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



function normalizeLabSearch(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function labSearchScore(item: LabTestItem, rawQuery: string) {
  const query = normalizeLabSearch(rawQuery);
  if (!query) return 0;

  const fields = [item.name, item.arabic, item.market]
    .map(value => normalizeLabSearch(value))
    .filter(Boolean);

  if (fields.some(field => field === query)) return 0;
  if (fields.some(field => field.startsWith(query))) return 1;
  if (fields.some(field => field.includes(query))) return 2;

  const compactQuery = query.replace(/\s+/g, '');
  if (compactQuery && fields.some(field => field.replace(/\s+/g, '').includes(compactQuery))) return 2;

  const tokens = query.split(' ').filter(Boolean);
  const combined = fields.join(' ');
  if (tokens.length && tokens.every(token => combined.includes(token))) return 3;

  return Number.POSITIVE_INFINITY;
}

function labPriceLabel(item: LabTestItem) {
  return item.price ? `${esc(item.price)} ج.م` : 'غير محدد';
}

function searchLabTests(rawQuery: string) {
  const query = normalizeLabSearch(rawQuery);
  if (!query) return LAB_TESTS;

  return LAB_TESTS
    .map(item => ({ item, score: labSearchScore(item, query) }))
    .filter(row => Number.isFinite(row.score))
    .sort((a, b) =>
      a.score - b.score ||
      a.item.name.localeCompare(b.item.name, 'en', { sensitivity: 'base' })
    )
    .map(row => row.item);
}

function labResultsHtml(rows: LabTestItem[], selectedCatalogIds = new Set<number>()) {
  if (!rows.length) {
    return `
      <div class="lab-search-empty">
        <span>⌕</span>
        <strong>مفيش تحليل مطابق للبحث</strong>
        <small>جرّب الاسم بالإنجليزي أو العربي أو الاسم الدارج.</small>
      </div>`;
  }

  return rows.map(item => {
    const selected = selectedCatalogIds.has(item.id);
    return `
      <article class="lab-result-card ${selected ? 'is-selected' : ''}">
        <div class="lab-result-copy">
          <strong class="ltr lab-result-en">${esc(item.name)}</strong>
          <span>${esc(item.arabic)}</span>
          <small>${esc(item.market)}</small>
        </div>
        <div class="lab-result-actions">
          <div class="lab-result-price ${item.price ? '' : 'missing'}">
            <span>السعر</span>
            <strong class="ltr">${labPriceLabel(item)}</strong>
          </div>
          <button
            class="btn ${selected ? 'ghost' : 'primary'} small lab-add-btn"
            data-add-lab="${item.id}"
            ${selected ? 'disabled' : ''}
          >${selected ? '✓ مضاف' : '＋ إضافة'}</button>
        </div>
      </article>`;
  }).join('');
}

function selectedPatientLabsHtml(rows: PatientLab[]) {
  const total = rows.reduce((sum, item) => sum + moneyNumber(item.price), 0);

  return `
    <div class="patient-labs-selected-head">
      <div>
        <strong>تحاليل العميل</strong>
        <span>${rows.length} تحليل</span>
      </div>
      <button class="btn primary small lab-add-another" type="button" data-add-another-lab>＋ إضافة تحليل آخر</button>
      <div class="patient-labs-total">
        <span>الإجمالي</span>
        <strong class="ltr">${total.toFixed(2)} ج.م</strong>
      </div>
    </div>
    <div class="lab-multi-hint">أضف كل التحاليل المطلوبة لنفس الحالة قبل الضغط على حفظ وإنهاء.</div>

    <div class="patient-labs-selected-list">
      ${rows.length ? rows.map(item => `
        <article class="patient-lab-selected-row">
          <div>
            <strong class="ltr">${esc(item.testName)}</strong>
            <small>محفوظ داخل ملف العميل</small>
          </div>
          <div class="patient-lab-selected-side">
            <b class="ltr">${item.price ? `${esc(item.price)} ج.م` : 'السعر غير محدد'}</b>
            <button class="icon-action danger" data-delete-patient-lab="${esc(item.id)}" title="حذف التحليل">🗑</button>
          </div>
        </article>
      `).join('') : `
        <div class="patient-labs-empty">
          لم تتم إضافة تحاليل لهذا العميل بعد.
        </div>
      `}
    </div>`;
}

async function openPatientFeaturePanel(
  patientId: string,
  kind: 'nursing' | 'labs'
) {
  const details = await invoke<PatientDetails>('get_patient_details', { id: patientId });
  const p = details.patient;
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;

  const isNursing = kind === 'nursing';

  if (!isNursing) {
    let [selectedLabs, labHistory] = await Promise.all([
      invoke<PatientLab[]>('list_patient_labs', { patientId }),
      invoke<LabOrder[]>('list_patient_lab_orders', { patientId })
    ]);

    root.innerHTML = `
      <div class="modal-backdrop" id="patientFeatureBackdrop">
        <section class="modal wide patient-feature-modal lab-catalog-modal">
          <div class="modal-head">
            <div class="patient-feature-title">
              <div class="patient-feature-title-icon labs">🧪</div>
              <div>
                <h2>تحاليل</h2>
                <p>${esc(p.fullName || 'بدون اسم')} • <span class="ltr">${esc(p.phone || 'بدون رقم')}</span></p>
              </div>
            </div>
            <button class="modal-close" id="closePatientFeature">×</button>
          </div>

          <div class="patient-context-links">
            <button class="btn ghost small" id="labCtxPatient">👤 ملف المريض</button>
            <button class="btn ghost small" id="labCtxVisit">＋ كشف / استشارة</button>
            <button class="btn ghost small" id="labCtxNursing">✚ خدمة تمريض</button>
            <button class="btn ghost small" id="labCtxToday">◷ حالات اليوم</button>
          </div>

          <section class="patient-labs-selected-panel">
            <div id="patientLabsSelected">
              ${selectedPatientLabsHtml(selectedLabs)}
            </div>
          </section>

          <section class="lab-payment-panel" id="labPaymentPanel">
            <div class="lab-payment-grid">
              <label>إجمالي التحاليل
                <div class="lab-payment-money ltr" id="labSubtotal">0.00 ج.م</div>
              </label>
              <label>الخصم
                <select id="labDiscountType">
                  <option value="none">بدون خصم</option>
                  <option value="percent">نسبة %</option>
                  <option value="amount">مبلغ</option>
                </select>
              </label>
              <label>قيمة الخصم
                <input id="labDiscountValue" type="number" min="0" step="0.01" value="0" disabled>
              </label>
              <label>الصافي
                <div class="lab-payment-money ltr" id="labNetTotal">0.00 ج.م</div>
              </label>
              <label>المدفوع يدويًا
                <input id="labPaidAmount" type="number" min="0" step="0.01" value="0">
              </label>
              <label>المتبقي
                <div class="lab-payment-money remaining ltr" id="labRemaining">0.00 ج.م</div>
              </label>
            </div>

            <div class="lab-finish-actions">
              <button class="btn primary" id="finishLabOrder">✓ حفظ حالة التحاليل وإنهاء</button>
              <button class="btn ghost" id="backToPatientProfile">← رجوع لملف المريض</button>
            </div>
          </section>

          <section class="lab-order-history">
            <div class="lab-order-history-head">
              <strong>سجل حالات التحاليل السابقة</strong>
              <span>${labHistory.length} حالة</span>
            </div>
            <div class="lab-order-history-list">
              ${labHistory.length ? labHistory.slice(0, 8).map(o => `
                <div class="lab-order-history-row">
                  <div><strong>${displayDate(o.orderDate)}</strong><span class="ltr">${esc(o.orderTime || '')}</span></div>
                  <span>${o.itemsCount} تحليل</span>
                  <b class="ltr">${moneyNumber(o.paidAmount).toFixed(2)} ج.م</b>
                  <button class="btn ghost small" data-open-lab-order="${esc(o.id)}">فتح</button>
                </div>
              `).join('') : '<div class="patient-labs-empty">لا توجد حالات تحاليل سابقة.</div>'}
            </div>
          </section>

          <div class="lab-search-shell">
            <div class="lab-search-row">
              <label class="lab-search-box">
                <span>⌕</span>
                <input
                  id="labSearchInput"
                  type="search"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="ابحث عن التحليل ثم اضغط إضافة..."
                >
              </label>
              <button class="btn ghost small" id="clearLabSearch">مسح البحث</button>
            </div>

            <div class="lab-search-hint">
              بعد إضافة أي تحليل، مربع البحث يفضى تلقائيًا وتقدر تبحث فورًا عن تحليل تاني وتضيفه، وهكذا.
            </div>

            <div class="lab-search-summary">
              <strong id="labResultCount">${LAB_TESTS.length} تحليل</strong>
              <span>بحث بالإنجليزي أو العربي أو الاسم الدارج • السعر من Price</span>
            </div>

            <div class="lab-results" id="labResults"></div>
          </div>

        </section>
      </div>`;

    const close = () => root.innerHTML = '';

    const labSearchShell = document.querySelector<HTMLElement>('.lab-search-shell')!;
    const paymentPanel = document.querySelector<HTMLElement>('#labPaymentPanel')!;
    if (labSearchShell && paymentPanel) paymentPanel.insertAdjacentElement('afterend', labSearchShell);

    const input = document.querySelector<HTMLInputElement>('#labSearchInput')!;
    const resultHost = document.querySelector<HTMLDivElement>('#labResults')!;
    const countHost = document.querySelector<HTMLElement>('#labResultCount')!;
    const selectedHost = document.querySelector<HTMLDivElement>('#patientLabsSelected')!;
    const discountType = document.querySelector<HTMLSelectElement>('#labDiscountType')!;
    const discountValue = document.querySelector<HTMLInputElement>('#labDiscountValue')!;
    const paidAmount = document.querySelector<HTMLInputElement>('#labPaidAmount')!;
    const subtotalHost = document.querySelector<HTMLElement>('#labSubtotal')!;
    const netHost = document.querySelector<HTMLElement>('#labNetTotal')!;
    const remainingHost = document.querySelector<HTMLElement>('#labRemaining')!;

    const selectedCatalogIds = () => new Set(selectedLabs.map(item => item.catalogId));

    const paymentPreview = () => {
      const subtotal = selectedLabs.reduce((sum, item) => sum + moneyNumber(item.price), 0);
      const rawDiscount = Math.max(0, moneyNumber(discountValue.value));
      const discountAmount = discountType.value === 'percent'
        ? subtotal * Math.min(rawDiscount, 100) / 100
        : discountType.value === 'amount'
          ? Math.min(rawDiscount, subtotal)
          : 0;
      const net = Math.max(0, subtotal - discountAmount);
      const paid = Math.max(0, moneyNumber(paidAmount.value));
      const remaining = Math.max(0, net - paid);

      subtotalHost.textContent = `${subtotal.toFixed(2)} ج.م`;
      netHost.textContent = `${net.toFixed(2)} ج.م`;
      remainingHost.textContent = `${remaining.toFixed(2)} ج.م`;
    };

    const bindDeleteButtons = () => {
      selectedHost.querySelectorAll<HTMLButtonElement>('[data-delete-patient-lab]').forEach(button => {
        button.onclick = async () => {
          const id = button.dataset.deletePatientLab;
          if (!id) return;
          try {
            await invoke('delete_patient_lab', { id });
            selectedLabs = selectedLabs.filter(item => item.id !== id);
            renderSelected();
            applySearch();
            toast('تم حذف التحليل');
            input.focus();
          } catch (err) {
            toast(`تعذر حذف التحليل: ${String(err)}`, 'error');
          }
        };
      });
    };

    const renderSelected = () => {
      selectedHost.innerHTML = selectedPatientLabsHtml(selectedLabs);
      bindDeleteButtons();
      selectedHost.querySelectorAll<HTMLButtonElement>('[data-add-another-lab]').forEach(button => {
        button.onclick = () => {
          labSearchShell.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setTimeout(() => input.focus(), 220);
        };
      });
      paymentPreview();
    };

    const bindAddButtons = () => {
      resultHost.querySelectorAll<HTMLButtonElement>('[data-add-lab]').forEach(button => {
        button.onclick = async () => {
          const catalogId = Number(button.dataset.addLab || '0');
          const item = LAB_TESTS.find(test => test.id === catalogId);
          if (!item) return;

          try {
            const added = await invoke<PatientLab>('add_patient_lab', {
              input: {
                patientId,
                catalogId: item.id,
                testName: item.name,
                price: item.price || ''
              }
            });

            selectedLabs = [added, ...selectedLabs.filter(row => row.catalogId !== added.catalogId)];
            renderSelected();

            input.value = '';
            applySearch();
            input.focus();
            toast(`تمت إضافة ${item.name}`);
          } catch (err) {
            const message = String(err);
            toast(message.includes('مضاف بالفعل') ? 'التحليل مضاف بالفعل للعميل' : `تعذر إضافة التحليل: ${message}`, 'error');
            input.focus();
          }
        };
      });
    };

    const applySearch = () => {
      const rows = searchLabTests(input.value);
      countHost.textContent = `${rows.length} تحليل`;
      resultHost.innerHTML = labResultsHtml(rows, selectedCatalogIds());
      bindAddButtons();
    };

    document.querySelector<HTMLButtonElement>('#closePatientFeature')!.onclick = close;
    document.querySelector<HTMLDivElement>('#patientFeatureBackdrop')!.onclick = e => {
      if (e.target === e.currentTarget) close();
    };
    discountType.onchange = () => {
      discountValue.disabled = discountType.value === 'none';
      if (discountType.value === 'none') discountValue.value = '0';
      paymentPreview();
    };
    discountValue.oninput = paymentPreview;
    paidAmount.oninput = paymentPreview;

    document.querySelector<HTMLButtonElement>('#finishLabOrder')!.onclick = async () => {
      if (!selectedLabs.length) {
        toast('أضف تحليل واحد على الأقل قبل حفظ الحالة', 'error');
        input.focus();
        return;
      }

      try {
        const details = await invoke<LabOrderDetails>('finalize_lab_order', {
          input: {
            patientId,
            discountType: discountType.value,
            discountValue: discountValue.value || '0',
            paidAmount: paidAmount.value || '0',
            orderDate: today(),
            orderTime: timeNow()
          }
        });

        selectedLabs = [];
        close();
        toast('تم حفظ حالة التحاليل وإضافتها إلى حالات اليوم');
        await renderScreen();
        await openLabOrderDetails(details.order.id);
      } catch (err) {
        toast(`تعذر حفظ حالة التحاليل: ${String(err)}`, 'error');
      }
    };

    bindLabOrderActions();

    document.querySelector<HTMLButtonElement>('#clearLabSearch')!.onclick = () => {
      input.value = '';
      applySearch();
      input.focus();
    };
    document.querySelector<HTMLButtonElement>('#backToPatientProfile')!.onclick = async () => {
      close();
      await openPatient(patientId);
    };
    document.querySelector<HTMLButtonElement>('#labCtxPatient')!.onclick = async () => {
      close(); await openPatient(patientId);
    };
    document.querySelector<HTMLButtonElement>('#labCtxVisit')!.onclick = () => {
      if (p.blacklisted && !confirm('هذا المريض موجود في Black List. هل تريد تسجيل زيارة رغم ذلك؟')) return;
      close(); openVisitModal(p);
    };
    document.querySelector<HTMLButtonElement>('#labCtxNursing')!.onclick = () => {
      close(); openPatientFeaturePanel(patientId, 'nursing');
    };
    document.querySelector<HTMLButtonElement>('#labCtxToday')!.onclick = async () => {
      close(); await navigate('today');
    };

    input.oninput = applySearch;
    renderSelected();
    applySearch();
    setTimeout(() => input.focus(), 0);
    return;
  }

const nursingHistory = await invoke<NursingOrder[]>('list_patient_nursing_orders', { patientId });

  root.innerHTML = `
    <div class="modal-backdrop" id="patientFeatureBackdrop">
      <section class="modal wide patient-feature-modal nursing-service-modal">
        <div class="modal-head">
          <div class="patient-feature-title">
            <div class="patient-feature-title-icon nursing">✚</div>
            <div>
              <h2>خدمات تمريض</h2>
              <p>${esc(p.fullName || 'بدون اسم')} • <span class="ltr">${esc(p.phone || 'بدون رقم')}</span></p>
            </div>
          </div>
          <button class="modal-close" id="closePatientFeature">×</button>
        </div>

        <div class="patient-context-links">
          <button class="btn ghost small" id="nursingCtxPatient">👤 ملف المريض</button>
          <button class="btn ghost small" id="nursingCtxVisit">＋ كشف / استشارة</button>
          <button class="btn ghost small" id="nursingCtxLabs">🧪 تحاليل</button>
          <button class="btn ghost small" id="nursingCtxToday">◷ حالات اليوم</button>
        </div>

        <form id="nursingServiceForm">
          <div class="nursing-service-entry-grid">
            <label class="span2">نوع الخدمة
              <input
                id="nursingServiceName"
                name="serviceName"
                autocomplete="off"
                placeholder="اكتب نوع الخدمة يدويًا..."
              >
            </label>

            <label>السعر
              <input
                id="nursingServicePrice"
                name="price"
                class="ltr"
                type="number"
                min="0"
                step="0.01"
                placeholder="يكتب يدويًا"
              >
            </label>

            <label>التاريخ
              <input name="orderDate" type="date" value="${today()}">
            </label>

            <label>الوقت
              <input name="orderTime" type="time" value="${timeNow()}">
            </label>
          </div>

          <div class="nursing-service-note">
            نوع الخدمة والسعر يتم إدخالهم يدويًا لكل حالة.
          </div>

          <div class="form-actions nursing-finish-actions">
            <button class="btn primary" type="submit">✓ حفظ خدمة التمريض وإنهاء</button>
            <button class="btn ghost" type="button" id="backToPatientProfile">← رجوع لملف المريض</button>
          </div>
        </form>

        <section class="nursing-history-section">
          <div class="lab-order-history-head">
            <strong>سجل خدمات التمريض السابقة</strong>
            <span>${nursingHistory.length} حالة</span>
          </div>

          <div class="nursing-history-list">
            ${nursingHistory.length ? nursingHistory.slice(0, 12).map(order => `
              <div class="nursing-history-row">
                <div>
                  <strong>${esc(order.serviceName)}</strong>
                  <span>${displayDate(order.orderDate)} • <span class="ltr">${esc(order.orderTime || '')}</span></span>
                </div>
                <b class="ltr">${moneyNumber(order.price).toFixed(2)} ج.م</b>
                <button class="btn ghost small" type="button" data-open-nursing-order="${esc(order.id)}">فتح</button>
              </div>
            `).join('') : '<div class="patient-labs-empty">لا توجد خدمات تمريض سابقة لهذا المريض.</div>'}
          </div>
        </section>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';

  document.querySelector<HTMLButtonElement>('#closePatientFeature')!.onclick = close;
  document.querySelector<HTMLDivElement>('#patientFeatureBackdrop')!.onclick = e => {
    if (e.target === e.currentTarget) close();
  };
  document.querySelector<HTMLButtonElement>('#backToPatientProfile')!.onclick = async () => {
    close();
    await openPatient(patientId);
  };
  document.querySelector<HTMLButtonElement>('#nursingCtxPatient')!.onclick = async () => {
    close(); await openPatient(patientId);
  };
  document.querySelector<HTMLButtonElement>('#nursingCtxVisit')!.onclick = () => {
    if (p.blacklisted && !confirm('هذا المريض موجود في Black List. هل تريد تسجيل زيارة رغم ذلك؟')) return;
    close(); openVisitModal(p);
  };
  document.querySelector<HTMLButtonElement>('#nursingCtxLabs')!.onclick = () => {
    close(); openPatientFeaturePanel(patientId, 'labs');
  };
  document.querySelector<HTMLButtonElement>('#nursingCtxToday')!.onclick = async () => {
    close(); await navigate('today');
  };

  document.querySelector<HTMLFormElement>('#nursingServiceForm')!.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);

    try {
      const order = await invoke<NursingOrder>('add_nursing_order', {
        input: {
          patientId,
          serviceName: String(fd.get('serviceName') || '').trim(),
          price: String(fd.get('price') || '').trim(),
          orderDate: String(fd.get('orderDate') || ''),
          orderTime: String(fd.get('orderTime') || '')
        }
      });

      close();
      toast('تم حفظ خدمة التمريض وإضافتها إلى حالات اليوم');
      await renderScreen();
      await openNursingOrderDetails(order.id);
    } catch (err) {
      toast(`تعذر حفظ خدمة التمريض: ${String(err)}`, 'error');
    }
  };

  bindNursingOrderActions();
}

async function openPatient(id: string) {
  const patientFile = await loadPatientFile(id);
  const details = patientFile.details;
  const p = details.patient;
  const totalActivities =
    details.visits.length +
    patientFile.labOrders.length +
    patientFile.nursingOrders.length +
    patientFile.radiologyOrders.length;

  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;

  root.innerHTML = `
    <div class="modal-backdrop patient-profile-backdrop" id="patientModalBackdrop" data-patient-id="${esc(p.id)}">
      <section class="modal wide patient-profile-modal patient-full-file-modal">
        <div class="modal-head patient-profile-head">
          <div class="patient-profile-identity">
            <div class="patient-profile-avatar">${esc((p.fullName || 'م').trim().charAt(0) || 'م')}</div>
            <div>
              <div class="patient-profile-name-row">
                <h2>${esc(p.fullName || "بدون اسم")}</h2>
                ${p.blacklisted ? '<span class="blacklist-badge">Black List</span>' : ''}
                ${p.archived ? '<span class="patient-file-archive-badge">مؤرشف</span>' : ''}
              </div>
              <p class="ltr patient-phone">📞 ${esc(p.phone || "بدون رقم تليفون")}</p>
            </div>
          </div>
          <button class="modal-close" id="closePatient">×</button>
        </div>

        ${patientFileClinicHeaderHtml(p)}

        <div class="patient-file-overview-clean">
          <div class="patient-overview-info-clean">
            <div><span>السن</span><strong>${p.age ?? '—'}</strong></div>
            <div><span>النوع</span><strong>${esc(p.gender || '—')}</strong></div>
            <div class="wide"><span>عنوان المريض</span><strong>${esc(p.address || '—')}</strong></div>
            <div><span>إنشاء الملف</span><strong>${esc(displaySavedDateTime(p.createdAt))}</strong></div>
            <div><span>آخر تحديث</span><strong>${esc(displaySavedDateTime(p.updatedAt))}</strong></div>
            <div class="activity"><span>إجمالي الأنشطة</span><strong>${totalActivities}</strong></div>
          </div>
        </div>

        <div class="patient-clean-section-head">
          <h3>الخدمات</h3>
          <small>اختار الخدمة المطلوبة</small>
        </div>

        <div class="patient-service-grid-clean">
          <button class="patient-service-clean visit" id="addVisitToPatient">
            <span class="patient-service-clean-icon">🩺</span>
            <span class="patient-service-clean-copy"><strong>كشف / استشارة</strong></span>
            <span class="patient-service-clean-count">${details.visits.length}</span>
          </button>

          <button class="patient-service-clean labs" id="patientLabTests">
            <span class="patient-service-clean-icon">🧪</span>
            <span class="patient-service-clean-copy"><strong>تحاليل</strong></span>
            <span class="patient-service-clean-count">${patientFile.labOrders.length}</span>
          </button>

          <button class="patient-service-clean nursing" id="patientNursingServices">
            <span class="patient-service-clean-icon">✚</span>
            <span class="patient-service-clean-copy"><strong>تمريض</strong></span>
            <span class="patient-service-clean-count">${patientFile.nursingOrders.length}</span>
          </button>

          <button class="patient-service-clean radiology" id="patientRadiologyServices">
            <span class="patient-service-clean-icon">🩻</span>
            <span class="patient-service-clean-copy"><strong>أشعة</strong></span>
            <span class="patient-service-clean-count">${patientFile.radiologyOrders.length}</span>
          </button>

          <button class="patient-service-clean attachments" id="patientAttachments">
            <span class="patient-service-clean-icon">📎</span>
            <span class="patient-service-clean-copy"><strong>المرفقات</strong></span>
            <span class="patient-service-clean-count">فتح</span>
          </button>
        </div>

        <div class="patient-file-primary-actions-clean">
          <button class="btn ghost small" id="editPatientFromDetails">✎ تعديل البيانات</button>
          <button class="btn primary small" id="patientExportPdf">PDF الملف الكامل</button>
          <button class="btn ghost small" id="patientExportImage">صورة الملف</button>

          <details class="patient-file-more-actions-clean">
            <summary>إدارة الملف ⋯</summary>
            <div class="patient-file-more-menu-clean">
              <button class="btn ${p.blacklisted ? 'ghost' : 'danger-outline'} small" id="toggleBlacklist">
                ${p.blacklisted ? 'إزالة Black List' : '⛔ Black List'}
              </button>
              ${p.archived
                ? '<button class="btn ghost small archive-action" id="archivePatientFromDetails">↶ استعادة</button>'
                : '<button class="btn ghost small archive-action" id="archivePatientFromDetails">▣ أرشفة</button>'
              }
              <button class="btn ghost small patient-nav-action" id="patientGoToday">◷ حالات اليوم</button>
              <button class="btn ghost small patient-nav-action" id="patientGoReports">▤ التقارير</button>
              <button class="btn danger-outline small" id="deletePatient">🗑 حذف المريض نهائيًا</button>
            </div>
          </details>
        </div>

        <div class="patient-full-record-head">
          <div>
            <h3>السجل الكامل للمريض</h3>
            <small>كل كشف أو استشارة أو تحليل أو خدمة تمريض أو أشعة محفوظة بتاريخ وتوقيت الحفظ</small>
          </div>
          <span>${totalActivities + 1} سجل شامل إنشاء الملف</span>
        </div>

        <div class="patient-full-record-wrap">
          ${patientFileTimelineHtml(patientFile, true)}
        </div>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';

  document.querySelector<HTMLButtonElement>('#closePatient')!.onclick = close;
  document.querySelector<HTMLDivElement>('#patientModalBackdrop')!.onclick = e => {
    if (e.target === e.currentTarget) close();
  };

  document.querySelector<HTMLButtonElement>('#patientNursingServices')!.onclick = () => {
    close();
    openPatientFeaturePanel(id, 'nursing');
  };

  document.querySelector<HTMLButtonElement>('#patientRadiologyServices')!.onclick = () => {
    close();
    openPatientRadiologyPanel(id);
  };
  document.querySelector<HTMLButtonElement>('#patientAttachments')!.onclick = () => {
    close();
    openPatientAttachments(id);
  };

  document.querySelector<HTMLButtonElement>('#patientLabTests')!.onclick = () => {
    close();
    openPatientFeaturePanel(id, 'labs');
  };

  document.querySelector<HTMLButtonElement>('#patientExportImage')!.onclick = () =>
    exportPatientFile(patientFile, 'png');

  document.querySelector<HTMLButtonElement>('#patientExportPdf')!.onclick = () =>
    exportPatientFile(patientFile, 'pdf');

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

  document.querySelector<HTMLButtonElement>('#archivePatientFromDetails')!.onclick = async () => {
    await invoke('set_patient_archived', { input: { id, archived: !p.archived } });
    close();
    toast(p.archived ? 'تمت استعادة ملف المريض' : 'تم نقل ملف المريض إلى الأرشيف');
    await renderScreen();
  };

  document.querySelector<HTMLButtonElement>('#patientGoToday')!.onclick = async () => {
    close();
    await navigate('today');
  };

  document.querySelector<HTMLButtonElement>('#patientGoReports')!.onclick = async () => {
    close();
    await navigate('reports');
  };

  document.querySelector<HTMLButtonElement>('#deletePatient')!.onclick = async () => {
    if (!confirm(`حذف ملف ${p.fullName || 'المريض'} نهائيًا بكل بياناته وسجله؟`)) return;
    if (!confirm('تأكيد أخير: سيتم حذف الكشوفات والاستشارات والتحاليل وخدمات التمريض والأشعة الخاصة بالمريض.')) return;
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

  document.querySelectorAll<HTMLButtonElement>('[data-patient-file-kind][data-patient-file-id]').forEach(button => {
    button.onclick = async () => {
      const kind = button.dataset.patientFileKind || '';
      const itemId = button.dataset.patientFileId || '';
      if (!itemId) return;
      close();

      if (kind === 'visit') {
        await openEditVisitModal(itemId);
      } else if (kind === 'lab') {
        await openLabOrderDetails(itemId);
      } else if (kind === 'nursing') {
        await openNursingOrderDetails(itemId);
      } else if (kind === 'radiology') {
        await openRadiologyOrderDetails(itemId);
      }
    };
  });
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
          <div>
            <h2>إنشاء ملف مريض</h2>
            <p>يتم إنشاء ملف دائم للمريض أولًا، وبعدها يمكن إضافة كشف أو استشارة أو تحاليل أو تمريض أو أشعة في أي وقت</p>
          </div>
          <button class="modal-close" id="closeCase">×</button>
        </div>

        <form id="patientRegisterForm">
          <div class="section-title">بيانات المريض</div>

          <div class="patient-register-grid">
            <label class="field-name">الاسم بالكامل<input name="fullName"></label>
            <label class="field-phone">رقم التليفون<input class="ltr" name="phone" inputmode="tel"></label>
            <label class="field-age">السن<input name="age" type="number" min="0" max="130"></label>
            <label class="field-gender">النوع
              <select name="gender">
                <option value="">—</option>
                <option>ذكر</option>
                <option>أنثى</option>
              </select>
            </label>
            <label class="field-address">العنوان (اختياري)<input name="address"></label>
          </div>

          <div class="patient-file-create-note">
            بمجرد الحفظ يتم إنشاء رقم ملف وتسجيل تاريخ ووقت إنشاء الملف تلقائيًا.
          </div>

          <div class="form-actions">
            <button type="button" class="btn ghost" id="cancelCase">إلغاء</button>
            <button type="button" class="btn ghost" id="savePatientFileOnly">💾 حفظ ملف المريض فقط</button>
            <button type="submit" class="btn primary">💾 حفظ الملف + إضافة كشف / استشارة</button>
          </div>
        </form>
      </section>
    </div>`;

  const close = () => root.innerHTML = '';
  const form = document.querySelector<HTMLFormElement>('#patientRegisterForm')!;

  document.querySelector<HTMLButtonElement>('#closeCase')!.onclick = close;
  document.querySelector<HTMLButtonElement>('#cancelCase')!.onclick = close;

  const registerFromForm = async () => {
    const fd = new FormData(form);
    const rawAge = String(fd.get('age') || '').trim();

    return invoke<{id:string, existed:boolean}>('register_patient', {
      input: {
        fullName: String(fd.get('fullName') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        age: rawAge ? Number(rawAge) : null,
        gender: String(fd.get('gender') || ''),
        address: String(fd.get('address') || '').trim()
      }
    });
  };

  document.querySelector<HTMLButtonElement>('#savePatientFileOnly')!.onclick = async () => {
    try {
      const result = await registerFromForm();
      close();
      toast(result.existed
        ? 'ملف المريض موجود بالفعل — تم فتح الملف'
        : 'تم إنشاء ملف المريض وتسجيل تاريخ ووقت الحفظ تلقائيًا');
      await renderScreen();
      await openPatient(result.id);
    } catch (err) {
      toast(`تعذر حفظ ملف المريض: ${String(err)}`, 'error');
    }
  };

  form.onsubmit = async e => {
    e.preventDefault();

    try {
      const result = await registerFromForm();
      const details = await invoke<PatientDetails>('get_patient_details', { id: result.id });

      close();
      toast(result.existed
        ? 'تم فتح ملف المريض الموجود — أكمل تسجيل الكشف أو الاستشارة'
        : 'تم إنشاء ملف المريض — أكمل تسجيل الكشف أو الاستشارة');

      await renderScreen();
      await openVisitModal(details.patient);
    } catch (err) {
      toast(`تعذر حفظ ملف المريض: ${String(err)}`, 'error');
    }
  };
}

async function openVisitModal(patient: Patient) {
  const root = document.querySelector<HTMLDivElement>('#modalRoot')!;
  root.innerHTML = `
    <div class="modal-backdrop" data-back-patient-id="${esc(patient.id)}">
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
            <label>مبلغ العيادات
              <input class="ltr" name="clinicAmount" type="number" min="0" step="0.01" placeholder="يكتب يدويًا">
            </label>
            <label>مبلغ الطبيب
              <input class="ltr" name="doctorAmount" type="number" min="0" step="0.01" placeholder="يكتب يدويًا">
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
        clinicAmount: String(fd.get('clinicAmount')||'').trim(),
        doctorAmount: String(fd.get('doctorAmount')||'').trim(),
        status: 'حضر',
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
            <label>مبلغ العيادات
              <input class="ltr" name="clinicAmount" type="number" min="0" step="0.01" value="${esc(visit.clinicAmount || '')}">
            </label>
            <label>مبلغ الطبيب
              <input class="ltr" name="doctorAmount" type="number" min="0" step="0.01" value="${esc(visit.doctorAmount || '')}">
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
        clinicAmount: String(fd.get('clinicAmount') || '').trim(),
        doctorAmount: String(fd.get('doctorAmount') || '').trim(),
        status: visit.status || 'حضر',
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
    <div class="modal-backdrop" data-back-patient-id="${esc(id)}"><section class="modal">
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

startV7App().catch(e => {
  app.innerHTML = `<div class="fatal"><h2>تعذر تشغيل النظام</h2><p>${esc(String(e))}</p></div>`;
});
