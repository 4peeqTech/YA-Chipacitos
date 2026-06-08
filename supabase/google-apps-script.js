/**
 * ═══════════════════════════════════════════════════════════════
 *  YA! Chipacitos — Google Apps Script API
 *  Archivo: API (dentro del proyecto Apps Script existente)
 *  NO tocar el archivo unificarTodosLosCsv.js
 * ═══════════════════════════════════════════════════════════════
 *
 * Parámetros GET:
 *   ?fecha=15/05/2026                         → un solo día
 *   ?fechaDesde=01/05/2026&fechaHasta=31/05/2026  → rango
 *   (sin parámetros)                          → todas las sucursales
 */

const PREFIJOS_SUCURSAL = ['Suc.', 'Facultad'];

function doGet(e) {
  try {
    const params = e.parameter || {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('BD') || ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return jsonResponse({ rows: [], total: 0, error: null });
    }

    // Detectar índices por nombre de columna
    const headers = data[0].map(h => String(h).trim().toLowerCase());
    const idx = {
      idVenta:  headers.indexOf('idventa'),
      fecha:    headers.indexOf('fecha'),
      cliente:  headers.indexOf('cliente'),
      producto: headers.indexOf('producto'),
      unidades: headers.indexOf('unidades'),
      monto:    headers.findIndex(h => h.includes('monto bruto')),
    };

    // Parsear parámetros de fecha
    const fechaParam    = params.fecha      || null; // "dd/mm/yyyy" — día exacto
    const fechaDesde    = params.fechaDesde || null; // "dd/mm/yyyy" — inicio rango
    const fechaHasta    = params.fechaHasta || null; // "dd/mm/yyyy" — fin rango

    function toDate(ddmmyyyy) {
      const p = ddmmyyyy.split('/');
      return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
    }

    const dDesde = fechaDesde ? toDate(fechaDesde) : null;
    const dHasta = fechaHasta ? toDate(fechaHasta) : null;

    const rows = data.slice(1)
      .filter(row => {
        // Solo sucursales internas
        const cliente = String(row[idx.cliente] || '').trim();
        if (!PREFIJOS_SUCURSAL.some(p => cliente.startsWith(p))) return false;

        // Solo filas con unidades > 0
        if (Number(row[idx.unidades]) <= 0) return false;

        const rowFechaStr = String(row[idx.fecha] || '').trim();
        if (!rowFechaStr || rowFechaStr === '#N/A') return false;

        // Filtro por día exacto
        if (fechaParam) return rowFechaStr === fechaParam;

        // Filtro por rango
        if (dDesde || dHasta) {
          const rowDate = toDate(rowFechaStr);
          if (dDesde && rowDate < dDesde) return false;
          if (dHasta && rowDate > dHasta) return false;
        }

        return true;
      })
      .map(row => {
        function parseNum(val) {
          if (typeof val === 'number') return val;
          return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
        }
        return {
          idVenta:    String(row[idx.idVenta]  || '').trim(),
          fecha:      String(row[idx.fecha]    || '').trim(),
          cliente:    String(row[idx.cliente]  || '').trim(),
          producto:   String(row[idx.producto] || '').trim(),
          unidades:   Number(row[idx.unidades]) || 0,
          montoBruto: parseNum(row[idx.monto]),
        };
      });

    return jsonResponse({ rows, total: rows.length, error: null });

  } catch (err) {
    return jsonResponse({ rows: [], total: 0, error: err.toString() });
  }
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
