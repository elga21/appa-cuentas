# Appa Cuentas - App Contable PWA (iOS)

Aplicación de contabilidad personal de tipo **PWA (Progressive Web App)**, diseñada con un estilo visual premium (Obsidiana y Oro) y optimizada especialmente para iPhone. Se sincroniza en tiempo real con una hoja de cálculo de Google.

---

## 🚀 Arquitectura Serverless (Sin Costos de Servidor)

**No necesitas contratar ni pagar ningún servidor.** La aplicación funciona de manera 100% serverless y gratuita:
1. **Interfaz (Frontend)**: Alojada gratis en **GitHub Pages**. Consiste en archivos estáticos (HTML, CSS, JS) que se ejecutan directamente en tu celular.
2. **Backend e Intercambio de Datos (API)**: Ejecutado en **Google Apps Script** dentro de tu cuenta de Google Drive. Es totalmente gratuito y procesa los datos escribiendo/leyendo de tu **Google Sheets**.

---

## 📦 Características Principales

* **Pantalla de Bloqueo por PIN**: Acceso protegido con el PIN fijo `0308` para asegurar tus datos financieros.
* **Múltiples Perfiles**: Crea y administra perfiles de usuario independientes.
* **Formateo Contable Interactiva**: A medida que escribes el monto de un gasto o ingreso, se añaden automáticamente los puntos de miles y millones (ej: escribes `1000000` y se muestra `$ 1.000.000` en vivo).
* **Gráfica de Balance Dinámica**: Un gráfico circular tipo dona en la tarjeta de balance muestra visualmente qué porcentaje de tus ingresos ya has consumido en gastos.
* **Ciclos de Facturación Personalizados**: Configura tu rango mensual (del 1 al 30 de cada mes por defecto, o iniciando el día que desees).
* **Soporte Offline**: Si no tienes señal, la aplicación guarda las transacciones localmente y las sube automáticamente a la nube cuando recuperes tu conexión a Internet.

---

## 🛠️ Guía Paso a Paso: Publicar en GitHub Pages

Para alojar la aplicación y poder usarla en tu iPhone como una app nativa, sigue estos pasos:

### 1. Crear un Repositorio en GitHub
1. Si no tienes una cuenta, regístrate gratis en [GitHub](https://github.com).
2. Haz clic en el botón **New** (Nuevo) para crear un repositorio.
3. Configura:
   - **Repository name**: `appa-cuentas` (o el nombre que prefieras).
   - **Public/Private**: Debe ser **Public** (Público) para que GitHub Pages pueda servir la web.
   - Deja las demás opciones por defecto y haz clic en **Create repository**.

### 2. Subir los Archivos de la App
Puedes subir los archivos directamente desde el sitio web de GitHub:
1. En la pantalla del nuevo repositorio, haz clic en el enlace **"uploading an existing file"** (subir un archivo existente).
2. Arrastra y suelta los siguientes **6 archivos** de tu carpeta local:
   - `index.html`
   - `style.css`
   - `app.js`
   - `manifest.json`
   - `sw.js`
   - `icon.png`
3. Espera a que carguen y haz clic abajo en **Commit changes** (Confirmar cambios).

### 3. Activar GitHub Pages (Hosting)
1. Dentro de tu repositorio en GitHub, ve a la pestaña **Settings** (Configuración) en el menú superior.
2. En el menú lateral izquierdo, haz clic en **Pages** (Páginas).
3. En la sección **Build and deployment > Source**, asegúrate de que esté seleccionado *Deploy from a branch*.
4. Abajo en **Branch** (Rama):
   - Cambia *None* por **main** (o *master*).
   - Deja la carpeta en `/ (root)`.
   - Haz clic en **Save** (Guardar).
5. Espera aproximadamente 1 minuto. Recarga la página de ajustes y en la parte superior verás un banner que dice: *"Your site is live at..."* seguido de un enlace HTTPS (ej: `https://tu_usuario.github.io/appa-cuentas/`).

¡Ese es el enlace de tu aplicación! Ábrelo en Safari en tu iPhone y selecciona **Compartir > Añadir a la pantalla de inicio** para instalarla.

---

## 🔗 Vinculación con tu Google Sheet

1. Abre tu hoja de cálculo de Google.
2. Ve a **Extensiones > Apps Script**.
3. Pega el código de `google-apps-script.js`.
4. Publica el script como **Aplicación Web** con acceso para **Cualquiera** y copia la URL `/exec` generada.
5. Abre la aplicación contable en tu celular, ve a **Ajustes**, pega la URL en el campo correspondiente y presiona **Guardar**.
