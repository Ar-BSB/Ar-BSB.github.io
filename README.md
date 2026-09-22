# La Recetera

Asistente de cocina argentina. Sitio estático: `index.html`, `style.css`, `script.js`, `config.js`. Sin framework, sin build.

## La clave de Groq

No hay forma de esconder una clave en un sitio estático. Todo lo que llega al navegador es público, incluso minificado o partido en pedazos. Por eso la clave vive en un proxy.

### Publicar en GitHub Pages (recomendado)

1. Revocá la clave vieja en la consola de Groq y generá una nueva. La anterior estuvo en el código, hay que darla por quemada.
2. Editá `ALLOWED_ORIGINS` en `worker.js` con tu origen real, por ejemplo `https://tuusuario.github.io`.
3. Desplegá el proxy:
   ```
   npm install -g wrangler
   wrangler login
   wrangler deploy
   wrangler secret put GROQ_API_KEY
   ```
4. Copiá la URL que imprime wrangler dentro de `config.js`:
   ```js
   window.RECETERA_CONFIG = { proxyUrl: "https://la-recetera-proxy.tuusuario.workers.dev" };
   ```
5. Subí `index.html`, `style.css`, `script.js`, `config.js` al repo y activá GitHub Pages. `worker.js` y `wrangler.toml` pueden quedar en el repo: no contienen la clave.

El Worker acepta pedidos solo desde los orígenes de la lista, fuerza el modelo, y limita tokens y largo de la conversación, así una URL filtrada no se convierte en inferencia gratis a tu cuenta.

### Usar solo en tu computadora

Dejá `proxyUrl: ""`. La app pide la clave una vez y la guarda en el `localStorage` de ese navegador. La clave nunca se escribe en los archivos, así que no se commitea nada secreto. "Empezar de nuevo" también borra la clave guardada.

## Cómo funciona la elección de receta

Cuando alguien pide cocinar algo sin definir la versión ("quiero hacer milanesas"), el modelo devuelve `{"type":"picks", ...}` con tres caminos distintos —distinta técnica, tiempo o región— y la app los muestra como tres cartas. Al elegir una, las otras dos se apagan y se pide la receta completa de la elegida. La elección queda registrada en el historial, así que sobrevive un reload.

Si el pedido ya es puntual ("receta de milanesa napolitana al horno"), va directo a la receta sin pasar por la elección.

## Fotos de los platos

El modelo devuelve un campo `image` con el nombre pelado del plato. Con eso la app busca una foto en Wikimedia Commons y, si no encuentra, en Openverse. Las dos APIs son públicas, sin clave y con CORS abierto, así que no hace falta tocar nada ni pasar por el proxy.

Las fotos son de licencia libre y por eso cada una muestra su crédito abajo, con link al original. No borres ese crédito: es la condición de uso de las licencias CC.

Puede pasar que la foto no sea exactamente el plato de la receta —es una búsqueda por nombre, no una foto de tu olla—. Si no aparece nada, la tarjeta se muestra igual sin foto, y ese "no hay" queda cacheado en `laRecetera.photos` para no volver a preguntar en cada recarga.

## Guardado local

- `laRecetera.history`: últimos 8 intercambios, se mandan como contexto en cada turno.
- `laRecetera.key`: solo en modo local, cuando no hay proxy.
