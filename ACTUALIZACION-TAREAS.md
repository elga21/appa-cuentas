# Actualización: tareas recurrentes con historial de cada marcado

## Recuperación de lectura de datos: versión 2026-10-26.2

La comprobación del endpoint proporcionado devolvió **249 movimientos**. Una sesión nueva de la aplicación publicada cargó movimientos al configurar ese mismo endpoint. No se enviaron registros de prueba a producción. El acceso directo a la hoja desde la sesión de prueba solicitó iniciar sesión, por lo que no se pudieron inspeccionar sus encabezados reales.

Esta versión abre expresamente el archivo `14P9eEwFt-1c55Rf7LA5zkSGV4EDqJwhmhSAxH3gWx8w`, identifica las columnas por encabezados y admite los formatos habituales de siete y ocho columnas, incluidos órdenes distintos. Si hay una pestaña reconocida con registros y otra Transacciones vacía, consulta la que contiene los registros. Si no puede identificar la tabla con seguridad devuelve un error y no borra ni reemplaza datos.

**Antes de publicar el backend:**

1. Guarda una copia del código actual de Apps Script.
2. Copia el backend de este paquete completo en el proyecto de tu hoja.
3. En el selector de funciones del editor, elige `verificarConexion` y pulsa Ejecutar. Esta función solo lee; no añade ni modifica movimientos. Autoriza el acceso a tu hoja si Google lo solicita.
4. Revisa el Registro de ejecución: debe mostrar el ID de tu archivo, `ledgerSheet`, los encabezados y `movementCount`. Si muestra un error, no publiques todavía; conserva el código anterior y utiliza ese mensaje para revisar la estructura o el acceso.
5. Si la lectura es correcta, publica una Nueva versión de la implementación web existente.
6. Abre tu URL /exec con `?action=diagnostics`: debe devolver `build: "2026-10-26.2"`, el ID de tu archivo y la pestaña de movimientos. Después consulta `?action=listTasks` para verificar `tasksBuild: "2026-10-26.2"`.
7. Publica también los cinco archivos de la interfaz del paquete. La vista de movimientos ahora muestra los errores de conexión en lugar de ocultarlos; un fallo de lectura conserva la copia local.

En Ajustes hay dos campos distintos: **URL Google Apps Script** debe contener la dirección que termina en `/exec`; **URL de tu Hoja de Cálculo** contiene la dirección `docs.google.com/spreadsheets/...`. El botón Sheet solo abre Google Sheets y exige que tu navegador tenga una sesión de Google con acceso al archivo. No es necesario hacer pública la hoja.

Los cambios están preparados en esta carpeta local. Para usarlos debes actualizar Apps Script y publicar los archivos en GitHub. El sitio actual es https://elga21.github.io/appa-cuentas/.

## Corrección de sincronización del 26 de octubre de 2026

**Versión de esta corrección: 2026-10-26.2.** Al revisar los enlaces facilitados, la URL /exec continuaba respondiendo con `status,data`, sin API de tareas; el tasks.js publicado tampoco contenía la cola de cada marcado. Esas versiones no pueden registrar el historial de tareas. Si cambiaste de implementación y tienes otra URL /exec, debes usarla en Ajustes en todos los dispositivos.

El paquete `recuperacion-sheets-20261026.zip` reúne los cinco archivos de la interfaz, el backend y esta documentación. Extrae el ZIP antes de subir los archivos: subir solamente el ZIP a GitHub no actualiza la aplicación.

Esta corrección además:

- No permite que una tarea con datos inválidos bloquee la sincronización de las demás; muestra el error en la tarea que falló.
- Envía también los marcados realizados durante la petición en curso, sin esperar a una nueva consulta periódica.
- Guarda la confirmación del servidor antes de actualizar las gráficas, para que un fallo visual no deje un movimiento ya registrado como pendiente.

- Devuelve el movimiento confirmado desde Apps Script y actualiza el historial y el balance inmediatamente, aunque falle la descarga siguiente.
- Envía enseguida los marcados realizados mientras otra petición estaba en curso.
- Muestra cuántos marcados están pendientes y las versiones de interfaz y backend en el listado de tareas.
- Amplía automáticamente hojas que solo conservaban sus columnas originales, evitando que la escritura de las nuevas columnas falle.

