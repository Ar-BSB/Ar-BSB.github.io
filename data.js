/**
 * data.js — TODOS los montos de impuestos viven acá.
 * Actualizar cada 6 meses (febrero/agosto) desde https://www.arca.gob.ar
 */
const DATA = {
  ultimaActualizacion: "4 de agosto de 2026",

  monotributo: {
    vigenciaDesde: "1 de agosto de 2026",
    categorias: [
      { letra: "A", topeAnual: 12009410.45, cuotaServicios: 49527.18, cuotaBienes: 49527.18 },
      { letra: "B", topeAnual: 17595182.74, cuotaServicios: 56379.08, cuotaBienes: 56379.08 },
      { letra: "C", topeAnual: 24670494.31, cuotaServicios: 66020.12, cuotaBienes: 64530.58 },
      { letra: "D", topeAnual: 30628651.43, cuotaServicios: 84612.93, cuotaBienes: 82564.81 },
      { letra: "E", topeAnual: 36028231.33, cuotaServicios: 119811.45, cuotaBienes: 108267.51 },
      { letra: "F", topeAnual: 45151659.41, cuotaServicios: 150784.21, cuotaBienes: 129930.65 },
      { letra: "G", topeAnual: 53995798.87, cuotaServicios: 230312.94, cuotaBienes: 158815.05 },
      { letra: "H", topeAnual: 81924660.37, cuotaServicios: 522706.68, cuotaBienes: 317895.01 },
      { letra: "I", topeAnual: 91699761.90, cuotaServicios: 963747.86, cuotaBienes: 474992.78 },
      { letra: "J", topeAnual: 105012519.20, cuotaServicios: 1167299.76, cuotaBienes: 580793.69 },
      { letra: "K", topeAnual: 126610838.75, cuotaServicios: 1614446.04, cuotaBienes: 702103.24 },
    ],
    vencimientoTexto: "Alrededor del día 20 de cada mes (depende del último dígito de tu CUIT). Se paga TODOS los meses.",
    diaVencimiento: 20,
  },

  ganancias: {
    vigencia: "1er semestre 2026",
    pisoNetoBase: 2490037.88,
    deduccionConyugeMensual: 404330.39,
    deduccionHijoMensual: 203905.29,
    factorNetoSobreBruto: 0.83,
    alicuotaMinima: 5,
    alicuotaMaxima: 35,
  },

  iva: { general: 21, reducida: 10.5, incrementada: 27 },

  bienesPersonales: {
    periodo: "2025 (declaración en 2026)",
    minimoNoImponible: 384728044.57,
    alicuotaMin: 0.5,
    alicuotaMax: 1.0,
    mes: 6,
    dia: 13,
  },
};
