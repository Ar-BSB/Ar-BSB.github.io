/**
 * pages.js
 * ─────────────────────────────────────────────────────────────
 * Un solo archivo con la lógica de TODAS las páginas. Cada bloque
 * se fija primero si los elementos de SU página existen antes de
 * hacer nada — así nunca hay errores por falta de un elemento en
 * otra página.
 *
 * Además: cuando guardás algo (tarea, gasto, evento), la página
 * se vuelve a dibujar sola al toque — y si tenés el sitio abierto
 * en otra pestaña, esa también se actualiza sola.
 * ─────────────────────────────────────────────────────────────
 */

document.addEventListener("DOMContentLoaded", () => {
  initDashboard();
  initCalendario();
  initTareas();
  initFinanzas();
  initImpuestos();
  initAyuda();
  initAdmin();
});

// Cuando cambian los datos (en esta pestaña o en otra), volvemos a dibujar
document.addEventListener("db:cambio", refrescarPaginaActual);
document.addEventListener("db:cambio-externo", refrescarPaginaActual);

function refrescarPaginaActual() {
  initDashboard();
  initCalendario(true);
  initTareas();
  initFinanzas();
}

// ════════════════════════════════════════════════════════════
// DASHBOARD (index.html)
// ════════════════════════════════════════════════════════════
function initDashboard() {
  const marca = Util.$("saludo-fecha");
  if (!marca) return; // no estamos en Inicio

  const hoy = new Date();
  marca.textContent = hoy.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Próximo vencimiento fiscal (próximos 60 días)
  const cf = DATA;
  const candidatos = [];
  for (let i = 0; i <= 60; i++) {
    const f = new Date(hoy);
    f.setDate(f.getDate() + i);
    if (f.getDate() === cf.monotributo.diaVencimiento) {
      candidatos.push({ dias: i, texto: "Vencimiento de Monotributo", fecha: f });
    }
    if (f.getMonth() + 1 === cf.bienesPersonales.mes && f.getDate() === cf.bienesPersonales.dia) {
      candidatos.push({ dias: i, texto: "Bienes Personales (declaración)", fecha: f });
    }
  }
  candidatos.sort((a, b) => a.dias - b.dias);
  const prox = candidatos[0];
  const vencCard = Util.$("dash-vencimiento");
  if (vencCard && prox) {
    const texto = prox.dias === 0 ? "¡Es hoy!" : prox.dias === 1 ? "Falta 1 día" : `Faltan ${prox.dias} días`;
    vencCard.querySelector(".stat-value").textContent = texto;
    vencCard.querySelector(".stat-note").textContent = `${prox.texto} · ${prox.fecha.toLocaleDateString("es-AR", { day: "numeric", month: "long" })}`;
  }

  // Tareas pendientes
  const pendientes = DB.lista("tareas").filter((t) => !t.hecha)
    .sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999"));
  const contador = Util.$("dash-tareas-count");
  if (contador) contador.textContent = pendientes.length;

  const listaEl = Util.$("dash-tareas-lista");
  if (listaEl) {
    listaEl.innerHTML = pendientes.length
      ? pendientes.slice(0, 5).map((t) => `
          <li class="list-item">
            <div class="li-main">
              <div class="li-title">${escapeHTML(t.texto)}</div>
              ${t.categoria ? `<div class="li-sub"><span class="chip">${escapeHTML(t.categoria)}</span></div>` : ""}
            </div>
          </li>`).join("")
      : `<li class="empty-state">No tenés tareas pendientes. 🎉</li>`;
  }

  // Balance del mes
  const prefijoMes = Util.hoyISO().slice(0, 7);
  const movs = DB.lista("finanzas").filter((m) => m.fecha.startsWith(prefijoMes));
  const ingresos = movs.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.monto, 0);
  const gastos = movs.filter((m) => m.tipo === "gasto").reduce((a, m) => a + m.monto, 0);
  const balance = ingresos - gastos;

  const balEl = Util.$("dash-balance");
  if (balEl) {
    balEl.textContent = Util.pesos(balance);
    const card = balEl.closest(".stat-card");
    card.classList.toggle("good", balance >= 0);
    card.classList.toggle("warn", balance < 0 && movs.length > 0);
  }
  const balNote = Util.$("dash-balance-note");
  if (balNote) {
    balNote.textContent = movs.length
      ? `Ingresos ${Util.pesos(ingresos)} · Gastos ${Util.pesos(gastos)}`
      : "Todavía no cargaste movimientos este mes";
  }

  // Quick-add de tarea
  const formQuick = Util.$("form-quick-tarea");
  if (formQuick && !formQuick.dataset.bound) {
    formQuick.dataset.bound = "1";
    formQuick.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = Util.$("quick-tarea-texto");
      const texto = input.value.trim();
      if (!texto) return;
      DB.agregar("tareas", { id: DB.id(), texto, categoria: "", fecha: null, hecha: false, creada: Date.now() });
      input.value = "";
    });
  }
}

