/* ==========================================================================
   SISTEMA DE GESTIÓN FINANCIERA PERSONAL CON NUBE Y SOPORTE OFFLINE
   ========================================================================== */

// --- CONFIGURACIÓN Y ESTADO GLOBAL ---
const PIN_CORRECTO = "0308";
let transactions = JSON.parse(localStorage.getItem("app_transactions")) || [];
let profilesList = JSON.parse(localStorage.getItem("app_profiles")) || [];
let activePerfil = "";
let currentFilter = "Todos";
let periodFilter = "actual";
let editingTxId = null;
let donutChartInstance = null;
let monthlyChartInstance = null;
let syncInterval = null;
let cloudLoadError = "";
let submittingTransaction = false;
let transactionRevision = 0;
let cloudReadSequence = 0;
const transactionFlights = new Map();
let pendingActions = JSON.parse(localStorage.getItem("app_pending_actions") || "[]");
transactions.filter(tx => !tx.synced).forEach(tx => {
  if (!pendingActions.some(item => item.id === tx.id)) pendingActions.push(tx);
});
function savePendingActions() { localStorage.setItem("app_pending_actions", JSON.stringify(pendingActions)); }
function queueTransaction(tx) {
  pendingActions = pendingActions.filter(item => item.id !== tx.id);
  pendingActions.push(tx);
  savePendingActions();
}
async function syncPendingTransactions() {
  for (const tx of [...pendingActions]) await syncTransactionWithAction(tx);
}

// --- INICIALIZACIÓN DE LA APLICACIÓN ---
document.addEventListener("DOMContentLoaded", () => {
  initPIN();
  initForm();
  initSettings();
  initTableFilters();
  initSheetRedirect();
  initOfflineSync();
  if (typeof initTasks === "function") initTasks();
});

/* ==========================================================================
   1. GESTIÓN DE PERFILES Y AUTENTICACIÓN (PIN)
   ========================================================================== */
