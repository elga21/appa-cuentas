/* Google Sheets confirma el guardado; localStorage conserva cambios sin conexión. */
const TASKS_BUILD = "2026-10-22.1";
let tasks = JSON.parse(localStorage.getItem("app_tasks") || "[]");
let tasksSyncing = false;
let tasksSyncRequested = false;
let tasksBackendBuild = "sin verificar";
let tasksSyncMessage = "";
let tasksLastSync = "";
let editingTaskId = null;
function saveTasks() { localStorage.setItem("app_tasks", JSON.stringify(tasks)); }
function taskId() { return crypto.randomUUID ? crypto.randomUUID() : `task_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function taskToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: localStorage.getItem("app_task_timezone") || "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = type => parts.find(part => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function taskCycleKey(day, today) {
  const parts = today.split("-").map(Number);
  let year = parts[0], month = parts[1] - 1;
  let start = Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  if (parts[2] < start) { month--; if (month < 0) { year--; month = 11; } }
  start = Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(start).padStart(2, "0")}`;
}
function taskShiftDate(fecha, fromCycle, toCycle) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "") || !fromCycle || fromCycle === toCycle) return fecha;
  const from = fromCycle.split("-").map(Number), to = toCycle.split("-").map(Number), parts = fecha.split("-").map(Number);
  const months = (to[0] - from[0]) * 12 + to[1] - from[1];
  const target = new Date(Date.UTC(parts[0], parts[1] - 1 + months, 1));
  target.setUTCDate(Math.min(parts[2], new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()));
  return target.toISOString().slice(0, 10);
}
function currentTaskCycle() { return taskCycleKey(Number(localStorage.getItem("app_dia_ciclo")) || 1, taskToday()); }
function rollTaskCycles() {
  const cycle = currentTaskCycle();
  let changed = false;
  tasks.forEach(task => {
    task.fechaBase ||= task.fecha;
    task.cicloBase ||= task.ciclo || cycle;
    if (task.ciclo && task.ciclo !== cycle) {
      task.completada = false;
      task.fecha = taskShiftDate(task.fechaBase, task.cicloBase, cycle);
      changed = true;
    }
    if (task.ciclo !== cycle) { task.ciclo = cycle; changed = true; }
  });
  if (changed) saveTasks();
}
function taskHasPayment(task) {
  return ["Ingreso", "Gasto"].includes(task.tipo) && Number.isSafeInteger(task.valor) && task.valor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(task.fecha || "");
}
function resetTaskForm() {
  editingTaskId = null;
  document.getElementById("taskForm").reset();
  document.getElementById("taskDate").value = taskToday();
  document.getElementById("btnSaveTask").textContent = "Agregar tarea";
  document.getElementById("btnCancelTaskEdit").classList.add("hidden");
}
function editTask(task) {
  editingTaskId = task.id;
  document.getElementById("taskText").value = task.motivo !== undefined ? task.motivo : task.texto;
  document.getElementById("taskType").value = task.tipo || "Gasto";
  document.getElementById("taskCategory").value = task.subtipo || "Otros";
  document.getElementById("taskAmount").value = task.valor ? `$ ${task.valor.toLocaleString("es-CO")}` : "";
  document.getElementById("taskDate").value = task.fecha || taskToday();
  document.getElementById("btnSaveTask").textContent = "Guardar tarea";
  document.getElementById("btnCancelTaskEdit").classList.remove("hidden");
  document.getElementById("taskText").focus();
}
function initTasks() {
  const dialog = document.getElementById("tasksDialog");
  document.getElementById("taskCategory").innerHTML = document.getElementById("subtipo").innerHTML;
  resetTaskForm();
  document.getElementById("btnTasks").addEventListener("click", () => {
    renderTasks(); dialog.showModal(); document.getElementById("taskText").focus(); syncTasks();
  });
  document.getElementById("btnCloseTasks").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", resetTaskForm);
  document.getElementById("btnCancelTaskEdit").addEventListener("click", resetTaskForm);
  document.getElementById("btnSyncTasks").addEventListener("click", syncTasks);
  document.getElementById("taskAmount").addEventListener("input", event => {
    const value = event.target.value.replace(/\D/g, "");
    event.target.value = value ? `$ ${Number(value).toLocaleString("es-CO")}` : "";
  });
  document.getElementById("taskForm").addEventListener("submit", event => {
    event.preventDefault();
    const input = document.getElementById("taskText");
    const payment = { motivo: input.value.trim(), tipo: document.getElementById("taskType").value,
      subtipo: document.getElementById("taskCategory").value,
      valor: Number(document.getElementById("taskAmount").value.replace(/\D/g, "")), fecha: document.getElementById("taskDate").value };
    payment.texto = payment.motivo || `${payment.tipo} - ${payment.subtipo}`;
    if (!activePerfil) return;
    if (!taskHasPayment(payment)) { mostrarToast("Indica Gasto o Ingreso, un valor mayor a cero y la fecha."); return; }
    if (editingTaskId) {
      const current = tasks.find(task => task.id === editingTaskId && task.perfil === activePerfil && !task.eliminada);
      if (!current) return;
      updateTask(current.id, payment);
    } else {
      tasks.push({ ...payment, id: taskId(), perfil: activePerfil, completada: false,
        ciclo: currentTaskCycle(), checkEvents: [], eliminada: false, revision: taskId(), pending: true });
      saveTasks(); renderTasks(); syncTasks();
    }
    resetTaskForm(); input.focus();
  });
  window.addEventListener("online", syncTasks);
  window.addEventListener("offline", renderTasks);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && activePerfil) syncTasks();
  });
  setInterval(() => { if (activePerfil) syncTasks(); }, 10000);
}
function updateTask(id, changes) {
  rollTaskCycles();
  const task = tasks.find(item => item.id === id && item.perfil === activePerfil && !item.eliminada);
  if (!task) return;
  const wasCompleted = task.completada;
  Object.assign(task, changes, { pending: true, revision: taskId() });
  if (changes.fecha !== undefined) { task.fechaBase = changes.fecha; task.cicloBase = currentTaskCycle(); }
  if (changes.completada === true && !wasCompleted && taskHasPayment(task)) {
    task.checkEvents ||= [];
    task.checkEvents.push({ id: taskId(), ciclo: currentTaskCycle(), checkedAt: new Date().toISOString(),
      payment: { tipo: task.tipo, subtipo: task.subtipo || "Otros", valor: task.valor, fecha: task.fecha, motivo: task.motivo !== undefined ? task.motivo : task.texto } });
  }
  saveTasks(); renderTasks(); syncTasks();
}
function applyConfirmedTaskMovements(movements) {
  if (!Array.isArray(movements) || typeof transactions === "undefined") return;
  const valid = movements.filter(item => item && typeof item.id === "string" && item.id.startsWith("task_event_") &&
    ["Ingreso", "Gasto"].includes(item.tipo) && Number.isFinite(item.valor) && item.valor > 0 && item.fecha);
  const byId = new Map(transactions.map(item => [String(item.id || item.ID), item]));
  valid.forEach(item => byId.set(item.id, { ...item, synced: true }));
  transactions = Array.from(byId.values());
  saveLocalTransactions();
  renderAll();
}
function renderTasks() {
  rollTaskCycles();
  const list = document.getElementById("tasksList");
  if (!list) return;
  const visible = tasks.filter(task => task.perfil === activePerfil && !task.eliminada);
  document.getElementById("tasksProfile").textContent = `Perfil: ${activePerfil} · Ciclo desde ${currentTaskCycle()}`;
  document.getElementById("tasksCount").textContent = `${visible.filter(task => task.completada).length} de ${visible.length} completadas`;
  document.getElementById("tasksEmpty").hidden = visible.length > 0;
  const pending = tasks.filter(task => task.pending).length;
  const pendingChecks = tasks.reduce((total, task) => total + (task.checkEvents || []).length, 0);
  const version = document.getElementById("tasksVersion");
  if (version) version.textContent = `Interfaz ${TASKS_BUILD} · Backend ${tasksBackendBuild}`;
  document.getElementById("tasksSyncStatus").textContent = !navigator.onLine
    ? "Sin conexión: cambios pendientes en este dispositivo; aún no están confirmados en Sheets."
    : !localStorage.getItem("app_api_url")
      ? "Falta la URL /exec en Ajustes. Las tareas solo están en este dispositivo. Configúrala en cada dispositivo."
      : tasksSyncing ? "Sincronizando con Google Sheets…"
        : tasksSyncMessage || (pending ? `${pending} tarea(s) pendiente(s); ${pendingChecks} marcado(s) por registrar en el historial.`
          : tasksLastSync ? `Confirmado en Google Sheets a las ${tasksLastSync}.` : "Conexión con Google Sheets pendiente de verificar.");
  document.getElementById("btnSyncTasks").disabled = tasksSyncing || !navigator.onLine;
  // Conservar el foco cuando una consulta periódica actualiza la lista.
  const focusId = document.activeElement && list.contains(document.activeElement) ? document.activeElement.id : "";
  list.replaceChildren();
  visible.forEach(task => {
    const row = document.createElement("li"); row.className = `task-item${task.completada ? " task-completed" : ""}`;
    const label = document.createElement("label"); label.className = "task-label";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = task.completada;
    checkbox.id = `check-${task.id}`;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked && !taskHasPayment(task)) {
        checkbox.checked = false; editTask(task); mostrarToast("Completa el tipo, valor y fecha de esta tarea antes de marcarla."); return;
      }
      updateTask(task.id, { completada: checkbox.checked }); document.getElementById(checkbox.id)?.focus();
    });
    const description = document.createElement("div"); description.className = "task-description";
    const text = document.createElement("span"); text.textContent = task.texto;
    const details = document.createElement("small"); details.className = "task-details";
    details.textContent = taskHasPayment(task)
      ? `${task.tipo} · ${task.subtipo || "Otros"} · $ ${task.valor.toLocaleString("es-CO")} · ${task.fecha}${task.pending ? " · Pendiente de sincronizar" : ""}`
      : "Tarea anterior: edita para añadir tipo, valor y fecha.";
    description.append(text, details); label.append(checkbox, description);
    const tools = document.createElement("div"); tools.className = "task-tools";
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn-action task-delete";
    edit.id = `edit-${task.id}`; edit.textContent = "✏️"; edit.setAttribute("aria-label", `Editar tarea: ${task.texto}`);
    edit.addEventListener("click", () => editTask(task));
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn-action task-delete";
    remove.id = `delete-${task.id}`; remove.textContent = "🗑️"; remove.setAttribute("aria-label", `Eliminar tarea: ${task.texto}`);
    remove.addEventListener("click", () => {
      const note = " Sus movimientos anteriores se conservarán en el historial.";
      if (confirm(`¿Eliminar la tarea «${task.texto}»?${note}`)) {
        updateTask(task.id, { eliminada: true });
        if (editingTaskId === task.id) resetTaskForm();
        document.getElementById("taskText").focus();
      }
    });
    tools.append(edit, remove); row.append(label, tools); list.appendChild(row);
  });
  if (focusId) document.getElementById(focusId)?.focus();
}
async function tasksRequest(apiUrl, payload) {
  const url = new URL(apiUrl); url.searchParams.set("action", "listTasks");
  url.searchParams.set("cycleDay", localStorage.getItem("app_dia_ciclo") || "1");
  const options = payload ? {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ entity: "task", ...payload }), redirect: "follow"
  } : { redirect: "follow", cache: "no-store" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(payload ? apiUrl : url.toString(), { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Google Apps Script respondió HTTP ${response.status}. Revisa la URL /exec y los permisos.`);
    let json;
    try { json = await response.json(); } catch { throw new Error("La URL no devuelve JSON. Revisa la implementación web y el acceso de Apps Script."); }
    tasksBackendBuild = json.tasksBuild || (json.tasksApi ? `API ${json.tasksApi}` : "API anterior de movimientos");
    if (json.tasksApi !== 3) throw new Error("La URL /exec sigue usando una versión sin el historial de tareas. En Apps Script: Implementar → Administrar implementaciones → Editar → Nueva versión → Implementar. Subir archivos a GitHub o guardar el script no actualiza esa implementación.");
    if (json.status !== "success") throw new Error(json.message || "Google Sheets no confirmó el guardado.");
    if (payload && payload.task && json.id !== payload.task.id) throw new Error("Sheets no confirmó el identificador de la tarea.");
    return json;
  } finally { clearTimeout(timeout); }
}
async function syncTasks() {
  const apiUrl = localStorage.getItem("app_api_url");
  if (tasksSyncing) { tasksSyncRequested = true; return; }
  if (!apiUrl || !navigator.onLine) { renderTasks(); return; }
  tasksSyncRequested = false;
  let failed = false;
  tasksSyncing = true; tasksSyncMessage = ""; renderTasks();
  try {
    // Verificar compatibilidad antes de enviar POST a un backend antiguo.
    let initial = await tasksRequest(apiUrl);
    if (localStorage.getItem("app_api_url") !== apiUrl) return;
    if (localStorage.getItem("app_task_cycle_dirty") === "true") {
      const requestedDay = localStorage.getItem("app_dia_ciclo") || "1";
      await tasksRequest(apiUrl, { action: "CONFIG", cycleDay: Number(requestedDay) });
      if (localStorage.getItem("app_dia_ciclo") === requestedDay) localStorage.setItem("app_task_cycle_dirty", "false");
      initial = await tasksRequest(apiUrl);
    }
    if (localStorage.getItem("app_api_url") !== apiUrl) return;
    if (!Array.isArray(initial.tasks) || !Array.isArray(initial.deletedIds)) throw new Error("Respuesta de tareas incompleta.");
    if (initial.cycleDay) localStorage.setItem("app_dia_ciclo", String(initial.cycleDay));
    if (initial.timezone) localStorage.setItem("app_task_timezone", initial.timezone);
    rollTaskCycles();
    const deleted = new Set(initial.deletedIds);
    const known = new Set(initial.tasks.map(task => task.id));
    // Recuperar tareas locales antiguas que nunca llegaron a la hoja; respetar eliminaciones de otros dispositivos.
    tasks = tasks.filter(task => !deleted.has(task.id) || task.checkEvents?.length);
    tasks.forEach(task => { if (deleted.has(task.id)) { task.eliminada = true; task.pending = true; } });
    tasks.forEach(task => { if (!known.has(task.id)) { task.pending = true; task.revision ||= taskId(); } });
    saveTasks();
    for (const task of tasks.filter(item => item.pending).map(item => ({ ...item,
      checkEvents: (item.checkEvents || []).map(event => ({ ...event, payment: { ...event.payment } })) }))) {
      if (localStorage.getItem("app_api_url") !== apiUrl) return;
      const result = await tasksRequest(apiUrl, { action: task.eliminada ? "DELETE" : "UPSERT", task });
      const sentIds = (task.checkEvents || []).map(event => event.id);
      if (!Array.isArray(result.ackEvents) || sentIds.some(id => !result.ackEvents.includes(id))) throw new Error("Sheets no confirmó todos los marcados; se conservarán para reintentar.");
      // El servidor ya confirmó el dinero: reflejarlo aunque falle la descarga siguiente.
      applyConfirmedTaskMovements(result.movements);
      const current = tasks.find(item => item.id === task.id);
      if (current) current.checkEvents = (current.checkEvents || []).filter(event => !result.ackEvents.includes(event.id));
      if (current && current.revision === task.revision) {
        current.pending = false;
        if (current.eliminada) tasks = tasks.filter(item => item.id !== current.id);
        saveTasks();
      }
      saveTasks();
    }
    const json = await tasksRequest(apiUrl);
    if (!Array.isArray(json.tasks) || !Array.isArray(json.deletedIds)) throw new Error("Respuesta de tareas incompleta.");
    if (localStorage.getItem("app_api_url") !== apiUrl) return;
    const removed = new Set(json.deletedIds);
    const pending = tasks.filter(item => item.pending && (!removed.has(item.id) || item.checkEvents?.length));
    pending.forEach(item => { if (removed.has(item.id)) item.eliminada = true; });
    const pendingIds = new Set(pending.map(item => item.id));
    tasks = [...json.tasks.filter(item => !pendingIds.has(item.id)).map(item => ({ ...item, checkEvents: [], pending: false })), ...pending];
    saveTasks();
    // Descubrir en el selector los perfiles que tienen tareas aunque no tengan movimientos.
    if (typeof profilesList !== "undefined") {
      tasks.forEach(task => { if (!profilesList.includes(task.perfil)) profilesList.push(task.perfil); });
      localStorage.setItem("app_profiles", JSON.stringify(profilesList));
    }
    tasksLastSync = new Date().toLocaleTimeString("es-CO");
    if (typeof fetchCloudTransactions === "function") await fetchCloudTransactions();
  } catch (error) {
    failed = true;
    console.error("Sincronización de tareas:", error);
    tasksSyncMessage = `${error.message} Los cambios locales se conservan y se reintentarán. Revisa Ajustes y usa la misma URL /exec en ambos dispositivos.`;
  } finally {
    tasksSyncing = false; renderTasks();
    // Enviar enseguida los marcados hechos durante una petición; no esperar al temporizador.
    if (!failed && tasksSyncRequested && navigator.onLine) setTimeout(syncTasks, 0);
  }
}
