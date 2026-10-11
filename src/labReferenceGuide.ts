import { LAB_TESTS } from './labCatalog';

type Guide = { purpose: string; organ: string; specimen: string; tube: string; timing: string; turnaround: string; caution: string };
const defaults: Guide = {
  purpose: 'راجع المرجع الطبي المعتمد لتحديد الغرض الدقيق من هذا الفحص.',
  organ: 'يتحدد حسب نوع الفحص والحالة الطبية.',
  specimen: 'غير مؤكد: راجع دليل جمع العينات بالمختبر.',
  tube: 'غير مؤكد: لا تختَر أنبوبة بالاعتماد على التخمين.',
  timing: 'تُحدد متطلبات الصيام والموعد وفق بروتوكول المختبر.',
  turnaround: 'يُحدد وقت النتيجة حسب جهاز المختبر أو المعمل المرجعي.',
  caution: 'لا تُستخدم هذه البيانات بديلًا عن تعليمات المختبر المعتمدة.'
};
const standard: Record<string, Partial<Guide>> = {
  'CBC': { purpose:'عدّ خلايا الدم والصفائح والمساعدة في تقييم الأنيميا والعدوى.', organ:'الدم ونخاع العظام',specimen:'دم كامل',tube:'بنفسجي — EDTA',timing:'عادةً بدون صيام.',turnaround:'غالبًا في نفس اليوم.',caution:'يجب تجنب تجلط العينة والالتزام بخلط الأنبوبة بالطريقة الصحيحة.' },
  'TSH': {purpose:'تقييم نشاط الغدة الدرقية بواسطة الهرمون المنبه لها.',organ:'الغدة الدرقية',specimen:'مصل الدم',tube:'ذهبي SST أو أحمر حسب منصة المختبر',timing:'لا يحتاج صيامًا عادةً؛ أخبر المختبر عن البيوتين وأدوية الغدة.',turnaround:'غالبًا خلال يوم عمل.',caution:'البيوتين قد يتداخل مع بعض منصات التحليل.'},
  'ALT': {purpose:'إنزيم يُستخدم للمساعدة في تقييم إصابة خلايا الكبد.',organ:'الكبد',specimen:'مصل الدم',tube:'ذهبي SST أو أحمر',timing:'الصيام غالبًا غير مطلوب للفحص منفردًا.',turnaround:'غالبًا في نفس اليوم.',caution:'التفسير مع التاريخ المرضي وباقي وظائف الكبد.'},
  'AST': {purpose:'إنزيم قد يرتفع مع إصابة الكبد أو العضلات.',organ:'الكبد والعضلات',specimen:'مصل الدم',tube:'ذهبي SST أو أحمر',timing:'حسب الفحوص المصاحبة.',turnaround:'غالبًا في نفس اليوم.',caution:'غير نوعي للكبد وحده.'},
  'Creatinine': {purpose:'تقييم وظائف الكلى والمساعدة في حساب eGFR.',organ:'الكلى',specimen:'مصل الدم',tube:'ذهبي SST أو أحمر',timing:'حسب الفحوص المصاحبة وتعليمات المختبر.',turnaround:'غالبًا في نفس اليوم.',caution:'قد تؤثر الكتلة العضلية والأدوية في تفسير النتيجة.'},
  'Blood Glucose Fasting': {purpose:'قياس سكر الدم الصائم.',organ:'السكر والتمثيل الغذائي',specimen:'بلازما أو مصل حسب نظام المعمل',tube:'رمادي فلورايد أو أنبوبة مع فصل سريع وفق البروتوكول',timing:'صيام 8 ساعات على الأقل حسب الطبيب.',turnaround:'غالبًا في نفس اليوم.',caution:'تختلف معالجة العينة ووقت فصل البلازما.'},
  'HbA1c': {purpose:'تقدير متوسط سكر الدم خلال قرابة شهرين إلى ثلاثة أشهر.',organ:'السكر',specimen:'دم كامل',tube:'بنفسجي — EDTA',timing:'لا يحتاج صيامًا عادةً.',turnaround:'غالبًا خلال يوم عمل.',caution:'بعض اضطرابات الهيموجلوبين وعمر الكريات الحمراء تؤثر في التفسير.'},
  'Ferritin': {purpose:'تقييم مخزون الحديد، وقد يرتفع أيضًا مع الالتهاب.',organ:'الدم والحديد',specimen:'مصل الدم',tube:'ذهبي SST أو أحمر',timing:'لا يحتاج صيامًا عادةً.',turnaround:'غالبًا خلال يوم عمل.',caution:'يفسر مع صورة الدم وعلامات الالتهاب.'},
  'Urine Analysis': {purpose:'فحص البول لتقييم علامات اضطرابات الكلى والمسالك وغيرها.',organ:'الكلى والمسالك البولية',specimen:'بول حديث في وعاء نظيف',tube:'وعاء بول مناسب — ليست أنبوبة دم',timing:'جمع العينة حسب تعليمات المختبر.',turnaround:'غالبًا في نفس اليوم.',caution:'التأخير في نقل العينة قد يغيّر النتائج.'},
  'Urine C/S': {purpose:'زراعة البول لتحديد الجراثيم وحساسيتها.',organ:'المسالك البولية',specimen:'بول منتصف المجرى معقم',tube:'وعاء جمع بول معقم',timing:'يُفضل قبل المضاد الحيوي إذا أمكن وبتوجيه طبي.',turnaround:'غالبًا 48–72 ساعة وقد تزيد.',caution:'طريقة جمع العينة الصحيحة مهمة لتجنب التلوث.'},
  'PTT': {purpose:'تقييم أحد مسارات تخثر الدم.',organ:'سيولة الدم',specimen:'بلازما سترات',tube:'أزرق فاتح — Sodium citrate',timing:'الصيام غير مطلوب عادةً؛ وضّح أدوية السيولة.',turnaround:'غالبًا في نفس اليوم.',caution:'يجب ملء أنبوبة السيترات للنسبة الصحيحة.'},
  'Prothrombin Time': {purpose:'تقييم التخثر وقد يُستخدم لمتابعة الوارفارين.',organ:'سيولة الدم',specimen:'بلازما سترات',tube:'أزرق فاتح — Sodium citrate',timing:'عادةً دون صيام؛ وضّح أدوية السيولة.',turnaround:'غالبًا في نفس اليوم.',caution:'امتلاء الأنبوبة عامل مهم لسلامة النتيجة.'},
  'Troponin': {purpose:'مؤشر لإصابة عضلة القلب.',organ:'القلب',specimen:'مصل أو بلازما حسب الجهاز',tube:'ذهبي SST أو أخضر هيبارين حسب المنصة',timing:'يُجرى حسب تقييم الطوارئ؛ وقد يستلزم تكرار العينة.',turnaround:'قد تكون خلال نحو ساعة في مختبر الطوارئ.',caution:'لا تُفسّر النتيجة دون الأعراض والتخطيط وتغير القيم.'},
  'Vit D3': {purpose:'تقييم حالة فيتامين د في الجسم.',organ:'العظام والتمثيل الغذائي',specimen:'مصل الدم',tube:'ذهبي SST أو أحمر',timing:'عادةً لا يحتاج صيامًا.',turnaround:'يختلف؛ غالبًا 1–3 أيام عمل.',caution:'يجب تحديد وقت التقرير الفعلي وفق المعمل.'},
};
const fields: [keyof Guide,string][] = [['purpose','ما وظيفة التحليل؟'],['organ','العضو أو الجهاز'],['specimen','نوع العينة'],['tube','لون الأنبوبة أو الوعاء'],['timing','التحضير ووقت إجرائه'],['turnaround','موعد ظهور النتيجة'],['caution','ملاحظات مهمة']];
const storageKey='clinic.lab.reference.guide.v1';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!));
export function openLabReferenceGuide(){
  const root=document.querySelector<HTMLDivElement>('#modalRoot');
  if(!root)return;
  let edits:Record<string,Partial<Guide>>={};
  try{edits=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{edits={}}
  let active=LAB_TESTS[0];
  let query='';
  const detail=():Guide=>({...defaults,...Object.entries(standard).find(([key])=>active.name.toLowerCase().includes(key.toLowerCase()))?.[1],...edits[String(active.id)]});
  function draw(){
    const matches=LAB_TESTS.filter(t=>(t.name+' '+t.arabic+' '+t.market).toLowerCase().includes(query.toLowerCase()));
    const info=detail();
    root!.innerHTML=`<div class="modal-backdrop" id="labGuideBackdrop"><section class="modal lab-reference-guide"><div class="modal-head"><div><h2>دليل التحاليل</h2><p>معلومات مرجعية عن التحليل والعينة والأنبوبة والتحضير ووقت النتيجة</p></div><button type="button" class="modal-close" id="labGuideClose">×</button></div><div class="lab-guide-layout"><aside><input id="labGuideSearch" type="search" placeholder="بحث عربي أو إنجليزي" value="${esc(query)}"><div class="lab-guide-list">${matches.map(t=>`<button type="button" data-guide-id="${t.id}" class="${active.id===t.id?'active':''}"><strong>${esc(t.name)}</strong><small>${esc(t.arabic||t.market)}</small></button>`).join('')}</div></aside><main class="lab-guide-body"><h3>${esc(active.name)}</h3><p>${esc(active.arabic||active.market)}</p><div class="lab-guide-grid">${fields.map(([key,label])=>`<div><small>${label}</small><strong>${esc(info[key])}</strong></div>`).join('')}</div><p class="lab-guide-warning">تنبيه: ألوان الأنابيب وأوقات النتيجة تختلف حسب الأجهزة وبروتوكول المعمل؛ لا تعتمد على معلومات غير مؤكدة عند سحب العينات.</p><button type="button" class="btn ghost small" id="labGuideEdit">تعديل بيانات هذا التحليل</button></main></div></section></div>`;
    root!.querySelector<HTMLButtonElement>('#labGuideClose')!.onclick=()=>root!.replaceChildren();
    const input=root!.querySelector<HTMLInputElement>('#labGuideSearch')!;
    input.oninput=()=>{query=input.value;const caret=input.selectionStart;draw();const next=root!.querySelector<HTMLInputElement>('#labGuideSearch')!;next.focus();next.setSelectionRange(caret,caret)};
    root!.querySelectorAll<HTMLButtonElement>('[data-guide-id]').forEach(button=>button.onclick=()=>{const t=LAB_TESTS.find(t=>t.id===Number(button.dataset.guideId));if(t){active=t;draw()}});
    root!.querySelector<HTMLButtonElement>('#labGuideEdit')!.onclick=()=>{
      const body=root!.querySelector<HTMLElement>('.lab-guide-body')!;
      body.innerHTML=`<h3>تعديل مرجع ${esc(active.name)}</h3><p>يُراجع المحتوى بواسطة مسؤول المختبر قبل الاعتماد عليه.</p><form id="labGuideForm">${fields.map(([key,label])=>`<label>${label}<textarea data-guide-field="${key}">${esc(info[key])}</textarea></label>`).join('')}<button class="btn primary" type="submit">حفظ بيانات التحليل</button><button type="button" class="btn ghost" id="labGuideCancel">إلغاء</button></form>`;
      body.querySelector<HTMLButtonElement>('#labGuideCancel')!.onclick=draw;
      body.querySelector<HTMLFormElement>('#labGuideForm')!.onsubmit=e=>{e.preventDefault();const v:Record<string,string>={};body.querySelectorAll<HTMLTextAreaElement>('[data-guide-field]').forEach(t=>v[t.dataset.guideField||'']=t.value.trim());edits[String(active.id)]=v;localStorage.setItem(storageKey,JSON.stringify(edits));draw()};
    };
  }
  draw();
}
