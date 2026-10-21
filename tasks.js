/* Google Sheets confirma el guardado; localStorage conserva cambios sin conexión. */
let tasks = JSON.parse(localStorage.getItem("app_tasks") || "[]");
let tasksSyncing = false;
let tasksSyncMessage = "";
let tasksLastSync = "";
let editingTaskId = null;
function saveTasks() { localStorage.setItem("app_tasks", JSON.stringify(tasks)); }
function taskId() { return crypto.randomUUID ? crypto.randomUUID() : `task_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function taskToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  document.getElementById("taskText").value = task.texto;
  document.getElementById("taskType").value = task.tipo || "Gasto";
  document.getElementById("taskAmount").value = task.valor ? `$ ${task.valor.toLocaleString("es-CO")}` : "";
  document.getElementById("taskDate").value = task.fecha || taskToday();
  document.getElementById("btnSaveTask").textContent = "Guardar tarea";
  document.getElementById("btnCancelTaskEdit").classList.remove("hidden");
  document.getElementById("taskText").focus();
}
function initTasks() {
  const dialog = document.getElementById("tasksDialog");
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
    const payment = { texto: input.value.trim(), tipo: document.getElementById("taskType").value,
      valor: Number(document.getElementById("taskAmount").value.replace(/\D/g, "")), fecha: document.getElementById("taskDate").value };
    if (!activePerfil || !payment.texto) return;
    if (!taskHasPayment(payment)) { mostrarToast("Indica Gasto o Ingreso, un valor mayor a cero y la fecha."); return; }
    if (editingTaskId) {
      const current = tasks.find(task => task.id === editingTaskId && task.perfil === activePerfil && !task.eliminada);
      if (!current || (current.completada && taskHasPayment(current))) {
        mostrarToast("Desmarca la tarea antes de editar su movimiento."); return;
      }
      updateTask(current.id, payment);
    } else {
      tasks.push({ ...payment, id: taskId(), perfil: activePerfil, completada: false,
        eliminada: false, revision: taskId(), pending: true });
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
  const task = tasks.find(item => item.id === id && item.perfil === activePerfil && !item.eliminada);
  if (!task) return;
  Object.assign(task, changes, { pending: true, revision: taskId() });
  saveTasks(); renderTasks(); syncTasks();
}
function renderTasks() {
  const list = document.getElementById("tasksList");
  if (!list) return;
  const visible = tasks.filter(task => task.perfil === activePerfil && !task.eliminada);
  document.getElementById("tasksProfile").textContent = `Perfil: ${activePerfil}`;
  document.getElementById("tasksCount").textContent = `${visible.filter(task => task.completada).length} de ${visible.length} completadas`;
  document.getElementById("tasksEmpty").hidden = visible.length > 0;
  const pending = tasks.filter(task => task.pending).length;
  document.getElementById("tasksSyncStatus").textContent = !navigator.onLine
    ? "Sin conexión: cambios pendientes en este dispositivo; aún no están confirmados en Sheets."
    : !localStorage.getItem("app_api_url")
      ? "Falta la URL /exec en Ajustes. Las tareas solo están en este dispositivo. Configúrala en cada dispositivo."
      : tasksSyncing ? "Sincronizando con Google Sheets…"
        : tasksSyncMessage || (pending ? `${pending} cambio(s) pendiente(s) de enviar a Sheets.`
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
      if (!checkbox.checked && taskHasPayment(task) && !confirm("¿Desmarcar y retirar de Sheets el movimiento automático de esta tarea?")) {
        checkbox.checked = true; return;
      }
      updateTask(task.id, { completada: checkbox.checked }); document.getElementById(checkbox.id)?.focus();
    });
    const description = document.createElement("div"); description.className = "task-description";
    const text = document.createElement("span"); text.textContent = task.texto;
    const details = document.createElement("small"); details.className = "task-details";
    details.textContent = taskHasPayment(task)
      ? `${task.tipo} · $ ${task.valor.toLocaleString("es-CO")} · ${task.fecha}${task.pending ? " · Pendiente de sincronizar" : ""}`
      : "Tarea anterior: edita para añadir tipo, valor y fecha.";
    description.append(text, details); label.append(checkbox, description);
    const tools = document.createElement("div"); tools.className = "task-tools";
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn-action task-delete";
    edit.id = `edit-${task.id}`; edit.textContent = "✏️"; edit.setAttribute("aria-label", `Editar tarea: ${task.texto}`);
    edit.disabled = task.completada && taskHasPayment(task); edit.addEventListener("click", () => editTask(task));
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn-action task-delete";
    remove.id = `delete-${task.id}`; remove.textContent = "🗑️"; remove.setAttribute("aria-label", `Eliminar tarea: ${task.texto}`);
    remove.addEventListener("click", () => {
      const note = task.completada ? " Su movimiento se conservará en el historial." : "";
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
    if (json.tasksApi !== 2) throw new Error("El backend de tareas está desactualizado. Publica una NUEVA VERSIÓN de google-apps-script.js en Apps Script.");
    if (json.status !== "success") throw new Error(json.message || "Google Sheets no confirmó el guardado.");
    if (payload && json.id !== payload.task.id) throw new Error("Sheets no confirmó el identificador de la tarea.");
    return json;
  } finally { clearTimeout(timeout); }
}
async function syncTasks() {
  const apiUrl = localStorage.getItem("app_api_url");
  if (tasksSyncing || !apiUrl || !navigator.onLine) { renderTasks(); return; }
  tasksSyncing = true; tasksSyncMessage = ""; renderTasks();
  try {
    // Verificar compatibilidad antes de enviar POST a un backend antiguo.
    const initial = await tasksRequest(apiUrl);
    if (localStorage.getItem("app_api_url") !== apiUrl) return;
    if (!Array.isArray(initial.tasks) || !Array.isArray(initial.deletedIds)) throw new Error("Respuesta de tareas incompleta.");
    const deleted = new Set(initial.deletedIds);
    const known = new Set(initial.tasks.map(task => task.id));
    // Recuperar tareas locales antiguas que nunca llegaron a la hoja; respetar eliminaciones de otros dispositivos.
    tasks = tasks.filter(task => !deleted.has(task.id));
    tasks.forEach(task => { if (!known.has(task.id)) { task.pending = true; task.revision ||= taskId(); } });
    saveTasks();
    for (const task of tasks.filter(item => item.pending).map(item => ({ ...item }))) {
      if (localStorage.getItem("app_api_url") !== apiUrl) return;
      await tasksRequest(apiUrl, { action: task.eliminada ? "DELETE" : "UPSERT", task });
      const current = tasks.find(item => item.id === task.id);
      if (current && current.revision === task.revision) {
        current.pending = false;
        if (current.eliminada) tasks = tasks.filter(item => item.id !== current.id);
        saveTasks();
      }
    }
    const json = await tasksRequest(apiUrl);
    if (!Array.isArray(json.tasks) || !Array.isArray(json.deletedIds)) throw new Error("Respuesta de tareas incompleta.");
    if (localStorage.getItem("app_api_url") !== apiUrl) return;
    const removed = new Set(json.deletedIds);
    const pending = tasks.filter(item => item.pending && !removed.has(item.id));
    const pendingIds = new Set(pending.map(item => item.id));
    tasks = [...json.tasks.filter(item => !pendingIds.has(item.id)).map(item => ({ ...item, pending: false })), ...pending];
    saveTasks();
    // Descubrir en el selector los perfiles que tienen tareas aunque no tengan movimientos.
    if (typeof profilesList !== "undefined") {
      tasks.forEach(task => { if (!profilesList.includes(task.perfil)) profilesList.push(task.perfil); });
      localStorage.setItem("app_profiles", JSON.stringify(profilesList));
    }
    tasksLastSync = new Date().toLocaleTimeString("es-CO");
    if (typeof fetchCloudTransactions === "function") await fetchCloudTransactions();
  } catch (error) {
    console.error("Sincronización de tareas:", error);
    tasksSyncMessage = `${error.message} Los cambios locales se conservan y se reintentarán. Revisa Ajustes y usa la misma URL /exec en ambos dispositivos.`;
  } finally { tasksSyncing = false; renderTasks(); }
}
