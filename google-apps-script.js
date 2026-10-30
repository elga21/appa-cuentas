/**
 * APP CONTABLE - BACKEND GOOGLE APPS SCRIPT
 * 
 * Instrucciones de instalación:
 * 1. Abre tu Google Sheet.
 * 2. Ve a Extensiones > Apps Script.
 * 3. Borra el código existente y pega este archivo completo.
 * 4. Guarda el proyecto (icono de disquete).
 * 5. Haz clic en "Implementar" (Deploy) > "Nueva implementación" (New deployment).
 * 6. Selecciona "Aplicación web" (Web app).
 * 7. Configura:
 *    - Descripción: App Contable API
 *    - Ejecutar como: Tu cuenta (Yo / Me)
 *    - Quién tiene acceso: Cualquiera (Anyone) -> IMPORTANTE para permitir conexiones desde la app móvil.
 * 8. Haz clic en "Implementar" y autoriza los permisos que solicite.
 * 9. Copia la "URL de la aplicación web" generada (termina en /exec) y pégala en la configuración de la App.
 */

// Inicializa las pestañas de la hoja de cálculo si no existen
function initSheets(spreadsheet) {
  var txSheet = spreadsheet.getSheetByName("Transacciones");
  if (!txSheet) {
    txSheet = spreadsheet.insertSheet("Transacciones");
    // Columnas
    txSheet.appendRow([
      "ID", 
      "Fecha Registro", 
      "Fecha Transaccion", 
      "Perfil", 
      "Tipo", 
      "Subtipo", 
      "Motivo", 
      "Valor"
    ]);
    txSheet.getRange("A1:H1").setFontWeight("bold").setBackground("#2c3e50").setFontColor("#ffffff");
    txSheet.setFrozenRows(1);
  }

  var summarySheet = spreadsheet.getSheetByName("Resumen");
  if (!summarySheet) {
    summarySheet = spreadsheet.insertSheet("Resumen");
    summarySheet.appendRow(["Métrica", "Valor", "Descripción"]);
    summarySheet.appendRow(["Total Ingresos Histórico", '=SUMIF(Transacciones!E:E; "Ingreso"; Transacciones!H:H)', "Suma de todos los ingresos registrados"]);
    summarySheet.appendRow(["Total Gastos Histórico", '=SUMIF(Transacciones!E:E; "Gasto"; Transacciones!H:H)', "Suma de todos los gastos registrados"]);
    summarySheet.appendRow(["Total en Caja", '=B2-B3', "Dinero total disponible (Ingresos - Gastos)"]);
    
    summarySheet.getRange("A1:C1").setFontWeight("bold").setBackground("#27ae60").setFontColor("#ffffff");
    summarySheet.getRange("A4:C4").setFontWeight("bold").setBackground("#f1f2f6");
    summarySheet.setColumnWidth(1, 200);
    summarySheet.setColumnWidth(2, 120);
    summarySheet.setColumnWidth(3, 300);
    
    // Eliminar la Hoja1 predeterminada si existe y está vacía
    var defaultSheet = spreadsheet.getSheetByName("Hoja1");
    if (defaultSheet && defaultSheet.getLastRow() === 0) {
      spreadsheet.deleteSheet(defaultSheet);
    }
  }
}

