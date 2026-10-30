const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function clock() {
  let now = '2026-10-21T15:00:00Z';
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return new Date(now).getTime(); } }
  return { Date: ClockDate, set: value => { now = value; } };
}
function backend() {
  const sheets = new Map(), properties = new Map(), time = clock(); let locked = false;
  const context = vm.createContext({ Date: time.Date,
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType() { return JSON.parse(text); } }) },
    LockService: { getScriptLock: () => ({ waitLock() { locked = true; }, hasLock: () => locked, releaseLock() { locked = false; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value) }) },
    Utilities: { formatDate: (value, timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value) },
    SpreadsheetApp: { flush() {},
      openById: () => context.SpreadsheetApp.getActiveSpreadsheet(),
      newRichTextValue: () => ({ setText(text) { this.text = text; return this; }, build() { return this.text; } }),
      getActiveSpreadsheet: () => ({ getSpreadsheetTimeZone: () => 'America/Bogota', getSheetByName: name => sheets.get(name), getSheets: () => Array.from(sheets.values()),
        insertSheet(name) {
          const rows = [];
          const sheet = { rows, getName: () => name, maxColumns: 26, getMaxColumns() { return this.maxColumns; },
            insertColumnsAfter(after, count) { this.maxColumns += count; },
            appendRow(row) { rows.push(row); }, deleteRow(row) { rows.splice(row - 1, 1); }, setFrozenRows() {}, setColumnWidth() {},
            getLastRow: () => rows.length, getDataRange: () => ({ getValues: () => rows.map(row => [...row]) }),
            getRange(row, col, height = 1, width = 1) {
              if (typeof row === 'number' && col + width - 1 > this.maxColumns) throw new Error('El rango supera las columnas de la hoja');
              return {
              setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; },
              setValues(values) { values.forEach((value, offset) => { rows[row - 1 + offset] ||= []; value.forEach((cell, index) => { rows[row - 1 + offset][col - 1 + index] = cell; }); }); },
              setRichTextValue(value) { rows[row - 1][col - 1] = value; }
            }; }
          }; sheets.set(name, sheet); return sheet;
        }
      })
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'google-apps-script.js'), 'utf8'), context);
  return { context, sheets, properties, time, post: payload => context.doPost({ postData: { contents: JSON.stringify(payload) } }),
    get: (params = {}) => context.doGet({ parameter: { action: 'listTasks', ...params } }),
    tx: () => (sheets.get('Transacciones')?.rows || []).slice(1) };
}
function frontend(initial = [], url = 'https://example.com/exec') {
  const elements = new Map(), time = clock();
  function element() { return { children: [], listeners: {}, value: '', className: '', classList: { add() {}, remove() {}, toggle() {} }, contains() { return false; },
    addEventListener(name, cb) { this.listeners[name] = cb; }, append(...children) { this.children.push(...children); }, appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; }, setAttribute() {}, focus() {}, reset() {}, showModal() {}, close() {} }; }
  const storage = new Map([['app_tasks', JSON.stringify(initial)], ['app_api_url', url]]);
  const context = vm.createContext({ Date: time.Date, activePerfil: 'Fernando', crypto: require('node:crypto').webcrypto, navigator: { onLine: true },
    URL, AbortController, setTimeout, clearTimeout, console: { error() {} }, mostrarToast() {}, confirm: () => true, setInterval() {},
    window: { addEventListener() {} }, document: { addEventListener() {}, createElement: element,
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'tasks.js'), 'utf8'), context);
  return { context, elements, storage, time, run: code => vm.runInContext(code, context), state: () => JSON.parse(vm.runInContext('JSON.stringify(tasks)', context)) };
}
function connect(ui, api) {
  ui.context.fetch = async (url, options) => {
    const json = options.method === 'POST' ? api.post(JSON.parse(options.body)) : api.get(Object.fromEntries(new URL(url).searchParams));
    return { ok: true, json: async () => json };
  };
}
function task(changes = {}) { return { id: 't1', perfil: 'Fernando', texto: 'Internet', motivo: 'Factura mensual', tipo: 'Gasto', subtipo: 'Servicios', valor: 90000, fecha: '2026-10-21', ciclo: '2026-10-01', completada: false, checkEvents: [], ...changes }; }
function event(item, id = 'event1') { return { id, ciclo: item.ciclo, payment: { tipo: item.tipo, subtipo: item.subtipo, valor: item.valor, fecha: item.fecha, motivo: item.motivo } }; }
function save(api, item, action = 'UPSERT') { return api.post({ entity: 'task', action, task: item }); }