function initPIN() {
  const btnUnlock = document.getElementById("btnUnlock");
  const pinInput = document.getElementById("pinInput");
  const pinError = document.getElementById("pinError");
  const perfilSelect = document.getElementById("pinPerfilSelect");
  const nuevoPerfilGroup = document.getElementById("nuevoPerfilGroup");
  const nuevoPerfilInput = document.getElementById("nuevoPerfilInput");
  const btnLogout = document.getElementById("btnLogout");

  const updateProfilesDropdown = () => {
    if (!perfilSelect) return;
    perfilSelect.innerHTML = "";

    if (profilesList.length > 0) {
      profilesList.forEach(p => {
        const option = document.createElement("option");
        option.value = p;
        option.innerText = p;
        perfilSelect.appendChild(option);
      });
    }

    const newOption = document.createElement("option");
    newOption.value = "__NEW__";
    newOption.innerText = "+ Registrar Nuevo Perfil";
    perfilSelect.appendChild(newOption);

    if (profilesList.length === 0) {
      perfilSelect.value = "__NEW__";
      if (nuevoPerfilGroup) nuevoPerfilGroup.classList.remove("hidden");
    } else {
      if (nuevoPerfilGroup) nuevoPerfilGroup.classList.add("hidden");
    }
  };

  if (perfilSelect) {
    perfilSelect.addEventListener("change", (e) => {
      if (e.target.value === "__NEW__") {
        if (nuevoPerfilGroup) nuevoPerfilGroup.classList.remove("hidden");
        if (nuevoPerfilInput) {
          nuevoPerfilInput.value = "";
          nuevoPerfilInput.focus();
        }
      } else {
        if (nuevoPerfilGroup) nuevoPerfilGroup.classList.add("hidden");
      }
    });
  }

  updateProfilesDropdown();

  const verifyPIN = async () => {
    let perfilDestino = "";

    if (perfilSelect && perfilSelect.value === "__NEW__") {
      perfilDestino = nuevoPerfilInput ? nuevoPerfilInput.value.trim() : "";
    } else if (perfilSelect) {
      perfilDestino = perfilSelect.value;
    }

    if (!perfilDestino) {
      if (pinError) {
        pinError.innerText = "Ingresa o selecciona un nombre de perfil.";
        pinError.classList.remove("hidden");
      }
      return;
    }

    if (pinInput && pinInput.value === PIN_CORRECTO) {
      activePerfil = perfilDestino;

      if (!profilesList.includes(activePerfil)) {
        profilesList.push(activePerfil);
        localStorage.setItem("app_profiles", JSON.stringify(profilesList));
      }

      const badge = document.getElementById("currentPerfilBadge");
      if (badge) badge.innerText = `Perfil: ${activePerfil}`;

      const pinScreen = document.getElementById("pinScreen");
      const appContent = document.getElementById("appContent");

      if (pinScreen) pinScreen.classList.add("hidden");
      if (appContent) appContent.classList.remove("hidden");

      pinInput.value = "";
      if (nuevoPerfilInput) nuevoPerfilInput.value = "";
      if (pinError) pinError.classList.add("hidden");

      updateProfilesDropdown();
      renderAll();

      if (typeof renderTasks === "function") renderTasks();
      if (typeof syncTasks === "function") syncTasks();

      await syncPendingTransactions();
      await fetchCloudTransactions();

      if (syncInterval) clearInterval(syncInterval);
      syncInterval = setInterval(() => syncPendingTransactions().then(fetchCloudTransactions), 10000);
    } else {
      if (pinError) {
        pinError.innerText = "PIN incorrecto. Intenta nuevamente.";
        pinError.classList.remove("hidden");
      }
      if (pinInput) pinInput.value = "";
    }
  };

  if (btnUnlock) btnUnlock.addEventListener("click", verifyPIN);
  if (pinInput) {
    pinInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") verifyPIN();
    });
  }
  if (nuevoPerfilInput) {
    nuevoPerfilInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") verifyPIN();
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      if (syncInterval) clearInterval(syncInterval);
      document.getElementById("tasksDialog")?.close();
      activePerfil = "";
      const appContent = document.getElementById("appContent");
      const pinScreen = document.getElementById("pinScreen");
      if (appContent) appContent.classList.add("hidden");
      if (pinScreen) pinScreen.classList.remove("hidden");
      updateProfilesDropdown();
    });
  }
}

/* ==========================================================================
   2. SINCRONIZACIÓN CON GOOGLE SHEETS (NUBE)
   ========================================================================== */
async function fetchCloudTransactions() {
  const apiUrl = localStorage.getItem("app_api_url");
  if (!apiUrl || !navigator.onLine) return;

  const sequence = ++cloudReadSequence;
  const revision = transactionRevision;
  try {
    const res = await fetch(apiUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store"
    });

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const json = await res.json();
    if (sequence !== cloudReadSequence || revision !== transactionRevision || localStorage.getItem("app_api_url") !== apiUrl) return;
    if (json && json.status === "error") throw new Error(json.message || "Google Sheets no pudo leer los movimientos.");
    let cloudData = null;

    if (Array.isArray(json)) {
      cloudData = json;
    } else if (json && Array.isArray(json.data)) {
      cloudData = json.data;
    } else if (json && Array.isArray(json.transactions)) {
      cloudData = json.transactions;
    }

    if (cloudData === null) throw new Error("La URL configurada no devuelve una lista de movimientos. Revisa que sea la URL /exec de Apps Script.");
    if (cloudData !== null) {
      setCloudLoadError("");
      const normalizedCloudData = cloudData.map((item, index) => {
        return {
          id: item.id || item.ID || `cloud_${index}`,
          fecha: item.fecha || item.Fecha || item.FECHA || item.fechaTransaccion || "",
          perfil: item.perfil || item.Perfil || item.PERFIL || "General",
          tipo: item.tipo || item.Tipo || item.TIPO || "",
          subtipo: item.subtipo || item.Subtipo || item.SUBTIPO || item.categoria || item.Categoria || "",
          motivo: item.motivo || item.Motivo || item.MOTIVO || item.descripcion || item.Descripcion || "",
          valor: parseTxValue(item),
          synced: true
        };
      });

      normalizedCloudData.forEach(item => {
        if (item.perfil && !profilesList.includes(item.perfil)) {
          profilesList.push(item.perfil);
        }
      });
      localStorage.setItem("app_profiles", JSON.stringify(profilesList));

      // Una lectura no confirma escrituras ni reemplaza ediciones pendientes.
      const pendingById = new Map(pendingActions.map(tx => [String(tx.id), tx]));
      transactions = [...normalizedCloudData.filter(tx => !pendingById.has(String(tx.id))),
        ...pendingActions.filter(tx => tx.action !== "DELETE")];

      saveLocalTransactions();
      renderAll();
    }
  } catch (err) {
    console.error("Error al obtener datos de Google Sheets:", err);
    setCloudLoadError(err.message || "No se pudo conectar con Google Sheets.");
  }
}