/**
 * Maneja las peticiones GET (Lectura de datos y balances)
 * Parámetros esperados:
 * - startDate: Fecha inicial de consulta (YYYY-MM-DD)
 * - endDate: Fecha final de consulta (YYYY-MM-DD)
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === "listTasks") return handleTasksRequest(null, e.parameter);
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  initSheets(spreadsheet);
  
  var txSheet = spreadsheet.getSheetByName("Transacciones");
  var params = e.parameter || {};
  
  var startDateStr = params.startDate;
  var endDateStr = params.endDate;
  
  var startDate = startDateStr ? new Date(startDateStr) : null;
  var endDate = endDateStr ? new Date(endDateStr) : null;
  
  // Sin filtros explícitos devolver todo el histórico para saldos y otros dispositivos.
  if (!startDate || !endDate) {
    startDate = new Date(1900, 0, 1);
    endDate = new Date(9999, 11, 31);
  }
  
  // Configurar las horas al inicio y fin del día para comparaciones correctas
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  
  var rows = txSheet.getDataRange().getValues();
  
  var transactions = [];
  var ingresosMes = 0;
  var ingresosAdicionales = 0;
  var gastosMes = 0;
  var gastosAdicionales = 0;
  
  var allTimeIngresos = 0;
  var allTimeGastos = 0;
  
  // Recorrer las transacciones (omitir cabecera en fila 0)
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[0]) continue; // Omitir filas vacías
    
    var id = row[0];
    var regDate = row[1];
    var txDate = new Date(row[2]);
    var perfil = row[3];
    var tipo = row[4]; // Ingreso / Gasto
    var subtipo = row[5]; // Mensual / Adicional
    var motivo = row[6];
    var valor = Number(row[7]) || 0;
    
    // Suma de todo el histórico para el Total en Caja
    if (tipo === "Ingreso") {
      allTimeIngresos += valor;
    } else if (tipo === "Gasto") {
      allTimeGastos += valor;
    }
    
    // Validar si la transacción está en el rango de fechas
    var txTime = txDate.getTime();
    if (txTime >= startDate.getTime() && txTime <= endDate.getTime()) {
      transactions.push({
        id: id,
        fechaRegistro: regDate,
        fechaTransaccion: txDate,
        fecha: taskDateString(row[2], spreadsheet),
        perfil: perfil,
        tipo: tipo,
        subtipo: subtipo,
        motivo: motivo,
        valor: valor
      });
      
      // Acumular balances del mes
      if (tipo === "Ingreso") {
        if (subtipo === "Mensual") {
          ingresosMes += valor;
        } else {
          ingresosAdicionales += valor;
        }
      } else if (tipo === "Gasto") {
        if (subtipo === "Mensual") {
          gastosMes += valor;
        } else {
          gastosAdicionales += valor;
        }
      }
    }
  }
  
  // Ordenar transacciones: las más recientes primero
  transactions.sort(function(a, b) {
    return new Date(b.fechaTransaccion) - new Date(a.fechaTransaccion);
  });
  
  var totalCaja = allTimeIngresos - allTimeGastos;
  
  var response = {
    status: "success",
    startDate: startDateStr || startDate.toISOString().split('T')[0],
    endDate: endDateStr || endDate.toISOString().split('T')[0],
    totals: {
      ingresosMes: ingresosMes + ingresosAdicionales,
      ingresosDetalle: {
        mensual: ingresosMes,
        adicional: ingresosAdicionales
      },
      gastosMes: gastosMes + gastosAdicionales,
      gastosDetalle: {
        mensual: gastosMes,
        adicional: gastosAdicionales
      },
      totalCaja: totalCaja
    },
    transactions: transactions
  };
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Maneja las peticiones POST (Escritura de datos)
 * Se recibe como text/plain para evitar errores de preflight CORS (OPTIONS) en navegadores
 */