function financeUI(api) {
  const ui = frontend();
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ui.context);
  ui.run('activePerfil = "Fernando"; renderAll = () => {};');
  ui.context.setTimeout = () => 0;
  ui.context.document.getElementById('btnGuardar').querySelector = () => ({});
  ui.context.document.getElementById('btnCancelEdit').remove = () => {};
  ui.context.document.getElementById('txForm').reset = () => {
    ui.context.document.getElementById('valor').value = '';
    ui.context.document.getElementById('motivo').value = '';
  };
  ui.context.fetch = async (url, options = {}) => ({ ok: true, json: async () =>
    options.method === 'POST' ? api.post(JSON.parse(options.body)) : api.context.doGet({ parameter: Object.fromEntries(new URL(url).searchParams) }) });
  ui.fill = () => ui.run('document.getElementById("valor").value = "90000"; document.getElementById("fecha").value = "2026-10-21"; document.getElementById("tipo").value = "Gasto"; document.getElementById("subtipo").value = "Servicios"; document.getElementById("motivo").value = "Prueba"');
  return ui;
}

test('Doble envío simultáneo y Enter después de guardar crean exactamente un movimiento', async () => {
  const api = backend(), ui = financeUI(api); ui.fill();
  await ui.run('Promise.all([handleFormSubmit({preventDefault(){}}), handleFormSubmit({preventDefault(){}})])');
  await ui.run('handleFormSubmit({preventDefault(){}})');
  assert.equal(api.tx().length, 1);
  assert.equal(ui.run('pendingActions.length'), 0);
  assert.equal(ui.run('transactions[0].synced'), true);
  assert.equal(ui.elements.get('btnGuardar').disabled, false);
});

test('Un registro no se envía en paralelo al reconectar; reintentos de respuesta perdida conservan su ID', async () => {
  const api = backend(), ui = financeUI(api); ui.fill();
  const fetch = ui.context.fetch; let posts = 0, lose = true;
  ui.context.fetch = async (url, options) => {
    const response = await fetch(url, options);
    if (options.method === 'POST') { posts++; await response.json(); if (lose) { lose = false; throw new Error('Respuesta perdida'); } }
    return response;
  };
  await ui.run('Promise.all([handleFormSubmit({preventDefault(){}}), syncPendingTransactions(), syncPendingTransactions()])');
  assert.equal(posts, 1); assert.equal(api.tx().length, 1); assert.equal(ui.run('pendingActions.length'), 1);
  await ui.run('Promise.all([syncPendingTransactions(), syncPendingTransactions()])');
  assert.equal(posts, 2); assert.equal(api.tx().length, 1); assert.equal(ui.run('pendingActions.length'), 0);
});

test('Un servidor antiguo no recibe escrituras manuales inseguras', async () => {
  const ui = financeUI(backend()); ui.fill(); let posts = 0;
  ui.context.fetch = async (url, options) => { if (options.method === 'POST') posts++; return { ok: true, json: async () => ({ status: 'success', data: [] }) }; };
  await ui.run('handleFormSubmit({preventDefault(){}})');
  await ui.run('syncPendingTransactions()');
  assert.equal(posts, 0); assert.equal(ui.run('pendingActions.length'), 1);
  assert.match(ui.run('cloudLoadError'), /Apps Script/);
});

test('Una lectura anterior al guardado no hace desaparecer el movimiento confirmado', async () => {
  const api = backend(), ui = financeUI(api); ui.fill();
  const fetch = ui.context.fetch; let release;
  ui.context.fetch = (url, options) => options.method === 'GET' ? new Promise(resolve => { release = () => resolve({ok: true, json: async () => ({data: []})}); }) : fetch(url, options);
  const reading = ui.run('fetchCloudTransactions()');
  await ui.run('handleFormSubmit({preventDefault(){}})');
  release(); await reading;
  assert.equal(ui.run('transactions.length'), 1); assert.equal(ui.run('transactions[0].synced'), true);
});

test('Editar y eliminar offline sobreviven a recarga y a lecturas del servidor', async () => {
  const api = backend(), ui = financeUI(api); ui.fill(); await ui.run('handleFormSubmit({preventDefault(){}})');
  const id = ui.run('transactions[0].id');
  ui.context.navigator.onLine = false;
  ui.run(`editingTxId = ${JSON.stringify(id)}`); ui.fill(); ui.run('document.getElementById("valor").value = "100000"');
  await ui.run('handleFormSubmit({preventDefault(){}})');
  ui.context.navigator.onLine = true; await ui.run('fetchCloudTransactions()');
  assert.equal(ui.run('transactions[0].valor'), 100000);
  await ui.run('syncPendingTransactions()'); assert.equal(api.tx()[0][7], 100000);
  ui.context.navigator.onLine = false; await ui.run(`deleteTransaction(${JSON.stringify(id)})`);
  assert.equal(ui.run('transactions.length'), 0);
  const reloaded = financeUI(api);
  reloaded.run(`pendingActions = ${ui.storage.get('app_pending_actions')}; transactions = [];`);
  await reloaded.run('fetchCloudTransactions()'); assert.equal(reloaded.run('transactions.length'), 0);
  await reloaded.run('syncPendingTransactions()'); assert.equal(api.tx().length, 0);
  assert.equal(reloaded.run('pendingActions.length'), 0);
});