// ════════════════════════════════════════════════════════════
// CALENDARIO (calendario.html)
// ════════════════════════════════════════════════════════════
let calEstado = null; // { anio, mes, seleccionado }

function initCalendario(soloRedibujar) {
  const grid = Util.$("cal-grid");
  if (!grid) return;

  if (!calEstado) {
    const hoy = new Date();
    calEstado = { anio: hoy.getFullYear(), mes: hoy.getMonth(), seleccionado: Util.hoyISO() };
  }

  if (!soloRedibujar) {
    const btnPrev = Util.$("cal-prev");
    const btnNext = Util.$("cal-next");
    const btnHoy = Util.$("cal-hoy");
    if (btnPrev && !btnPrev.dataset.bound) {
      btnPrev.dataset.bound = "1";
      btnPrev.addEventListener("click", () => {
        calEstado.mes--; if (calEstado.mes < 0) { calEstado.mes = 11; calEstado.anio--; }
        dibujarCalendario();
      });
    }
    if (btnNext && !btnNext.dataset.bound) {
      btnNext.dataset.bound = "1";
      btnNext.addEventListener("click", () => {
        calEstado.mes++; if (calEstado.mes > 11) { calEstado.mes = 0; calEstado.anio++; }
        dibujarCalendario();
      });
    }
    if (btnHoy && !btnHoy.dataset.bound) {
      btnHoy.dataset.bound = "1";
      btnHoy.addEventListener("click", () => {
        const hoy = new Date();
        calEstado = { anio: hoy.getFullYear(), mes: hoy.getMonth(), seleccionado: Util.hoyISO() };
        dibujarCalendario();
      });
    }
    const formEvento = Util.$("form-evento");
    if (formEvento && !formEvento.dataset.bound) {
      formEvento.dataset.bound = "1";
      formEvento.addEventListener("submit", (e) => {
        e.preventDefault();
        const titulo = Util.$("evento-titulo").value.trim();
        if (!titulo) return;
        DB.agregar("eventos", {
          id: DB.id(),
          fecha: calEstado.seleccionado,
          titulo,
          nota: Util.$("evento-nota").value.trim(),
        });
        formEvento.reset();
      });
    }
  }

  dibujarCalendario();
}

function eventosFiscalesDelMes(anio, mesIdx) {
  const mes = mesIdx + 1;
  const eventos = {};
  function marcar(dia, tipo, texto) {
    const key = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    (eventos[key] = eventos[key] || []).push({ tipo, texto });
  }
  marcar(DATA.monotributo.diaVencimiento, "mono", "Vencimiento aproximado de Monotributo");
  if (DATA.bienesPersonales.mes === mes) {
    marcar(DATA.bienesPersonales.dia, "bp", "Declaración y pago de Bienes Personales (aprox.)");
  }
  return eventos;
}