function doPost(e) {
  // La ruta de tareas administra su movimiento asociado en el servidor.
  try {
    var payload = JSON.parse(e.postData.contents);
    if (payload.entity === "task") return handleTasksRequest(payload);
  } catch (error) {
    return tasksJson({ status: "error", message: "Solicitud JSON inválida" });
  }
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  initSheets(spreadsheet);
  
  var txSheet = spreadsheet.getSheetByName("Transacciones");
  
  try {
    var postContent = e.postData.contents;
    var data = JSON.parse(postContent);
    
    var id = data.id || Utilities.getUuid();
    var now = new Date();
    // Usar la fecha provista o en su defecto la actual
    var txDate = data.fecha ? new Date(data.fecha) : now;
    
    // Append la nueva transacción
    txSheet.appendRow([
      id,
      now, // Fecha Registro
      txDate, // Fecha Transaccion
      data.perfil || "Desconocido",
      data.tipo || "Gasto",
      data.subtipo || "Adicional",
      data.motivo || "Sin concepto",
      Number(data.valor) || 0
    ]);
    
    var result = {
      status: "success",
      message: "Transacción guardada con éxito",
      id: id
    };
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    var errorResult = {
      status: "error",
      message: error.toString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function tasksJson(data) {
  data.tasksApi = 3;
  data.tasksBuild = '2026-10-22.1';
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function taskBoolean(value) { return value === true || String(value).toLowerCase() === 'true'; }
function taskDateString(value, spreadsheet) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, spreadsheet.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return String(value).split('T')[0];
}
function taskCycleKey(day, today) {
  var parts = today.split('-').map(Number);
  var year = parts[0], month = parts[1] - 1;
  var start = Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  if (parts[2] < start) { month--; if (month < 0) { year--; month = 11; } }
  start = Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(start).padStart(2, '0');
}
function taskShiftDate(fecha, fromCycle, toCycle) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || !fromCycle || fromCycle === toCycle) return fecha;
  var from = fromCycle.split('-').map(Number), to = toCycle.split('-').map(Number), parts = fecha.split('-').map(Number);
  var months = (to[0] - from[0]) * 12 + to[1] - from[1];
  var target = new Date(Date.UTC(parts[0], parts[1] - 1 + months, 1));
  target.setUTCDate(Math.min(parts[2], new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()));
  return target.toISOString().slice(0, 10);
}
function taskValidPayment(payment) {
  var fecha = payment.fecha || '';
  return ['Gasto', 'Ingreso'].indexOf(payment.tipo) !== -1 && Number.isSafeInteger(payment.valor) && payment.valor > 0 &&
    typeof payment.subtipo === 'string' && payment.subtipo.trim().length > 0 && payment.subtipo.length <= 100 &&
    typeof payment.motivo === 'string' && payment.motivo.length <= 200 &&
    /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !isNaN(new Date(fecha + 'T12:00:00Z').getTime()) && new Date(fecha + 'T12:00:00Z').toISOString().slice(0, 10) === fecha;
}
function taskFromRow(row, spreadsheet) {
  return { id: String(row[0]), perfil: String(row[1]), texto: String(row[2]), completada: taskBoolean(row[3]),
    createdAt: row[4], eliminada: false, tipo: row[7] || '', valor: Number(row[8]) || 0,
    fecha: taskDateString(row[9], spreadsheet), movimientoId: row[10] || '', subtipo: row[11] || 'Otros',
    ciclo: row[12] || '', motivo: row[13] === undefined ? String(row[2]) : String(row[13]),
    fechaBase: taskDateString(row[14], spreadsheet) || taskDateString(row[9], spreadsheet), cicloBase: row[15] || row[12] || '' };
}
function handleTasksRequest(payload, params) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var properties = PropertiesService.getScriptProperties();
    var storedDay = properties.getProperty('TASK_CYCLE_DAY');
    var requestedDay = Number(params && params.cycleDay);
    var day = storedDay ? Number(storedDay) : (Number.isInteger(requestedDay) && requestedDay >= 1 && requestedDay <= 31 ? requestedDay : 1);
    if (payload && payload.action === 'CONFIG') {
      day = Number(payload.cycleDay);
      if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('El día de inicio de ciclo debe estar entre 1 y 31');
    }
    properties.setProperty('TASK_CYCLE_DAY', String(day));
    var timezone = spreadsheet.getSpreadsheetTimeZone();
    var today = taskDateString(new Date(), spreadsheet);
    var cycle = taskCycleKey(day, today);
    if (payload && payload.action === 'CONFIG') return tasksJson({ status: 'success', cycleDay: day, cycleKey: cycle, timezone: timezone });
    var sheet = spreadsheet.getSheetByName('Tareas');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('Tareas');
      sheet.appendRow(['ID', 'Perfil', 'Tarea', 'Completada', 'Fecha Creación', 'Fecha Actualización', 'Eliminada']);
      sheet.getRange('A1:G1').setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
      sheet.setFrozenRows(1); sheet.setColumnWidth(3, 320);
    }
    ensureTaskColumns(sheet, 16);
    sheet.getRange(1, 8, 1, 9).setValues([['Tipo', 'Valor', 'Fecha Pago', 'Último ID Movimiento', 'Categoría', 'Ciclo', 'Descripción', 'Fecha Base', 'Ciclo Base']]);
    var rows = sheet.getDataRange().getValues();
    // El reinicio se aplica al consultar o escribir, sin crear ni borrar movimientos.
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row[0] || taskBoolean(row[6])) continue;
      var previousCycle = row[12] || taskCycleKey(day, taskDateString(row[5] || row[4], spreadsheet) || today);
      var needsBase = !row[14] || !row[15];
      row[14] = taskDateString(row[14], spreadsheet) || taskDateString(row[9], spreadsheet);
      row[15] = row[15] || previousCycle;
      if (needsBase) sheet.getRange(r + 1, 15, 1, 2).setValues([[row[14] || '', row[15]]]);
      if (previousCycle !== cycle) {
        row[3] = false;
        row[9] = taskShiftDate(row[14], row[15], cycle);
        sheet.getRange(r + 1, 4).setValues([[false]]);
        sheet.getRange(r + 1, 10).setValues([[row[9] || '']]);
      }
      if (row[12] !== cycle) sheet.getRange(r + 1, 13).setValues([[cycle]]);
      row[12] = cycle;
    }
    if (!payload) {
      var tasks = [], deletedIds = [];
      for (var i = 1; i < rows.length; i++) {
        if (!rows[i][0]) continue;
        if (taskBoolean(rows[i][6])) { deletedIds.push(String(rows[i][0])); continue; }
        tasks.push(taskFromRow(rows[i], spreadsheet));
      }
      SpreadsheetApp.flush();
      return tasksJson({ status: 'success', tasks: tasks, deletedIds: deletedIds, cycleDay: day, cycleKey: cycle, timezone: timezone });
    }
    var task = payload.task;
    if (!task || typeof task.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.id) ||
        typeof task.perfil !== 'string' || !task.perfil.trim() || typeof task.texto !== 'string' || !task.texto.trim() ||
        task.texto.length > 200 || typeof task.completada !== 'boolean' || ['UPSERT', 'DELETE'].indexOf(payload.action) === -1) throw new Error('Datos de tarea inválidos');
    var rowIndex = -1;
    for (var j = 1; j < rows.length; j++) { if (String(rows[j][0]) === task.id) { rowIndex = j; break; } }
    if (rowIndex !== -1 && String(rows[rowIndex][1]) !== task.perfil) throw new Error('Perfil de tarea incorrecto');
    var existing = rowIndex === -1 ? null : taskFromRow(rows[rowIndex], spreadsheet);
    var payment = { tipo: task.tipo !== undefined ? task.tipo : existing ? existing.tipo : '',
      valor: task.valor !== undefined ? Number(task.valor) : existing ? existing.valor : 0,
      fecha: task.fecha !== undefined ? task.fecha : existing ? existing.fecha : '',
      subtipo: task.subtipo || (existing ? existing.subtipo : 'Otros'),
      motivo: task.motivo !== undefined ? task.motivo : task.texto };
    var hasPayment = Boolean(payment.tipo || payment.valor || payment.fecha);
    if (payload.action !== 'DELETE' && hasPayment && !taskValidPayment(payment)) throw new Error('Completa tipo, categoría, monto válido, fecha y descripción opcional');
    var events = task.checkEvents || [];
    if (!Array.isArray(events)) throw new Error('Lista de marcados inválida');
    events.forEach(function(event) {
      if (!event || typeof event.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(event.id) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(event.ciclo || '') || !taskValidPayment(event.payment) ||
          (event.checkedAt && isNaN(new Date(event.checkedAt).getTime()))) throw new Error('Marcado inválido');
    });
    var movementId = existing ? existing.movimientoId : '';
    // Procesar TODOS los marcados, aunque la tarea termine desmarcada o eliminada.
    var movements = [];
    events.forEach(function(event) {
      var movement = appendTaskCheck(spreadsheet, task, event);
      movementId = movement.id;
      movements.push(movement);
    });
    var ack = events.map(function(event) { return event.id; });
    if (rowIndex !== -1 && taskBoolean(rows[rowIndex][6])) return tasksJson({ status: 'success', id: task.id, ackEvents: ack, movements: movements });
    var taskCycle = task.ciclo || cycle;
    var completed = task.completada && taskCycle === cycle;
    var baseDate = task.fechaBase || (existing ? existing.fechaBase : '') || payment.fecha;
    var baseCycle = task.cicloBase || (existing ? existing.cicloBase : '') || taskCycle;
    payment.fecha = taskShiftDate(baseDate, baseCycle, cycle);
    var target = rowIndex === -1 ? sheet.getLastRow() + 1 : rowIndex + 1;
    var createdAt = rowIndex === -1 ? new Date() : rows[rowIndex][4];
    sheet.getRange(target, 1, 1, 16).setValues([[task.id, '', '', completed, createdAt, new Date(), payload.action === 'DELETE',
      payment.tipo || '', payment.valor || 0, payment.fecha || '', movementId, '', cycle, '', baseDate || '', baseCycle]]);
    sheet.getRange(target, 2).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(task.perfil).build());
    sheet.getRange(target, 3).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(task.texto).build());
    sheet.getRange(target, 12).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(payment.subtipo).build());
    sheet.getRange(target, 14).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(payment.motivo).build());
    SpreadsheetApp.flush();
    return tasksJson({ status: 'success', id: task.id, ackEvents: ack, movements: movements });
  } catch (error) { return tasksJson({ status: 'error', message: String(error.message || error) }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function appendTaskCheck(spreadsheet, task, event) {
  var id = 'task_event_' + event.id;
  var sheet = spreadsheet.getSheetByName('Transacciones');
  if (!sheet) { initSheets(spreadsheet); sheet = spreadsheet.getSheetByName('Transacciones'); }
  ensureTaskColumns(sheet, 12);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id) {
      if (String(rows[i][3]) !== task.perfil || String(rows[i][8]) !== task.id) throw new Error('El marcado ya pertenece a otra tarea');
      return taskMovementFromRow(rows[i], spreadsheet); // Reintentar no duplica ni modifica el historial.
    }
  }
  var payment = event.payment;
  sheet.getRange(1, 9, 1, 4).setValues([['ID Tarea', 'ID Marcado', 'Ciclo Tarea', 'Fecha Marcado']]);
  var target = sheet.getLastRow() + 1;
  var literal = function(value) { return String(value).charAt(0) === '=' ? "'" + value : value; };
  sheet.getRange(target, 1, 1, 12).setValues([[id, new Date(), payment.fecha, literal(task.perfil), payment.tipo, literal(payment.subtipo), literal(payment.motivo), payment.valor,
    task.id, event.id, event.ciclo, event.checkedAt ? new Date(event.checkedAt) : new Date()]]);
  sheet.getRange(target, 4).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(task.perfil).build());
  sheet.getRange(target, 6).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(payment.subtipo).build());
  sheet.getRange(target, 7).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(payment.motivo).build());
  SpreadsheetApp.flush();
  return { id: id, fecha: payment.fecha, perfil: task.perfil, tipo: payment.tipo, subtipo: payment.subtipo, motivo: payment.motivo, valor: payment.valor };
}

function ensureTaskColumns(sheet, required) {
  var count = sheet.getMaxColumns();
  if (count < required) sheet.insertColumnsAfter(count, required - count);
}

function taskMovementFromRow(row, spreadsheet) {
  return { id: String(row[0]), fecha: taskDateString(row[2], spreadsheet), perfil: String(row[3]),
    tipo: String(row[4]), subtipo: String(row[5]), motivo: String(row[6]), valor: Number(row[7]) || 0 };
}
