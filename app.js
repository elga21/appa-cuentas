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

document.addEventListener("DOMContentLoaded", () => {
  initPIN();
  initForm();
  initSettings();
  initTableFilters();
  initSheetRedirect();
  initOfflineSync();
});

/* --- Gestión de Perfiles y Autenticación --- */
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

      // Sincronizar de inmediato
      await fetchCloudTransactions();

      // Iniciar polling automático cada 10 segundos
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

/* --- Descarga de Datos Unificados de Google Sheets --- */
async function fetchCloudTransactions() {
  const apiUrl = localStorage.getItem("app_api_url");
  if (!apiUrl || !navigator.onLine) return;

  try {
    const res = await fetch(apiUrl);
    const json = await res.json();

    if (json.status === "success" && Array.isArray(json.data)) {
      const cloudData = json.data;

      cloudData.forEach(item => {
        if (item.perfil && !profilesList.includes(item.perfil)) {
          profilesList.push(item.perfil);
        }
      });
      localStorage.setItem("app_profiles", JSON.stringify(profilesList));

      const pendingLocalTx = transactions.filter(t => !t.synced);
      transactions = [...cloudData, ...pendingLocalTx];

      saveLocalTransactions();
      renderAll();
    }
  } catch (err) {
    console.error("Error al obtener datos unificados:", err);
  }
}

function initSheetRedirect() {
  const btnOpenSheet = document.getElementById("btnOpenSheet");
  btnOpenSheet.addEventListener("click", () => {
    const sheetUrl = localStorage.getItem("app_sheet_url");
    if (sheetUrl) {
      window.open(sheetUrl, "_blank");
    } else {
      mostrarToast("Configura la URL de Google Sheets en Ajustes ⚙️");
    }
  });
}

/* --- Filtros de la Tabla --- */
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
  periodSelect.addEventListener("change", (e) => {
    periodFilter = e.target.value;
    renderAll();
  });
}

function initForm() {
  const valorInput = document.getElementById("valor");
  const fechaInput = document.getElementById("fecha");
  
  fechaInput.value = new Date().toISOString().split('T')[0];

  valorInput.addEventListener("input", (e) => {
    let rawValue = e.target.value.replace(/\D/g, "");
    if (!rawValue) {
      e.target.value = "";
      return;
    }
    let formatted = parseInt(rawValue, 10).toLocaleString("es-CO");
    e.target.value = `$ ${formatted}`;
  });

  document.getElementById("txForm").addEventListener("submit", handleFormSubmit);
}