function dibujarCalendario() {
  const grid = Util.$("cal-grid");
  const titulo = Util.$("cal-titulo");
  const NOMBRES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const DIAS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

  titulo.textContent = `${NOMBRES[calEstado.mes]} ${calEstado.anio}`;
  grid.innerHTML = DIAS.map((d) => `<div class="cal-dow">${d}</div>`).join("");

  const primerDia = new Date(calEstado.anio, calEstado.mes, 1).getDay();
  const diasEnMes = new Date(calEstado.anio, calEstado.mes + 1, 0).getDate();
  const diasMesAnt = new Date(calEstado.anio, calEstado.mes, 0).getDate();
  const fiscales = eventosFiscalesDelMes(calEstado.anio, calEstado.mes);
  const eventosPersonales = DB.lista("eventos");
  const hoyISO = Util.hoyISO();

  const celdas = [];
  for (let i = primerDia - 1; i >= 0; i--) celdas.push({ dia: diasMesAnt - i, fuera: true });
  for (let d = 1; d <= diasEnMes; d++) celdas.push({ dia: d, fuera: false });
  while (celdas.length % 7 !== 0) celdas.push({ dia: celdas.length, fuera: true });

  celdas.forEach((c) => {
    if (c.fuera) {
      const div = document.createElement("div");
      div.className = "cal-day fuera";
      div.innerHTML = `<span class="cal-day-num">${c.dia}</span>`;
      grid.appendChild(div);
      return;
    }
    const iso = `${calEstado.anio}-${String(calEstado.mes + 1).padStart(2, "0")}-${String(c.dia).padStart(2, "0")}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-day";
    if (iso === hoyISO) btn.classList.add("hoy");
    if (iso === calEstado.seleccionado) btn.classList.add("sel");

    const dots = (fiscales[iso] || []).map((ev) => `<span class="dot dot-${ev.tipo}"></span>`).join("")
      + eventosPersonales.filter((e) => e.fecha === iso).map(() => `<span class="dot dot-personal"></span>`).join("");

    btn.innerHTML = `<span class="cal-day-num">${c.dia}</span><div class="cal-dots">${dots}</div>`;
    btn.addEventListener("click", () => {
      calEstado.seleccionado = iso;
      dibujarCalendario();
      dibujarPanelDia();
    });
    grid.appendChild(btn);
  });

  dibujarPanelDia();
}

function dibujarPanelDia() {
  const titulo = Util.$("panel-dia-titulo");
  const lista = Util.$("panel-dia-lista");
  if (!titulo || !lista) return;

  titulo.textContent = Util.fechaLarga(calEstado.seleccionado);

  const [anio, mes] = calEstado.seleccionado.split("-").map(Number);
  const fiscales = eventosFiscalesDelMes(anio, mes - 1)[calEstado.seleccionado] || [];
  const personales = DB.lista("eventos").filter((e) => e.fecha === calEstado.seleccionado);

  let html = "";
  fiscales.forEach((ev) => {
    html += `<li class="list-item">
      <span class="dot dot-${ev.tipo}"></span>
      <div class="li-main"><div class="li-title">${ev.texto}</div><div class="li-sub">Vencimiento fiscal (aproximado)</div></div>
    </li>`;
  });
  personales.forEach((ev) => {
    html += `<li class="list-item">
      <span class="dot dot-personal"></span>
      <div class="li-main"><div class="li-title">${escapeHTML(ev.titulo)}</div>${ev.nota ? `<div class="li-sub">${escapeHTML(ev.nota)}</div>` : ""}</div>
      <button class="icon-btn" data-borrar-evento="${ev.id}">🗑️</button>
    </li>`;
  });
  lista.innerHTML = html || `<li class="empty-state">No hay nada cargado para este día.</li>`;

  lista.querySelectorAll("[data-borrar-evento]").forEach((btn) => {
    btn.addEventListener("click", () => DB.borrar("eventos", btn.dataset.borrarEvento));
  });
}

// ════════════════════════════════════════════════════════════
// TAREAS (tareas.html)
// ════════════════════════════════════════════════════════════
let filtroTareas = "pendientes";

function initTareas() {
  const lista = Util.$("lista-tareas");
  if (!lista) return;

  const form = Util.$("form-tarea");
  if (form && !form.dataset.bound) {
    form.dataset.bound = "1";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const texto = Util.$("tarea-texto").value.trim();
      if (!texto) return;
      DB.agregar("tareas", {
        id: DB.id(),
        texto,
        categoria: Util.$("tarea-categoria").value,
        fecha: Util.$("tarea-fecha").value || null,
        hecha: false,
        creada: Date.now(),
      });
      form.reset();
    });
  }

  document.querySelectorAll(".filter-tab").forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-tab").forEach((b) => b.classList.remove("activo"));
      btn.classList.add("activo");
      filtroTareas = btn.dataset.filtro;
      dibujarTareas();
    });
  });

  dibujarTareas();
}

function dibujarTareas() {
  const lista = Util.$("lista-tareas");
  if (!lista) return;
  let todas = DB.lista("tareas").sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999"));
  if (filtroTareas === "pendientes") todas = todas.filter((t) => !t.hecha);
  if (filtroTareas === "completadas") todas = todas.filter((t) => t.hecha);

  const contador = Util.$("tareas-contador");
  if (contador) {
    const n = DB.lista("tareas").filter((t) => !t.hecha).length;
    contador.textContent = n === 1 ? "1 tarea pendiente" : `${n} tareas pendientes`;
  }

  if (!todas.length) {
    lista.innerHTML = `<li class="empty-state">No hay tareas para mostrar acá.</li>`;
    return;
  }

  lista.innerHTML = todas.map((t) => `
    <li class="list-item ${t.hecha ? "hecha" : ""}">
      <input type="checkbox" ${t.hecha ? "checked" : ""} data-toggle="${t.id}" style="width:auto;">
      <div class="li-main">
        <div class="li-title">${escapeHTML(t.texto)}</div>
        <div class="li-sub">${t.categoria ? `<span class="chip">${escapeHTML(t.categoria)}</span>` : ""}${t.fecha ? Util.fechaCorta(t.fecha) : ""}</div>
      </div>
      <button class="icon-btn" data-borrar="${t.id}">🗑️</button>
    </li>`).join("");

  lista.querySelectorAll("[data-toggle]").forEach((el) => {
    el.addEventListener("change", (e) => DB.actualizar("tareas", el.dataset.toggle, { hecha: e.target.checked }));
  });
  lista.querySelectorAll("[data-borrar]").forEach((el) => {
    el.addEventListener("click", () => DB.borrar("tareas", el.dataset.borrar));
  });
}

// ════════════════════════════════════════════════════════════
// FINANZAS (finanzas.html)
// ════════════════════════════════════════════════════════════
let finEstado = null;

function initFinanzas() {
  const lista = Util.$("lista-movimientos");
  if (!lista) return;

  if (!finEstado) {
    const hoy = new Date();
    finEstado = { anio: hoy.getFullYear(), mes: hoy.getMonth() };
  }

  const form = Util.$("form-movimiento");
  if (form && !form.dataset.bound) {
    form.dataset.bound = "1";
    Util.$("mov-fecha").value = Util.hoyISO();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const monto = parseFloat(Util.$("mov-monto").value);
      if (isNaN(monto) || monto <= 0) return;
      DB.agregar("finanzas", {
        id: DB.id(),
        tipo: Util.$("mov-tipo").value,
        categoria: Util.$("mov-categoria").value,
        monto,
        fecha: Util.$("mov-fecha").value || Util.hoyISO(),
        nota: Util.$("mov-nota").value.trim(),
      });
      form.reset();
      Util.$("mov-fecha").value = Util.hoyISO();
    });
  }

  const btnPrev = Util.$("fin-prev");
  const btnNext = Util.$("fin-next");
  if (btnPrev && !btnPrev.dataset.bound) {
    btnPrev.dataset.bound = "1";
    btnPrev.addEventListener("click", () => {
      finEstado.mes--; if (finEstado.mes < 0) { finEstado.mes = 11; finEstado.anio--; }
      dibujarFinanzas();
    });
  }
  if (btnNext && !btnNext.dataset.bound) {
    btnNext.dataset.bound = "1";
    btnNext.addEventListener("click", () => {
      finEstado.mes++; if (finEstado.mes > 11) { finEstado.mes = 0; finEstado.anio++; }
      dibujarFinanzas();
    });
  }

  dibujarFinanzas();
}

function dibujarFinanzas() {
  const lista = Util.$("lista-movimientos");
  if (!lista || !finEstado) return;

  const NOMBRES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  Util.$("fin-titulo").textContent = `${NOMBRES[finEstado.mes]} ${finEstado.anio}`;

  const prefijo = `${finEstado.anio}-${String(finEstado.mes + 1).padStart(2, "0")}`;
  const movs = DB.lista("finanzas").filter((m) => m.fecha.startsWith(prefijo)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ingresos = movs.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.monto, 0);
  const gastos = movs.filter((m) => m.tipo === "gasto").reduce((a, m) => a + m.monto, 0);

  Util.$("fin-ingresos").textContent = Util.pesos(ingresos);
  Util.$("fin-gastos").textContent = Util.pesos(gastos);
  const balEl = Util.$("fin-balance");
  balEl.textContent = Util.pesos(ingresos - gastos);
  balEl.closest(".stat-card").classList.toggle("good", ingresos - gastos >= 0);
  balEl.closest(".stat-card").classList.toggle("warn", ingresos - gastos < 0);

  lista.innerHTML = movs.length
    ? movs.map((m) => `
        <li class="list-item">
          <div class="li-main">
            <div class="li-title">
              <span class="chip ${m.tipo === "ingreso" ? "chip-ingreso" : "chip-gasto"}">${m.tipo === "ingreso" ? "Ingreso" : "Gasto"}</span>
              ${escapeHTML(m.categoria)}
            </div>
            <div class="li-sub">${Util.fechaCorta(m.fecha)}${m.nota ? " · " + escapeHTML(m.nota) : ""}</div>
          </div>
          <strong style="font-family:monospace;">${m.tipo === "gasto" ? "-" : "+"}${Util.pesos(m.monto)}</strong>
          <button class="icon-btn" data-borrar-mov="${m.id}">🗑️</button>
        </li>`).join("")
    : `<li class="empty-state">Todavía no cargaste movimientos este mes.</li>`;

  lista.querySelectorAll("[data-borrar-mov]").forEach((el) => {
    el.addEventListener("click", () => DB.borrar("finanzas", el.dataset.borrarMov));
  });

  // Barras por categoría (gastos)
  const barras = Util.$("fin-barras");
  if (barras) {
    const gastosMov = movs.filter((m) => m.tipo === "gasto");
    if (!gastosMov.length) {
      barras.innerHTML = `<p class="empty-state">Sin gastos cargados este mes todavía.</p>`;
    } else {
      const porCat = {};
      gastosMov.forEach((m) => { porCat[m.categoria] = (porCat[m.categoria] || 0) + m.monto; });
      const total = Object.values(porCat).reduce((a, b) => a + b, 0);
      barras.innerHTML = Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([cat, monto]) => {
        const pct = Math.round((monto / total) * 100);
        return `<div class="bar-row">
          <div class="bar-label"><span>${escapeHTML(cat)}</span><span>${Util.pesos(monto)} (${pct}%)</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join("");
    }
  }
}

