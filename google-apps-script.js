/** Backend de Appa Cuentas. Actualiza la implementación existente después de guardar. */
var FINANCE_SPREADSHEET_ID = '14P9eEwFt-1c55Rf7LA5zkSGV4EDqJwhmhSAxH3gWx8w';
function financeSpreadsheet() { return SpreadsheetApp.openById(FINANCE_SPREADSHEET_ID); }
function verificarConexion() {
  var spreadsheet = financeSpreadsheet(), ledger = financeLedger(spreadsheet, false);
  var result = { build: '2026-10-30.1', spreadsheetId: FINANCE_SPREADSHEET_ID, ledgerSheet: ledger.sheet.getName(),
    headers: ledger.rows[0], movementCount: ledger.rows.slice(1).filter(function(row) { return Boolean(row[ledger.schema.id]); }).length };
  console.log(JSON.stringify(result));
  return result;
}
function financeJson(data) {
  data.financeApi = 1;
  data.build = '2026-10-30.1';
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function financeHeader(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function financeSchema(rows) {
  var headers = (rows[0] || []).map(financeHeader);
  function column(names) { for (var i = 0; i < names.length; i++) { var index = headers.indexOf(names[i]); if (index !== -1) return index; } return -1; }
  return { id: column(['id','idtransaccion','idmovimiento']), fecha: column(['fechatransaccion','fechamovimiento','fecha','date']),
    registro: column(['fecharegistro','createdat']), perfil: column(['perfil','usuario']), tipo: column(['tipo','tipomovimiento']),
    subtipo: column(['subtipo','categoria']), motivo: column(['motivo','descripcion','observacion','descripcionobservacion','concepto']),
    valor: column(['valor','monto','importe']), taskId: column(['idtarea']), eventId: column(['idmarcado']),
    cycle: column(['ciclotarea']), checkedAt: column(['fechamarcado']), synced: column(['synced','sincronizado']) };
}
function financeLedger(spreadsheet, create) {
  var sheets = spreadsheet.getSheets(), candidates = [];
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName() === 'Tareas') continue;
    var rows = sheets[i].getDataRange().getValues(), schema = financeSchema(rows);
    if (schema.id >= 0 && schema.fecha >= 0 && schema.tipo >= 0 && schema.valor >= 0) {
      candidates.push({ sheet: sheets[i], rows: rows, schema: schema, populated: rows.slice(1).some(function(row) { return Boolean(row[schema.id]); }) });
    }
  }
  var populated = candidates.filter(function(item) { return item.populated; });
  var options = populated.length ? populated : candidates;
  var preferred = options.filter(function(item) { return item.sheet.getName() === 'Transacciones'; });
  if (preferred.length === 1) return preferred[0];
  if (options.length === 1) return options[0];
  if (options.length > 1) throw new Error('Hay varias pestañas de movimientos: ' + options.map(function(item) { return item.sheet.getName(); }).join(', ') + '. No se eligió una para evitar mezclar datos.');
  if (!create) throw new Error('No se encontró una pestaña con encabezados ID, Fecha, Tipo y Valor/Monto en la hoja configurada. No se han borrado datos.');
  if (spreadsheet.getSheetByName('Transacciones')) throw new Error('La pestaña Transacciones tiene encabezados no reconocidos. No se ha modificado su estructura.');
  var sheet = spreadsheet.insertSheet('Transacciones');
  sheet.appendRow(['ID','Fecha Registro','Fecha Transaccion','Perfil','Tipo','Subtipo','Motivo','Valor']);
  sheet.setFrozenRows(1);
  return { sheet: sheet, rows: sheet.getDataRange().getValues(), schema: financeSchema(sheet.getDataRange().getValues()) };
}
function initSheets(spreadsheet) { financeLedger(spreadsheet, true); }
function financeDate(value, spreadsheet) {
  if (value instanceof Date) return Utilities.formatDate(value, spreadsheet.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  var text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  var match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (match) return match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
  return '';
}
function financeNumber(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  var text = String(value || '').replace(/[^0-9,.-]/g, '');
  if (text.indexOf(',') !== -1) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  return Number(text) || 0;
}
function financeMovement(row, schema, spreadsheet) {
  var tipo = String(row[schema.tipo] || '').trim();
  if (/^ingreso$/i.test(tipo)) tipo = 'Ingreso';
  if (/^(gasto|egreso)$/i.test(tipo)) tipo = 'Gasto';
  return { id: String(row[schema.id]), fecha: financeDate(row[schema.fecha], spreadsheet),
    perfil: schema.perfil >= 0 ? String(row[schema.perfil] || 'General') : 'General', tipo: tipo,
    subtipo: schema.subtipo >= 0 ? String(row[schema.subtipo] || '') : '', motivo: schema.motivo >= 0 ? String(row[schema.motivo] || '') : '',
    valor: financeNumber(row[schema.valor]), synced: true };
}
function doGet(e) {
  var params = e && e.parameter || {};
  if (params.action === 'listTasks') return handleTasksRequest(null, params);
  if (params.action === 'capabilities') return financeJson({ status: 'success', tasksApi: 3 });
  try {
    var spreadsheet = financeSpreadsheet(), ledger = financeLedger(spreadsheet, false);
    var transactions = ledger.rows.slice(1).filter(function(row) { return Boolean(row[ledger.schema.id]); }).map(function(row) { return financeMovement(row, ledger.schema, spreadsheet); });
    if (params.action === 'diagnostics') return financeJson({ status: 'success', spreadsheetId: FINANCE_SPREADSHEET_ID, ledgerSheet: ledger.sheet.getName(), headers: ledger.rows[0], movementCount: transactions.length });
    var incomes = 0, expenses = 0;
    transactions.forEach(function(tx) { if (tx.tipo === 'Ingreso') incomes += tx.valor; if (tx.tipo === 'Gasto') expenses += tx.valor; });
    if (params.startDate) transactions = transactions.filter(function(tx) { return tx.fecha >= params.startDate; });
    if (params.endDate) transactions = transactions.filter(function(tx) { return tx.fecha <= params.endDate; });
    transactions.sort(function(a, b) { return b.fecha.localeCompare(a.fecha); });
    return financeJson({ status: 'success', spreadsheetId: FINANCE_SPREADSHEET_ID, ledgerSheet: ledger.sheet.getName(),
      data: transactions, transactions: transactions, totals: { ingresosMes: incomes, gastosMes: expenses, totalCaja: incomes - expenses } });
  } catch (error) { return financeJson({ status: 'error', message: String(error.message || error) }); }
}
function financeWriteMovement(ledger, data, target) {
  var schema = ledger.schema, width = Math.max(ledger.rows[0].length, 1);
  var row = target <= ledger.rows.length ? ledger.rows[target - 1].slice() : [];
  while (row.length < width) row.push('');
  function put(column, value) { if (column >= 0) row[column] = value; }
  put(schema.id, data.id); put(schema.fecha, data.fecha); put(schema.tipo, data.tipo); put(schema.valor, data.valor);
  if (schema.registro >= 0 && !row[schema.registro]) row[schema.registro] = new Date();
  var literal = function(value) { return String(value).charAt(0) === '=' ? "'" + value : value; };
  put(schema.perfil, literal(data.perfil || 'General')); put(schema.subtipo, literal(data.subtipo || 'Otros')); put(schema.motivo, literal(data.motivo || '')); put(schema.synced, true);
  if (data.taskId) { put(schema.taskId, data.taskId); put(schema.eventId, data.eventId); put(schema.cycle, data.cycle); put(schema.checkedAt, data.checkedAt); }
  ledger.sheet.getRange(target, 1, 1, width).setValues([row]);
  [[schema.perfil, data.perfil || 'General'], [schema.subtipo, data.subtipo || 'Otros'], [schema.motivo, data.motivo || '']].forEach(function(item) {
    if (item[0] >= 0) ledger.sheet.getRange(target, item[0] + 1).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(String(item[1])).build());
  });
}
function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (error) { return financeJson({ status: 'error', message: 'Solicitud JSON inválida' }); }
  if (data.entity === 'task') return handleTasksRequest(data);
  if (typeof data.id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(data.id) ||
      ['CREATE', 'UPDATE', 'DELETE'].indexOf(data.action) === -1) {
    return financeJson({ status: 'error', message: 'Se requiere ID estable y acción CREATE, UPDATE o DELETE' });
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var spreadsheet = financeSpreadsheet(), ledger = financeLedger(spreadsheet, true);
    var id = data.id, index = -1;
    for (var i = 1; i < ledger.rows.length; i++) if (String(ledger.rows[i][ledger.schema.id]) === String(id)) { index = i; break; }
    if (data.action === 'DELETE') {
      if (index !== -1) ledger.sheet.deleteRow(index + 1);
    } else if (index === -1 || data.action === 'UPDATE') {
      var payment = { id: id, fecha: financeDate(data.fecha, spreadsheet), tipo: data.tipo, perfil: data.perfil, subtipo: data.subtipo, motivo: data.motivo, valor: financeNumber(data.valor) };
      if (!payment.fecha || ['Gasto','Ingreso'].indexOf(payment.tipo) === -1 || payment.valor <= 0) throw new Error('Fecha, tipo o monto inválidos');
      financeWriteMovement(ledger, payment, index === -1 ? ledger.sheet.getLastRow() + 1 : index + 1);
    }
    SpreadsheetApp.flush();
    return financeJson({ status: 'success', id: id, message: 'Movimiento confirmado en Google Sheets' });
  } catch (error) { return financeJson({ status: 'error', message: String(error.message || error) }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function tasksJson(data) {
  data.tasksApi = 3;
  data.tasksBuild = '2026-10-30.1';
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
    ciclo: taskDateString(row[12], spreadsheet), motivo: row[13] === undefined ? String(row[2]) : String(row[13]),
    fechaBase: taskDateString(row[14], spreadsheet) || taskDateString(row[9], spreadsheet),
    cicloBase: taskDateString(row[15], spreadsheet) || taskDateString(row[12], spreadsheet) };
}
function handleTasksRequest(payload, params) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var spreadsheet = financeSpreadsheet();
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
      var previousCycle = taskDateString(row[12], spreadsheet) || taskCycleKey(day, taskDateString(row[5] || row[4], spreadsheet) || today);
      var needsBase = !row[14] || !row[15];
      row[14] = taskDateString(row[14], spreadsheet) || taskDateString(row[9], spreadsheet);
      row[15] = taskDateString(row[15], spreadsheet) || previousCycle;
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
    var taskCycle = taskDateString(task.ciclo, spreadsheet) || cycle;
    var completed = task.completada && taskCycle === cycle;
    var baseDate = task.fechaBase || (existing ? existing.fechaBase : '') || payment.fecha;
    var baseCycle = taskDateString(task.cicloBase, spreadsheet) || (existing ? existing.cicloBase : '') || taskCycle;
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
  var ledger = financeLedger(spreadsheet, true);
  var headers = ledger.rows[0].slice(), originalWidth = headers.length;
  [['taskId','ID Tarea'], ['eventId','ID Marcado'], ['cycle','Ciclo Tarea'], ['checkedAt','Fecha Marcado']].forEach(function(field) {
    if (ledger.schema[field[0]] < 0) headers.push(field[1]);
  });
  if (headers.length !== originalWidth) {
    ensureTaskColumns(ledger.sheet, headers.length);
    ledger.sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    ledger.rows = ledger.sheet.getDataRange().getValues();
    ledger.schema = financeSchema(ledger.rows);
  }
  var schema = ledger.schema;
  for (var i = 1; i < ledger.rows.length; i++) {
    if (String(ledger.rows[i][schema.id]) === id) {
      if (String(ledger.rows[i][schema.taskId]) !== task.id) throw new Error('El marcado ya pertenece a otra tarea');
      return financeMovement(ledger.rows[i], schema, spreadsheet);
    }
  }
  var payment = event.payment;
  var data = { id: id, fecha: payment.fecha, perfil: task.perfil, tipo: payment.tipo, subtipo: payment.subtipo, motivo: payment.motivo,
    valor: payment.valor, taskId: task.id, eventId: event.id, cycle: event.ciclo, checkedAt: event.checkedAt ? new Date(event.checkedAt) : new Date() };
  financeWriteMovement(ledger, data, ledger.sheet.getLastRow() + 1);
  SpreadsheetApp.flush();
  return { id: id, fecha: payment.fecha, perfil: task.perfil, tipo: payment.tipo, subtipo: payment.subtipo, motivo: payment.motivo, valor: payment.valor };
}

function ensureTaskColumns(sheet, required) {
  var count = sheet.getMaxColumns();
  if (count < required) sheet.insertColumnsAfter(count, required - count);
}