Después de publicar, el listado debe mostrar **Interfaz 2026-10-26.2 · Backend 2026-10-26.2**. Si no coincide, todavía se está utilizando otro archivo, caché o implementación. No borres los datos del navegador: ahí pueden estar los marcados pendientes.

## Funcionamiento de esta versión

Cada tarea solicita los mismos datos que Registrar Movimiento: **fecha, tipo (Gasto o Ingreso), categoría, monto y descripción/observación opcional**. El perfil es el usuario activo.

- Agregar una tarea crea la plantilla pendiente; no genera todavía un movimiento.
- **Cada transición de desmarcada a marcada crea un movimiento nuevo** en la pestaña Transacciones. Participa en los balances, categorías y gráficos normales de la app.
- **Desmarcar no elimina ni modifica ningún movimiento.** Marcar, desmarcar y volver a marcar deja dos movimientos.
- Editar la tarea cambia los datos de los próximos marcados. Los movimientos ya registrados conservan sus importes, categorías, descripciones y fechas.
- Eliminar la tarea la quita del listado, conservando todos sus movimientos.
- Al comenzar un nuevo ciclo, la tarea sigue en el listado con la casilla desmarcada y queda disponible para otro marcado. No se crea un movimiento por el reinicio.
- La fecha de la plantilla avanza al ciclo nuevo. Por ejemplo, 21 de octubre pasa al 21 de noviembre. Si el día es 31, se limita al último día de febrero y vuelve al 31 en marzo.

Cada marcado tiene su propio ID. Reenviar el mismo marcado tras un fallo de red no lo duplica; hacer otro marcado deliberado sí crea otro registro. Si dos dispositivos hacen marcados distintos, ambos se registran.

## 1. Respaldar

1. En Google Sheets, usa Archivo > Hacer una copia.
2. Guarda también una copia del código actual de Apps Script y de la versión publicada en GitHub.
3. No borres los datos del navegador ni desinstales la app mientras existan cambios locales pendientes.
4. Si tu backend tiene personalizaciones distintas de este proyecto, consérvalas al integrar los cambios; no añadas un segundo doGet o doPost.

## 2. Actualizar Google Apps Script primero

1. Abre la hoja existente > Extensiones > Apps Script.
2. Reemplaza el script de este proyecto por el contenido completo de **google-apps-script.js** actualizado. Si tienes personalizaciones, integra las rutas de tareas y todas sus funciones auxiliares conservándolas.
3. Guarda.
4. Entra a **Implementar > Administrar implementaciones > selecciona la implementación web actual > Editar (lápiz)**.
5. En Versión, elige **Nueva versión** y pulsa Implementar. Mantén la configuración de ejecución y acceso de tu aplicación web.
6. Actualizar esa implementación mantiene la URL /exec. Si creas otra, configura la URL nueva en todos los dispositivos.
7. Consulta la URL agregando `?action=listTasks`. Debe devolver `status: success`, **`tasksApi: 3`**, **`tasksBuild: "2026-10-26.2"`**, `tasks`, `deletedIds`, `cycleDay` y `cycleKey`. Si ya había un signo ?, utiliza &action=listTasks. Si devuelve `status,data`, sigue activa la implementación anterior: vuelve a Administrar implementaciones y actualiza la que corresponde a esa URL.

Guardar el código sin implementar una nueva versión no cambia el backend publicado. Subir google-apps-script.js a GitHub tampoco actualiza Apps Script.

Las columnas nuevas de Tareas se crean automáticamente sin eliminar las tareas ni los movimientos existentes. La pestaña de movimientos conserva sus columnas originales, sean siete, ocho o estén reordenadas, y añade ID Tarea, ID Marcado, Ciclo Tarea y Fecha Marcado cuando faltan. No borres ni alteres las columnas de control ni las filas con Eliminada = TRUE.

