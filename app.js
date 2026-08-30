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

// --- INICIALIZACIÓN DE LA APLICACIÓN ---
document.addEventListener("DOMContentLoaded", () => {
  initPIN();
  initForm();
  initSettings();
  initTableFilters();
  initSheetRedirect();
  initOfflineSync();
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
      nuevoPerfilGroup.classList.remove("hidden");
    } else {
      nuevoPerfilGroup.classList.add("hidden");
    }
  };

  perfilSelect.addEventListener("change", (e) => {
    if (e.target.value === "__NEW__") {
      nuevoPerfilGroup.classList.remove("hidden");
      nuevoPerfilInput.value = "";
      nuevoPerfilInput.focus();
    } else {
      nuevoPerfilGroup.classList.add("hidden");
    }
  });

  updateProfilesDropdown();

  const verifyPIN = async () => {
    let perfilDestino = "";

    if (perfilSelect.value === "__NEW__") {
      perfilDestino = nuevoPerfilInput.value.trim();
    } else {
      perfilDestino = perfilSelect.value;
    }

    if (!perfilDestino) {
      pinError.innerText = "Ingresa o selecciona un nombre de perfil.";
      pinError.classList.remove("hidden");
      return;
    }

    if (pinInput.value === PIN_CORRECTO) {
      activePerfil = perfilDestino;

      if (!profilesList.includes(activePerfil)) {
        profilesList.push(activePerfil);
        localStorage.setItem("app_profiles", JSON.stringify(profilesList));
      }

      document.getElementById("currentPerfilBadge").innerText = `Perfil: ${activePerfil}`;
      document.getElementById("pinScreen").classList.add("hidden");
      document.getElementById("appContent").classList.remove("hidden");

      pinInput.value = "";
      nuevoPerfilInput.value = "";
      pinError.classList.add("hidden");

      updateProfilesDropdown();
      renderAll();

      await fetchCloudTransactions();

      if (syncInterval) clearInterval(syncInterval);
      syncInterval = setInterval(fetchCloudTransactions, 10000);
    } else {
      pinError.innerText = "PIN incorrecto. Intenta nuevamente.";
      pinError.classList.remove("hidden");
      pinInput.value = "";
    }
  };

  btnUnlock.addEventListener("click", verifyPIN);
  pinInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") verifyPIN();
  });
  nuevoPerfilInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") verifyPIN();
  });

  btnLogout.addEventListener("click", () => {
    if (syncInterval) clearInterval(syncInterval);
    document.getElementById("appContent").classList.add("hidden");
    document.getElementById("pinScreen").classList.remove("hidden");
    updateProfilesDropdown();
  });
}

/* ==========================================================================
   2. SINCRONIZACIÓN CON GOOGLE SHEETS (NUBE)
   ========================================================================== */
async function fetchCloudTransactions() {
  const apiUrl = localStorage.getItem("app_api_url");
  if (!apiUrl || !navigator.onLine) return;

  try {
    const res = await fetch(apiUrl, {
      method: "GET",
      redirect: "follow"
    });

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const json = await res.json();
    let cloudData = [];

    if (Array.isArray(json)) {
      cloudData = json;
    } else if (json && Array.isArray(json.data)) {
      cloudData = json.data;
    } else if (json && Array.isArray(json.transactions)) {
      cloudData = json.transactions;
    }

    if (cloudData.length > 0) {
      const normalizedCloudData = cloudData.map((item, index) => {
        return {
          id: item.id || item.ID || `cloud_${index}`,
          fecha: item.fecha || item.Fecha || item.FECHA || "",
          perfil: item.perfil || item.Perfil || item.PERFIL || "General",
          tipo: item.tipo || item.Tipo || item.TIPO || "",
          subtipo: item.subtipo || item.Subtipo || item.SUBTIPO || "",
          motivo: item.motivo || item.Motivo || item.MOTIVO || "",
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

      const pendingLocalTx = transactions.filter(t => !t.synced);
      transactions = [...normalizedCloudData, ...pendingLocalTx];

      saveLocalTransactions();
      renderAll();
    }
  } catch (err) {
    console.error("Error al obtener datos de Google Sheets:", err);
  }
}

async function syncTransactionWithAction(tx) {
  const apiUrl = localStorage.getItem("app_api_url");
  if (!apiUrl || !navigator.onLine) {
    mostrarToast("Guardado en local");
    return;
  }

  try {
    await fetch(apiUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tx)
    });

    tx.synced = true;
    saveLocalTransactions();
    updateSyncBadge();
    mostrarToast(tx.action === "DELETE" ? "Eliminado en Google Sheets" : "Sincronizado con Sheets");

    setTimeout(fetchCloudTransactions, 1000);
  } catch (err) {
    console.error("Error al sincronizar:", err);
    mostrarToast("Guardado localmente (Offline)");
  }
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

  const btnGuardar = document.getElementById("btnGuardar");
  const valorRaw = document.getElementById("valor").value.replace(/\D/g, "");

  if (!valorRaw || parseInt(valorRaw, 10) <= 0) {
    mostrarToast("Ingresa un monto válido");
    return;
  }

  btnGuardar.disabled = true;

  const txId = editingTxId || ("tx_" + new Date().getTime());
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
    resetFormState();
  } else {
    transactions.unshift(txData);
  }

  saveLocalTransactions();
  renderAll();

  await syncTransactionWithAction(txData);
  btnGuardar.disabled = false;
}