function setCloudLoadError(message) {
  cloudLoadError = message;
  const error = document.getElementById("cloudConnectionError");
  if (error) { error.textContent = message; error.classList.toggle("hidden", !message); }
  updateSyncBadge();
}

async function syncTransactionWithAction(tx) {
  if (transactionFlights.has(tx.id)) return transactionFlights.get(tx.id);
  if (!pendingActions.some(item => item === tx)) queueTransaction(tx);
  const flight = sendTransaction(tx);
  transactionFlights.set(tx.id, flight);
  try { return await flight; }
  finally { transactionFlights.delete(tx.id); }
}

async function sendTransaction(tx) {
  const apiUrl = localStorage.getItem("app_api_url");
  if (!apiUrl || !navigator.onLine) {
    mostrarToast("Guardado en local");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    // No enviar escrituras a versiones que no garantizan IDs idempotentes.
    const checkUrl = new URL(apiUrl);
    checkUrl.searchParams.set("action", "capabilities");
    const check = await fetch(checkUrl.toString(), { cache: "no-store", redirect: "follow", signal: controller.signal });
    const capabilities = await check.json();
    if (!check.ok || capabilities.financeApi !== 1) throw new Error("Actualiza la implementación de Apps Script: el servidor no confirma la protección contra duplicados.");
    const response = await fetch(apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(tx)
    });
    if (!response.ok) throw new Error(`Google Sheets respondió HTTP ${response.status}`);
    const confirmation = await response.json();
    if (confirmation.status !== "success" || String(confirmation.id) !== String(tx.id)) throw new Error(confirmation.message || "Sheets no confirmó el movimiento; se conserva pendiente.");

    tx.synced = true;
    pendingActions = pendingActions.filter(item => item !== tx);
    savePendingActions();
    const current = transactions.find(item => item.id === tx.id);
    if (current && !pendingActions.some(item => item.id === tx.id)) current.synced = true;
    saveLocalTransactions();
    updateSyncBadge();
    mostrarToast(tx.action === "DELETE" ? "Eliminado en Google Sheets" : "Sincronizado con Sheets");

    setTimeout(fetchCloudTransactions, 1000);
  } catch (err) {
    console.error("Error al sincronizar:", err);
    setCloudLoadError(err.message);
    mostrarToast("Guardado en este dispositivo; pendiente de confirmar en Sheets.");
  } finally { clearTimeout(timeout); }
}

function initSheetRedirect() {
  const btnOpenSheet = document.getElementById("btnOpenSheet");
  if (!btnOpenSheet) return;
  btnOpenSheet.addEventListener("click", () => {
    const sheetUrl = localStorage.getItem("app_sheet_url");
    if (sheetUrl) {
      window.open(sheetUrl, "_blank");
    } else {
      mostrarToast("Configura la URL de Google Sheets en Ajustes ⚙️");
    }
  });
}