test('Servidor rechaza solicitudes sin ID o acción sin crear filas', () => {
  const api = backend();
  assert.equal(api.post({tipo:'Gasto', valor:1000, fecha:'2026-10-21'}).status, 'error');
  assert.equal(api.post({id:'a', action:'UPSERT', tipo:'Gasto', valor:1000, fecha:'2026-10-21'}).status, 'error');
  assert.equal(api.tx().length, 0);
});

test('Fechas reales de Sheets en Ciclo y Ciclo Base no provocan fromCycle.split y permiten marcar', async () => {
  const api = backend(); save(api, task());
  const row = api.sheets.get('Tareas').rows[1];
  row[12] = new api.time.Date('2026-10-01T05:00:00Z');
  row[15] = new api.time.Date('2026-10-01T05:00:00Z');
  let response = api.get();
  assert.equal(response.status, 'success'); assert.equal(response.tasks[0].ciclo, '2026-10-01');
  assert.equal(response.tasks[0].cicloBase, '2026-10-01');
  // Sheets puede volver a convertir el texto guardado en una celda de fecha.
  row[12] = new api.time.Date('2026-10-01T05:00:00Z');
  row[15] = new api.time.Date('2026-10-01T05:00:00Z');
  api.time.set('2026-11-02T15:00:00Z');
  response = api.get(); assert.equal(response.status, 'success');
  assert.equal(response.tasks[0].fecha, '2026-11-21');
  const item = response.tasks[0]; item.completada = true; item.checkEvents = [event(item)];
  assert.equal(save(api, item).status, 'success'); assert.equal(api.tx().length, 1);
  assert.equal(api.get().tasks[0].completada, true);
});

test('Balance, saldo anterior y gráficas incluyen movimientos manuales y de tareas de todos los perfiles', () => {
  const ui = frontend();
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ui.context);
  ui.context.Chart = class { constructor(ctx, config) { this.config = config; } destroy() {} };
  ui.context.document.getElementById('balanceChart').getContext = () => ({});
  ui.context.document.getElementById('monthlyTrendChart').getContext = () => ({});
  ui.run(`renderTable = () => {}; activePerfil = 'Fernando'; transactions = [
    {id:'prior',fecha:'2026-09-20',tipo:'Ingreso',valor:100000,perfil:'Eli'},
    {id:'manual',fecha:'2026-10-01',tipo:'Ingreso',valor:50000,perfil:'Fernando'},
    {id:'task_event_1',fecha:'2026-10-21',tipo:'Gasto',valor:20000,perfil:'Eli'}]; renderAll();`);
  assert.equal(ui.elements.get('totalBalance').innerText, '$ 130.000');
  assert.match(ui.elements.get('remanenteAnteriorText').innerText, /100.000/);
  assert.equal(ui.elements.get('totalIngresos').innerText, '$ 50.000');
  assert.equal(ui.elements.get('totalGastos').innerText, '$ 20.000');
  assert.equal(ui.run('donutChartInstance.config.data.datasets[0].data[0]'), 20000);
  assert.equal(ui.run('monthlyChartInstance.config.data.datasets[0].data.at(-1)'), 50000);
  assert.equal(ui.run('monthlyChartInstance.config.data.datasets[1].data.at(-1)'), 20000);
});

test('Cada marcado crea un movimiento; desmarcar, editar y eliminar conservan todos los anteriores', () => {
  const api = backend(), item = task();
  assert.equal(save(api, item).status, 'success'); assert.equal(api.tx().length, 0);
  item.completada = true; item.checkEvents = [event(item)];
  assert.deepEqual(save(api, item).ackEvents, ['event1']);
  assert.deepEqual(api.tx()[0].slice(2, 8), ['2026-10-21', 'Fernando', 'Gasto', 'Servicios', 'Factura mensual', 90000]);
  save(api, item); assert.equal(api.tx().length, 1, 'Reintentar el MISMO marcado no duplica');
  item.completada = false; item.checkEvents = []; save(api, item); assert.equal(api.tx().length, 1);
  item.completada = true; item.checkEvents = [event(item, 'event2')]; save(api, item); assert.equal(api.tx().length, 2);
  item.checkEvents = []; item.valor = 120000; item.texto = 'Internet editado'; save(api, item);
  assert.equal(api.tx()[0][7], 90000, 'Editar la plantilla no modifica pagos anteriores');
  save(api, item, 'DELETE'); assert.equal(api.get().tasks.length, 0); assert.equal(api.tx().length, 2);
});

test('Offline: marcar/desmarcar/marcar/desmarcar guarda dos eventos incluso después de recargar', async () => {
  const api = backend(), ui = frontend([task({ pending: true, revision: 'r1' })]);
  ui.context.navigator.onLine = false;
  ui.run('updateTask("t1", { completada: true }); updateTask("t1", { completada: false }); updateTask("t1", { completada: true }); updateTask("t1", { completada: false })');
  assert.equal(ui.state()[0].checkEvents.length, 2);
  const restored = frontend(JSON.parse(ui.storage.get('app_tasks'))); connect(restored, api);
  await restored.run('syncTasks()');
  assert.equal(api.tx().length, 2); assert.equal(api.get().tasks[0].completada, false);
  assert.equal(restored.state()[0].checkEvents.length, 0);
  await restored.run('syncTasks()'); assert.equal(api.tx().length, 2);
});