// ════════════════════════════════════════════════════════════
// IMPUESTOS (impuestos.html)
// ════════════════════════════════════════════════════════════
function initImpuestos() {
  const monoBtn = Util.$("mono-calcular");
  if (!monoBtn) return; // no estamos en Impuestos

  Util.$("footer-fecha") && (Util.$("footer-fecha").textContent = DATA.ultimaActualizacion);
  Util.$("mono-vencimiento") && (Util.$("mono-vencimiento").textContent = DATA.monotributo.vencimientoTexto);
  Util.$("iva-general-inline") && (Util.$("iva-general-inline").textContent = DATA.iva.general + "%");
  Util.$("iva-reducida-inline") && (Util.$("iva-reducida-inline").textContent = DATA.iva.reducida + "%");
  Util.$("iva-incrementada-inline") && (Util.$("iva-incrementada-inline").textContent = DATA.iva.incrementada + "%");

  monoBtn.addEventListener("click", () => {
    const actividad = Util.$("mono-actividad").value;
    const ingresos = parseFloat(Util.$("mono-ingresos").value);
    const out = Util.$("mono-resultado");
    if (isNaN(ingresos) || ingresos < 0) {
      out.innerHTML = `<div class="result-box warn"><div class="result-title">Falta un dato</div>Ingresá cuánto facturás por año.</div>`;
      return;
    }
    const cat = DATA.monotributo.categorias.find((c) => ingresos <= c.topeAnual);
    if (!cat) {
      out.innerHTML = `<div class="result-box warn"><div class="result-title">Superás el tope del Monotributo</div>Tendrías que pasar a Responsable Inscripto. Consultalo con un contador/a.</div>`;
      return;
    }
    const cuota = actividad === "servicios" ? cat.cuotaServicios : cat.cuotaBienes;
    out.innerHTML = `<div class="result-box">
      <div class="result-title">Categoría ${cat.letra}</div>
      <div class="result-line">Tope anual: ${Util.pesos(cat.topeAnual)}</div>
      <div class="result-line">Cuota mensual: ${Util.pesos(cuota)}</div>
      <div class="result-note">Vigente desde ${DATA.monotributo.vigenciaDesde}. Incluye impuesto, jubilación y obra social.</div>
    </div>`;
  });

  const ganBtn = Util.$("gan-calcular");
  if (ganBtn) ganBtn.addEventListener("click", () => {
    const g = DATA.ganancias;
    const casado = Util.$("gan-estado").value === "casado";
    const hijos = Math.max(0, parseInt(Util.$("gan-hijos").value || "0", 10));
    let pisoNeto = g.pisoNetoBase + (casado ? g.deduccionConyugeMensual : 0) + hijos * g.deduccionHijoMensual;
    const pisoBruto = pisoNeto / g.factorNetoSobreBruto;
    Util.$("gan-resultado").innerHTML = `<div class="result-box">
      <div class="result-title">Empezarías a pagar Ganancias a partir de:</div>
      <div class="result-line">Bruto: ${Util.pesos(pisoBruto)}</div>
      <div class="result-line">Neto: ${Util.pesos(pisoNeto)}</div>
      <div class="result-note">Estimación 1er semestre 2026. Tu recibo real puede variar.</div>
    </div>`;
  });

  const ivaBtn = Util.$("iva-calcular");
  if (ivaBtn) ivaBtn.addEventListener("click", () => {
    const monto = parseFloat(Util.$("iva-monto").value);
    const alicuota = parseFloat(Util.$("iva-alicuota").value);
    const op = Util.$("iva-operacion").value;
    const out = Util.$("iva-resultado");
    if (isNaN(monto) || monto < 0) {
      out.innerHTML = `<div class="result-box warn"><div class="result-title">Falta un dato</div>Ingresá un monto.</div>`;
      return;
    }
    if (op === "agregar") {
      const ivaMonto = monto * (alicuota / 100);
      out.innerHTML = `<div class="result-box">
        <div class="result-title">Precio final: ${Util.pesos(monto + ivaMonto)}</div>
        <div class="result-line">Sin IVA: ${Util.pesos(monto)}</div>
        <div class="result-line">IVA (${alicuota}%): ${Util.pesos(ivaMonto)}</div>
      </div>`;
    } else {
      const sinIva = monto / (1 + alicuota / 100);
      out.innerHTML = `<div class="result-box">
        <div class="result-title">IVA incluido: ${Util.pesos(monto - sinIva)}</div>
        <div class="result-line">Sin IVA: ${Util.pesos(sinIva)}</div>
        <div class="result-line">Con IVA (${alicuota}%): ${Util.pesos(monto)}</div>
      </div>`;
    }
  });

  const bpBtn = Util.$("bp-calcular");
  if (bpBtn) bpBtn.addEventListener("click", () => {
    const patrimonio = parseFloat(Util.$("bp-patrimonio").value);
    const out = Util.$("bp-resultado");
    const mni = DATA.bienesPersonales.minimoNoImponible;
    if (isNaN(patrimonio) || patrimonio < 0) {
      out.innerHTML = `<div class="result-box warn"><div class="result-title">Falta un dato</div>Ingresá el valor de tus bienes.</div>`;
      return;
    }
    if (patrimonio <= mni) {
      out.innerHTML = `<div class="result-box"><div class="result-title">No tenés que pagar Bienes Personales</div>Estás bajo el mínimo no imponible (${Util.pesos(mni)}).</div>`;
    } else {
      out.innerHTML = `<div class="result-box warn">
        <div class="result-title">Superás el mínimo no imponible</div>
        <div class="result-line">Excedente: ${Util.pesos(patrimonio - mni)}</div>
        <div class="result-note">Alícuota progresiva ${DATA.bienesPersonales.alicuotaMin}%–${DATA.bienesPersonales.alicuotaMax}%. Consultá con contador/a para el monto exacto.</div>
      </div>`;
    }
  });

  // Mini calendario fiscal
  const calDiv = Util.$("calendario-fiscal-mini");
  if (calDiv) {
    const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    calDiv.innerHTML = MESES.map((mes, i) => `
      <div style="background:var(--ink-2); border:1px solid var(--ink-line); border-radius:10px; padding:12px;">
        <div style="font-size:0.7rem; text-transform:uppercase; color:var(--gold-soft); margin-bottom:8px;">${mes}</div>
        <div style="display:flex; gap:5px;">
          <span class="dot dot-mono"></span>
          ${i === 5 ? '<span class="dot dot-bp"></span>' : ""}
        </div>
      </div>`).join("");
  }

  // Glosario
  const glosDiv = Util.$("glosario-lista");
  if (glosDiv) {
    const terminos = [
      ["ARCA (ex AFIP)", "El organismo que administra los impuestos nacionales."],
      ["CUIT", "Tu número de identificación tributaria."],
      ["Recategorización", "Trámite dos veces al año para confirmar tu categoría de Monotributo."],
      ["Responsable Inscripto", "Régimen general: IVA y Ganancias por separado, sin tope de facturación."],
      ["Retención", "Cuando te descuentan un impuesto antes de pagarte."],
      ["Declaración jurada (DDJJ)", "El formulario donde declarás tus ingresos o bienes ante ARCA."],
      ["Mínimo no imponible", "El monto hasta el cual no pagás un impuesto."],
      ["Convenio Multilateral", "Acuerdo entre provincias para repartirse Ingresos Brutos."],
    ];
    glosDiv.innerHTML = terminos.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join("");
  }
}

