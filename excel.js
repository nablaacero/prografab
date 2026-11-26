// PrograFAB - libro de Excel con formato y logo (ExcelJS). Funciona en el navegador y en Node.
(function (raiz) {
  "use strict";

  var AZUL = "FF14325F", NARANJA = "FFE8622C", GRIS = "FFF3F4F6", AZULCLARO = "FFEEF2F8", BORDE = "FFD9DCE1";
  var F3 = "#,##0.000", F2 = "#,##0.00", F1 = "#,##0.0", F0 = "#,##0";

  function relleno(c) { return { type: "pattern", pattern: "solid", fgColor: { argb: c } }; }
  var lineaFina = { style: "thin", color: { argb: BORDE } };
  function bordes(fila, desde, hasta) {
    for (var c = desde; c <= hasta; c++) fila.getCell(c).border = { top: lineaFina, bottom: lineaFina, left: lineaFina, right: lineaFina };
  }
  function estiloEncabezado(fila, n) {
    for (var c = 1; c <= n; c++) {
      var x = fila.getCell(c);
      x.fill = relleno(AZUL); x.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      x.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    }
    fila.height = 28;
  }
  function formatos(fila, mapa) { Object.keys(mapa).forEach(function (c) { fila.getCell(+c).numFmt = mapa[c]; }); }

  // Cajetín: logo a la izquierda, título y datos del proyecto a la derecha. Devuelve la fila siguiente libre.
  function cajetin(wb, ws, logoId, titulo, meta, nCols) {
    ws.getRow(1).height = 22; ws.getRow(2).height = 18; ws.getRow(3).height = 18;
    if (logoId !== null && logoId !== undefined) ws.addImage(logoId, { tl: { col: 0.15, row: 0.2 }, ext: { width: 176, height: 51 }, editAs: "oneCell" });
    var c0 = Math.min(4, nCols - 1);
    ws.mergeCells(1, c0, 1, nCols);
    var t = ws.getCell(1, c0);
    t.value = titulo; t.font = { bold: true, size: 14, color: { argb: AZUL } }; t.alignment = { vertical: "middle" };
    ws.mergeCells(2, c0, 2, nCols);
    ws.getCell(2, c0).value = "Proyecto " + meta.proy + (meta.nombreProy ? " — " + meta.nombreProy : "") + (meta.alias ? "   ·   Alias " + meta.alias : "") +
      "   ·   " + meta.fase;
    ws.getCell(2, c0).font = { size: 10, color: { argb: "FF1F2937" } };
    ws.mergeCells(3, c0, 3, nCols);
    ws.getCell(3, c0).value = "Fecha " + meta.fecha + "   ·   " + meta.ens + " ensambles   ·   " +
      (meta.kg / 1000).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " t" +
      (meta.por ? "   ·   Generó: " + meta.por : "");
    ws.getCell(3, c0).font = { size: 10, color: { argb: "FF4B5563" } };
    // línea naranja bajo el cajetín
    for (var c = 1; c <= nCols; c++) ws.getCell(4, c).border = { top: { style: "medium", color: { argb: NARANJA } } };
    ws.getRow(4).height = 6;
    return 6;
  }

  function anchos(ws, l) { l.forEach(function (w, i) { ws.getColumn(i + 1).width = w; }); }
  function congelar(ws, fila) { ws.views = [{ state: "frozen", ySplit: fila, showGridLines: false }]; }
  function imprimir(ws, nCols, filaEnc, horizontal) {
    ws.pageSetup = { paperSize: 1, orientation: horizontal ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                     margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    if (filaEnc) ws.pageSetup.printTitlesRow = filaEnc + ":" + filaEnc;
    ws.headerFooter = { oddFooter: "&L&8PrograFAB · NABLA Acero&R&8Página &P de &N" };
  }

  // -------------------------------------------------------------- hoja 1: listado A–M
  function hojaListado(wb, L, C, logo, porFase, meta) {
    var ws = wb.addWorksheet("Listado", { properties: { tabColor: { argb: AZUL } } });
    var r = cajetin(wb, ws, logo, "LISTADO DE ENSAMBLES POR FASE", meta, 13);
    anchos(ws, [8, 7, 11, 9, 27, 10, 2, 12, 2, 10, 12, 21, 7]);
    var enc = ws.getRow(r);
    enc.values = ["Proy Alias", "Proy #", "Part Mark", "[Q] Quantity", "Description", "[Wn] Weight (kg)", "", "[Q]x[Wn] Total weight (kg)", "",
                  "[A] Area (m2)", "[Q]x[A] Total Area (m2)", "Funtion", "Holes"];
    estiloEncabezado(enc, 13); var filaEnc = r; r++;
    porFase.forEach(function (pf) {
      if (porFase.length > 1) {
        ws.mergeCells(r, 1, r, 13);
        var t = ws.getCell(r, 1);
        t.value = pf.fase + " — " + pf.instancias.length + " ensambles";
        t.font = { bold: true, color: { argb: "FFFFFFFF" } }; t.fill = relleno(NARANJA);
        r++;
      }
      var g = {};
      pf.instancias.forEach(function (x) { (g[x.marca] = g[x.marca] || { marca: x.marca, cant: 0, partes: x.partes }).cant++; });
      var lst = L.filasListado(Object.keys(g).map(function (k) { return g[k]; }), { alias: meta.alias, proy: meta.proyNum }, C);
      lst.aoa.forEach(function (v) {
        var f = ws.getRow(r);
        f.values = v.map(function (x) { return x === "" ? null : x; });
        formatos(f, { 6: F3, 8: F3, 10: F3, 11: F3 });
        f.font = { size: 9 };
        [2, 4, 13].forEach(function (c) { f.getCell(c).alignment = { horizontal: "center" }; });
        f.getCell(12).alignment = { indent: 1 };
        if (v[5] === "[Wn]Assembly") {
          f.font = { size: 9, italic: true, bold: true, color: { argb: "FF374151" } };
          for (var c = 6; c <= 11; c++) f.getCell(c).border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } };
        } else if (v[5] === "" && v[2]) {
          for (var c2 = 1; c2 <= 13; c2++) f.getCell(c2).fill = relleno(AZULCLARO);
          f.font = { size: 9.5, bold: true, color: { argb: AZUL } };
        }
        r++;
      });
    });
    ws.autoFilter = { from: { row: filaEnc, column: 1 }, to: { row: filaEnc, column: 13 } };
    congelar(ws, filaEnc); imprimir(ws, 13, filaEnc, false);
  }

  // -------------------------------------------------------------- hoja: placas por espesor / perfiles por perfil
  function hojaDetalle(wb, logo, meta, nombre, titulo, grupos, esPerfil) {
    var ws = wb.addWorksheet(nombre, { properties: { tabColor: { argb: NARANJA } } });
    var cols = esPerfil
      ? ["Fase", "Marca pieza", "Descripción", "Rol", "Largo (mm)", "Cantidad", "Metros lineales", "Peso unit. (kg)", "Peso total (kg)", "Ensambles (piezas)"]
      : ["Fase", "Marca pieza", "Descripción", "Tipo", "Rol", "Cantidad", "Área placa total (m²)", "Peso unit. (kg)", "Peso total (kg)", "Ensambles (piezas)"];
    var n = cols.length;
    var r = cajetin(wb, ws, logo, titulo, meta, n);
    anchos(ws, esPerfil ? [11, 10, 22, 16, 10, 9, 11, 10, 11, 48] : [11, 10, 25, 11, 16, 9, 11, 10, 11, 48]);
    // índice rápido de grupos
    ws.getCell(r, 1).value = esPerfil ? "Resumen por perfil" : "Resumen por espesor";
    ws.getCell(r, 1).font = { bold: true, color: { argb: AZUL } }; r++;
    var er = ws.getRow(r);
    er.values = esPerfil ? ["Perfil", "", "", "", "", "Cantidad", "Metros lineales", "", "Peso total (kg)"]
                         : ["Espesor", "", "", "", "", "Cantidad", "Área placa (m²)", "", "Peso total (kg)"];
    estiloEncabezado(er, 9); er.height = 18; ws.mergeCells(r, 1, r, 5); r++;
    var tot = { c: 0, m: 0, kg: 0 };
    grupos.forEach(function (g) {
      var f = ws.getRow(r);
      f.values = [g.grupo, null, null, null, null, g.cant, esPerfil ? g.m : g.m2, null, g.kg];
      formatos(f, { 6: F0, 7: F2, 9: F1 }); f.font = { size: 9.5 }; bordes(f, 1, 9); ws.mergeCells(r, 1, r, 5);
      tot.c += g.cant; tot.m += esPerfil ? g.m : g.m2; tot.kg += g.kg; r++;
    });
    var ft = ws.getRow(r);
    ft.values = ["TOTAL", null, null, null, null, tot.c, tot.m, null, tot.kg];
    formatos(ft, { 6: F0, 7: F2, 9: F1 }); ft.font = { bold: true, size: 9.5 }; bordes(ft, 1, 9); ws.mergeCells(r, 1, r, 5);
    r += 2;
    // detalle
    ws.getCell(r, 1).value = "Detalle: qué marcas son, en qué fase y cuántas";
    ws.getCell(r, 1).font = { bold: true, color: { argb: AZUL } }; r++;
    var enc = ws.getRow(r); enc.values = cols; estiloEncabezado(enc, n); var filaEnc = r; r++;
    grupos.forEach(function (g) {
      ws.mergeCells(r, 1, r, n);
      var t = ws.getCell(r, 1);
      t.value = g.grupo + "   —   " + g.cant.toLocaleString("es-GT") + " piezas   ·   " +
        (esPerfil ? g.m.toLocaleString("es-GT", { maximumFractionDigits: 2 }) + " m lineales" : g.m2.toLocaleString("es-GT", { maximumFractionDigits: 2 }) + " m² de placa") +
        "   ·   " + g.kg.toLocaleString("es-GT", { maximumFractionDigits: 1 }) + " kg";
      t.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }; t.fill = relleno(AZUL);
      r++;
      g.filas.forEach(function (x, i) {
        var f = ws.getRow(r);
        f.values = esPerfil
          ? [x.fase, x.spm, x.desc, x.rol, x.largo, x.cant, x.m, x.kgU, x.kg, x.ensTxt]
          : [x.fase, x.spm, x.desc, x.tipo, x.rol, x.cant, x.m2, x.kgU, x.kg, x.ensTxt];
        formatos(f, esPerfil ? { 5: F0, 6: F0, 7: F2, 8: F3, 9: F2 } : { 6: F0, 7: F3, 8: F3, 9: F2 });
        f.font = { size: 9 };
        for (var cc = 1; cc <= n; cc++) f.getCell(cc).alignment = cc === 10 ? { vertical: "top", wrapText: true, indent: 1 } : { vertical: "top" };
        if (i % 2) for (var c = 1; c <= n; c++) f.getCell(c).fill = relleno(GRIS);
        r++;
      });
      var st = ws.getRow(r);
      st.values = esPerfil ? ["", "Subtotal " + g.grupo, null, null, null, g.cant, g.m, null, g.kg]
                           : ["", "Subtotal " + g.grupo, null, null, null, g.cant, g.m2, null, g.kg];
      formatos(st, { 6: F0, 7: esPerfil ? F2 : F3, 9: F2 });
      st.font = { bold: true, size: 9 };
      for (var c3 = 1; c3 <= n; c3++) st.getCell(c3).border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } };
      r += 2;
    });
    ws.autoFilter = { from: { row: filaEnc, column: 1 }, to: { row: filaEnc, column: n } };
    imprimir(ws, n, filaEnc, true);
    ws.views = [{ showGridLines: false }];
  }

  // -------------------------------------------------------------- hoja: metros lineales (resumen de compra)
  function hojaMetros(wb, L, C, logo, meta, instancias) {
    var ws = wb.addWorksheet("Metros lineales");
    var r = cajetin(wb, ws, logo, "METROS LINEALES Y PLACAS", meta, 7);
    anchos(ws, [32, 14, 11, 15, 15, 12, 14]);
    L.filasMateriales(L.resumenMateriales(instancias, C)).forEach(function (v) {
      var f = ws.getRow(r);
      f.values = v;
      var a = String(v[0] || "");
      if (/^\d\. /.test(a)) { f.font = { bold: true, color: { argb: AZUL }, size: 10.5 }; }
      else if (/^(Perfil|Tipo|Rol|Espesor)$/.test(a)) { estiloEncabezado(f, v.length); f.height = 18; }
      else if (/^(Total|PESO)/.test(a)) { f.font = { bold: true, size: 9.5 }; for (var c = 1; c <= 7; c++) f.getCell(c).border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } }; }
      else f.font = { size: 9.5 };
      r++;
    });
    ws.eachRow(function (row) { row.eachCell(function (cell) { if (typeof cell.value === "number") cell.numFmt = Number.isInteger(cell.value) ? F0 : F2; }); });
    ws.views = [{ showGridLines: false }];
    imprimir(ws, 7, 0, false);
  }

  // -------------------------------------------------------------- hoja: resumen de marcas
  function hojaResumen(wb, L, logo, meta, porFase) {
    var ws = wb.addWorksheet("Resumen marcas");
    var r = cajetin(wb, ws, logo, "RESUMEN DE ENSAMBLES", meta, 6);
    anchos(ws, [14, 12, 9, 10, 15, 15]);
    var enc = ws.getRow(r); enc.values = ["Fase", "Marca", "Prefijo", "Cantidad", "Peso unitario (kg)", "Peso total (kg)"];
    estiloEncabezado(enc, 6); var filaEnc = r; r++;
    porFase.forEach(function (pf) {
      var g = {};
      pf.instancias.forEach(function (x) { (g[x.marca] = g[x.marca] || { marca: x.marca, cant: 0, kg: x.kg }).cant++; });
      Object.keys(g).sort(L.cmpNat).forEach(function (m) {
        var f = ws.getRow(r);
        f.values = [pf.fase, m, L.prefijo(m), g[m].cant, g[m].kg, g[m].kg * g[m].cant];
        formatos(f, { 4: F0, 5: F1, 6: F1 }); f.font = { size: 9.5 }; bordes(f, 1, 6); r++;
      });
    });
    ws.autoFilter = { from: { row: filaEnc, column: 1 }, to: { row: filaEnc, column: 6 } };
    congelar(ws, filaEnc); imprimir(ws, 6, filaEnc, false);
  }

  // porFase: [{ fase, instancias:[{marca, partes, kg}] }]; meta: {proy, proyNum, alias, fase, fecha, por}
  function construirLibro(ExcelJS, L, C, porFase, meta, logoBuffer) {
    var wb = new ExcelJS.Workbook();
    wb.creator = "PrograFAB · NABLA Acero"; wb.created = new Date();
    var logo = null;
    if (logoBuffer) { try { logo = wb.addImage({ buffer: logoBuffer, extension: "png" }); } catch (e) { logo = null; } }
    var todas = [];
    porFase.forEach(function (pf) { pf.instancias.forEach(function (x) { todas.push({ marca: x.marca, partes: x.partes, kg: x.kg, fase: pf.fase }); }); });
    meta.ens = todas.length;
    meta.kg = todas.reduce(function (s, x) { return s + (x.kg || 0); }, 0);
    hojaListado(wb, L, C, logo, porFase, meta);
    var det = L.detalleMateriales(todas, C);
    hojaDetalle(wb, logo, meta, "Placas por espesor", "PLACAS POR ESPESOR — marcas, fase y cantidades", det.placas, false);
    hojaDetalle(wb, logo, meta, "Perfiles", "PERFILES — marcas, fase, cantidades y metros lineales", det.perfiles, true);
    hojaMetros(wb, L, C, logo, meta, todas);
    hojaResumen(wb, L, logo, meta, porFase);
    return wb;
  }

  var api = { construirLibro: construirLibro };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.ExcelPF = api;
})(this);