function editTransaction(id) {
  const tx = transactions.find(t => (t.id || t.ID) === id);
  if (!tx) return;

  editingTxId = id;
  document.getElementById("fecha").value = tx.fecha || tx.Fecha;
  document.getElementById("tipo").value = tx.tipo || tx.Tipo;
  document.getElementById("subtipo").value = tx.subtipo || tx.Subtipo;
  document.getElementById("motivo").value = tx.motivo || tx.Motivo || "";

  let val = parseTxValue(tx);
  document.getElementById("valor").value = `$ ${val.toLocaleString('es-CO')}`;

  const btnGuardar = document.getElementById("btnGuardar");
  btnGuardar.querySelector("span").innerText = "Actualizar Cambios";

  if (!document.getElementById("btnCancelEdit")) {
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
  let year = now.getFullYear();
  let month = now.getMonth();

  let startDate, endDate;

  if (now.getDate() >= startDay) {
    startDate = new Date(year, month, startDay);
    endDate = new Date(year, month + 1, startDay - 1, 23, 59, 59);
  } else {
    startDate = new Date(year, month - 1, startDay);
    endDate = new Date(year, month, startDay - 1, 23, 59, 59);
  }

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
    const f = t.fecha || t.Fecha;
    if (!f) return false;
    const parts = f.split("-");
    if (parts.length !== 3) return false;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d >= startDate && d <= endDate;
  });

  const previousTx = transactions.filter(t => {
    const f = t.fecha || t.Fecha;
    if (!f) return false;
    const parts = f.split("-");
    if (parts.length !== 3) return false;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d < startDate;
  });

  let remanenteAnterior = 0;
  previousTx.forEach(t => {
    const tipo = String(t.tipo || t.Tipo || "").trim().toLowerCase();
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
    const tipo = String(tx.tipo || tx.Tipo || "").trim().toLowerCase();
    const val = parseTxValue(tx);
    if (tipo === "ingreso") ingresosCiclo += val;
    if (tipo === "gasto" || tipo === "egreso") gastosCiclo += val;
  });

  const totalBalance = remanenteAnterior + ingresosCiclo - gastosCiclo;

  const optionsDate = { month: 'short', day: 'numeric' };
  document.getElementById("periodoTitle").innerText = `CICLO: ${startDate.toLocaleDateString('es-CO', optionsDate)} - ${endDate.toLocaleDateString('es-CO', optionsDate)}`;
  document.getElementById("remanenteAnteriorText").innerText = `Saldo acumulado anterior: $ ${remanenteAnterior.toLocaleString('es-CO')}`;
  document.getElementById("totalBalance").innerText = `$ ${totalBalance.toLocaleString('es-CO')}`;
  document.getElementById("totalIngresos").innerText = `$ ${ingresosCiclo.toLocaleString('es-CO')}`;
  document.getElementById("totalGastos").innerText = `$ ${gastosCiclo.toLocaleString('es-CO')}`;

  const canvas = document.getElementById("balanceChart");
  if (!canvas) return;
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

  let baseTx = (periodFilter === "actual") ? currentCycleTx : allTx;

  if (currentFilter !== "Todos") {
    baseTx = baseTx.filter(t => {
      const tipo = String(t.tipo || t.Tipo || "").trim().toLowerCase();
      return tipo === currentFilter.toLowerCase();
    });
  }

  baseTx.slice(0, 30).forEach(tx => {
    const tr = document.createElement("tr");
    const tipo = String(tx.tipo || tx.Tipo || "").trim().toLowerCase();
    const claseMonto = tipo === "ingreso" ? "text-ingreso" : "text-gasto";
    const signo = (tipo === "gasto" || tipo === "egreso") ? "-" : "+";
    const val = parseTxValue(tx);

    const txId = tx.id || tx.ID;
    const fecha = tx.fecha || tx.Fecha || "-";
    const perfil = tx.perfil || tx.Perfil || 'General';
    const subtipo = tx.subtipo || tx.Subtipo || "-";
    const motivo = tx.motivo || tx.Motivo || "-";

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
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (monthlyChartInstance) monthlyChartInstance.destroy();

  const { startDate, endDate } = getCycleDates();

  const currentCycleTx = allTx.filter(t => {
    const f = t.fecha || t.Fecha;
    if (!f) return false;
    const parts = f.split("-");
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
    const f = tx.fecha || tx.Fecha;
    if (dailyMap[f]) {
      const tipo = String(tx.tipo || tx.Tipo || "").trim().toLowerCase();
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
    modal.classList.remove("hidden");
  });

  if (btnClose) btnClose.addEventListener("click", () => modal.classList.add("hidden"));

  if (btnSave) {
    btnSave.addEventListener("click", () => {
      localStorage.setItem("app_api_url", document.getElementById("apiUrl").value.trim());
      localStorage.setItem("app_sheet_url", document.getElementById("sheetUrl").value.trim());
      localStorage.setItem("app_dia_ciclo", document.getElementById("diaInicioCiclo").value);
      modal.classList.add("hidden");
      mostrarToast("Ajustes guardados");
      renderAll();
      fetchCloudTransactions();
    });
  }
}

function saveLocalTransactions() {
  localStorage.setItem("app_transactions", JSON.stringify(transactions));
}

function updateSyncBadge() {
  const badge = document.getElementById("syncStatus");
  if (!badge) return;
  const pending = transactions.filter(t => !t.synced).length;

  if (!navigator.onLine) {
    badge.innerText = "Modo Offline";
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
    transactions.filter(t => !t.synced).forEach(syncTransactionWithAction);
    fetchCloudTransactions();
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
