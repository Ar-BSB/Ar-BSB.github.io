/**
 * core.js
 * ─────────────────────────────────────────────────────────────
 * TODO lo que necesitan las páginas para guardar y leer datos.
 * Un solo archivo, sin dependencias de orden de carga raras.
 *
 * Cómo se guardan los datos: localStorage (la "cajita" del
 * navegador). Se sincroniza SOLO entre pestañas abiertas del
 * mismo navegador en esta compu (evento "storage"), no entre
 * dispositivos distintos — para eso está Exportar/Importar en Ayuda.
 * ─────────────────────────────────────────────────────────────
 */

const DB = {
  PREFIJO: "criollo_",

  _leer(clave) {
    try {
      const crudo = localStorage.getItem(this.PREFIJO + clave);
      return crudo ? JSON.parse(crudo) : null;
    } catch (e) {
      console.error("Error leyendo", clave, e);
      return null;
    }
  },

  _escribir(clave, valor) {
    try {
      localStorage.setItem(this.PREFIJO + clave, JSON.stringify(valor));
      return true;
    } catch (e) {
      console.error("Error guardando", clave, e);
      return false;
    }
  },

  lista(clave) {
    return this._leer(clave) || [];
  },

  guardarLista(clave, arr) {
    this._escribir(clave, arr);
    // Avisamos a otras partes de ESTA MISMA pestaña que hay datos nuevos
    document.dispatchEvent(new CustomEvent("db:cambio", { detail: { clave } }));
  },

  agregar(clave, item) {
    const arr = this.lista(clave);
    arr.push(item);
    this.guardarLista(clave, arr);
  },

  borrar(clave, id) {
    const arr = this.lista(clave).filter((x) => x.id !== id);
    this.guardarLista(clave, arr);
  },

  actualizar(clave, id, cambios) {
    const arr = this.lista(clave).map((x) => (x.id === id ? { ...x, ...cambios } : x));
    this.guardarLista(clave, arr);
  },

  pref(clave, porDefecto) {
    const v = localStorage.getItem(this.PREFIJO + "pref_" + clave);
    return v === null ? porDefecto : JSON.parse(v);
  },

  guardarPref(clave, valor) {
    localStorage.setItem(this.PREFIJO + "pref_" + clave, JSON.stringify(valor));
  },

  id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  exportar() {
    const paquete = {
      version: 1,
      generado: new Date().toISOString(),
      tareas: this.lista("tareas"),
      eventos: this.lista("eventos"),
      finanzas: this.lista("finanzas"),
    };
    const blob = new Blob([JSON.stringify(paquete, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `en-criollo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  importar(texto) {
    const paquete = JSON.parse(texto);
    if (Array.isArray(paquete.tareas)) this.guardarLista("tareas", paquete.tareas);
    if (Array.isArray(paquete.eventos)) this.guardarLista("eventos", paquete.eventos);
    if (Array.isArray(paquete.finanzas)) this.guardarLista("finanzas", paquete.finanzas);
  },

  borrarTodo() {
    ["tareas", "eventos", "finanzas"].forEach((c) => this.guardarLista(c, []));
  },
};

// ── Sincronización entre PESTAÑAS del mismo navegador ──
// Si tenés el sitio abierto en dos pestañas y cambiás algo en una,
// la otra se entera sola (evento nativo del navegador "storage").
window.addEventListener("storage", (e) => {
  if (e.key && e.key.startsWith(DB.PREFIJO)) {
    document.dispatchEvent(new CustomEvent("db:cambio-externo", { detail: { key: e.key } }));
  }
});

// ── Utilidades compartidas ──
const Util = {
  pesos(n) {
    n = Number(n) || 0;
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  },
  hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  fechaCorta(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    return new Date(a, m - 1, d).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  },
  fechaLarga(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    return new Date(a, m - 1, d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  },
  $(id) {
    return document.getElementById(id);
  },
};