test('Nuevo ciclo: tarea persiste desmarcada, conserva historial, avanza fecha y permite otro registro', () => {
  const api = backend(), item = task({ completada: true }); item.checkEvents = [event(item)]; save(api, item);
  api.time.set('2026-11-01T15:00:00Z');
  const next = api.get().tasks[0];
  assert.equal(next.id, item.id); assert.equal(next.completada, false); assert.equal(next.fecha, '2026-11-21'); assert.equal(next.ciclo, '2026-11-01');
  assert.equal(api.tx().length, 1); assert.equal(api.tx()[0][2], '2026-10-21');
  next.completada = true; next.checkEvents = [event(next, 'november')]; save(api, next);
  assert.equal(api.tx().length, 2); assert.equal(api.tx()[1][2], '2026-11-21');
});

test('Ciclo personalizado compartido: reinicia el día 15 y limita día 31 al fin de febrero', () => {
  const api = backend(); api.post({ entity: 'task', action: 'CONFIG', cycleDay: 15 });
  const item = task({ ciclo: '2026-10-15', completada: true }); item.checkEvents = [event(item)]; save(api, item);
  api.time.set('2026-11-14T15:00:00Z'); assert.equal(api.get({ cycleDay: '1' }).tasks[0].completada, true);
  api.time.set('2026-11-15T15:00:00Z'); assert.equal(api.get().tasks[0].completada, false);
  assert.equal(api.get().cycleDay, 15); assert.equal(api.tx().length, 1);
  for (const [today, expected] of [['2027-02-27', '2027-01-31'], ['2027-02-28', '2027-02-28'], ['2028-02-29', '2028-02-29'], ['2027-03-30', '2027-02-28'], ['2027-03-31', '2027-03-31']]) {
    assert.equal(api.context.taskCycleKey(31, today), expected);
  }
});

test('Frontend y servidor coinciden en ciclos y meses cortos; la zona de la hoja decide el reinicio', () => {
  const api = backend(), ui = frontend();
  for (const day of [1, 15, 29, 30, 31]) for (const today of ['2026-12-31', '2027-01-01', '2027-02-28', '2028-02-29', '2028-03-01']) {
    assert.equal(ui.context.taskCycleKey(day, today), api.context.taskCycleKey(day, today));
  }
  assert.equal(ui.context.taskShiftDate('2027-01-31', '2027-01-01', '2027-02-01'), '2027-02-28');
  api.time.set('2026-11-01T03:00:00Z'); ui.time.set('2026-11-01T03:00:00Z');
  assert.equal(api.get().cycleKey, '2026-10-01'); assert.equal(ui.run('currentTaskCycle()'), '2026-10-01');
});

test('Marcados offline del ciclo anterior se registran con su fecha sin marcar el ciclo nuevo', async () => {
  const api = backend(), ui = frontend([task({ pending: true, revision: 'r1' })]);
  ui.context.navigator.onLine = false; ui.run('updateTask("t1", { completada: true })');
  api.time.set('2026-11-02T15:00:00Z'); ui.time.set('2026-11-02T15:00:00Z'); ui.context.navigator.onLine = true;
  connect(ui, api); await ui.run('syncTasks()');
  assert.equal(api.tx().length, 1); assert.equal(api.tx()[0][2], '2026-10-21'); assert.equal(api.tx()[0][10], '2026-10-01');
  assert.equal(ui.state()[0].completada, false); assert.equal(ui.state()[0].fecha, '2026-11-21');
});

test('Dos dispositivos comparten la plantilla y cada marcado deliberado deja un movimiento separado', async () => {
  const api = backend(), a = frontend([task({ pending: true, revision: 'r1' })]), b = frontend(); connect(a, api); connect(b, api);
  await a.run('syncTasks()'); await b.run('syncTasks()'); assert.equal(b.state()[0].subtipo, 'Servicios');
  a.context.navigator.onLine = false; a.run('updateTask("t1", { completada: true })'); a.context.navigator.onLine = true;
  await a.run('syncTasks()'); await b.run('syncTasks()'); assert.equal(b.state()[0].completada, true);
  b.context.navigator.onLine = false; b.run('updateTask("t1", { completada: false }); updateTask("t1", { completada: true })'); b.context.navigator.onLine = true;
  await b.run('syncTasks()'); await a.run('syncTasks()'); assert.equal(api.tx().length, 2);
  b.context.navigator.onLine = false; b.run('updateTask("t1", { eliminada: true })'); b.context.navigator.onLine = true;
  await b.run('syncTasks()'); await a.run('syncTasks()'); assert.equal(a.state().length, 0); assert.equal(api.tx().length, 2);
});

