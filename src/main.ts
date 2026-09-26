import './style.css';

type CaseRow = {
  id: string;
  name: string;
  phone: string;
  doctor: string;
  specialty: string;
  date: string;
  complaint: string;
  archived: boolean;
};

const KEY = 'clinic-cases-v1';
let rows: CaseRow[] = JSON.parse(localStorage.getItem(KEY) || '[]');

const app = document.querySelector<HTMLDivElement>('#app')!;

function save() {
  localStorage.setItem(KEY, JSON.stringify(rows));
}

function esc(v: string) {
  return v.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]!));
}

function render() {
  const active = rows.filter(r => !r.archived);
  app.innerHTML = `
    <div class="layout">
      <aside>
        <h2>Clinic Cases</h2>
        <nav>
          <button class="nav active">الرئيسية</button>
          <button class="nav">الحالات</button>
          <button class="nav" id="newCaseBtn">تسجيل حالة</button>
        </nav>
      </aside>

      <main>
        <header>
          <div>
            <h1>نظام تسجيل حالات العيادة</h1>
            <p>نسخة V1 — تعمل على الكمبيوتر وأندرويد</p>
          </div>
          <button class="primary" id="newCaseTop">+ تسجيل حالة جديدة</button>
        </header>

        <section class="stats">
          <article><span>إجمالي الحالات</span><strong>${active.length}</strong></article>
          <article><span>حالات اليوم</span><strong>${active.filter(r => r.date === new Date().toISOString().slice(0,10)).length}</strong></article>
        </section>

        <section class="panel">
          <input id="search" class="search" placeholder="بحث بالاسم أو رقم الهاتف..." />
          <div id="list"></div>
        </section>
      </main>
    </div>

    <dialog id="caseDialog">
      <form method="dialog" id="caseForm">
        <h2>تسجيل حالة جديدة</h2>
        <label>الاسم بالكامل<input name="name" required /></label>
        <label>رقم الهاتف<input name="phone" inputmode="tel" required /></label>
        <label>الطبيب<input name="doctor" required /></label>
        <label>التخصص<input name="specialty" required /></label>
        <label>تاريخ الزيارة<input name="date" type="date" required /></label>
        <label>الشكوى<textarea name="complaint" rows="3"></textarea></label>
        <div class="actions">
          <button value="cancel">إلغاء</button>
          <button class="primary" id="saveCase" value="default">حفظ الحالة</button>
        </div>
      </form>
    </dialog>
  `;

  const list = document.querySelector<HTMLDivElement>('#list')!;
  const search = document.querySelector<HTMLInputElement>('#search')!;

  function drawList(term = '') {
    const q = term.trim().toLowerCase();
    const data = active.filter(r => !q || r.name.toLowerCase().includes(q) || r.phone.includes(q));
    list.innerHTML = data.length ? data.map(r => `
      <article class="row">
        <div><strong>${esc(r.name)}</strong><small>${esc(r.phone)}</small></div>
        <div><span>${esc(r.doctor)}</span><small>${esc(r.specialty)}</small></div>
        <div><span>${esc(r.date)}</span></div>
        <button data-archive="${r.id}" class="danger">أرشفة</button>
      </article>
    `).join('') : `<div class="empty">لا توجد حالات مسجلة</div>`;

    document.querySelectorAll<HTMLButtonElement>('[data-archive]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.archive!;
        rows = rows.map(r => r.id === id ? {...r, archived: true} : r);
        save();
        render();
      };
    });
  }

  drawList();
  search.oninput = () => drawList(search.value);

  const dialog = document.querySelector<HTMLDialogElement>('#caseDialog')!;
  const open = () => dialog.showModal();
  document.querySelector<HTMLButtonElement>('#newCaseTop')!.onclick = open;
  document.querySelector<HTMLButtonElement>('#newCaseBtn')!.onclick = open;

  const form = document.querySelector<HTMLFormElement>('#caseForm')!;
  const dateInput = form.elements.namedItem('date') as HTMLInputElement;
  dateInput.value = new Date().toISOString().slice(0,10);

  form.addEventListener('submit', (e) => {
    const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.value === 'cancel') return;

    e.preventDefault();
    const fd = new FormData(form);
    const phone = String(fd.get('phone') || '').trim();
    if (rows.some(r => !r.archived && r.phone === phone)) {
      alert('يوجد ملف مسجل بهذا الرقم');
      return;
    }

    rows.unshift({
      id: crypto.randomUUID(),
      name: String(fd.get('name') || '').trim(),
      phone,
      doctor: String(fd.get('doctor') || '').trim(),
      specialty: String(fd.get('specialty') || '').trim(),
      date: String(fd.get('date') || ''),
      complaint: String(fd.get('complaint') || '').trim(),
      archived: false
    });
    save();
    dialog.close();
    render();
  });
}

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