/* ==========================================================================
   3. FORMULARIO Y EDICIÓN/ELIMINACIÓN DE REGISTROS
   ========================================================================== */
function initForm() {
  const valorInput = document.getElementById("valor");
  const fechaInput = document.getElementById("fecha");

  if (fechaInput) {
    fechaInput.value = new Date().toISOString().split('T')[0];
  }

  if (valorInput) {
    valorInput.addEventListener("input", (e) => {
      let rawValue = e.target.value.replace(/\D/g, "");
      if (!rawValue) {
        e.target.value = "";
        return;
      }
      let formatted = parseInt(rawValue, 10).toLocaleString("es-CO");
      e.target.value = `$ ${formatted}`;
    });
  }

  const txForm = document.getElementById("txForm");
  if (txForm) {
    txForm.addEventListener("submit", handleFormSubmit);
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();
  if (submittingTransaction || !activePerfil) return;

  const btnGuardar = document.getElementById("btnGuardar");
  const valorRaw = document.getElementById("valor").value.replace(/\D/g, "");

  if (!valorRaw || parseInt(valorRaw, 10) <= 0) {
    mostrarToast("Ingresa un monto válido");
    return;
  }

  submittingTransaction = true;
  if (btnGuardar) btnGuardar.disabled = true;
  try {

    const txId = editingTxId || ("tx_" + crypto.randomUUID());
    const actionType = editingTxId ? "UPDATE" : "CREATE";

    const txData = {
      id: txId,
      fecha: document.getElementById("fecha").value,
      perfil: activePerfil,
      tipo: document.getElementById("tipo").value,
      subtipo: document.getElementById("subtipo").value,
      motivo: document.getElementById("motivo").value.trim(),
      valor: parseFloat(valorRaw),
      action: actionType,
      synced: false
    };

    if (editingTxId) {
      const idx = transactions.findIndex(t => (t.id || t.ID) === editingTxId);
      if (idx !== -1) transactions[idx] = txData;
    } else {
      transactions.unshift(txData);
    }

    queueTransaction(txData);
    saveLocalTransactions();
    resetFormState();
    try { renderAll(); } catch (error) { console.error("Error al actualizar la vista:", error); }

    await syncTransactionWithAction(txData);
  } finally {
    submittingTransaction = false;
    if (btnGuardar) btnGuardar.disabled = false;
  }
}

function editTransaction(id) {
  const tx = transactions.find(t => (t.id || t.ID) === id);
  if (!tx) return;

  editingTxId = id;
  const fechaVal = tx.fecha || tx.Fecha || tx.FECHA || "";
  document.getElementById("fecha").value = String(fechaVal).split("T")[0];
  document.getElementById("tipo").value = tx.tipo || tx.Tipo || tx.TIPO || "";
  document.getElementById("subtipo").value = tx.subtipo || tx.Subtipo || tx.SUBTIPO || tx.categoria || "";
  document.getElementById("motivo").value = tx.motivo || tx.Motivo || tx.MOTIVO || tx.descripcion || "";

  let val = parseTxValue(tx);
  document.getElementById("valor").value = `$ ${val.toLocaleString('es-CO')}`;

  const btnGuardar = document.getElementById("btnGuardar");
  if (btnGuardar) btnGuardar.querySelector("span").innerText = "Actualizar Cambios";

  if (!document.getElementById("btnCancelEdit") && btnGuardar) {
    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.id = "btnCancelEdit";
    btnCancel.className = "btn btn-secondary full-width btn-cancel-edit";
    btnCancel.innerText = "Cancelar Edición";
    btnCancel.onclick = resetFormState;
    btnGuardar.parentNode.appendChild(btnCancel);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteTransaction(id) {
  if (!confirm("¿Estás seguro de que deseas eliminar este registro?")) return;

  const txIndex = transactions.findIndex(t => (t.id || t.ID) === id);
  if (txIndex === -1) return;

  const txToDelete = transactions[txIndex];
  if (transactionFlights.has(txToDelete.id)) { mostrarToast("Espera a que termine el envío de este movimiento."); return; }
  txToDelete.action = "DELETE";
  txToDelete.synced = false;
  queueTransaction(txToDelete);
  transactions.splice(txIndex, 1);
  saveLocalTransactions();
  renderAll();

  txToDelete.action = "DELETE";
  await syncTransactionWithAction(txToDelete);
}

function resetFormState() {
  editingTxId = null;
  const txForm = document.getElementById("txForm");
  if (txForm) txForm.reset();

  const fechaInput = document.getElementById("fecha");
  if (fechaInput) fechaInput.value = new Date().toISOString().split('T')[0];

  const btnGuardar = document.getElementById("btnGuardar");
  if (btnGuardar) btnGuardar.querySelector("span").innerText = "Guardar Registro";

  const btnCancel = document.getElementById("btnCancelEdit");
  if (btnCancel) btnCancel.remove();
}

/* ==========================================================================
   4. CÁLCULOS, CICLOS Y RENDERIZADO GENERAL
   ========================================================================== */
function getCycleDates() {
  const startDay = parseInt(localStorage.getItem("app_dia_ciclo") || 1, 10);
  const now = new Date();
  const parts = typeof taskToday === "function" ? taskToday().split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  let year = parts[0], month = parts[1] - 1;
  let anchor = Math.min(startDay, new Date(year, month + 1, 0).getDate());
  if (parts[2] < anchor) { month--; if (month < 0) { year--; month = 11; } }
  anchor = Math.min(startDay, new Date(year, month + 1, 0).getDate());
  const startDate = new Date(year, month, anchor);
  const nextMonth = new Date(year, month + 1, 1);
  const nextDay = Math.min(startDay, new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate());
  const endDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), nextDay);
  endDate.setMilliseconds(-1);
  return { startDate, endDate };
}

function parseTxValue(tx) {
  let valRaw = tx.valor !== undefined ? tx.valor : (tx.monto !== undefined ? tx.monto : (tx.Valor !== undefined ? tx.Valor : tx.Monto));
  if (valRaw === undefined || valRaw === null) return 0;
  if (typeof valRaw === "string") {
    valRaw = valRaw.replace(/[^\d.-]/g, "");
  }
  return parseFloat(valRaw) || 0;
}

function renderAll() {
  const { startDate, endDate } = getCycleDates();

  const currentCycleTx = transactions.filter(t => {
    const f = t.fecha || t.Fecha || t.FECHA;
    if (!f) return false;
    const parts = String(f).split("T")[0].split("-");
    if (parts.length !== 3) return false;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d >= startDate && d <= endDate;
  });

  const previousTx = transactions.filter(t => {
    const f = t.fecha || t.Fecha || t.FECHA;
    if (!f) return false;
    const parts = String(f).split("T")[0].split("-");
    if (parts.length !== 3) return false;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d < startDate;
  });

  let remanenteAnterior = 0;
  previousTx.forEach(t => {
    const tipo = String(t.tipo || t.Tipo || t.TIPO || "").trim().toLowerCase();
    const val = parseTxValue(t);
    if (tipo === "ingreso") remanenteAnterior += val;
    if (tipo === "gasto" || tipo === "egreso") remanenteAnterior -= val;
  });

  renderBalanceAndDonut(currentCycleTx, remanenteAnterior, startDate, endDate);
  renderTable(transactions, currentCycleTx);
  renderMonthlyTrend(transactions);
  updateSyncBadge();
}

/* --- Panel de Balance y Gráfica de Dona --- */
function renderBalanceAndDonut(currentCycleTx, remanenteAnterior, startDate, endDate) {
  let ingresosCiclo = 0;
  let gastosCiclo = 0;

  currentCycleTx.forEach(tx => {
    const tipo = String(tx.tipo || tx.Tipo || tx.TIPO || "").trim().toLowerCase();
    const val = parseTxValue(tx);
    if (tipo === "ingreso") ingresosCiclo += val;
    if (tipo === "gasto" || tipo === "egreso") gastosCiclo += val;
  });

  const totalBalance = remanenteAnterior + ingresosCiclo - gastosCiclo;

  const optionsDate = { month: 'short', day: 'numeric' };
  const periodoTitle = document.getElementById("periodoTitle");
  const remanenteText = document.getElementById("remanenteAnteriorText");
  const totalBalEl = document.getElementById("totalBalance");
  const totalIngEl = document.getElementById("totalIngresos");
  const totalGasEl = document.getElementById("totalGastos");

  if (periodoTitle) periodoTitle.innerText = `CICLO: ${startDate.toLocaleDateString('es-CO', optionsDate)} - ${endDate.toLocaleDateString('es-CO', optionsDate)}`;
  if (remanenteText) remanenteText.innerText = `Saldo acumulado anterior: $ ${remanenteAnterior.toLocaleString('es-CO')}`;
  if (totalBalEl) totalBalEl.innerText = `$ ${totalBalance.toLocaleString('es-CO')}`;
  if (totalIngEl) totalIngEl.innerText = `$ ${ingresosCiclo.toLocaleString('es-CO')}`;
  if (totalGasEl) totalGasEl.innerText = `$ ${gastosCiclo.toLocaleString('es-CO')}`;

  const canvas = document.getElementById("balanceChart");
  if (!canvas || typeof Chart === "undefined") return;
  const ctx = canvas.getContext("2d");
  if (donutChartInstance) donutChartInstance.destroy();

  const totalDisponible = Math.max(0, (remanenteAnterior + ingresosCiclo) - gastosCiclo);

  donutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Gastos del Ciclo', 'Disponible'],
      datasets: [{
        data: (ingresosCiclo + remanenteAnterior) === 0 ? [0, 1] : [gastosCiclo, totalDisponible],
        backgroundColor: ['#dc2626', '#059669'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      cutout: '75%'
    }
  });
}

/* --- Tabla de Transacciones y Filtros --- */
function initTableFilters() {
  const filterButtons = document.querySelectorAll(".btn-filter");
  filterButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      filterButtons.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      currentFilter = e.target.getAttribute("data-filter");
      renderAll();
    });
  });

  const periodSelect = document.getElementById("periodoFilterSelect");
  if (periodSelect) {
    periodSelect.addEventListener("change", (e) => {
      periodFilter = e.target.value;
      renderAll();
    });
  }
}