Referencia oficial: [Administrar implementaciones de Apps Script](https://developers.google.com/apps-script/concepts/deployments).

## 3. Publicar la interfaz en GitHub

En la carpeta que ya utiliza GitHub Pages, reemplaza estos cinco archivos y confirma con Commit changes:

- index.html
- style.css
- app.js
- tasks.js
- sw.js

Conserva sus ubicaciones actuales; no añadas una subcarpeta extra. Puedes subir también el backend, README y esta guía para mantener actualizado el código fuente. Espera a que GitHub Pages termine de publicar.

## 4. Configurar los dispositivos y el ciclo

1. Abre la app con conexión y recarga. Si muestra la versión anterior, espera unos segundos, ciérrala y vuelve a abrirla para cargar la nueva caché.
2. En cada dispositivo configura la misma URL /exec y entra con exactamente el mismo nombre de perfil.
3. En Ajustes indica el día de inicio del ciclo, entre 1 y 31, y guarda. Esta configuración de ciclo se comparte con los demás dispositivos mediante Apps Script. El ciclo se calcula con la zona horaria de la hoja; revisa Archivo > Configuración de Google Sheets si necesitas ajustarla.
4. Para ciclos que comienzan el 29, 30 o 31, los meses cortos usan su último día.
5. Las tareas se consultan cada 10 segundos mientras la aplicación está activa, al abrir el listado, al regresar a la app y al recuperar conexión. El reinicio de ciclo se aplica al consultar o escribir en el nuevo período; no requiere una tarea programada. Si la app estaba cerrada, aparecerán desmarcadas al abrirla y sincronizar.
6. iOS puede suspender las apps en segundo plano. No se generan pagos automáticamente por permanecer cerrada; se generan cuando marcas la casilla.

## 5. Verificar el comportamiento

1. Crea una tarea con tipo Gasto, categoría Servicios, monto 1000, fecha de hoy y una descripción.
2. Espera el mensaje **Confirmado en Google Sheets a las…** y verifica la fila en Tareas. Aún no debe haber un gasto nuevo.
3. Márcala y sincroniza: debe haber un movimiento de 1000 en Transacciones y en la aplicación.
4. Desmárcala y sincroniza: el movimiento debe permanecer.
5. Márcala de nuevo: ahora deben existir dos movimientos de 1000 con IDs de marcado distintos.
6. Cambia el monto de la tarea a 2000: los dos movimientos anteriores deben conservar 1000. El próximo marcado utilizará 2000.
7. Abre otro dispositivo con la misma URL y perfil: debe mostrar la misma tarea y su estado.
8. Desconecta Internet, marca y desmarca varias veces, cierra y abre la app, y reconecta. Todos los marcados nuevos deben llegar a Sheets una vez, aunque la casilla termine desmarcada.
9. Al llegar el siguiente ciclo, verifica que la tarea siga en la lista, desmarcada, con la fecha del nuevo período. Sus movimientos anteriores deben permanecer en el histórico.
10. Elimina la tarea y comprueba que sus movimientos continúen registrados.

Las tareas antiguas siguen disponibles. Usa el lápiz para completar o corregir sus datos. Esta actualización no reconstruye marcados antiguos que nunca se sincronizaron como movimientos: el registro individual se aplica a los nuevos marcados realizados con esta versión. No modifica ni borra movimientos ya existentes de versiones anteriores.

## Si las tareas solo se ven en un dispositivo

- Comprueba que la URL /exec y el nombre de perfil coincidan en ambos.
- Revisa el mensaje del listado: sin URL, sin conexión o backend desactualizado requieren acciones distintas.
- Verifica que el backend devuelva tasksApi: 3. La versión anterior no admite el nuevo historial por marcado.
- No borres el almacenamiento local mientras haya marcados pendientes. Se conservan en el dispositivo hasta que Sheets confirme sus IDs.
- Las tareas eliminadas en otro dispositivo no se restauran; si había marcados pendientes hechos offline, se envían al historial antes de quitar la copia local.

## Archivos modificados

| Archivo | Cambio |
| --- | --- |
| index.html | Formulario con los mismos datos de un movimiento y explicación del historial permanente. |
| tasks.js | Categoría, edición, cola persistente de cada marcado, reinicio por ciclo y sincronización de estados y marcados. |
| google-apps-script.js | API v3, configuración compartida del ciclo, migración aditiva y movimientos nuevos por evento sin borrar históricos. |
| app.js | Balance y checklist comparten el cálculo del ciclo, incluidos los meses cortos. |
| sw.js | Caché v7 para distribuir la corrección 2026-10-26.2. |
| tests/tasks.test.cjs | Pruebas de ciclos, historial, sincronización entre dispositivos, ediciones y recuperación offline. |

Para ejecutar las pruebas, abre una terminal en esta carpeta y usa `node --test tests/tasks.test.cjs` con Node.js instalado. Las pruebas simulan el navegador y Google Sheets; la comprobación de tu publicación real se hace siguiendo el paso 5.
# Corrección 2026-10-30.1 — registros y tareas

Estado: corregido y verificado localmente; pendiente de publicación.

El 30 de octubre se consultó la URL /exec facilitada: `action=listTasks` devuelve `status:error`, `tasksBuild:2026-10-26.1` y `fromCycle.split is not a function`. Sheets convirtió las columnas Ciclo/Ciclo Base en fechas; ahora se normalizan antes de calcular el ciclo. El app.js público además usa no-cors y marca como confirmado un envío sin leer la respuesta.

Esta entrega bloquea envíos simultáneos del formulario, limpia los campos después de guardar, conserva una cola de movimientos con IDs estables y exige confirmación del servidor. También conserva ediciones y eliminaciones pendientes después de recargar. Las respuestas de consultas anteriores a un cambio local se descartan. El backend rechaza escrituras sin ID/acción y evita insertar otra vez un ID ya existente.

Las tareas conservan una instantánea por cada marcado: crear no registra un movimiento; marcar sí; desmarcar no borra; volver a marcar crea otro. Se conserva el ciclo mensual configurado, según la confirmación del usuario. No se eliminaron movimientos existentes ni se enviaron movimientos de prueba a producción.

## Aplicar esta entrega

1. En el proyecto de Apps Script vinculado a la hoja, reemplazar el código por `google-apps-script.js` de esta entrega. Actualizar la implementación web existente con una nueva versión para conservar la misma URL /exec.
2. Consultar esa URL con `?action=capabilities`: debe responder `status:success`, `financeApi:1`, `build:2026-10-30.1`. Con `?action=listTasks` debe responder `status:success`, `tasksApi:3`, `tasksBuild:2026-10-30.1` y la lista de tareas.
3. Actualizar en la raíz del repositorio de GitHub Pages `app.js`, `tasks.js`, `sw.js`, `index.html` y `style.css` de esta entrega. El ZIP contiene también manifiesto e icono para conservar el conjunto completo.
4. Recargar la aplicación y comprobar en Tareas: `Interfaz 2026-10-30.1 · Backend 2026-10-30.1`. Conservar el almacenamiento del navegador para recuperar operaciones pendientes.
5. Comprobar con un movimiento real previsto: aparece una sola vez con su perfil, descripción, categoría, fecha y valor. Comprobar una tarea real: marcar añade uno; desmarcar lo conserva; marcar de nuevo añade otro. Verificar los mismos IDs en la hoja y en el historial.

La interfaz nueva conserva pendientes las escrituras si detecta un backend sin protección contra duplicados; por eso hay que actualizar también Apps Script, no solo GitHub. No hay sesión autenticada de publicación disponible en este entorno. La comprobación de producción posterior al despliegue sigue pendiente.

## Verificación local

`node --test tests/tasks.test.cjs`: 37 pruebas aprobadas con navegador y Sheets simulados. Cubren el error real de celdas Date, doble envío, respuesta perdida, servidor incompatible, lectura tardía, edición/eliminación offline, historial de marcados, sincronización entre dispositivos, rollover mensual, saldo anterior, balance y datos de gráficas. No sustituyen la comprobación de la implementación publicada.

---

