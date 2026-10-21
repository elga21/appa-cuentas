/* Tareas por perfil con cambios pendientes hasta recibir confirmación de Google. */
let tasks = JSON.parse(localStorage.getItem("app_tasks") || "[]");
let tasksSyncing = false;
let tasksSyncMessage = "";
function saveTasks() { localStorage.setItem("app_tasks", JSON.stringify(tasks)); }
function taskId() { return crypto.randomUUID ? crypto.randomUUID() : `task_${Date.now()}_${Math.random().toString(36).slice(2)}`; }

function initTasks() {
  const dialog = document.getElementById("tasksDialog");
  document.getElementById("btnTasks").addEventListener("click", () => {
    renderTasks(); dialog.showModal(); document.getElementById("taskText").focus(); syncTasks();
  });
  document.getElementById("btnCloseTasks").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => document.getElementById("taskForm").reset());
  document.getElementById("btnSyncTasks").addEventListener("click", syncTasks);
  document.getElementById("taskForm").addEventListener("submit", event => {
    event.preventDefault();
    const input = document.getElementById("taskText");
    const text = input.value.trim();
    if (!activePerfil || !text) return;
    tasks.push({ id: taskId(), perfil: activePerfil, texto: text, completada: false,
      eliminada: false, revision: taskId(), pending: true });
    saveTasks(); input.value = ""; renderTasks(); input.focus(); syncTasks();
  });
  window.addEventListener("online", syncTasks);
  window.addEventListener("offline", renderTasks);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && activePerfil) syncTasks();
  });
  setInterval(() => { if (activePerfil) syncTasks(); }, 15000);
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
    ? "Sin conexión. Tus cambios quedan guardados en este dispositivo."
    : !localStorage.getItem("app_api_url")
      ? "Guardado en este dispositivo. Configura Google Apps Script en Ajustes para sincronizar."
      : tasksSyncing ? "Sincronizando tareas…"
        : tasksSyncMessage || (pending ? `${pending} cambio(s) pendiente(s) de sincronizar.` : "Tareas sincronizadas con Google Sheets.");
  document.getElementById("btnSyncTasks").disabled = tasksSyncing || !navigator.onLine;
  list.replaceChildren();
  visible.forEach(task => {
    const row = document.createElement("li");
    row.className = `task-item${task.completada ? " task-completed" : ""}`;
    const label = document.createElement("label"); label.className = "task-label";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = task.completada;
    checkbox.id = `check-${task.id}`;
    checkbox.addEventListener("change", () => {
      updateTask(task.id, { completada: checkbox.checked });
      document.getElementById(`check-${task.id}`)?.focus();
    });
    const text = document.createElement("span"); text.textContent = task.texto;
    label.append(checkbox, text);
    const remove = document.createElement("button"); remove.type = "button";
    remove.className = "btn-action task-delete"; remove.textContent = "🗑️";
    remove.setAttribute("aria-label", `Eliminar tarea: ${task.texto}`);
    remove.addEventListener("click", () => {
      if (confirm(`¿Eliminar la tarea «${task.texto}»?`)) {
        updateTask(task.id, { eliminada: true }); document.getElementById("taskText").focus();
      }
    });
    row.append(label, remove); list.appendChild(row);
  });
}

async function tasksRequest(apiUrl, payload) {
  const url = new URL(apiUrl); url.searchParams.set("action", "listTasks");
  const options = payload ? {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ entity: "task", ...payload }), redirect: "follow"
  } : { redirect: "follow", cache: "no-store" };
  const response = await fetch(payload ? apiUrl : url.toString(), { ...options, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("No se pudo conectar con Google Sheets.");
  const json = await response.json();
  if (json.tasksApi !== 1) throw new Error("Actualiza e implementa google-apps-script.js para sincronizar las tareas.");
  if (json.status !== "success") throw new Error(json.message || "Google Sheets no confirmó el guardado.");
  return json;
}

async function syncTasks() {
  const apiUrl = localStorage.getItem("app_api_url");
  if (tasksSyncing || !apiUrl || !navigator.onLine) { renderTasks(); return; }
  tasksSyncing = true; tasksSyncMessage = ""; renderTasks();
  try {
    // Un backend antiguo guarda cualquier POST como movimiento: verificar primero la versión.
    await tasksRequest(apiUrl);
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
    if (!Array.isArray(json.tasks)) throw new Error("Respuesta de tareas inválida.");
    if (localStorage.getItem("app_api_url") !== apiUrl) return;
    // Conservar ediciones realizadas mientras estaba en curso la petición.
    const pending = tasks.filter(item => item.pending);
    const pendingIds = new Set(pending.map(item => item.id));
    tasks = [...json.tasks.filter(item => !pendingIds.has(item.id)).map(item => ({ ...item, pending: false })), ...pending];
    saveTasks();
  } catch (error) {
    console.error("Sincronización de tareas:", error);
    tasksSyncMessage = `${error.message} Tus cambios locales se conservan; se reintentará automáticamente.`;
  } finally { tasksSyncing = false; renderTasks(); }
}
