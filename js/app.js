import { openDb, getAll, getOne, put, remove, uid } from './db.js';
import { BIBLE_BOOKS, TOTAL_BIBLE_CHAPTERS, getBook, bookProgress, planProgress } from './bible.js';
import { limaToday, formatDateEs, startOfWeekMonday, isSunday, monthBounds, eachDate, dayOfWeek, minutesBetweenEpoch } from './dates.js';
import { calculateReadingStreak, calculatePrayerStreak, calculateChurchStreak, readingDayComplete, prayerDayComplete, scheduledServicesForDate, attendedAllScheduledServices } from './streaks.js';
import { weeklyMetrics, monthlyMetrics, goalProgress } from './metrics.js';
import { exportBackup, importBackupFile, backupStatus } from './backup.js';

console.log('[Cimiento] build reading-debug-1');

const DEFAULT_CHURCH_SCHEDULE = {
  0: [
    { id: 'sun-1000', time: '10:00', label: 'Culto de la mañana', enabled: true },
    { id: 'sun-1900', time: '19:00', label: 'Culto de la noche', enabled: true }
  ],
  1: [],
  2: [{ id: 'tue-1900', time: '19:00', label: 'Culto', enabled: true }],
  3: [{ id: 'wed-1900', time: '19:00', label: 'Culto', enabled: true }],
  4: [{ id: 'thu-1900', time: '19:00', label: 'Culto', enabled: true }],
  5: [{ id: 'fri-1900', time: '19:00', label: 'Culto', enabled: true }],
  6: [{ id: 'sat-1900', time: '19:00', label: 'Culto', enabled: true }]
};

const DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const GOAL_LABELS = {
  readingDays: 'Días de lectura', prayerDays: 'Días de oración', prayerMinutes: 'Minutos de oración',
  chapters: 'Capítulos leídos', servicesAttended: 'Cultos asistidos'
};

const MORE_VIEWS = ['progress', 'study', 'settings'];

const state = {
  today: limaToday(),
  selectedDate: limaToday(),
  activeView: 'home',
  deferredInstallPrompt: null,
  timerInterval: null,
  prayerRecoveryAcknowledged: false, // true una vez que el usuario resuelve el banner de recuperación
  prayerActionPending: false,
  data: null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 2200);
}

function closeMoreMenu() {
  $('#moreMenu').hidden = true;
  $('#moreButton').setAttribute('aria-expanded', 'false');
}