// ════════════════════════════════════════════════════════════
// AYUDA (ayuda.html)
// ════════════════════════════════════════════════════════════
function initAyuda() {
  const btnExp = Util.$("btn-exportar");
  if (!btnExp) return;
  btnExp.addEventListener("click", () => DB.exportar());

  const inputImp = Util.$("input-importar");
  if (inputImp) {
    inputImp.addEventListener("change", (e) => {
      const archivo = e.target.files[0];
      if (!archivo) return;
      const lector = new FileReader();
      lector.onload = () => {
        try {
          DB.importar(lector.result);
          Util.$("importar-mensaje").textContent = "✅ Datos importados con éxito.";
        } catch (err) {
          Util.$("importar-mensaje").textContent = "⚠️ No se pudo leer ese archivo.";
        }
      };
      lector.readAsText(archivo);
    });
  }
}

// ════════════════════════════════════════════════════════════
// ADMIN (admin.html)
// ════════════════════════════════════════════════════════════
function initAdmin() {
  const editTar = Util.$("editor-tareas");
  if (!editTar) return;

  const editEven = Util.$("editor-eventos");
  const editFin = Util.$("editor-finanzas");

  function cargar(clave, el) { el.value = JSON.stringify(DB.lista(clave), null, 2); }
  cargar("tareas", editTar);
  cargar("eventos", editEven);
  cargar("finanzas", editFin);

  function guardar(clave, el, msgEl) {
    try {
      DB.guardarLista(clave, JSON.parse(el.value));
      msgEl.textContent = "✅ Guardado";
      msgEl.style.color = "var(--teal)";
    } catch (e) {
      msgEl.textContent = "❌ JSON inválido: " + e.message;
      msgEl.style.color = "var(--rust)";
    }
  }

  Util.$("btn-guardar-tareas").addEventListener("click", () => guardar("tareas", editTar, Util.$("msg-tareas")));
  Util.$("btn-guardar-eventos").addEventListener("click", () => guardar("eventos", editEven, Util.$("msg-eventos")));
  Util.$("btn-guardar-finanzas").addEventListener("click", () => guardar("finanzas", editFin, Util.$("msg-finanzas")));
  Util.$("btn-recargar-tareas").addEventListener("click", () => cargar("tareas", editTar));
  Util.$("btn-recargar-eventos").addEventListener("click", () => cargar("eventos", editEven));
  Util.$("btn-recargar-finanzas").addEventListener("click", () => cargar("finanzas", editFin));

  Util.$("btn-limpiar-todo").addEventListener("click", () => {
    if (confirm("¿Seguro que querés borrar TODA tu información? No se puede deshacer.")) {
      DB.borrarTodo();
      cargar("tareas", editTar);
      cargar("eventos", editEven);
      cargar("finanzas", editFin);
    }
  });
}

// ── Utilidad chica para no inyectar HTML de textos del usuario sin escapar ──
function escapeHTML(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}
