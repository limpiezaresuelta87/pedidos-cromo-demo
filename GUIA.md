# Pedidos Cromo / Demo — guía de publicación

App independiente (no comparte código, datos, caché ni Firebase con Presupuesto Limpieza Resuelta).

Contenido: `index.html` (la app), `sw.js` (modo sin conexión), `manifest.webmanifest` + `icons/` (instalación),
`sync.js` + `firebase-config.js` + `firestore.rules` (sincronización opcional), `firebase.json` (hosting en Firebase, alternativa).

## 1. Publicar en GitHub Pages (gratis, con HTTPS)
1. En GitHub: **New repository** → nombre `pedidos-cromo-demo` → Public (Pages gratis lo requiere) → Create.
2. **Add file → Upload files** y arrastrá todo el contenido de esta carpeta (no el .zip). Commit.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch → main / (root) → Save.**
4. En 1–2 minutos queda en `https://TU-USUARIO.github.io/pedidos-cromo-demo/`.

## 2. Instalarla
- **Chrome en compu:** ícono de instalar en la barra de direcciones, o botón “Instalar app” de la app.
- **Android (Chrome):** menú ⋮ → Instalar app (o el botón “Instalar app”).
- **iPhone:** abrila en Safari → Compartir → Agregar a pantalla de inicio.
Después de la primera apertura con internet, abre y funciona sin conexión.

## 3. Sincronizar entre equipos (opcional, Firebase)
Sin esto, cada equipo guarda sus propios datos (se pueden pasar con “Descargar copia / Restaurar copia”).
1. https://console.firebase.google.com → **Agregar proyecto** nuevo (por ejemplo `pedidos-cromo-demo`). No hace falta Analytics.
2. **Authentication → Comenzar → Correo electrónico/contraseña → Habilitar.** En **Users → Add user** creá un usuario por persona.
3. **Authentication → Settings → Authorized domains → Add domain:** `TU-USUARIO.github.io`.
4. **Firestore Database → Crear base de datos** → modo producción → región `southamerica-east1`. En **Rules** pegá el contenido de `firestore.rules` → Publicar.
5. **Configuración del proyecto → Tus apps → Web (</>)** → registrá la app y copiá el objeto `firebaseConfig`.
6. Pegalo en `firebase-config.js` reemplazando `null`, y subí el archivo a GitHub (Add file → Upload files, reemplaza).
7. En la app: **Ajustes → Sincronizar entre equipos** → correo y contraseña → Entrar.
La primera vez que entra un equipo con datos propios, los sube; un equipo con solo datos de ejemplo toma los de la nube.

## 4. Publicar una versión nueva
1. Cambiá `VERSION` en `sw.js` (por ejemplo `v1.0.1`) y `APP_VERSION` en `index.html`.
2. Subí los archivos a GitHub. Quien tenga la app abierta ve el aviso “Hay una versión nueva” y toca Actualizar.

## Cosas para saber
- Los pedidos tienen número correlativo. Con sincronización y conexión el número es único entre equipos; sin conexión se asigna uno local y puede repetirse con otro equipo (la pestaña Control lo avisa).
- Si dos personas editan lo mismo a la vez, queda el último cambio guardado.
- La pestaña **Control** avisa de precios en cero, Demo mayor que Cromo, códigos o clientes repetidos y pedidos sin precio.
- Los datos de ejemplo se pueden borrar desde Catálogo y Clientes, o reemplazar con “Importar”.
