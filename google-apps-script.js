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
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  initSheets(spreadsheet);
  
  var txSheet = spreadsheet.getSheetByName("Transacciones");
  var params = e.parameter || {};
  
  var startDateStr = params.startDate;
  var endDateStr = params.endDate;
  
  var startDate = startDateStr ? new Date(startDateStr) : null;
  var endDate = endDateStr ? new Date(endDateStr) : null;
  
  // Rango por defecto (mes actual del 1 al 30)
  if (!startDate || !endDate) {
    var now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 30);
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
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*");
}

/**
 * Maneja las peticiones POST (Escritura de datos)
 * Se recibe como text/plain para evitar errores de preflight CORS (OPTIONS) en navegadores
 */
function doPost(e) {
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
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader("Access-Control-Allow-Origin", "*");
      
  } catch (error) {
    var errorResult = {
      status: "error",
      message: error.toString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader("Access-Control-Allow-Origin", "*");
  }
}