test('Pérdida de respuesta reintenta el evento sin duplicar', async () => {
  const api = backend(), item = task({ completada: true, pending: true, revision: 'r1' }); item.checkEvents = [event(item)];
  const ui = frontend([item]); let fail = true;
  ui.context.fetch = async (url, options) => {
    const json = options.method === 'POST' ? api.post(JSON.parse(options.body)) : api.get();
    if (options.method === 'POST' && fail) { fail = false; throw new Error('Respuesta perdida'); }
    return { ok: true, json: async () => json };
  };
  await ui.run('syncTasks()'); assert.equal(ui.state()[0].checkEvents.length, 1); assert.equal(api.tx().length, 1);
  await ui.run('syncTasks()'); assert.equal(ui.state()[0].checkEvents.length, 0); assert.equal(api.tx().length, 1);
});

test('Marcar y eliminar offline conserva el marcado antes de ocultar la tarea', async () => {
  const api = backend(), ui = frontend([task({ pending: true, revision: 'r1' })]); ui.context.navigator.onLine = false;
  ui.run('updateTask("t1", { completada: true }); updateTask("t1", { completada: false }); updateTask("t1", { eliminada: true })');
  ui.context.navigator.onLine = true; connect(ui, api); await ui.run('syncTasks()');
  assert.equal(api.get().tasks.length, 0); assert.equal(api.tx().length, 1);
});

test('Migración conserva tareas e históricos de versión anterior sin registrar pagos retroactivos', () => {
  const api = backend(); api.get();
  api.sheets.get('Tareas').rows.push(['legacy', 'Fernando', 'Anterior', true, '2026-10-01', '2026-10-21', false, 'Gasto', 1000, '2026-10-21', 'task_legacy']);
  const migrated = api.get().tasks[0]; assert.equal(migrated.texto, 'Anterior'); assert.equal(migrated.subtipo, 'Otros'); assert.equal(migrated.movimientoId, 'task_legacy');
  save(api, { ...migrated, completada: false }); assert.equal(api.tx().length, 0);
});

test('Validación: rechaza importes, categorías, fechas y eventos inválidos sin escribir movimientos', () => {
  const api = backend(), item = task();
  for (const change of [{ fecha: '2026-02-30' }, { valor: -1 }, { valor: 1.5 }, { tipo: 'Otro' }, { subtipo: ' ' }]) assert.equal(save(api, { ...item, ...change }).status, 'error');
  assert.equal(save(api, { ...item, checkEvents: [{ ...event(item), payment: { ...event(item).payment, valor: -5 } }] }).status, 'error');
  assert.equal(api.tx().length, 0);
});

test('Formulario usa fecha, tipo, categoría, monto, descripción opcional y perfil activo', () => {
  const ui = frontend([], ''); ui.context.navigator.onLine = false; ui.run('initTasks()');
  ui.run('document.getElementById("taskText").value = ""; document.getElementById("taskCategory").value = "Colegio"; document.getElementById("taskType").value = "Ingreso"; document.getElementById("taskAmount").value = "$ 150.000"; document.getElementById("taskDate").value = "2026-10-21"');
  ui.elements.get('taskForm').listeners.submit({ preventDefault() {} });
  const item = ui.state()[0]; assert.equal(item.subtipo, 'Colegio'); assert.equal(item.motivo, ''); assert.equal(item.perfil, 'Fernando'); assert.equal(item.valor, 150000); assert.equal(item.checkEvents.length, 0);
  ui.run('activePerfil = "Eli"; renderTasks()'); assert.equal(ui.elements.get('tasksList').children.length, 0);
});

test('Backend antiguo no recibe tareas ni pierde eventos locales', async () => {
  const ui = frontend([task({ pending: true })]); let posts = 0;
  ui.context.fetch = async (url, options) => { if (options.method === 'POST') posts++; return { ok: true, json: async () => ({ status: 'success', tasksApi: 2, tasks: [] }) }; };
  await ui.run('syncTasks()'); assert.equal(posts, 0); assert.equal(ui.state()[0].pending, true);
});

test('Movimientos automáticos participan en histórico, categoría y balances normales', async () => {
  const api = backend(), item = task({ tipo: 'Ingreso', fecha: '2024-01-31', completada: true }); item.checkEvents = [event(item)]; save(api, item);
  const json = api.context.doGet({ parameter: {} }); assert.equal(json.transactions.length, 1); assert.equal(json.transactions[0].subtipo, 'Servicios'); assert.equal(json.totals.totalCaja, 90000);
  const ui = frontend(); vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ui.context); ui.run('renderAll = () => {}');
  ui.context.fetch = async () => ({ ok: true, json: async () => ({ transactions: [{ ...json.transactions[0], fecha: undefined, fechaTransaccion: '2024-01-31T00:00:00Z' }] }) });
  await ui.run('fetchCloudTransactions()'); assert.equal(ui.run('transactions[0].fecha'), '2024-01-31T00:00:00Z');
});