function navigate(view) {
  closeMoreMenu();
  state.activeView = view;
  $$('.view').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  $$('[data-nav]').forEach(el => {
    const active = el.dataset.nav === view;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  $('#moreButton').classList.toggle('active', MORE_VIEWS.includes(view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function ensureDefaults() {
  const schedule = await getOne('settings', 'churchSchedule');
  if (!schedule) await put('settings', { key: 'churchSchedule', value: DEFAULT_CHURCH_SCHEDULE });
  const createdAt = await getOne('meta', 'createdAt');
  if (!createdAt) await put('meta', { key: 'createdAt', value: new Date().toISOString() });
}

async function loadData() {
  const [readings, plans, prayerDays, prayerSessions, prayerRequests, attendance, teachings, highlights, favorites, memoryPassages, goals, weeklyReviews, settings] = await Promise.all([
    getAll('readings'), getAll('plans'), getAll('prayerDays'), getAll('prayerSessions'), getAll('prayerRequests'), getAll('attendance'),
    getAll('teachings'), getAll('highlights'), getAll('favorites'), getAll('memoryPassages'), getAll('goals'), getAll('weeklyReviews'), getAll('settings')
  ]);
  state.data = {
    readings, plans, prayerDays, prayerSessions, prayerRequests, attendance, teachings, highlights, favorites,
    memoryPassages, goals, weeklyReviews,
    churchSchedule: settings.find(s => s.key === 'churchSchedule')?.value ?? DEFAULT_CHURCH_SCHEDULE
  };
}

async function refresh(message) {
  state.today = limaToday();
  await loadData();
  renderAll();
  await renderBackupBanner();
  if (message) toast(message);
}

function bookOptions(selected = '') {
  return BIBLE_BOOKS.map(b => `<option value="${esc(b.name)}" ${b.name === selected ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
}

function chapterOptions(bookName, selected = 1) {
  const book = getBook(bookName) ?? BIBLE_BOOKS[0];
  return Array.from({ length: book.chapters }, (_, i) => i + 1).map(n => `<option value="${n}" ${Number(selected) === n ? 'selected' : ''}>${n}</option>`).join('');
}

function lastReadingBeforeOrOn(dateKey) {
  return [...state.data.readings].filter(r => r.date <= dateKey).sort((a,b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0] ?? null;
}

function suggestedNextReading(dateKey) {
  const last = lastReadingBeforeOrOn(dateKey);
  if (!last) return null;
  const bookIndex = BIBLE_BOOKS.findIndex(b => b.name === last.book);
  const book = BIBLE_BOOKS[bookIndex];
  if (!book) return null;
  if (Number(last.chapter) < book.chapters) return { book: book.name, chapter: Number(last.chapter) + 1 };
  const nextBook = BIBLE_BOOKS[bookIndex + 1];
  return nextBook ? { book: nextBook.name, chapter: 1 } : null;
}

function renderHome() {
  const d = state.selectedDate;
  const readings = state.data.readings.filter(r => r.date === d);
  const readingDone = readings.length > 0;
  const prayerDone = prayerDayComplete(d, state.data.prayerDays, state.data.prayerSessions);
  const services = scheduledServicesForDate(d, state.data.churchSchedule);
  const churchDone = services.length ? attendedAllScheduledServices(d, state.data.churchSchedule, state.data.attendance) === true : null;
  const next = suggestedNextReading(d);
  const prayerDay = state.data.prayerDays.find(p => p.date === d);

  $('#view-home').innerHTML = `
    <div class="page-head">
      <div><h2>Hoy</h2><p>Registrar lo esencial, sin fricción.</p></div>
      <label>Fecha<input id="homeDate" type="date" value="${d}" max="${state.today}"></label>
    </div>
    <div class="grid three">
      <article class="card quick-card ${readingDone ? 'done' : ''}">
        <div><span class="status ${readingDone ? 'ok' : 'pending'}">${readingDone ? '● Cumplido' : '○ Pendiente'}</span><h3>Lectura</h3><p>${readingDone ? `${readings.length} registro(s) hoy` : 'Registra un capítulo de forma estructurada.'}</p></div>
        <div class="button-row">
          ${next ? `<button class="button" data-action="quick-next-reading" data-book="${esc(next.book)}" data-chapter="${next.chapter}">Siguiente: ${esc(next.book)} ${next.chapter}</button>` : ''}
          <button class="button secondary" data-action="go-reading">Registrar lectura</button>
        </div>
      </article>
      <article class="card quick-card ${prayerDone ? 'done' : ''}">
        <div><span class="status ${prayerDone ? 'ok' : 'pending'}">${prayerDone ? '● Cumplido' : '○ Pendiente'}</span><h3>Oración</h3><p>${prayerDay?.quick === false ? 'Marcado como no cumplido.' : 'El modo rápido cuenta el día, sin minutos.'}</p></div>
        <div class="button-row"><button class="button" data-action="quick-prayer-yes">Sí</button><button class="button secondary" data-action="quick-prayer-no">No</button><button class="button ghost" data-action="go-prayer">Profundo</button></div>
      </article>
      <article class="card quick-card ${churchDone ? 'done' : ''}">
        <div><span class="status ${churchDone ? 'ok' : 'pending'}">${services.length === 0 ? '— Sin culto' : churchDone ? '● Cumplido' : '○ Pendiente'}</span><h3>Iglesia</h3><p>${services.length ? `${services.length} culto(s) programado(s). El día cumple solo si asistes a todos.` : 'No hay culto programado.'}</p></div>
        ${services.length ? `<div class="button-row"><button class="button" data-action="church-all-attended">Asistí a todos</button><button class="button secondary" data-action="church-all-missed">No asistí</button><button class="button ghost" data-action="go-church">Editar</button></div>` : '<button class="button ghost" data-action="go-church">Ver horario</button>'}
      </article>
    </div>
    ${isSunday(d) ? renderWeeklyReviewCard(d) : ''}
  `;
}

function renderWeeklyReviewCard(dateKey) {
  const weekStart = startOfWeekMonday(dateKey);
  const saved = state.data.weeklyReviews.find(r => r.weekStart === weekStart);
  return `
    <h3 class="section-title">Revisión semanal</h3>
    <form id="weeklyReviewForm" class="card">
      <input type="hidden" name="weekStart" value="${weekStart}">
      <div class="form-grid two">
        <label>¿Qué aprendí esta semana?<textarea name="learned" maxlength="1200">${esc(saved?.learned ?? '')}</textarea></label>
        <label>¿Qué quiero mejorar la próxima semana?<textarea name="improve" maxlength="1200">${esc(saved?.improve ?? '')}</textarea></label>
      </div>
      <div class="form-actions"><button class="button" type="submit">Guardar revisión</button></div>
    </form>`;
}

function renderReading() {
  const progress = bookProgress(state.data.readings);
  const plans = state.data.plans;
  const recent = [...state.data.readings].sort((a,b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 20);
  $('#view-reading').innerHTML = `
    <div class="page-head"><div><h2>Lectura</h2><p>Registro estructurado. Biblia protestante de 66 libros · ${TOTAL_BIBLE_CHAPTERS.toLocaleString('es-PE').replace(',', '.')} capítulos.</p></div></div>
    <form id="readingForm" class="card">
      <div class="form-grid four">
        <label>Fecha<input type="date" name="date" value="${state.selectedDate}" max="${state.today}" required></label>
        <label>Libro<select name="book" id="readingBook">${bookOptions()}</select></label>
        <label>Capítulo<select name="chapter" id="readingChapter">${chapterOptions(BIBLE_BOOKS[0].name)}</select></label>
        <label>Versículo inicial (opcional)<input type="number" name="verseStart" min="1" inputmode="numeric"></label>
        <label>Versículo final (opcional)<input type="number" name="verseEnd" min="1" inputmode="numeric"></label>
      </div>
      <div class="form-actions"><button class="button" type="submit">Guardar lectura</button></div>
    </form>

    <h3 class="section-title">Mapa de los 66 libros</h3>
    <div class="legend"><span><i class="dot unread"></i>Sin leer</span><span><i class="dot progress"></i>En progreso</span><span><i class="dot done"></i>Terminado</span></div>
    <div class="book-map">${progress.map(b => `<div class="book-chip ${b.state}" title="${b.readChapters}/${b.chapters} capítulos">${esc(b.name)}<br><strong>${b.readChapters}/${b.chapters}</strong></div>`).join('')}</div>

    <h3 class="section-title">Planes de lectura</h3>
    <form id="planForm" class="card">
      <div class="form-grid four">
        <label>Nombre<input name="name" placeholder="Ej. Evangelios" maxlength="80" required></label>
        <label>Desde<select name="startBook" id="planStartBook">${bookOptions()}</select></label>
        <label>Hasta<select name="endBook" id="planEndBook">${bookOptions()}</select></label>
        <label>Capítulos por día<input type="number" name="chaptersPerDay" min="1" max="30" value="2" required></label>
      </div>
      <div class="form-actions"><button class="button" type="submit">Crear plan</button></div>
    </form>
    <div class="list" style="margin-top:10px">${plans.length ? plans.map(plan => {
      const p = planProgress(plan, state.data.readings);
      return `<div class="list-item"><div class="row"><div><h4>${esc(plan.name)}</h4><p class="small muted">${esc(plan.startBook)} → ${esc(plan.endBook)} · ${plan.chaptersPerDay} cap./día</p></div><button class="button danger small" data-action="delete" data-store="plans" data-id="${plan.id}">Eliminar</button></div><p><strong>${p.completed}/${p.total}</strong> capítulos · ${p.percent}%</p><div class="progress"><span style="width:${p.percent}%"></span></div><p class="small muted">Restan ${p.remaining} capítulos ≈ ${p.estimatedDaysRemaining} día(s) al ritmo elegido.</p></div>`;
    }).join('') : '<p class="muted">Aún no hay planes.</p>'}</div>

    <h3 class="section-title">Lecturas recientes</h3>
    <div class="list">${recent.length ? recent.map(r => `<div class="list-item"><div class="row"><div><strong>${esc(r.book)} ${r.chapter}${r.verseStart ? `:${r.verseStart}${r.verseEnd ? `-${r.verseEnd}` : ''}` : ''}</strong><p class="small muted">${formatDateEs(r.date, {weekday:true})}</p></div><button class="button danger small" data-action="delete" data-store="readings" data-id="${r.id}">Eliminar</button></div></div>`).join('') : '<p class="muted">Aún no registraste lecturas.</p>'}</div>
  `;
}

function activePrayerSession() {
  return state.data.prayerSessions.find(s => s.completed === false) ?? null;
}

/** Genera el HTML del banner de recuperación cuando hay una sesión abierta al arrancar. */
function renderPrayerRecoveryBanner(active) {
  const startedStr = new Date(active.startedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const startedDate = formatDateEs(active.date, { weekday: true });
  const elapsedMin = Math.max(0, Math.floor((Date.now() - active.startEpochMs) / 60000));
  return `
    <div class="card" style="border-left:4px solid var(--accent);margin-bottom:12px" role="alert">
      <h3 style="margin-top:0">Sesión de oración abierta</h3>
      <p>Iniciada el <strong>${startedDate}</strong> a las <strong>${startedStr}</strong>.<br>
         Tiempo transcurrido: <strong id="recoveryTimer">${elapsedMin} min</strong>.</p>
      <p class="small muted">Elige qué hacer con esta sesión:</p>
      <div class="button-row">
        <button class="button" data-action="recover-continue" data-id="${active.id}">Continuar</button>
        <button class="button secondary" data-action="recover-finish" data-id="${active.id}">Finalizar ahora</button>
        <button class="button danger" data-action="recover-discard" data-id="${active.id}">Descartar</button>
      </div>
    </div>`;
}

function renderPrayer() {
  const active = activePrayerSession();
  const sessions = [...state.data.prayerSessions].filter(s => s.completed).sort((a,b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? '')).slice(0,20);
  const requests = [...state.data.prayerRequests].sort((a,b) => b.date.localeCompare(a.date));

  // El banner de recuperación se muestra solo la primera vez (flag false).
  // Tras cualquier acción de recuperación el flag queda true y se pasa a la vista normal.
  const showRecoveryBanner = active && !state.prayerRecoveryAcknowledged;
  const deepBlock = showRecoveryBanner
    ? renderPrayerRecoveryBanner(active)
    : active
    ? `<div class="card">
        <h3>Modo profundo</h3>
        <p class="muted">Sesión en curso desde ${new Date(active.startedAt).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}.</p>
        <div id="prayerTimer" class="timer">0 min</div>
        <label>Nota opcional<textarea id="prayerTimerNote" maxlength="800">${esc(active.note ?? '')}</textarea></label>
        <div class="form-actions"><button class="button" data-action="stop-prayer-timer" data-id="${active.id}">Finalizar sesión</button></div>
        <p class="timer-note">Se guardan minutos completos; los segundos no se contabilizan.</p>
       </div>`
    : `<div class="card">
        <h3>Modo profundo</h3>
        <p class="muted">El cronómetro guarda la hora real de inicio. Si bloqueas el teléfono, no se desfasa.</p>
        <button class="button" data-action="start-prayer-timer">Iniciar oración</button>
        <p class="timer-note">Se guardan minutos completos; los segundos no se contabilizan.</p>
       </div>`;

  $('#view-prayer').innerHTML = `
    <div class="page-head"><div><h2>Oración</h2><p>Modo rápido para cumplir el día; modo profundo para registrar minutos.</p></div></div>
    ${deepBlock}
    <div class="grid two">
      <div class="card">
        <h3>Modo rápido</h3><p>Marca el día sin registrar duración.</p>
        <label>Fecha<input id="prayerQuickDate" type="date" value="${state.selectedDate}" max="${state.today}"></label>
        <div class="button-row" style="margin-top:10px"><button class="button" data-action="prayer-quick-yes-page">Sí, oré</button><button class="button secondary" data-action="prayer-quick-no-page">No</button></div>
      </div>
    </div>

    <h3 class="section-title">Peticiones de oración</h3>
    <form id="prayerRequestForm" class="card">
      <div class="form-grid two"><label>Fecha<input type="date" name="date" value="${state.today}" max="${state.today}" required></label><label>Petición<textarea name="request" required maxlength="800"></textarea></label></div>
      <div class="form-actions"><button class="button" type="submit">Agregar petición</button></div>
    </form>
    <div class="list" style="margin-top:10px">${requests.length ? requests.map(r => `<div class="list-item"><div class="row"><div><h4>${esc(r.request)}</h4><p class="small muted">${formatDateEs(r.date)}${r.respondedDate ? ` · Respondida: ${formatDateEs(r.respondedDate)}` : ''}</p></div><div class="button-row">${!r.respondedDate ? `<button class="button secondary small" data-action="answer-request" data-id="${r.id}">Respondida</button>` : ''}<button class="button danger small" data-action="delete" data-store="prayerRequests" data-id="${r.id}">Eliminar</button></div></div></div>`).join('') : '<p class="muted">No hay peticiones registradas.</p>'}</div>

    <h3 class="section-title">Sesiones profundas recientes</h3>
    <div class="list">${sessions.length ? sessions.map(s => `<div class="list-item"><div class="row"><div><strong>${s.minutes} min</strong><p class="small muted">${formatDateEs(s.date)}${s.note ? ` · ${esc(s.note)}` : ''}</p></div><button class="button danger small" data-action="delete" data-store="prayerSessions" data-id="${s.id}">Eliminar</button></div></div>`).join('') : '<p class="muted">Aún no hay sesiones profundas.</p>'}</div>
  `;
  startTimerUi(active);
}

function startTimerUi(active) {
  if (state.timerInterval) clearInterval(state.timerInterval);
  if (!active) return;
  const update = () => {
    const el = $('#prayerTimer') ?? $('#recoveryTimer');
    if (el) el.textContent = `${Math.max(0, Math.floor((Date.now() - active.startEpochMs) / 60000))} min`;
  };
  update();
  state.timerInterval = setInterval(update, 10000);
}

function renderChurch() {
  const d = state.selectedDate;
  const services = scheduledServicesForDate(d, state.data.churchSchedule);
  $('#view-church').innerHTML = `
    <div class="page-head"><div><h2>Iglesia</h2><p>La asistencia se registra por cada culto.</p></div><label>Fecha<input id="churchDate" type="date" value="${d}" max="${state.today}"></label></div>
    <div class="list">${services.length ? services.map(service => {
      const record = state.data.attendance.find(a => a.date === d && a.serviceId === service.id);
      return `<div class="list-item"><div class="row"><div><h4>${esc(service.label)}</h4><p class="small muted">${service.time}</p></div><span class="status ${record?.status === 'attended' ? 'ok' : 'pending'}">${record?.status === 'attended' ? 'Asistí' : record?.status === 'missed' ? 'No asistí' : 'Pendiente'}</span></div><div class="button-row" style="margin-top:10px"><button class="button small" data-action="service-attended" data-service="${service.id}">Asistí</button><button class="button secondary small" data-action="service-missed" data-service="${service.id}">No asistí</button><button class="button ghost small" data-action="service-clear" data-service="${service.id}">Limpiar</button></div></div>`;
    }).join('') : '<div class="card"><p class="muted">No hay cultos programados para este día.</p></div>'}</div>
    <p class="small muted">La racha del día se cumple solo si todos los cultos programados están marcados como “Asistí”.</p>
    <h3 class="section-title">Horario semanal</h3>
    <div class="card">${DAY_NAMES.map((name, day) => `<div><strong>${name}</strong><span class="muted small"> · ${(state.data.churchSchedule[day] ?? []).map(s => `${s.time}`).join(', ') || 'sin culto'}</span></div>`).join('<hr>')}<div class="form-actions"><button class="button secondary" data-action="go-settings">Editar horario</button></div></div>
  `;
}

function renderStudy() {
  const teachings = [...state.data.teachings].sort((a,b) => b.date.localeCompare(a.date));
  const highlights = [...state.data.highlights].sort((a,b) => b.date.localeCompare(a.date));
  const favorite = state.data.favorites.find(f => f.id === 'favorite');
  const memory = state.data.memoryPassages.find(m => m.id === 'current');
  $('#view-study').innerHTML = `
    <div class="page-head"><div><h2>Estudio personal</h2><p>Enseñanzas, versículos resaltados y memorización.</p></div></div>
    <h3 class="section-title">Enseñanzas</h3>
    <form id="teachingForm" class="card"><div class="form-grid two"><label>Fecha<input type="date" name="date" value="${state.today}" max="${state.today}" required></label><label>Pasaje o prédica de origen<input name="source" maxlength="160" required placeholder="Ej. Juan 15 / Prédica dominical"></label><label>Enseñanza<textarea name="content" maxlength="2000" required></textarea></label></div><div class="form-actions"><button class="button" type="submit">Guardar enseñanza</button></div></form>
    <label style="margin:10px 0">Buscar<input id="teachingSearch" type="search" placeholder="Buscar en origen o enseñanza"></label>
    <div id="teachingList" class="list">${renderTeachingItems(teachings)}</div>

    <h3 class="section-title">Versículos resaltados</h3>
    <form id="highlightForm" class="card"><div class="form-grid two"><label>Cita obligatoria<input name="citation" maxlength="80" required placeholder="Ej. Filipenses 4:6-7"></label><label>Texto opcional<textarea name="text" maxlength="1000"></textarea></label><label>Etiquetas<input name="tags" maxlength="160" placeholder="fe, oración, paciencia"></label><label>Comentario<textarea name="comment" maxlength="1200"></textarea></label></div><div class="form-actions"><button class="button" type="submit">Guardar versículo</button></div></form>
    <div class="list" style="margin-top:10px">${highlights.length ? highlights.map(h => `<div class="list-item"><div class="row"><div><h4>${esc(h.citation)}</h4>${h.text ? `<p>${esc(h.text)}</p>` : ''}${h.comment ? `<p class="small">${esc(h.comment)}</p>` : ''}<p class="small muted">${esc(h.tags ?? '')}</p></div><button class="button danger small" data-action="delete" data-store="highlights" data-id="${h.id}">Eliminar</button></div></div>`).join('') : '<p class="muted">No hay versículos resaltados.</p>'}</div>

    <div class="grid two">
      <div><h3 class="section-title">Versículo favorito</h3><form id="favoriteForm" class="card"><label>Cita<input name="citation" value="${esc(favorite?.citation ?? '')}" maxlength="80" required></label><label>Texto opcional<textarea name="text" maxlength="1000">${esc(favorite?.text ?? '')}</textarea></label><div class="form-actions"><button class="button" type="submit">Guardar favorito</button></div></form></div>
      <div><h3 class="section-title">Pasaje en memorización</h3><form id="memoryForm" class="card"><label>Cita<input name="citation" value="${esc(memory?.citation ?? '')}" maxlength="120" required></label><label>Fecha de inicio<input type="date" name="startDate" value="${memory?.startDate ?? state.today}" max="${state.today}" required></label><div class="form-actions"><button class="button" type="submit">Guardar pasaje</button></div></form></div>
    </div>
  `;
}

function renderTeachingItems(items) {
  return items.length ? items.map(t => `<div class="list-item" data-teaching-search="${esc((t.source + ' ' + t.content).toLowerCase())}"><div class="row"><div><h4>${esc(t.source)}</h4><p>${esc(t.content)}</p><p class="small muted">${formatDateEs(t.date)}</p></div><button class="button danger small" data-action="delete" data-store="teachings" data-id="${t.id}">Eliminar</button></div></div>`).join('') : '<p class="muted">No hay enseñanzas.</p>';
}

function renderProgress() {
  const d = state.today;
  const data = state.data;
  const weekly = weeklyMetrics(d, data);
  const monthly = monthlyMetrics(d, data);
  const readingStreak = calculateReadingStreak(d, data.readings);
  const prayerStreak = calculatePrayerStreak(d, data.prayerDays, data.prayerSessions);
  const churchStreak = calculateChurchStreak(d, data.churchSchedule, data.attendance);
  const { start: monthStart, end: monthEnd } = monthBounds(d);
  const monthDates = eachDate(monthStart, monthEnd);
  const firstDow = dayOfWeek(monthStart); // 0 domingo
  const mondayOffset = firstDow === 0 ? 6 : firstDow - 1;

  $('#view-progress').innerHTML = `
    <div class="page-head"><div><h2>Progreso</h2><p>Rachas independientes y cumplimiento real.</p></div></div>
    <div class="grid three">
      <div class="card"><div class="kpi-label">Racha de lectura</div><div class="kpi">${readingStreak}</div><div class="muted small">día(s)</div></div>
      <div class="card"><div class="kpi-label">Racha de oración</div><div class="kpi">${prayerStreak}</div><div class="muted small">día(s)</div></div>
      <div class="card"><div class="kpi-label">Racha de asistencia</div><div class="kpi">${churchStreak}</div><div class="muted small">día(s) aplicables</div></div>
    </div>
    <h3 class="section-title">Esta semana</h3>
    <div class="grid three">
      <div class="card"><div class="kpi">${weekly.readingPercent}%</div><div class="kpi-label">Lectura · ${weekly.readingDays}/${weekly.days} días</div></div>
      <div class="card"><div class="kpi">${weekly.prayerPercent}%</div><div class="kpi-label">Oración · ${weekly.prayerDays}/${weekly.days} días</div></div>
      <div class="card"><div class="kpi">${weekly.attendancePercent}%</div><div class="kpi-label">Asistencia · ${weekly.attendedServices}/${weekly.scheduledServices} cultos</div></div>
      <div class="card"><div class="kpi">${weekly.prayerMinutes}</div><div class="kpi-label">Minutos de oración</div></div>
      <div class="card"><div class="kpi">${weekly.chaptersRead}</div><div class="kpi-label">Capítulos leídos</div></div>
      <div class="card"><div class="kpi">${monthly.attendancePercent}%</div><div class="kpi-label">Asistencia del mes</div></div>
    </div>
    <h3 class="section-title">Mes actual</h3>
    <div class="grid three"><div class="card"><div class="kpi">${monthly.readingPercent}%</div><div class="kpi-label">Lectura</div></div><div class="card"><div class="kpi">${monthly.prayerPercent}%</div><div class="kpi-label">Oración</div></div><div class="card"><div class="kpi">${monthly.chaptersRead}</div><div class="kpi-label">Capítulos únicos</div></div></div>
    <div class="card" style="margin-top:12px">
      <div class="calendar"><div class="cal-head">L</div><div class="cal-head">M</div><div class="cal-head">X</div><div class="cal-head">J</div><div class="cal-head">V</div><div class="cal-head">S</div><div class="cal-head">D</div>${Array.from({length:mondayOffset},()=>'<div class="cal-day empty"></div>').join('')}${monthDates.map(date => {
        const r = readingDayComplete(date, data.readings);
        const p = prayerDayComplete(date, data.prayerDays, data.prayerSessions);
        const services = scheduledServicesForDate(date, data.churchSchedule);
        const c = services.length ? attendedAllScheduledServices(date, data.churchSchedule, data.attendance) === true : null;
        return `<div class="cal-day"><div class="cal-number">${Number(date.slice(-2))}</div><div class="cal-marks" title="Lectura / Oración / Iglesia"><i class="mark ${r ? 'done' : ''}"></i><i class="mark ${p ? 'done' : ''}"></i><i class="mark ${c === true ? 'done' : c === null ? 'na' : ''}"></i></div></div>`;
      }).join('')}</div>
    </div>

    <h3 class="section-title">Planes</h3>
    <div class="list">${data.plans.length ? data.plans.map(plan => { const p=planProgress(plan,data.readings); return `<div class="list-item"><strong>${esc(plan.name)}</strong><p class="small muted">${p.completed}/${p.total} · ${p.percent}%</p><div class="progress"><span style="width:${p.percent}%"></span></div></div>`; }).join('') : '<p class="muted">No hay planes activos.</p>'}</div>

    <h3 class="section-title">Metas semanales</h3>
    <form id="goalForm" class="card"><div class="form-grid two"><label>Meta<select name="metric">${Object.entries(GOAL_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Cantidad objetivo<input type="number" name="target" min="1" value="5" required></label></div><div class="form-actions"><button class="button" type="submit">Agregar meta</button></div></form>
    <div class="list" style="margin-top:10px">${data.goals.length ? data.goals.map(goal => { const g=goalProgress(goal,weekly,data,d); return `<div class="list-item"><div class="row"><div><strong>${esc(GOAL_LABELS[goal.metric] ?? goal.metric)}</strong><p class="small muted">${g.value}/${g.target} · ${g.percent}%</p></div><button class="button danger small" data-action="delete" data-store="goals" data-id="${goal.id}">Eliminar</button></div><div class="progress"><span style="width:${g.percent}%"></span></div></div>`; }).join('') : '<p class="muted">Define las metas que quieras; no hay un número fijo.</p>'}</div>

    <h3 class="section-title">Resumen de la semana</h3>
    <div class="card"><p><strong>${weekly.readingDays}</strong> día(s) de lectura · <strong>${weekly.chaptersRead}</strong> capítulo(s) únicos · <strong>${weekly.prayerDays}</strong> día(s) de oración · <strong>${weekly.prayerMinutes}</strong> min profundos · <strong>${weekly.attendedServices}/${weekly.scheduledServices}</strong> cultos asistidos.</p></div>
  `;
}

function renderSettings() {
  $('#view-settings').innerHTML = `
    <div class="page-head"><div><h2>Ajustes</h2><p>Horario, respaldo e instalación.</p></div></div>
    <h3 class="section-title">Horario de cultos</h3>
    <form id="scheduleForm" class="card">
      ${DAY_NAMES.map((name, day) => `<div class="schedule-day" data-schedule-day="${day}"><strong>${name}</strong><div class="schedule-list">${(state.data.churchSchedule[day] ?? []).map(s => scheduleRow(s)).join('')}</div><button class="button ghost small" type="button" data-action="add-service" data-day="${day}">+ Agregar culto</button></div>`).join('')}
      <div class="form-actions"><button class="button" type="submit">Guardar horario</button></div>
      <p class="small muted">El horario actual se usa para calcular la aplicabilidad de las rachas y porcentajes, incluidos registros anteriores.</p>
    </form>
    <h3 class="section-title">Respaldo</h3>
    <div class="card"><p>Exporta todos los datos a un JSON versionado. Importar reemplaza por completo los datos locales por el contenido del respaldo.</p><div class="button-row"><button class="button" data-action="export-backup">Exportar JSON</button><label class="button secondary" style="display:flex;align-items:center;justify-content:center">Importar JSON<input id="importBackupInput" type="file" accept="application/json,.json" hidden></label></div></div>
    <h3 class="section-title">Almacenamiento</h3>
    <div class="card"><p id="storageStatus" class="muted">Comprobando almacenamiento persistente…</p><button class="button secondary" data-action="request-persist">Solicitar persistencia</button></div>
    <h3 class="section-title">Acerca de</h3>
    <div class="card"><p><strong>Cimiento 1.0</strong></p><p class="small muted">PWA local, sin servidor, sin cuentas y sin sincronización. Las fechas se guardan como YYYY-MM-DD usando el día civil de Lima.</p></div>
  `;
  renderStorageStatus();
}

function scheduleRow(service = {}) {
  return `<div class="schedule-row"><input type="hidden" data-field="id" value="${esc(service.id ?? '')}"><input type="time" data-field="time" value="${esc(service.time ?? '19:00')}" required><input data-field="label" value="${esc(service.label ?? 'Culto')}" maxlength="60" required><button class="button danger small" type="button" data-action="remove-service">×</button></div>`;
}

function renderAll() {
  renderHome(); renderReading(); renderPrayer(); renderChurch(); renderStudy(); renderProgress(); renderSettings(); navigate(state.activeView);
}

async function saveAttendance(date, serviceId, status) {
  await put('attendance', { id: `${date}|${serviceId}`, date, serviceId, status, updatedAt: new Date().toISOString() });
}

async function deleteAttendance(date, serviceId) {
  await remove('attendance', `${date}|${serviceId}`);
}

async function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const fd = new FormData(form);

  if (form.id === 'readingForm') {
    try {
      const verseStart = fd.get('verseStart') ? Number(fd.get('verseStart')) : null;
      const verseEnd = fd.get('verseEnd') ? Number(fd.get('verseEnd')) : null;
      if (verseEnd && !verseStart) return toast('Indica primero el versículo inicial.');
      if (verseEnd && verseStart && verseEnd < verseStart) return toast('El versículo final no puede ser menor que el inicial.');

      console.log('[Cimiento][Reading] environment', {
        isSecureContext: globalThis.isSecureContext,
        cryptoExists: !!globalThis.crypto,
        randomUUID: typeof globalThis.crypto?.randomUUID,
        getRandomValues: typeof globalThis.crypto?.getRandomValues,
        uidFallbackLoaded: uid.toString().includes('getRandomValues')
      });
      const id = uid('read');
      console.log('[Cimiento][Reading] uid', id);
      const reading = { id, date: fd.get('date'), book: fd.get('book'), chapter: Number(fd.get('chapter')), verseStart, verseEnd, createdAt: new Date().toISOString() };
      await put('readings', reading);
      const stored = await getOne('readings', id);
      if (!stored) throw new Error(`La lectura ${id} no aparece en IndexedDB después de put().`);
      console.log('[Cimiento][Reading] IndexedDB confirmed', stored);

      state.selectedDate = String(reading.date);
      await refresh('Lectura guardada.');
      const loaded = state.data.readings.some(item => item.id === id);
      console.log('[Cimiento][Reading] refreshed', { loaded, selectedDate: state.selectedDate, today: state.today });
      if (!loaded) throw new Error(`La lectura ${id} existe en IndexedDB, pero no en state.data después de refresh().`);
      console.log('[Cimiento][Reading] saved', reading);
    } catch (error) {
      console.error('[Cimiento][Reading] save failed', error);
      toast(`No se pudo guardar: ${error?.name ?? 'Error'} — ${error?.message ?? String(error)}`);
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => $('#toast').classList.add('hidden'), 15000);
    }
    return;
  }
  if (form.id === 'planForm') {
    const startBook = String(fd.get('startBook')), endBook = String(fd.get('endBook'));
    if (BIBLE_BOOKS.findIndex(b=>b.name===startBook) > BIBLE_BOOKS.findIndex(b=>b.name===endBook)) return toast('El libro final debe estar después del inicial.');
    await put('plans', { id: uid('plan'), name: String(fd.get('name')).trim(), startBook, endBook, chaptersPerDay: Number(fd.get('chaptersPerDay')), createdAt: new Date().toISOString() });
    return refresh('Plan creado.');
  }
  if (form.id === 'prayerRequestForm') {
    await put('prayerRequests', { id: uid('request'), date: fd.get('date'), request: String(fd.get('request')).trim(), respondedDate: null, createdAt: new Date().toISOString() });
    return refresh('Petición agregada.');
  }
  if (form.id === 'teachingForm') {
    await put('teachings', { id: uid('teaching'), date: fd.get('date'), source: String(fd.get('source')).trim(), content: String(fd.get('content')).trim(), createdAt: new Date().toISOString() });
    return refresh('Enseñanza guardada.');
  }
  if (form.id === 'highlightForm') {
    await put('highlights', { id: uid('highlight'), date: state.today, citation: String(fd.get('citation')).trim(), text: String(fd.get('text')).trim(), tags: String(fd.get('tags')).trim(), comment: String(fd.get('comment')).trim(), createdAt: new Date().toISOString() });
    return refresh('Versículo guardado.');
  }
  if (form.id === 'favoriteForm') {
    await put('favorites', { id: 'favorite', citation: String(fd.get('citation')).trim(), text: String(fd.get('text')).trim(), updatedAt: new Date().toISOString() });
    return refresh('Versículo favorito actualizado.');
  }
  if (form.id === 'memoryForm') {
    await put('memoryPassages', { id: 'current', citation: String(fd.get('citation')).trim(), startDate: fd.get('startDate'), updatedAt: new Date().toISOString() });
    return refresh('Pasaje de memorización actualizado.');
  }
  if (form.id === 'goalForm') {
    await put('goals', { id: uid('goal'), metric: fd.get('metric'), target: Number(fd.get('target')), createdAt: new Date().toISOString() });
    return refresh('Meta semanal agregada.');
  }
  if (form.id === 'weeklyReviewForm') {
    await put('weeklyReviews', { weekStart: fd.get('weekStart'), learned: String(fd.get('learned')).trim(), improve: String(fd.get('improve')).trim(), updatedAt: new Date().toISOString() });
    return refresh('Revisión semanal guardada.');
  }
  if (form.id === 'scheduleForm') {
    const schedule = {};
    for (let day = 0; day <= 6; day++) {
      const container = form.querySelector(`[data-schedule-day="${day}"]`);
      schedule[day] = [...container.querySelectorAll('.schedule-row')].map(row => ({
        id: row.querySelector('[data-field="id"]').value || uid('service'),
        time: row.querySelector('[data-field="time"]').value,
        label: row.querySelector('[data-field="label"]').value.trim(),
        enabled: true
      })).filter(s => s.time && s.label);
    }
    await put('settings', { key: 'churchSchedule', value: schedule });
    return refresh('Horario guardado.');
  }
}

async function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'go-reading') { state.selectedDate = $('#homeDate')?.value ?? state.selectedDate; navigate('reading'); renderReading(); return; }
  if (action === 'go-prayer') return navigate('prayer');
  if (action === 'go-church') return navigate('church');
  if (action === 'go-settings') return navigate('settings');
  if (action === 'quick-next-reading') {
    await put('readings', { id: uid('read'), date: state.selectedDate, book: button.dataset.book, chapter: Number(button.dataset.chapter), verseStart: null, verseEnd: null, createdAt: new Date().toISOString() });
    return refresh('Siguiente capítulo registrado.');
  }
  if (['quick-prayer-yes','prayer-quick-yes-page'].includes(action)) {
    const date = action === 'quick-prayer-yes' ? state.selectedDate : $('#prayerQuickDate').value;
    await put('prayerDays', { date, quick: true, updatedAt: new Date().toISOString() });
    return refresh('Oración rápida registrada.');
  }
  if (['quick-prayer-no','prayer-quick-no-page'].includes(action)) {
    const date = action === 'quick-prayer-no' ? state.selectedDate : $('#prayerQuickDate').value;
    await put('prayerDays', { date, quick: false, updatedAt: new Date().toISOString() });
    return refresh('Día marcado como no cumplido.');
  }
  if (action === 'church-all-attended' || action === 'church-all-missed') {
    const status = action === 'church-all-attended' ? 'attended' : 'missed';
    const services = scheduledServicesForDate(state.selectedDate, state.data.churchSchedule);
    for (const service of services) await saveAttendance(state.selectedDate, service.id, status);
    return refresh(status === 'attended' ? 'Asistencia registrada.' : 'Inasistencia registrada.');
  }
  if (['service-attended','service-missed','service-clear'].includes(action)) {
    const serviceId = button.dataset.service;
    if (action === 'service-clear') await deleteAttendance(state.selectedDate, serviceId);
    else await saveAttendance(state.selectedDate, serviceId, action === 'service-attended' ? 'attended' : 'missed');
    return refresh('Registro de culto actualizado.');
  }
  if (['recover-continue', 'recover-finish', 'recover-discard', 'start-prayer-timer', 'stop-prayer-timer'].includes(action)) {
    if (state.prayerActionPending) return;
    state.prayerActionPending = true;
    try {
      if (action === 'recover-continue') {
        // La sesión sigue abierta con el startEpochMs original.
        state.prayerRecoveryAcknowledged = true;
        return await refresh('Sesión retomada.');
      }
      if (action === 'recover-finish') {
        const session = state.data.prayerSessions.find(s => s.id === button.dataset.id);
        if (!session || session.completed) return;
        state.prayerRecoveryAcknowledged = true;
        const end = Date.now();
        const minutes = minutesBetweenEpoch(session.startEpochMs, end);
        await put('prayerSessions', { ...session, completed: true, endedAt: new Date(end).toISOString(), minutes, note: '' });
        return await refresh(`Sesión finalizada: ${minutes} min.`);
      }
      if (action === 'recover-discard') {
        const session = state.data.prayerSessions.find(s => s.id === button.dataset.id);
        if (!session || session.completed) return;
        state.prayerRecoveryAcknowledged = true;
        await remove('prayerSessions', session.id);
        return await refresh('Sesión descartada.');
      }
      if (action === 'start-prayer-timer') {
        if (activePrayerSession()) return toast('Ya hay una sesión de oración abierta. Resuélvela primero.');
        const now = Date.now();
        await put('prayerSessions', { id: uid('session'), date: limaToday(new Date(now)), startEpochMs: now, startedAt: new Date(now).toISOString(), completed: false, minutes: 0, note: '' });
        return await refresh('Cronómetro iniciado.');
      }
      const session = state.data.prayerSessions.find(s => s.id === button.dataset.id);
      if (!session || session.completed) return;
      const end = Date.now();
      const minutes = minutesBetweenEpoch(session.startEpochMs, end);
      await put('prayerSessions', { ...session, completed: true, endedAt: new Date(end).toISOString(), minutes, note: $('#prayerTimerNote')?.value.trim() ?? '' });
      return await refresh(`Sesión guardada: ${minutes} min.`);
    } finally {
      state.prayerActionPending = false;
    }
  }
  if (action === 'answer-request') {
    const req = state.data.prayerRequests.find(r => r.id === button.dataset.id);
    if (req) await put('prayerRequests', { ...req, respondedDate: state.today, updatedAt: new Date().toISOString() });
    return refresh('Petición marcada como respondida.');
  }
  if (action === 'delete') {
    await remove(button.dataset.store, button.dataset.id);
    return refresh('Registro eliminado.');
  }
  if (action === 'add-service') {
    const list = button.closest('.schedule-day').querySelector('.schedule-list');
    list.insertAdjacentHTML('beforeend', scheduleRow());
    return;
  }
  if (action === 'remove-service') { button.closest('.schedule-row').remove(); return; }
  if (action === 'export-backup') {
    await exportBackup(); await renderBackupBanner(); return toast('Respaldo exportado.');
  }
  if (action === 'request-persist') { await requestPersistentStorage(true); return; }
}

async function handleChange(event) {
  const target = event.target;
  if (target.id === 'homeDate' || target.id === 'churchDate') {
    state.selectedDate = target.value;
    renderHome(); renderChurch(); renderReading();
  }
  if (target.id === 'readingBook') {
    $('#readingChapter').innerHTML = chapterOptions(target.value);
  }
  if (target.id === 'planStartBook') {
    const startIndex = BIBLE_BOOKS.findIndex(b => b.name === target.value);
    const end = $('#planEndBook');
    if (BIBLE_BOOKS.findIndex(b => b.name === end.value) < startIndex) end.value = target.value;
  }
  if (target.id === 'importBackupInput' && target.files?.[0]) {
    const ok = confirm('Importar reemplazará todos los datos actuales de Cimiento. ¿Continuar?');
    if (!ok) { target.value = ''; return; }
    try { await importBackupFile(target.files[0]); await refresh('Respaldo importado correctamente.'); }
    catch (err) { console.error(err); toast(`No se pudo importar: ${err.message}`); }
    target.value = '';
  }
}

function handleInput(event) {
  if (event.target.id === 'teachingSearch') {
    const q = event.target.value.trim().toLowerCase();
    $$('#teachingList [data-teaching-search]').forEach(el => el.classList.toggle('hidden', !el.dataset.teachingSearch.includes(q)));
  }
}

async function renderBackupBanner() {
  const s = await backupStatus();
  const el = $('#backupBanner');
  if (s.state === 'overdue') {
    el.textContent = `Han pasado ${s.days} días desde el último respaldo. Conviene exportar un JSON en Ajustes.`;
    el.classList.remove('hidden');
  } else if (s.state === 'never' && state.data && Object.values(state.data).some(v => Array.isArray(v) && v.length)) {
    el.textContent = 'Aún no has creado un respaldo. Puedes exportarlo desde Ajustes.';
    el.classList.remove('hidden');
  } else el.classList.add('hidden');
}

async function requestPersistentStorage(showToast = false) {
  if (!navigator.storage?.persist) {
    if (showToast) toast('Este navegador no expone almacenamiento persistente.');
    return false;
  }
  const granted = await navigator.storage.persist();
  await renderStorageStatus();
  if (showToast) toast(granted ? 'Almacenamiento persistente concedido.' : 'El navegador no concedió persistencia.');
  return granted;
}

async function renderStorageStatus() {
  const el = $('#storageStatus');
  if (!el) return;
  if (!navigator.storage?.persisted) { el.textContent = 'Estado de persistencia no disponible en este navegador.'; return; }
  const persisted = await navigator.storage.persisted();
  el.textContent = persisted ? 'Almacenamiento persistente: activo.' : 'Almacenamiento persistente: aún no concedido por el navegador.';
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    $('#installButton').classList.remove('hidden');
  });
  $('#installButton').addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    $('#installButton').classList.add('hidden');
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker:', err));
}

function checkDayRollover() {
  setInterval(() => {
    const current = limaToday();
    if (current !== state.today) {
      state.today = current;
      state.selectedDate = current;
      refresh('Nuevo día en Lima.');
    }
  }, 30000);
}

async function init() {
  if (TOTAL_BIBLE_CHAPTERS !== 1189) throw new Error(`Catálogo bíblico inválido: ${TOTAL_BIBLE_CHAPTERS} capítulos.`);
  await openDb();
  await ensureDefaults();
  await loadData();
  renderAll();
  await renderBackupBanner();
  setupInstallPrompt();
  registerServiceWorker();
  requestPersistentStorage(false);
  checkDayRollover();

  document.addEventListener('submit', handleSubmit);
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);
  $$('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav)));
  $('#moreButton').addEventListener('click', () => {
    const menu = $('#moreMenu');
    menu.hidden = !menu.hidden;
    $('#moreButton').setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('#moreMenu, #moreButton')) closeMoreMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMoreMenu();
  });
  window.addEventListener('resize', closeMoreMenu);
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<main class="shell"><div class="card"><h1>Cimiento</h1><p>No se pudo iniciar la app.</p><pre>${esc(err.message)}</pre></div></main>`;
});
