/**
 * nav.js — dibuja el menú de arriba en todas las páginas.
 */
(function () {
  const PAGINAS = [
    { href: "index.html", icono: "🏠", texto: "Inicio" },
    { href: "calendario.html", icono: "🗓️", texto: "Calendario" },
    { href: "tareas.html", icono: "✅", texto: "Tareas" },
    { href: "finanzas.html", icono: "💰", texto: "Mi plata" },
    { href: "impuestos.html", icono: "🧾", texto: "Impuestos" },
    { href: "ayuda.html", icono: "❓", texto: "Ayuda" },
  ];

  function paginaActual() {
    const partes = location.pathname.split("/");
    return partes[partes.length - 1] || "index.html";
  }

  function render() {
    const cont = document.getElementById("app-nav");
    if (!cont) return;
    const actual = paginaActual();
    const links = PAGINAS.map(
      (p) =>
        `<a class="nav-link${p.href === actual ? " activo" : ""}" href="${p.href}">
           <span class="nav-icon">${p.icono}</span>${p.texto}
         </a>`
    ).join("");

    cont.innerHTML = `
      <div class="wrap nav-inner">
        <a href="index.html" class="brand">En criollo</a>
        <nav class="site-nav">${links}</nav>
        <div class="a11y-controls">
          <button type="button" data-fs="menos" title="Achicar letra">A-</button>
          <button type="button" data-fs="normal" title="Letra normal">A</button>
          <button type="button" data-fs="mas" title="Agrandar letra">A+</button>
        </div>
      </div>`;

    cont.querySelectorAll("[data-fs]").forEach((btn) => {
      btn.addEventListener("click", () => setTamanoLetra(btn.dataset.fs));
    });
  }

  const TAMANOS = ["normal", "grande", "xgrande"];

  function setTamanoLetra(direccion) {
    const actual = DB.pref("tamanoLetra", "normal");
    const idx = TAMANOS.indexOf(actual);
    let nuevo;
    if (direccion === "mas") nuevo = TAMANOS[Math.min(idx + 1, TAMANOS.length - 1)];
    else if (direccion === "menos") nuevo = TAMANOS[Math.max(idx - 1, 0)];
    else nuevo = "normal";
    document.documentElement.classList.remove("fs-normal", "fs-grande", "fs-xgrande");
    document.documentElement.classList.add("fs-" + nuevo);
    DB.guardarPref("tamanoLetra", nuevo);
  }

  // Aplicar el tamaño guardado apenas se puede (antes de pintar todo)
  document.documentElement.classList.add("fs-" + DB.pref("tamanoLetra", "normal"));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