test('Marcar durante una petición conserva el segundo evento y su propio monto', async () => {
  const api = backend(), ui = frontend([task({ pending: true, revision: 'r1' })]);
  connect(ui, api); await ui.run('syncTasks()');
  ui.context.navigator.onLine = false; ui.run('updateTask("t1", { completada: true })'); ui.context.navigator.onLine = true;
  let changed = false;
  ui.context.fetch = async (url, options) => {
    const json = options.method === 'POST' ? api.post(JSON.parse(options.body)) : api.get();
    if (options.method === 'POST' && !changed) {
      changed = true;
      ui.run('updateTask("t1", { completada: false }); updateTask("t1", { valor: 100000 }); updateTask("t1", { completada: true })');
    }
    return { ok: true, json: async () => json };
  };
  await ui.run('syncTasks()');
  assert.equal(api.tx().length, 2); assert.equal(ui.state()[0].checkEvents.length, 0, 'El segundo marcado se envía en la misma sincronización');
  await ui.run('syncTasks()');
  assert.equal(api.tx().length, 2); assert.equal(api.tx()[0][7], 90000); assert.equal(api.tx()[1][7], 100000);
});

test('Fecha recurrente del 31 se limita en febrero y vuelve al 31 en marzo', () => {
  const api = backend(); api.time.set('2027-01-20T15:00:00Z');
  save(api, task({ ciclo: '2027-01-01', fecha: '2027-01-31' }));
  api.time.set('2027-02-01T15:00:00Z'); assert.equal(api.get().tasks[0].fecha, '2027-02-28');
  api.time.set('2027-03-01T15:00:00Z'); assert.equal(api.get().tasks[0].fecha, '2027-03-31');
});

test('Fallo después de registrar el movimiento permite recuperar la tarea sin duplicar historial', () => {
  const api = backend(); api.get();
  const sheet = api.sheets.get('Tareas'), getRange = sheet.getRange; let fail = true;
  sheet.getRange = function(row, col, ...args) {
    const range = getRange.call(this, row, col, ...args);
    if (row > 1 && col === 1 && fail) { fail = false; range.setValues = () => { throw new Error('Fallo temporal'); }; }
    return range;
  };
  const item = task({ completada: true }); item.checkEvents = [event(item)];
  assert.equal(save(api, item).status, 'error'); assert.equal(api.tx().length, 1);
  assert.equal(save(api, item).status, 'success'); assert.equal(api.tx().length, 1); assert.equal(api.get().tasks.length, 1);
});

test('Cambio de ciclo en Ajustes se comparte entre dispositivos y con el balance contable', async () => {
  const api = backend(), a = frontend(), b = frontend(); connect(a, api); connect(b, api);
  a.storage.set('app_dia_ciclo', '15'); a.storage.set('app_task_cycle_dirty', 'true');
  await a.run('syncTasks()'); await b.run('syncTasks()');
  assert.equal(b.storage.get('app_dia_ciclo'), '15'); assert.equal(b.run('currentTaskCycle()'), '2026-10-15');
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), b.context);
  const dates = b.run('getCycleDates()'); assert.equal(dates.startDate.getDate(), 15); assert.equal(dates.endDate.getDate(), 14);
});

test('Sin conexión durante dos ciclos conserva ambos marcados con sus fechas originales', async () => {
  const api = backend(), ui = frontend([task({ pending: true, revision: 'r1' })]);
  ui.context.navigator.onLine = false; ui.run('updateTask("t1", { completada: true })');
  api.time.set('2026-11-02T15:00:00Z'); ui.time.set('2026-11-02T15:00:00Z'); ui.run('renderTasks()');
  assert.equal(ui.state()[0].completada, false); assert.equal(ui.state()[0].checkEvents.length, 1);
  ui.run('updateTask("t1", { completada: true })');
  ui.context.navigator.onLine = true; connect(ui, api); await ui.run('syncTasks()');
  assert.equal(api.tx().length, 2);
  assert.equal(api.tx()[0][2], '2026-10-21'); assert.equal(api.tx()[1][2], '2026-11-21');
  assert.equal(api.tx()[0][11].toISOString(), '2026-10-21T15:00:00.000Z');
  assert.equal(ui.state()[0].completada, true);
});

test('Hojas reducidas a sus columnas originales se amplían antes de guardar marcados', () => {
  const api = backend(); api.get();
  api.sheets.get('Tareas').maxColumns = 7;
  api.context.initSheets(api.context.SpreadsheetApp.getActiveSpreadsheet());
  api.sheets.get('Transacciones').maxColumns = 8;
  const item = task({ completada: true }); item.checkEvents = [event(item)];
  assert.equal(save(api, item).status, 'success');
  assert.equal(api.sheets.get('Tareas').maxColumns, 16);
  assert.equal(api.sheets.get('Transacciones').maxColumns, 12);
  assert.equal(api.tx().length, 1);
});