/* --- Guardar / Editar --- */
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const btnGuardar = document.getElementById("btnGuardar");
  const valorRaw = document.getElementById("valor").value.replace(/\D/g, "");
  
  if (!valorRaw || parseInt(valorRaw) <= 0) {
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
    const idx = transactions.findIndex(t => t.id === editingTxId);
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
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;

  editingTxId = id;
  document.getElementById("fecha").value = tx.fecha;
  document.getElementById("tipo").value = tx.tipo;
  document.getElementById("subtipo").value = tx.subtipo;
  document.getElementById("motivo").value = tx.motivo;
  document.getElementById("valor").value = `$ ${tx.valor.toLocaleString('es-CO')}`;

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

  const txIndex = transactions.findIndex(t => t.id === id);
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
  document.getElementById("txForm").reset();
  document.getElementById("fecha").value = new Date().toISOString().split('T')[0];
  const btnGuardar = document.getElementById("btnGuardar");
  btnGuardar.querySelector("span").innerText = "Guardar Registro";
  const btnCancel = document.getElementById("btnCancelEdit");
  if (btnCancel) btnCancel.remove();
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

/* --- Cálculo y Renderizado Global --- */
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

function renderAll() {
  const { startDate, endDate } = getCycleDates();

  const currentCycleTx = transactions.filter(t => {
    if (!t.fecha) return false;
    const parts = t.fecha.split("-");
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d >= startDate && d <= endDate;
  });

  const previousTx = transactions.filter(t => {
    if (!t.fecha) return false;
    const parts = t.fecha.split("-");
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d < startDate;
  });

  let remanenteAnterior = 0;
  previousTx.forEach(t => {
    if (t.tipo === "Ingreso") remanenteAnterior += Number(t.valor) || 0;
    if (t.tipo === "Gasto") remanenteAnterior -= Number(t.valor) || 0;
  });

  renderBalanceAndDonut(currentCycleTx, remanenteAnterior, startDate, endDate);
  renderTable(transactions, currentCycleTx);
  renderMonthlyTrend(transactions);
  updateSyncBadge();
}

function renderBalanceAndDonut(currentCycleTx, remanenteAnterior, startDate, endDate) {
  let ingresosCiclo = 0;
  let gastosCiclo = 0;

  currentCycleTx.forEach(tx => {
    const val = Number(tx.valor) || 0;
    if (tx.tipo === "Ingreso") ingresosCiclo += val;
    if (tx.tipo === "Gasto") gastosCiclo += val;
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

function renderTable(allTx, currentCycleTx) {
  const tbody = document.getElementById("tablaCuerpo");
  if (!tbody) return;
  tbody.innerHTML = "";

  let baseTx = (periodFilter === "actual") ? currentCycleTx : allTx;

  if (currentFilter !== "Todos") {
    baseTx = baseTx.filter(t => t.tipo === currentFilter);
  }

  baseTx.slice(0, 25).forEach(tx => {
    const tr = document.createElement("tr");
    const claseMonto = tx.tipo === "Ingreso" ? "text-ingreso" : "text-gasto";
    const signo = tx.tipo === "Gasto" ? "-" : "+";
    const val = Number(tx.valor) || 0;

    tr.innerHTML = `
      <td>${tx.fecha}</td>
      <td><strong>${tx.perfil || 'General'}</strong></td>
      <td>${tx.subtipo}</td>
      <td>${tx.motivo || '-'}</td>
      <td class="text-right ${claseMonto}"><strong>${signo} $${val.toLocaleString('es-CO')}</strong></td>
      <td class="text-center">
        <button class="btn-action" onclick="editTransaction('${tx.id}')" title="Editar">✏️</button>
        <button class="btn-action" onclick="deleteTransaction('${tx.id}')" title="Eliminar">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* --- Gráfica de Tendencia: Ingresos vs Egresos por Ciclo (Blindada) --- */
function renderMonthlyTrend(allTx) {
  const canvas = document.getElementById("monthlyTrendChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (monthlyChartInstance) monthlyChartInstance.destroy();

  const startDay = parseInt(localStorage.getItem("app_dia_ciclo") || 1, 10);
  const cycleDataMap = {};

  // Procesar y limpiar transacciones
  if (Array.isArray(allTx) && allTx.length > 0) {
    allTx.forEach(tx => {
      // Normalización de campos por si la API envía llaves en mayúsculas o con distinto nombre
      const fechaRaw = tx.fecha || tx.Fecha || "";
      const tipoRaw = String(tx.tipo || tx.Tipo || "").trim().toLowerCase();
      
      if (!fechaRaw) return;
      
      const parts = fechaRaw.split("-");
      if (parts.length !== 3) return;
      
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      
      if (isNaN(year) || isNaN(month) || isNaN(day)) return;

      let cycleStartYear = year;
      let cycleStartMonth = month;

      if (day < startDay) {
        cycleStartMonth -= 1;
        if (cycleStartMonth < 0) {
          cycleStartMonth = 11;
          cycleStartYear -= 1;
        }
      }

      const cycleStart = new Date(cycleStartYear, cycleStartMonth, startDay);
      const cycleEnd = new Date(cycleStartYear, cycleStartMonth + 1, startDay - 1);

      const cycleKey = `${cycleStartYear}-${String(cycleStartMonth + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;

      if (!cycleDataMap[cycleKey]) {
        const options = { day: '2-digit', month: 'short' };
        const labelStr = `${cycleStart.toLocaleDateString('es-CO', options)} - ${cycleEnd.toLocaleDateString('es-CO', options)}`;
        
        cycleDataMap[cycleKey] = {
          sortDate: cycleStart.getTime(),
          label: labelStr,
          ingresos: 0,
          gastos: 0
        };
      }

      // Limpieza estricta del valor por si viene en formato texto/moneda ($ 1.000.000)
      let valRaw = tx.valor !== undefined ? tx.valor : (tx.monto !== undefined ? tx.monto : 0);
      if (typeof valRaw === "string") {
        valRaw = valRaw.replace(/[^\d.-]/g, ""); // Remueve $, puntos, espacios
      }
      const val = parseFloat(valRaw) || 0;

      if (tipoRaw === "ingreso") {
        cycleDataMap[cycleKey].ingresos += val;
      } else if (tipoRaw === "gasto" || tipoRaw === "egreso") {
        cycleDataMap[cycleKey].gastos += val;
      }
    });
  }

  const sortedCycles = Object.values(cycleDataMap).sort((a, b) => a.sortDate - b.sortDate);
  const recentCycles = sortedCycles.slice(-8);

  // Si no hay datos mapeados, mostramos etiquetas por defecto del ciclo actual para evitar la escala 0..1
  let labels = recentCycles.map(c => c.label);
  let dataIngresos = recentCycles.map(c => c.ingresos);
  let dataGastos = recentCycles.map(c => c.gastos);

  if (labels.length === 0) {
    const { startDate, endDate } = getCycleDates();
    const options = { day: '2-digit', month: 'short' };
    labels = [`${startDate.toLocaleDateString('es-CO', options)} - ${endDate.toLocaleDateString('es-CO', options)}`];
    dataIngresos = [0];
    dataGastos = [0];
  }

  monthlyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Ingresos',
          data: dataIngresos,
          backgroundColor: '#059669',
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.6
        },
        {
          label: 'Gastos',
          data: dataGastos,
          backgroundColor: '#dc2626',
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.6
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
          labels: { color: '#334155', font: { size: 12, weight: '600' } }
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
            text: 'Ciclos de Pago',
            color: '#475569',
            font: { weight: 'bold', size: 12 }
          },
          ticks: { color: '#64748b', font: { size: 11 } },
          grid: { display: false }
        },
        y: {
          title: {
            display: true,
            text: 'Valor ($)',
            color: '#475569',
            font: { weight: 'bold', size: 12 }
          },
          ticks: {
            color: '#64748b',
            callback: function(value) {
              if (value >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
              if (value >= 1000) return '$' + (value / 1000).toFixed(0) + 'k';
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

function initSettings() {
  const modal = document.getElementById("settingsModal");
  const btnSettings = document.getElementById("btnSettings");
  const btnClose = document.getElementById("btnCloseSettings");
  const btnSave = document.getElementById("btnSaveSettings");

  btnSettings.addEventListener("click", () => {
    document.getElementById("apiUrl").value = localStorage.getItem("app_api_url") || "";
    document.getElementById("sheetUrl").value = localStorage.getItem("app_sheet_url") || "";
    document.getElementById("diaInicioCiclo").value = localStorage.getItem("app_dia_ciclo") || 1;
    modal.classList.remove("hidden");
  });

  btnClose.addEventListener("click", () => modal.classList.add("hidden"));

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