function renderTable(allTx, currentCycleTx) {
  const tbody = document.getElementById("tablaCuerpo");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Seleccionar conjunto base según el filtro de periodo ("actual" vs "todos")
  let baseTx = (periodFilter === "actual") ? currentCycleTx : allTx;

  // Filtrar por tipo (Todos / Ingresos / Gastos)
  if (currentFilter !== "Todos") {
    baseTx = baseTx.filter(t => {
      const tipo = String(t.tipo || t.Tipo || t.TIPO || "").trim().toLowerCase();
      if (currentFilter.toLowerCase() === "ingresos" || currentFilter.toLowerCase() === "ingreso") {
        return tipo === "ingreso";
      }
      if (currentFilter.toLowerCase() === "gastos" || currentFilter.toLowerCase() === "gasto") {
        return tipo === "gasto" || tipo === "egreso";
      }
      return true;
    });
  }

  // Ordenar de más reciente a más antiguo por fecha
  baseTx.sort((a, b) => {
    const fA = new Date(String(a.fecha || a.Fecha || a.FECHA).split("T")[0]);
    const fB = new Date(String(b.fecha || b.Fecha || b.FECHA).split("T")[0]);
    return fB - fA;
  });

  if (baseTx.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 20px; color: #64748b;">No hay registros para mostrar.</td></tr>`;
    return;
  }

  // Renderizado completo de TODOS los registros (sin .slice)
  baseTx.forEach(tx => {
    const tr = document.createElement("tr");
    const tipo = String(tx.tipo || tx.Tipo || tx.TIPO || "").trim().toLowerCase();
    const claseMonto = tipo === "ingreso" ? "text-ingreso" : "text-gasto";
    const signo = (tipo === "gasto" || tipo === "egreso") ? "-" : "+";
    const val = parseTxValue(tx);

    const txId = tx.id || tx.ID || "";
    const fecha = String(tx.fecha || tx.Fecha || tx.FECHA || "-").split("T")[0];
    const perfil = tx.perfil || tx.Perfil || tx.PERFIL || 'General';
    const subtipo = tx.subtipo || tx.Subtipo || tx.SUBTIPO || tx.categoria || tx.Categoria || "-";
    const motivo = tx.motivo || tx.Motivo || tx.MOTIVO || tx.descripcion || tx.Descripcion || "-";

    tr.innerHTML = `
      <td>${fecha}</td>
      <td><strong>${perfil}</strong></td>
      <td>${subtipo}</td>
      <td>${motivo}</td>
      <td class="text-right ${claseMonto}"><strong>${signo} $${val.toLocaleString('es-CO')}</strong></td>
      <td class="text-center">
        <button class="btn-action" onclick="editTransaction('${txId}')" title="Editar">✏️</button>
        <button class="btn-action" onclick="deleteTransaction('${txId}')" title="Eliminar">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* --- Gráfica de Tendencia Mensual --- */
function renderMonthlyTrend(allTx) {
  const canvas = document.getElementById("monthlyTrendChart");
  if (!canvas || typeof Chart === "undefined") return;

  const ctx = canvas.getContext("2d");
  if (monthlyChartInstance) monthlyChartInstance.destroy();

  const { startDate, endDate } = getCycleDates();

  const currentCycleTx = allTx.filter(t => {
    const f = t.fecha || t.Fecha || t.FECHA;
    if (!f) return false;
    const parts = String(f).split("T")[0].split("-");
    if (parts.length !== 3) return false;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d >= startDate && d <= endDate;
  });

  const dailyMap = {};
  let cur = new Date(startDate);

  while (cur <= endDate) {
    const isoKey = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    const options = { day: '2-digit', month: 'short' };
    dailyMap[isoKey] = {
      label: cur.toLocaleDateString('es-CO', options),
      ingresos: 0,
      gastos: 0
    };
    cur.setDate(cur.getDate() + 1);
  }

  currentCycleTx.forEach(tx => {
    const f = String(tx.fecha || tx.Fecha || tx.FECHA).split("T")[0];
    if (dailyMap[f]) {
      const tipo = String(tx.tipo || tx.Tipo || tx.TIPO || "").trim().toLowerCase();
      const val = parseTxValue(tx);
      if (tipo === "ingreso") dailyMap[f].ingresos += val;
      if (tipo === "gasto" || tipo === "egreso") dailyMap[f].gastos += val;
    }
  });

  const dailyKeys = Object.keys(dailyMap).sort();
  const labels = dailyKeys.map(k => dailyMap[k].label);

  let acumIngresos = 0;
  let acumGastos = 0;

  const dataIngresos = [];
  const dataGastos = [];
  const dataNeto = [];

  dailyKeys.forEach(k => {
    acumIngresos += dailyMap[k].ingresos;
    acumGastos += dailyMap[k].gastos;

    dataIngresos.push(acumIngresos);
    dataGastos.push(acumGastos);
    dataNeto.push(acumIngresos - acumGastos);
  });

  monthlyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Ingresos Acumulados',
          data: dataIngresos,
          borderColor: '#059669',
          backgroundColor: '#059669',
          borderWidth: 3,
          pointRadius: 3,
          tension: 0.2,
          fill: false
        },
        {
          label: 'Gastos Acumulados',
          data: dataGastos,
          borderColor: '#dc2626',
          backgroundColor: '#dc2626',
          borderWidth: 3,
          pointRadius: 3,
          tension: 0.2,
          fill: false
        },
        {
          label: 'Tendencia Flujo Neto',
          data: dataNeto,
          borderColor: '#94a3b8',
          backgroundColor: '#94a3b8',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 2,
          tension: 0.2,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#334155', font: { size: 11, weight: '600' } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) label += ': ';
              if (context.parsed.y !== null) {
                label += '$ ' + context.parsed.y.toLocaleString('es-CO');
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Días del Ciclo',
            color: '#475569',
            font: { weight: 'bold', size: 11 }
          },
          ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45 },
          grid: { display: false }
        },
        y: {
          title: {
            display: true,
            text: 'Valor ($)',
            color: '#475569',
            font: { weight: 'bold', size: 11 }
          },
          ticks: {
            color: '#64748b',
            callback: function(value) {
              if (Math.abs(value) >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
              if (Math.abs(value) >= 1000) return '$' + (value / 1000).toFixed(0) + 'k';
              return '$' + value;
            }
          },
          grid: { color: '#f1f5f9' },
          beginAtZero: true
        }
      }
    }
  });
}

/* ==========================================================================
   5. CONFIGURACIÓN Y UTILIDADES
   ========================================================================== */
function initSettings() {
  const modal = document.getElementById("settingsModal");
  const btnSettings = document.getElementById("btnSettings");
  const btnClose = document.getElementById("btnCloseSettings");
  const btnSave = document.getElementById("btnSaveSettings");

  if (!btnSettings) return;

  btnSettings.addEventListener("click", () => {
    document.getElementById("apiUrl").value = localStorage.getItem("app_api_url") || "";
    document.getElementById("sheetUrl").value = localStorage.getItem("app_sheet_url") || "";
    document.getElementById("diaInicioCiclo").value = localStorage.getItem("app_dia_ciclo") || 1;
    if (modal) modal.classList.remove("hidden");
  });

  if (btnClose) btnClose.addEventListener("click", () => modal && modal.classList.add("hidden"));

  if (btnSave) {
    btnSave.addEventListener("click", () => {
      const cycleDay = Number(document.getElementById("diaInicioCiclo").value);
      if (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > 31) {
        mostrarToast("El día de inicio del ciclo debe estar entre 1 y 31.");
        return;
      }
      localStorage.setItem("app_api_url", document.getElementById("apiUrl").value.trim());
      localStorage.setItem("app_sheet_url", document.getElementById("sheetUrl").value.trim());
      localStorage.setItem("app_dia_ciclo", document.getElementById("diaInicioCiclo").value);
      localStorage.setItem("app_task_cycle_dirty", "true");
      if (modal) modal.classList.add("hidden");
      mostrarToast("Ajustes guardados");
      if (typeof syncTasks === "function") syncTasks();
      renderAll();
      fetchCloudTransactions();
    });
  }
}

function saveLocalTransactions() {
  transactionRevision++;
  localStorage.setItem("app_transactions", JSON.stringify(transactions));
}

function updateSyncBadge() {
  const badge = document.getElementById("syncStatus");
  if (!badge) return;
  const pending = pendingActions.length;

  if (!navigator.onLine) {
    badge.innerText = "Modo Offline";
    badge.className = "badge badge-warning";
  } else if (cloudLoadError) {
    badge.innerText = "Error al cargar Sheets";
    badge.className = "badge badge-warning";
  } else if (pending > 0) {
    badge.innerText = `${pending} Pendiente(s)`;
    badge.className = "badge badge-warning";
  } else {
    badge.innerText = "Sincronizado";
    badge.className = "badge badge-success";
  }
}

function initOfflineSync() {
  window.addEventListener("online", () => {
    updateSyncBadge();
    syncPendingTransactions().then(fetchCloudTransactions);
  });
  window.addEventListener("offline", updateSyncBadge);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      fetchCloudTransactions();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Error:', err));
  }
}

function mostrarToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3000);
}