test('Confirmación del marcado actualiza historial y balance aunque falle la descarga posterior', async () => {
  const api = backend(), item = task({ pending: true, revision: 'r1', completada: true }); item.checkEvents = [event(item)];
  const ui = frontend([item]);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ui.context);
  ui.run('let renderedNet = 0; renderAll = () => { renderedNet = transactions.reduce((sum, tx) => sum + (tx.tipo === "Ingreso" ? tx.valor : -tx.valor), 0); }');
  let gets = 0;
  ui.context.fetch = async (url, options) => {
    if (options.method !== 'POST' && ++gets > 1) throw new Error('Descarga temporalmente no disponible');
    const json = options.method === 'POST' ? api.post(JSON.parse(options.body)) : api.get();
    return { ok: true, json: async () => json };
  };
  await ui.run('syncTasks()');
  assert.equal(ui.run('transactions.length'), 1);
  assert.equal(ui.run('renderedNet'), -90000);
  assert.equal(ui.run('transactions[0].synced'), true);
  assert.equal(ui.state()[0].checkEvents.length, 0);
  // La misma confirmación, aplicada otra vez, tampoco duplica el historial local.
  const response = save(api, item);
  ui.context.applyConfirmedTaskMovements(response.movements);
  assert.equal(ui.run('transactions.length'), 1);
});

test('Una tarea antigua inválida no bloquea el movimiento de una tarea correcta', async () => {
  const api = backend();
  const invalid = task({ id: 'invalid', texto: 'Anterior inválida', valor: -1, pending: true, revision: 'bad' });
  const valid = task({ id: 'valid', completada: true, pending: true, revision: 'good' }); valid.checkEvents = [event(valid)];
  const ui = frontend([invalid, valid]); connect(ui, api); await ui.run('syncTasks()');
  assert.equal(api.tx().length, 1);
  const pending = ui.state().find(item => item.id === 'invalid');
  assert.equal(pending.pending, true); assert.match(pending.syncError, /Completa/);
  assert.equal(ui.state().find(item => item.id === 'valid').pending, false);
});

test('Un error de la gráfica no deja el marcado confirmado pendiente de sincronización', async () => {
  const api = backend(), item = task({ pending: true, revision: 'r1', completada: true }); item.checkEvents = [event(item)];
  const ui = frontend([item]);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ui.context);
  ui.run('renderAll = () => { throw new Error("Chart no disponible"); }');
  ui.context.fetch = async (url, options) => {
    const json = options.method === 'POST' ? api.post(JSON.parse(options.body)) :
      new URL(url).searchParams.get('action') === 'listTasks' ? api.get() : api.context.doGet({ parameter: {} });
    return { ok: true, json: async () => json };
  };
  await ui.run('syncTasks()');
  assert.equal(api.tx().length, 1); assert.equal(ui.state()[0].pending, false); assert.equal(ui.state()[0].checkEvents.length, 0);
  await ui.run('syncTasks()'); assert.equal(api.tx().length, 1);
});

test('Seis marcados con seis desmarcados dejan seis movimientos y el balance correspondiente', async () => {
  for (const tipo of ['Gasto', 'Ingreso']) {
    const api = backend(), ui = frontend([task({ tipo, pending: true, revision: 'r1' })]);
    vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ui.context);
    ui.run('activePerfil = "Fernando"; let netFromTasks = 0; renderAll = () => { netFromTasks = transactions.reduce((sum, tx) => sum + (tx.tipo === "Ingreso" ? tx.valor : -tx.valor), 0); }');
    ui.context.navigator.onLine = false;
    ui.run('for (let index = 0; index < 6; index++) { updateTask("t1", { completada: true }); updateTask("t1", { completada: false }); }');
    ui.context.navigator.onLine = true;
    ui.context.fetch = async (url, options) => {
      const json = options.method === 'POST' ? api.post(JSON.parse(options.body)) :
        new URL(url).searchParams.get('action') === 'listTasks' ? api.get() : api.context.doGet({ parameter: {} });
      return { ok: true, json: async () => json };
    };
    await ui.run('syncTasks()');
    assert.equal(api.tx().length, 6); assert.equal(ui.run('transactions.length'), 6);
    assert.equal(ui.run('netFromTasks'), tipo === 'Ingreso' ? 540000 : -540000);
    assert.equal(ui.state()[0].completada, false); assert.equal(ui.state()[0].checkEvents.length, 0);
    await ui.run('syncTasks()'); assert.equal(api.tx().length, 6);
  }
});

