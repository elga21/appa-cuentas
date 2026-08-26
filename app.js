const PIN_CORRECTO = "0308";
let transactions = JSON.parse(localStorage.getItem("app_transactions")) || [];
let profilesList = JSON.parse(localStorage.getItem("app_profiles")) || [];
let activePerfil = "";
let currentFilter = "Todos";
let periodFilter = "actual"; // 'actual' o 'todos'
let editingTxId = null;
let donutChartInstance = null;
let monthlyChartInstance = null;

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

  // Renderiza el selector de perfiles disponibles + la opción de crear
  const updateProfilesDropdown = () => {
    perfilSelect.innerHTML = "";

    // 1. Insertar perfiles ya creados
    if (profilesList.length > 0) {
      profilesList.forEach(p => {
        const option = document.createElement("option");
        option.value = p;
        option.innerText = p;
        perfilSelect.appendChild(option);
      });
    }

    // 2. Opción fija para registrar un perfil nuevo
    const newOption = document.createElement("option");
    newOption.value = "__NEW__";
    newOption.innerText = "+ Registrar Nuevo Perfil";
    perfilSelect.appendChild(newOption);

    // Si no existen perfiles, seleccionar automáticamente "+ Registrar Nuevo Perfil"
    if (profilesList.length === 0) {
      perfilSelect.value = "__NEW__";
      nuevoPerfilGroup.classList.remove("hidden");
    } else {
      // Si hay perfiles, ocultar el input de texto por defecto
      nuevoPerfilGroup.classList.add("hidden");
    }
  };

  // Detectar cambios en la selección del combo box
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

  const verifyPIN = () => {
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

      // Si es un perfil nuevo, se añade a la lista local
      if (!profilesList.includes(activePerfil)) {
        profilesList.push(activePerfil);
        localStorage.setItem("app_profiles", JSON.stringify(profilesList));
      }

      document.getElementById("currentPerfilBadge").innerText = `Perfil: ${activePerfil}`;
      document.getElementById("pinScreen").classList.add("hidden");
      document.getElementById("appContent").classList.remove("hidden");

      // Limpiar campos para la próxima sesión
      pinInput.value = "";
      nuevoPerfilInput.value = "";
      pinError.classList.add("hidden");

      updateProfilesDropdown();
      renderAll();
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
    document.getElementById("appContent").classList.add("hidden");
    document.getElementById("pinScreen").classList.remove("hidden");
    updateProfilesDropdown();
  });
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
  } catch (err) {
    console.error("Error al sincronizar:", err);
    mostrarToast("Guardado localmente (Offline)");
  }
}

/* --- Lógica de Filtro por Período Mensual --- */
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
  const profileTx = transactions.filter(t => t.perfil === activePerfil);
  const { startDate, endDate } = getCycleDates();

  const currentCycleTx = profileTx.filter(t => {
    const d = new Date(t.fecha + "T00:00:00");
    return d >= startDate && d <= endDate;
  });

  const previousTx = profileTx.filter(t => {
    const d = new Date(t.fecha + "T00:00:00");
    return d < startDate;
  });

  let remanenteAnterior = 0;
  previousTx.forEach(t => {
    if (t.tipo === "Ingreso") remanenteAnterior += t.valor;
    if (t.tipo === "Gasto") remanenteAnterior -= t.valor;
  });

  renderBalanceAndDonut(currentCycleTx, remanenteAnterior, startDate, endDate);
  renderTable(profileTx, currentCycleTx);
  renderMonthlyTrend(profileTx);
  updateSyncBadge();
}

function renderBalanceAndDonut(currentCycleTx, remanenteAnterior, startDate, endDate) {
  let ingresosCiclo = 0;
  let gastosCiclo = 0;

  currentCycleTx.forEach(tx => {
    if (tx.tipo === "Ingreso") ingresosCiclo += tx.valor;
    if (tx.tipo === "Gasto") gastosCiclo += tx.valor;
  });

  const totalBalance = remanenteAnterior + ingresosCiclo - gastosCiclo;

  const optionsDate = { month: 'short', day: 'numeric' };
  document.getElementById("periodoTitle").innerText = `CICLO: ${startDate.toLocaleDateString('es-CO', optionsDate)} - ${endDate.toLocaleDateString('es-CO', optionsDate)}`;
  document.getElementById("remanenteAnteriorText").innerText = `Saldo disponible acumulado anterior: $ ${remanenteAnterior.toLocaleString('es-CO')}`;
  document.getElementById("totalBalance").innerText = `$ ${totalBalance.toLocaleString('es-CO')}`;
  document.getElementById("totalIngresos").innerText = `$ ${ingresosCiclo.toLocaleString('es-CO')}`;
  document.getElementById("totalGastos").innerText = `$ ${gastosCiclo.toLocaleString('es-CO')}`;

  const ctx = document.getElementById("balanceChart").getContext("2d");
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

function renderTable(allProfileTx, currentCycleTx) {
  const tbody = document.getElementById("tablaCuerpo");
  tbody.innerHTML = "";

  let baseTx = (periodFilter === "actual") ? currentCycleTx : allProfileTx;

  if (currentFilter !== "Todos") {
    baseTx = baseTx.filter(t => t.tipo === currentFilter);
  }

  baseTx.slice(0, 20).forEach(tx => {
    const tr = document.createElement("tr");
    const claseMonto = tx.tipo === "Ingreso" ? "text-ingreso" : "text-gasto";
    const signo = tx.tipo === "Gasto" ? "-" : "+";

    tr.innerHTML = `
      <td>${tx.fecha}</td>
      <td><strong>${tx.tipo}</strong></td>
      <td>${tx.subtipo}</td>
      <td>${tx.motivo || '-'}</td>
      <td class="text-right ${claseMonto}"><strong>${signo} $${tx.valor.toLocaleString('es-CO')}</strong></td>
      <td class="text-center">
        <button class="btn-action" onclick="editTransaction('${tx.id}')" title="Editar">✏️</button>
        <button class="btn-action" onclick="deleteTransaction('${tx.id}')" title="Eliminar">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderMonthlyTrend(profileTx) {
  const monthlyData = {};

  profileTx.forEach(tx => {
    const monthKey = tx.fecha.substring(0, 7);
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { ingresos: 0, gastos: 0 };
    }
    if (tx.tipo === "Ingreso") monthlyData[monthKey].ingresos += tx.valor;
    if (tx.tipo === "Gasto") monthlyData[monthKey].gastos += tx.valor;
  });

  const sortedMonths = Object.keys(monthlyData).sort();
  const dataIngresos = sortedMonths.map(m => monthlyData[m].ingresos);
  const dataGastos = sortedMonths.map(m => monthlyData[m].gastos);

  const ctx = document.getElementById("monthlyTrendChart").getContext("2d");
  if (monthlyChartInstance) monthlyChartInstance.destroy();

  monthlyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sortedMonths,
      datasets: [
        {
          label: 'Ingresos',
          data: dataIngresos,
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.08)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Gastos',
          data: dataGastos,
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.08)',
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#475569', font: { size: 12, weight: '500' } } }
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
        y: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } }
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
  });
}

function saveLocalTransactions() {
  localStorage.setItem("app_transactions", JSON.stringify(transactions));
}

function updateSyncBadge() {
  const badge = document.getElementById("syncStatus");
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
  });
  window.addEventListener("offline", updateSyncBadge);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Error:', err));
  }
}

function mostrarToast(msg) {
  const toast = document.getElementById("toast");
  toast.innerText = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3000);
}