test('Recuperación: lee siete columnas por encabezado y prefiere los datos a una Transacciones vacía', () => {
  const api = backend(), book = api.context.SpreadsheetApp.getActiveSpreadsheet();
  const legacy = book.insertSheet('Movimientos');
  legacy.rows.push(['ID','Fecha','Perfil','Tipo','Categoría','Descripción','Monto']);
  legacy.rows.push(['old_1','21/10/2026','Fernando','Gasto','Hogar','Dato existente','$ 90.000']);
  const empty = book.insertSheet('Transacciones');
  empty.rows.push(['ID','Fecha Registro','Fecha Transaccion','Perfil','Tipo','Subtipo','Motivo','Valor']);
  const before = JSON.stringify(legacy.rows);
  const result = api.context.doGet({ parameter: {} });
  assert.equal(result.status, 'success'); assert.equal(result.ledgerSheet, 'Movimientos');
  assert.equal(result.data[0].fecha, '2026-10-21'); assert.equal(result.data[0].valor, 90000);
  assert.equal(result.data[0].subtipo, 'Hogar'); assert.equal(JSON.stringify(legacy.rows), before, 'Consultar no cambia los registros');
  const item = task({ completada: true }); item.checkEvents = [event(item)];
  const saved = save(api, item);
  assert.equal(saved.status, 'success'); assert.equal(legacy.rows.length, 3); assert.equal(empty.rows.length, 1);
  assert.deepEqual(legacy.rows[1], JSON.parse(before)[1], 'El marcado no altera el movimiento anterior');
  assert.equal(legacy.rows[2][5], 'Factura mensual'); assert.equal(legacy.rows[2][6], 90000);
});

test('Recuperación: columnas reordenadas conservan perfil, categoría, monto e historial', () => {
  const api = backend(), sheet = api.context.SpreadsheetApp.getActiveSpreadsheet().insertSheet('Datos');
  sheet.rows.push(['Motivo','Valor','Tipo','ID','Perfil','Subtipo','Fecha','synced']);
  sheet.rows.push(['Anterior',10000,'Ingreso','old','Eli','Salario','2026-10-01',true]);
  let result = api.context.doGet({ parameter: {} });
  assert.equal(result.data[0].id, 'old'); assert.equal(result.data[0].valor, 10000); assert.equal(result.data[0].perfil, 'Eli');
  const item = task({ completada: true }); item.checkEvents = [event(item)]; assert.equal(save(api, item).status, 'success');
  result = api.context.doGet({ parameter: {} });
  assert.equal(result.data.length, 2); assert.equal(result.totals.totalCaja, -80000);
  assert.equal(sheet.rows[1][0], 'Anterior'); assert.equal(sheet.rows[2][0], 'Factura mensual');
});

test('Recuperación: usa el ID explícito del archivo aunque no haya hoja activa en la aplicación web', () => {
  const api = backend(), book = api.context.SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.insertSheet('Transacciones'); sheet.rows.push(['ID','Fecha','Perfil','Tipo','Subtipo','Motivo','Valor']); sheet.rows.push(['old','2026-10-21','Fernando','Ingreso','Otros','Existente',1000]);
  let openedId = '';
  api.context.SpreadsheetApp.openById = id => { openedId = id; return book; };
  api.context.SpreadsheetApp.getActiveSpreadsheet = () => null;
  const result = api.context.doGet({ parameter: {} });
  assert.equal(result.status, 'success'); assert.equal(result.data.length, 1);
  assert.equal(openedId, '14P9eEwFt-1c55Rf7LA5zkSGV4EDqJwhmhSAxH3gWx8w');
  assert.equal(api.get().status, 'success');
});

test('Error de lectura no borra la copia local y muestra el mensaje del backend', async () => {
  const ui = frontend();
  ui.storage.set('app_transactions', JSON.stringify([{ id: 'existing', fecha: '2026-10-21', tipo: 'Ingreso', valor: 1000, synced: true }]));
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ui.context);
  ui.run('renderAll = () => {}');
  ui.context.fetch = async () => ({ ok: true, json: async () => ({ status: 'error', message: 'Encabezados no reconocidos' }) });
  await ui.run('fetchCloudTransactions()');
  assert.equal(ui.run('transactions.length'), 1); assert.equal(ui.run('cloudLoadError'), 'Encabezados no reconocidos');
});

test('Movimientos normales funcionan sobre siete columnas: crear sin duplicar, editar y eliminar', () => {
  const api = backend(), sheet = api.context.SpreadsheetApp.getActiveSpreadsheet().insertSheet('Movimientos');
  sheet.rows.push(['ID','Fecha','Perfil','Tipo','Subtipo','Motivo','Valor']);
  const data = { id: 'manual', fecha: '2026-10-21', perfil: 'Fernando', tipo: 'Ingreso', subtipo: 'Salario', motivo: 'Normal', valor: 50000, action: 'CREATE' };
  assert.equal(api.post(data).status, 'success'); api.post(data); assert.equal(sheet.rows.length, 2);
  assert.equal(api.post({ ...data, action: 'UPDATE', valor: 60000 }).status, 'success'); assert.equal(sheet.rows[1][6], 60000);
  assert.equal(api.post({ ...data, action: 'DELETE' }).status, 'success'); assert.equal(sheet.rows.length, 1);
});
