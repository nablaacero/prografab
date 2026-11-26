/* PrograFAB - extensión del visor 3D de Trimble Connect: fases de fabricación por ensamble */
(function () {
  "use strict";
  var C = window.CONFIG, L = window.LogicaPF;
  var API = null, pid = "";
  var modelo = null;          // { ins: [...], porRid: { "mid:id": i }, todosIds: [...] }
  var datos = nuevoDatos();   // fases y asignaciones vigentes
  var pend = nuevoPend();     // cambios locales aún no guardados en Trimble Connect
  var chipsSel = {}, coloreado = false;
  var tokTC = null, esperaTok = null, baseTC = null, carpetaId = null;
  var $ = function (id) { return document.getElementById(id); };

  function nuevoDatos() { return { version: 1, fases: [], asign: {}, marcas: {}, actualizado: "" }; }
  function nuevoPend() { return { asign: {}, fases: {} }; }
  function hayPend() { return Object.keys(pend.asign).length + Object.keys(pend.fases).length > 0; }
  function esc(t) { return String(t === undefined || t === null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function estado(txt, error) { var e = $("estado"); e.textContent = txt || ""; e.className = error ? "error" : ""; }
  function ton(kg) { return (kg / 1000).toLocaleString("es-GT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function leerLocal(k) { try { return localStorage.getItem("prografab:" + k); } catch (e) { return null; } }
  function guardarLocal(k, v) { try { localStorage.setItem("prografab:" + k, v); } catch (e) {} }
  function norm(t) { return String(t || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function hoy() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  // ------------------------------------------------------------ conexión
  async function conectar() {
    try {
      API = await TrimbleConnectWorkspace.connect(window.parent, function (evento, d) {
        if (evento === "viewer.onModelStateChanged" || evento === "viewer.onModelReset") { /* el índice se refresca con «Leer modelo» */ }
        if (evento === "viewer.onSelectionChanged") contarSeleccion();
        if (evento === "extension.accessToken") {
          var t = d && d.data !== undefined ? d.data : d;
          if (t && t !== "pending" && t !== "denied") { tokTC = t; if (esperaTok) { esperaTok(t); esperaTok = null; } }
        }
      }, 30000);
      try {
        var p = await API.project.getProject();
        pid = p && p.id || ""; nombreProy = String(p && p.name || "").replace(new RegExp(C.patronProyecto), "").replace(/^[\s\-–]+/, "").trim();
        var m = (p && p.name || "").match(new RegExp(C.patronProyecto));
        $("proyecto").value = leerLocal("proyecto:" + pid) || (m ? m[1] : "");
        $("alias").value = leerLocal("alias:" + pid) || "";
      } catch (e) {}
      cargarLocal();
      pintarFases();
      estado("Listo. Carga los modelos y presiona «Leer modelo».");
      if ((C.gruposBloqueados || []).length) verificarAcceso().catch(function () {});
    } catch (e) {
      estado("No se pudo conectar con Trimble Connect. Abre esta página desde el visor 3D.", true);
    }
  }

  function cargarLocal() {
    try { var d = JSON.parse(leerLocal("datos:" + pid) || "null"); if (d && d.fases) datos = d; } catch (e) {}
    try { var p = JSON.parse(leerLocal("pend:" + pid) || "null"); if (p && p.asign) pend = p; } catch (e) {}
  }
  function guardarTodoLocal() {
    guardarLocal("datos:" + pid, JSON.stringify(datos));
    guardarLocal("pend:" + pid, JSON.stringify(pend));
  }

  // ------------------------------------------------------------ índice: ensambles del modelo
  async function indexar() {
    estado("Leyendo propiedades de los modelos cargados…");
    var modelos = await API.viewer.getObjects();
    var todosIds = modelos.map(function (m) { return { modelId: m.modelId, objectRuntimeIds: (m.objects || []).map(function (o) { return o.id; }) }; });
    var partes = {}, asm = [], total = 0;
    for (var a = 0; a < modelos.length; a++) {
      var mid = modelos[a].modelId, ids = (modelos[a].objects || []).map(function (o) { return o.id; });
      for (var i = 0; i < ids.length; i += 1000) {
        var props = await API.viewer.getObjectProperties(mid, ids.slice(i, i + 1000));
        props.forEach(function (o) {
          if (/ASSEMBLY/i.test(String(o.class || ""))) { asm.push({ modelId: mid, id: o.id, nombre: o.product && o.product.name || o.name || "" }); return; }
          var p = L.leerParte(o, C);
          if (p) partes[mid + ":" + o.id] = p;
        });
        total += Math.min(1000, ids.length - i);
        estado("Leyendo propiedades… " + total + " objetos");
      }
    }
    if (!asm.length) throw new Error("Los modelos cargados no traen ensambles (IfcElementAssembly). Revisa la exportación del IFC.");
    var ins = [], porRid = {}, claves = {};
    for (var u = 0; u < asm.length; u += 40) {
      var lote = asm.slice(u, u + 40);
      var hh = await Promise.all(lote.map(async function (x) {
        try { return await API.viewer.getHierarchyChildren(x.modelId, [x.id], 4, true); } catch (e) { return []; }
      }));
      lote.forEach(function (x, j) {
        var hijos = (hh[j] || []).map(function (e) { return e.id; });
        var ps = hijos.map(function (h) { return partes[x.modelId + ":" + h]; }).filter(Boolean);
        var main = ps.filter(function (p) { return p.main; })[0] || ps[0];
        var marca = String(x.nombre || (main && main.mpm) || "").trim().toUpperCase();
        if (!marca) return;
        var key = main && main.handle ? "H:" + main.handle : marca + "@" + x.modelId + ":" + x.id;
        if (claves[key]) key += "#" + (++claves[key]); else claves[key] = 1;
        var fab = ps.filter(function (p) { return L.tipoParte(p, C) !== "nofab"; });
        var it = { key: key, marca: marca, pref: L.prefijo(marca), modelId: x.modelId, ids: [x.id].concat(hijos), partes: ps,
                   kg: fab.reduce(function (s, p) { return s + p.peso; }, 0), pz: fab.length };
        var k = ins.push(it) - 1;
        it.ids.forEach(function (id) { porRid[x.modelId + ":" + id] = k; });
      });
      estado("Agrupando piezas por ensamble… " + Math.min(u + 40, asm.length) + "/" + asm.length);
    }
    modelo = { ins: ins, porRid: porRid, todosIds: todosIds };
    return modelo;
  }

  async function leerModelo() {
    if (!API) return;
    ocupado(true);
    try {
      await verificarAcceso();
      guardarLocal("proyecto:" + pid, $("proyecto").value.trim());
      guardarLocal("alias:" + pid, $("alias").value.trim());
      await indexar();
      var avisoTC = "";
      try { await recargarTC(true); } catch (e) { avisoTC = " · " + (e.message || e); }
      pintarChips(); pintarFases();
      var conFase = modelo.ins.filter(function (x) { return datos.asign[x.key]; }).length;
      estado(modelo.ins.length.toLocaleString("es-GT") + " ensambles en el modelo · " + conFase + " con fase." + avisoTC, !!avisoTC);
    } catch (e) { estado(e.message || String(e), true); }
    finally { ocupado(false); }
  }
  function ocupado(si) { ["btnLeer", "btnAsignar", "btnGuardarTC"].forEach(function (b) { $(b).disabled = si; }); }

  // ------------------------------------------------------------ selección
  function selector(lista) {
    var por = {};
    lista.forEach(function (x) {
      var g = por[x.modelId] = por[x.modelId] || { modelId: x.modelId, objectRuntimeIds: [] };
      Array.prototype.push.apply(g.objectRuntimeIds, x.ids);
    });
    return { modelObjectIds: Object.keys(por).map(function (k) { return por[k]; }) };
  }

  async function instanciasSeleccion() {
    if (!modelo) throw new Error("Primero presiona «Leer modelo».");
    var sel = await API.viewer.getSelection(), vistos = {}, out = [];
    (sel || []).forEach(function (g) {
      (g.objectRuntimeIds || []).forEach(function (id) {
        var k = modelo.porRid[g.modelId + ":" + id];
        if (k !== undefined && !vistos[k]) { vistos[k] = 1; out.push(modelo.ins[k]); }
      });
    });
    return out;
  }

  async function seleccionar(lista, texto) {
    if (!lista.length) { await API.viewer.setSelection({ modelObjectIds: [] }, "set").catch(function () {}); $("txtSel").textContent = ""; return; }
    await API.viewer.setSelection(selector(lista), "set");
    $("txtSel").textContent = lista.length + " ensambles · " + ton(lista.reduce(function (s, x) { return s + x.kg; }, 0)) + " t";
    if (texto) estado(texto);
  }

  var tContar = null;
  function contarSeleccion() {
    clearTimeout(tContar);
    tContar = setTimeout(async function () {
      if (!modelo) return;
      try {
        var l = await instanciasSeleccion();
        $("txtSel").textContent = l.length ? l.length + " ensambles · " + ton(l.reduce(function (s, x) { return s + x.kg; }, 0)) + " t" : "";
      } catch (e) {}
    }, 300);
  }

  function filtroSinFase(l) { return $("soloSinFase").checked ? l.filter(function (x) { return !datos.asign[x.key]; }) : l; }

  function pintarChips() {
    if (!modelo) return;
    var cuenta = {}, libres = {};
    modelo.ins.forEach(function (x) { cuenta[x.pref] = (cuenta[x.pref] || 0) + 1; if (!datos.asign[x.key]) libres[x.pref] = (libres[x.pref] || 0) + 1; });
    var prefs = Object.keys(cuenta).sort(function (a, b) { return cuenta[b] - cuenta[a] || (a < b ? -1 : 1); });
    $("chips").innerHTML = prefs.map(function (p) {
      return '<button class="chip' + (chipsSel[p] ? " act" : "") + '" data-p="' + esc(p) + '" title="' + (libres[p] || 0) + ' sin fase de ' + cuenta[p] + '">' +
        esc(p) + "<span>" + (libres[p] || 0) + "/" + cuenta[p] + "</span></button>";
    }).join("") + '<button class="chip todo" data-p="*">Ninguno</button>';
  }

  async function aplicarChips() {
    var activos = Object.keys(chipsSel).filter(function (k) { return chipsSel[k]; });
    var l = filtroSinFase(modelo.ins.filter(function (x) { return chipsSel[x.pref]; }));
    await seleccionar(l, activos.length ? "Seleccionados por código: " + activos.join(", ") : "");
  }

  function patronMarcas(txt) {
    var partes = String(txt || "").split(/[,;\s]+/).map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean);
    if (!partes.length) return null;
    return new RegExp("^(" + partes.map(function (p) { return p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"); }).join("|") + ")$");
  }

  // ------------------------------------------------------------ fases
  function fase(id) { return datos.fases.filter(function (f) { return f.id === id; })[0]; }
  function marcarCambio() { datos.actualizado = new Date().toISOString(); guardarTodoLocal(); pintarFases(); pintarChips(); if (coloreado) colorear(); }

  function crearFase() {
    var n = $("nuevaFase").value.trim() || ("Fase " + (datos.fases.length + 1));
    if (datos.fases.some(function (f) { return norm(f.nombre) === norm(n); })) { estado("Ya existe una fase con ese nombre.", true); return; }
    var f = { id: "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nombre: n,
              color: C.coloresFase[datos.fases.length % C.coloresFase.length], creada: new Date().toISOString() };
    datos.fases.push(f); pend.fases[f.id] = f;
    $("nuevaFase").value = "";
    guardarLocal("activa:" + pid, f.id);
    marcarCambio();
    estado("Fase «" + n + "» creada. Selecciona ensambles y presiona «Asignar selección».");
  }

  async function asignar(quitar) {
    try {
      var fid = $("faseActiva").value;
      if (!quitar && !fid) { estado("Crea una fase primero.", true); return; }
      var l = await instanciasSeleccion();
      if (!l.length) { estado("No hay ensambles seleccionados en el modelo.", true); return; }
      var cambio = 0, otra = 0;
      l.forEach(function (x) {
        var antes = datos.asign[x.key] || "";
        var nuevo = quitar ? "" : fid;
        if (antes === nuevo) return;
        if (antes && !quitar) otra++;
        if (nuevo) datos.asign[x.key] = nuevo; else delete datos.asign[x.key];
        datos.marcas[x.key] = x.marca;
        pend.asign[x.key] = nuevo;
        cambio++;
      });
      chipsSel = {};
      marcarCambio();
      var kg = l.reduce(function (s, x) { return s + x.kg; }, 0);
      estado(quitar ? cambio + " ensambles quedaron sin fase."
        : cambio + " ensambles asignados a «" + fase(fid).nombre + "» (" + ton(kg) + " t)" + (otra ? " · " + otra + " se movieron de otra fase" : "") + ". Falta «Guardar en Trimble Connect».");
    } catch (e) { estado(e.message || String(e), true); }
  }

  function instFase(fid) { return modelo ? modelo.ins.filter(function (x) { return (datos.asign[x.key] || "") === fid; }) : []; }

  function pintarFases() {
    var act = leerLocal("activa:" + pid) || $("faseActiva").value;
    $("faseActiva").innerHTML = datos.fases.length
      ? datos.fases.map(function (f) { return '<option value="' + f.id + '">' + esc(f.nombre) + "</option>"; }).join("")
      : '<option value="">(crea una fase)</option>';
    if (act && fase(act)) $("faseActiva").value = act;
    var tot = { e: 0, p: 0, k: 0 };
    var fila = function (f, l, sinFase) {
      var e = l.length, p = l.reduce(function (s, x) { return s + x.pz; }, 0), k = l.reduce(function (s, x) { return s + x.kg; }, 0);
      tot.e += e; tot.p += p; tot.k += k;
      var id = sinFase ? "" : f.id;
      var acc = (e ? '<button class="ico txt" data-sel="' + id + '" title="Seleccionar en el modelo">▶</button>' +
                     '<button class="ico txt" data-solo="' + id + '" title="Mostrar solo esta fase">◉</button>' +
                     '<button class="ico txt" data-xls="' + id + '" title="Listado en Excel">XLS</button>' : "") +
                (sinFase ? "" : '<button class="ico txt" data-borrar="' + id + '" title="Borrar la fase">×</button>');
      var nom = sinFase ? '<span class="sw" style="background:' + C.colorSinFase + '"></span> Sin fase'
        : '<input type="color" value="' + f.color + '" data-color="' + id + '"> ' + '<span data-ren="' + id + '">' + esc(f.nombre) + "</span>";
      return "<tr" + (!sinFase && id === $("faseActiva").value ? ' class="act"' : "") + '><td class="nom">' + nom + '</td><td class="num">' + (modelo ? e : "") +
        '</td><td class="num">' + (modelo ? p.toLocaleString("es-GT") : "") + '</td><td class="num">' + (modelo ? ton(k) : "") + '</td><td class="accs">' + acc + "</td></tr>";
    };
    var html = datos.fases.map(function (f) { return fila(f, instFase(f.id), false); }).join("");
    if (modelo) {
      html += fila(null, instFase(""), true);
      html += '<tr class="tot"><td>Total en modelo</td><td class="num">' + tot.e + '</td><td class="num">' + tot.p.toLocaleString("es-GT") + '</td><td class="num">' + ton(tot.k) + "</td><td></td></tr>";
    }
    $("cuerpoFases").innerHTML = html || '<tr><td colspan="5" class="ayuda">Sin fases todavía.</td></tr>';
    // asignaciones que no están en el modelo cargado
    var aviso = "";
    if (modelo) {
      var enModelo = {}; modelo.ins.forEach(function (x) { enModelo[x.key] = 1; });
      var fuera = Object.keys(datos.asign).filter(function (k) { return !enModelo[k]; });
      if (fuera.length) {
        var ms = fuera.map(function (k) { return datos.marcas[k] || k; });
        aviso = '<div class="aviso">' + fuera.length + " ensambles con fase no están en los modelos cargados (otro modelo, o se borraron/renumeraron): " +
          esc(ms.slice(0, 30).join(", ")) + (ms.length > 30 ? "…" : "") + "</div>";
      }
    }
    $("avisoFases").innerHTML = aviso;
    $("txtGuardado").innerHTML = hayPend() ? '<span class="pend">cambios sin guardar</span>'
      : (datos.guardadoTC ? '<span class="ok">guardado ' + new Date(datos.guardadoTC).toLocaleString("es-GT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + "</span>" : "");
  }

  function borrarFase(id) {
    var f = fase(id); if (!f) return;
    var n = instFase(id).length || Object.keys(datos.asign).filter(function (k) { return datos.asign[k] === id; }).length;
    if (n && !confirmarBorrar(id)) return;
    datos.fases = datos.fases.filter(function (x) { return x.id !== id; });
    Object.keys(datos.asign).forEach(function (k) { if (datos.asign[k] === id) { delete datos.asign[k]; pend.asign[k] = ""; } });
    pend.fases[id] = null;
    marcarCambio();
    estado("Fase «" + f.nombre + "» borrada" + (n ? "; " + n + " ensambles quedaron sin fase." : "."));
  }
  // se pide un segundo clic en lugar de un cuadro de confirmación (los diálogos bloquean el visor)
  var porBorrar = null;
  function confirmarBorrar(id) {
    if (porBorrar === id) { porBorrar = null; return true; }
    porBorrar = id; estado("La fase tiene ensambles asignados. Presiona × otra vez para borrarla.", true);
    setTimeout(function () { if (porBorrar === id) porBorrar = null; }, 6000);
    return false;
  }

  function renombrar(span) {
    var id = span.dataset.ren, f = fase(id); if (!f) return;
    var inp = document.createElement("input");
    inp.type = "text"; inp.value = f.nombre; inp.style.width = "110px"; inp.style.padding = "2px 4px";
    span.replaceWith(inp); inp.focus(); inp.select();
    var listo = false;
    var fin = function (ok) {
      if (listo) return; listo = true;
      var v = inp.value.trim();
      if (ok && v && v !== f.nombre) { f.nombre = v; pend.fases[id] = f; marcarCambio(); } else pintarFases();
    };
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") fin(true); if (e.key === "Escape") fin(false); });
    inp.addEventListener("blur", function () { fin(true); });
  }

  // ------------------------------------------------------------ colores y vista
  async function colorear() {
    if (!modelo) { estado("Primero presiona «Leer modelo».", true); return; }
    try {
      await API.viewer.setObjectState(undefined, { color: "reset" });
      await API.viewer.setObjectState(undefined, { color: { r: 225, g: 225, b: 225, a: 70 } });
      var sin = instFase("");
      if (sin.length) await API.viewer.setObjectState(selector(sin), { color: rgba(C.colorSinFase) });
      for (var i = 0; i < datos.fases.length; i++) {
        var l = instFase(datos.fases[i].id);
        if (l.length) await API.viewer.setObjectState(selector(l), { color: rgba(datos.fases[i].color) });
      }
      coloreado = true;
    } catch (e) { estado("No se pudo colorear: " + (e.message || e), true); }
  }
  function rgba(hex) { var h = String(hex).replace("#", ""); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 255 }; }

  async function quitarColores() {
    coloreado = false;
    try { await API.viewer.setObjectState(undefined, { color: "reset", visible: "reset" }); estado("Colores restablecidos."); } catch (e) {}
  }

  async function mostrarSolo(lista, nombre) {
    var sel = selector(lista), ok = false;
    try {
      ok = await API.viewer.isolateEntities(sel.modelObjectIds.map(function (g) { return { modelId: g.modelId, entityIds: g.objectRuntimeIds }; }));
    } catch (e) { ok = false; }
    if (ok === false) {
      var ver = {};
      sel.modelObjectIds.forEach(function (g) { g.objectRuntimeIds.forEach(function (id) { ver[g.modelId + ":" + id] = 1; }); });
      var ocultar = modelo.todosIds.map(function (g) {
        return { modelId: g.modelId, objectRuntimeIds: g.objectRuntimeIds.filter(function (id) { return !ver[g.modelId + ":" + id]; }) };
      }).filter(function (g) { return g.objectRuntimeIds.length; });
      if (ocultar.length) await API.viewer.setObjectState({ modelObjectIds: ocultar }, { visible: false });
      await API.viewer.setObjectState(sel, { visible: true });
    }
    await API.viewer.setCamera(sel, { animationTime: 400 }).catch(function () {});
    estado("Mostrando solo " + nombre + " · " + lista.length + " ensambles. «Quitar colores» vuelve a mostrar todo.");
  }

  // ------------------------------------------------------------ listados Excel (ExcelJS: logo y formato)
  var logoBuf = null, nombreProy = "";
  async function logo() {
    if (logoBuf) return logoBuf;
    try { var r = await fetch(C.logoListado || "logo.png"); if (r.ok) logoBuf = await r.arrayBuffer(); } catch (e) {}
    return logoBuf;
  }

  // porFase: [{ fase, instancias }]
  async function exportar(porFase, titulo) {
    porFase = porFase.filter(function (p) { return p.instancias.length; });
    if (!porFase.length) { estado("No hay ensambles para el listado.", true); return; }
    try {
      estado("Generando el listado…");
      var proy = $("proyecto").value.trim(), alias = $("alias").value.trim();
      var quien = "";
      try { if (baseTC) { var yo = await tc("/users/me"); quien = ((yo.firstName || "") + " " + (yo.lastName || "")).trim(); } } catch (e) {}
      var meta = { proy: proy, proyNum: isNaN(+proy) ? proy : +proy, nombreProy: nombreProy, alias: alias, fase: titulo, fecha: hoy(), por: quien };
      var wb = ExcelPF.construirLibro(ExcelJS, L, C, porFase, meta, await logo());
      var buf = await wb.xlsx.writeBuffer();
      var nombre = ("PrograFAB_" + proy + "_" + alias + "_" + titulo + "_" + hoy())
        .replace(/[\\/:*?"<>|]+/g, "-").replace(/_+/g, "_").replace(/\s+/g, " ") + ".xlsx";
      descargar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombre);
      var n = porFase.reduce(function (s, p) { return s + p.instancias.length; }, 0);
      if ($("subirListados").checked) {
        estado("Guardando " + nombre + " en Trimble Connect…");
        await subirTC(nombre, buf);
        estado("Listado «" + nombre + "» descargado y guardado en " + C.carpetaFases + ".");
      } else estado("Listado «" + nombre + "» descargado (" + n + " ensambles).");
    } catch (e) { estado("No se pudo generar el listado: " + (e.message || e), true); }
  }
  function exportarFase(id) { exportar([{ fase: id ? fase(id).nombre : "Sin fase", instancias: instFase(id) }], id ? fase(id).nombre : "Sin fase"); }
  function exportarTodas() {
    if (!modelo) { estado("Primero presiona «Leer modelo».", true); return; }
    exportar(datos.fases.map(function (f) { return { fase: f.nombre, instancias: instFase(f.id) }; }), "Todas las fases");
  }

  function descargar(blob, nombre) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  // ------------------------------------------------------------ Trimble Connect: archivos
  async function tokenTC() {
    if (tokTC) return tokTC;
    var t = await API.extension.requestPermission("accesstoken");
    if (t && t !== "pending" && t !== "denied") { tokTC = t; return t; }
    if (t === "denied") throw new Error("Trimble Connect no dio permiso a la extensión.");
    estado("Acepta el permiso que muestra Trimble Connect…");
    return await new Promise(function (ok, mal) {
      esperaTok = ok;
      setTimeout(function () { mal(new Error("Acepta el permiso de acceso de Trimble Connect y vuelve a intentar.")); }, 90000);
    });
  }
  async function tc(ruta, opc) {
    var tk = await tokenTC();
    opc = opc || {};
    opc.headers = Object.assign({ Authorization: "Bearer " + tk }, opc.headers || {});
    var r = await fetch(baseTC + ruta, opc);
    if (r.status === 401) { tokTC = null; throw new Error("La sesión de Trimble Connect venció; vuelve a intentar."); }
    if (!r.ok) { var t = ""; try { t = await r.text(); } catch (e) {} var er = new Error("Trimble Connect respondió " + r.status + " en " + ruta); er.status = r.status; er.cuerpo = t; throw er; }
    var ct = r.headers.get("content-type") || "";
    return /json/.test(ct) ? r.json() : r.text();
  }
  async function asegurarBase() {
    if (baseTC) return;
    var tk = await tokenTC();
    var bases = ["https://app.connect.trimble.com", "https://app21.connect.trimble.com", "https://app22.connect.trimble.com",
                 "https://app31.connect.trimble.com", "https://app32.connect.trimble.com"];
    for (var b = 0; b < bases.length && !baseTC; b++) {
      try { var rr = await fetch(bases[b] + "/tc/api/2.0/projects/" + pid, { headers: { Authorization: "Bearer " + tk } }); if (rr.ok) baseTC = bases[b] + "/tc/api/2.0"; } catch (e) {}
    }
    if (!baseTC) throw new Error("No pude abrir el proyecto con la API de Trimble Connect.");
  }
  async function carpetaFases() {
    if (carpetaId) return carpetaId;
    await asegurarBase();
    var info = await tc("/projects/" + pid);
    var c = info.rootId, partes = C.carpetaFases.split("/").filter(Boolean);
    for (var i = 0; i < partes.length; i++) {
      var items = await tc("/folders/" + c + "/items");
      var f = (items || []).filter(function (x) { return String(x.type).toUpperCase() === "FOLDER" && norm(x.name) === norm(partes[i]); })[0];
      if (!f) throw new Error("No existe la carpeta «" + C.carpetaFases + "» en Trimble Connect: créala para compartir las fases (por ahora quedan solo en este navegador).");
      c = f.id;
    }
    return (carpetaId = c);
  }
  function nombreArchivoFases() { return C.archivoFases.replace("{proy}", $("proyecto").value.trim() || "proyecto"); }

  async function archivosFases() {
    var c = await carpetaFases();
    var base = nombreArchivoFases().replace(/\.json$/i, "");
    var fecha = function (x) { return Date.parse(x.modifiedOn || x.modified || x.createdOn || 0) || 0; };
    return ((await tc("/folders/" + c + "/items")) || []).filter(function (x) {
      return String(x.type).toUpperCase() === "FILE" && norm(x.name).indexOf(norm(base)) === 0 && /\.json$/i.test(x.name);
    }).sort(function (a, b) { return fecha(b) - fecha(a); });
  }

  async function leerTC() {
    var arch = await archivosFases();
    if (!arch.length) return null;
    var du = await tc("/files/fs/" + arch[0].id + "/downloadurl");
    var resp = await fetch(du.url || du.downloadUrl || du);
    if (!resp.ok) throw new Error("No se pudo descargar " + arch[0].name);
    var d = JSON.parse(await resp.text());
    d.archivo = arch[0].name;
    return d;
  }

  // subida en 3 pasos de la API 2.0: initiate -> PUT al uploadURL -> commit
  async function subirTC(nombre, contenido) {
    var c = await carpetaFases();
    var ini = await tc("/files/fs/initiate", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nombre, parentId: c, parentType: "FOLDER" }) });
    var url = ini.uploadURL || ini.uploadUrl || (ini.contents && ini.contents[0] && ini.contents[0].url);
    if (!url || !ini.uploadId) throw new Error("Trimble Connect no devolvió la dirección de subida.");
    var put = await fetch(url, { method: "PUT", body: contenido });
    if (!put.ok) throw new Error("Falló la subida del archivo (" + put.status + ").");
    return await tc("/files/fs/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: ini.uploadId }) });
  }

  // combina lo guardado en Trimble Connect con los cambios locales pendientes
  function combinar(remoto) {
    var d = remoto ? JSON.parse(JSON.stringify(remoto)) : nuevoDatos();
    d.fases = d.fases || []; d.asign = d.asign || {}; d.marcas = d.marcas || {};
    Object.keys(pend.fases).forEach(function (id) {
      var f = pend.fases[id];
      d.fases = d.fases.filter(function (x) { return x.id !== id; });
      if (f) d.fases.push(f);
    });
    d.fases.sort(function (a, b) { return String(a.creada || "") < String(b.creada || "") ? -1 : 1; });
    Object.keys(pend.asign).forEach(function (k) {
      if (pend.asign[k]) { d.asign[k] = pend.asign[k]; d.marcas[k] = datos.marcas[k] || d.marcas[k]; } else delete d.asign[k];
    });
    var vivas = {}; d.fases.forEach(function (f) { vivas[f.id] = 1; });
    Object.keys(d.asign).forEach(function (k) { if (!vivas[d.asign[k]]) delete d.asign[k]; });
    return d;
  }

  async function recargarTC(silencio) {
    var r = await leerTC();
    if (!r) { if (!silencio) estado("Aún no hay fases guardadas en " + C.carpetaFases + "."); return; }
    var g = datos.guardadoTC;
    datos = combinar(r);
    datos.guardadoTC = r.actualizado || g;
    guardarTodoLocal(); pintarFases(); pintarChips();
    if (coloreado) colorear();
    if (!silencio) estado("Fases leídas de " + r.archivo + (hayPend() ? " (se conservan tus cambios sin guardar)." : "."));
  }

  async function guardarTC() {
    $("btnGuardarTC").disabled = true;
    try {
      estado("Leyendo la versión guardada para no pisar cambios de otros…");
      var r = null; try { r = await leerTC(); } catch (e) { if (/No existe la carpeta/.test(e.message)) throw e; }
      var d = combinar(r);
      var quien = "";
      try { var yo = await tc("/users/me"); quien = (yo.firstName || "") + " " + (yo.lastName || ""); } catch (e) {}
      d.actualizado = new Date().toISOString(); d.por = quien.trim(); d.proyecto = $("proyecto").value.trim();
      d.alias = $("alias").value.trim(); d.version = 1;
      delete d.archivo; delete d.guardadoTC;
      await subirTC(nombreArchivoFases(), new Blob([JSON.stringify(d, null, 1)], { type: "application/json" }));
      datos = d; datos.guardadoTC = d.actualizado; pend = nuevoPend();
      guardarTodoLocal(); pintarFases(); pintarChips();
      estado("Fases guardadas en " + C.carpetaFases + "/" + nombreArchivoFases() + ".");
    } catch (e) {
      estado((e.message || String(e)) + " — Puedes usar «Respaldo manual» para descargar el .json.", true);
    } finally { $("btnGuardarTC").disabled = false; }
  }

  // ------------------------------------------------------------ control de acceso por grupo (igual que Avance NABLA)
  var acceso = null, diagAcceso = "";
  function lista(x) { return Array.isArray(x) ? x : (x && (x.items || x.data || x.users || x.members)) || []; }
  async function intentar(rutas) {
    for (var i = 0; i < rutas.length; i++) {
      try { var r = await tc(rutas[i]); diagAcceso += "\n  OK " + rutas[i]; return r; } catch (e) { diagAcceso += "\n  " + (e.status || "error") + " " + rutas[i]; }
    }
    return null;
  }
  async function verificarAcceso() {
    var bloq = (C.gruposBloqueados || []).map(norm);
    if (!bloq.length || acceso === true) return;
    if (acceso === false) throw new Error("Sin acceso");
    diagAcceso = "Control de acceso (grupos bloqueados: " + C.gruposBloqueados.join(", ") + ")";
    try { await asegurarBase(); } catch (e) { diagAcceso += "\n  → no se pudo verificar; se permite"; acceso = true; return; }
    var yo = await intentar(["/users/me"]);
    var grupos = lista(await intentar(["/groups?projectId=" + pid, "/projects/" + pid + "/groups"]));
    if (!yo || !grupos.length) { diagAcceso += "\n  → no se pudo verificar; se permite"; acceso = true; return; }
    var miIds = [yo.id, yo.tiduuid, yo.uuid].filter(Boolean), miMail = String(yo.email || "").toLowerCase();
    var esMiembro = function (u) { return miIds.indexOf(u.id) >= 0 || miIds.indexOf(u.tiduuid) >= 0 || miIds.indexOf(u.userId) >= 0 || (miMail && String(u.email || "").toLowerCase() === miMail); };
    acceso = true;
    for (var g = 0; g < grupos.length && acceso; g++) {
      if (bloq.indexOf(norm(grupos[g].name)) < 0) continue;
      var miembros = lista(grupos[g].users || grupos[g].members);
      if (!miembros.length) miembros = lista(await intentar(["/groups/" + grupos[g].id + "/users", "/groups/" + grupos[g].id + "/members"]));
      if (miembros.some(esMiembro)) acceso = false;
    }
    if (!acceso) {
      document.body.innerHTML = '<div style="font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#14325f"><h3 style="margin:0 0 8px">PrograFAB</h3>' +
        '<p style="font-size:13px;color:#4b5563">Esta herramienta es de uso interno de NABLA Acero y no está disponible para tu usuario.</p></div>';
      throw new Error("Sin acceso");
    }
  }

  // ------------------------------------------------------------ diagnóstico
  async function diagnostico() {
    var out = $("diag");
    try {
      var sel = await API.viewer.getSelection();
      if (!sel.length || !sel[0].objectRuntimeIds || !sel[0].objectRuntimeIds.length) { out.textContent = "No hay nada seleccionado."; return; }
      var mid = sel[0].modelId, id = sel[0].objectRuntimeIds[0];
      var p = (await API.viewer.getObjectProperties(mid, [id]))[0] || {};
      var txt = "Clase: " + (p.class || "") + "\nProduct.Name: " + (p.product && p.product.name || "") + "\n";
      if (modelo) {
        var k = modelo.porRid[mid + ":" + id];
        if (k !== undefined) {
          var x = modelo.ins[k], pt = x.partes.filter(function (q) { return q.id === id; })[0];
          txt += "Ensamble: " + x.marca + " · clave " + x.key + " · fase: " + ((fase(datos.asign[x.key]) || {}).nombre || "(sin fase)") + "\n";
          if (pt) txt += "Pieza: " + pt.spm + " · rol " + pt.rol + " · tipo para listados: " + L.tipoParte(pt, C) + "\n";
        } else txt += "No pertenece a ningún ensamble leído.\n";
      }
      txt += "\n";
      (p.properties || []).forEach(function (s) { (s.properties || []).forEach(function (q) { txt += s.name + "." + q.name + " = " + q.value + "\n"; }); });
      out.textContent = txt + (diagAcceso ? "\n" + diagAcceso : "");
    } catch (e) { out.textContent = "Error: " + (e.message || e); }
  }

  // ------------------------------------------------------------ eventos
  $("btnLeer").addEventListener("click", leerModelo);
  $("btnColor").addEventListener("click", colorear);
  $("btnReset").addEventListener("click", quitarColores);
  $("chips").addEventListener("click", function (ev) {
    var b = ev.target.closest("button.chip"); if (!b || !modelo) return;
    if (b.dataset.p === "*") chipsSel = {}; else chipsSel[b.dataset.p] = !chipsSel[b.dataset.p];
    pintarChips(); aplicarChips().catch(function (e) { estado(e.message || e, true); });
  });
  $("soloSinFase").addEventListener("change", function () { if (modelo && Object.keys(chipsSel).some(function (k) { return chipsSel[k]; })) aplicarChips(); });
  $("btnMarcas").addEventListener("click", function () {
    if (!modelo) { estado("Primero presiona «Leer modelo».", true); return; }
    var re = patronMarcas($("marcas").value); if (!re) return;
    var l = filtroSinFase(modelo.ins.filter(function (x) { return re.test(x.marca); }));
    seleccionar(l, l.length + " ensambles coinciden.").catch(function (e) { estado(e.message || e, true); });
  });
  $("marcas").addEventListener("keydown", function (e) { if (e.key === "Enter") $("btnMarcas").click(); });
  $("btnLimpiar").addEventListener("click", function () { chipsSel = {}; pintarChips(); if (API) seleccionar([]); });
  $("btnNueva").addEventListener("click", crearFase);
  $("nuevaFase").addEventListener("keydown", function (e) { if (e.key === "Enter") crearFase(); });
  $("faseActiva").addEventListener("change", function () { guardarLocal("activa:" + pid, this.value); pintarFases(); });
  $("btnAsignar").addEventListener("click", function () { asignar(false); });
  $("btnQuitar").addEventListener("click", function () { asignar(true); });
  $("btnListSel").addEventListener("click", async function () {
    try {
      var l = await instanciasSeleccion(), por = {};
      l.forEach(function (x) { var n = (fase(datos.asign[x.key]) || {}).nombre || "Sin fase"; (por[n] = por[n] || []).push(x); });
      exportar(Object.keys(por).map(function (n) { return { fase: n, instancias: por[n] }; }), "Seleccion");
    } catch (e) { estado(e.message || e, true); }
  });
  $("cuerpoFases").addEventListener("click", function (ev) {
    var ren = ev.target.closest("[data-ren]"); if (ren) return renombrar(ren);
    var b = ev.target.closest("button"); if (!b) return;
    var d = b.dataset, nom = function (id) { return id ? fase(id).nombre : "Sin fase"; };
    if (d.sel !== undefined) return seleccionar(instFase(d.sel), "Seleccionada: " + nom(d.sel));
    if (d.solo !== undefined) return mostrarSolo(instFase(d.solo), nom(d.solo));
    if (d.xls !== undefined) return exportarFase(d.xls);
    if (d.borrar !== undefined) return borrarFase(d.borrar);
  });
  $("cuerpoFases").addEventListener("change", function (ev) {
    var id = ev.target.dataset && ev.target.dataset.color; if (!id) return;
    var f = fase(id); f.color = ev.target.value; pend.fases[id] = f; marcarCambio();
  });
  $("btnGuardarTC").addEventListener("click", guardarTC);
  $("btnXlsTodas").addEventListener("click", exportarTodas);
  $("btnRecargarTC").addEventListener("click", function () { recargarTC(false).catch(function (e) { estado(e.message || e, true); }); });
  $("subirListados").checked = leerLocal("subirListados") === "1";
  $("subirListados").addEventListener("change", function () { guardarLocal("subirListados", this.checked ? "1" : "0"); });
  $("btnDescJSON").addEventListener("click", function () {
    var d = combinar(datos); d.proyecto = $("proyecto").value.trim(); d.alias = $("alias").value.trim(); d.actualizado = new Date().toISOString();
    descargar(new Blob([JSON.stringify(d, null, 1)], { type: "application/json" }), nombreArchivoFases().replace(/\.json$/i, "_" + hoy() + ".json"));
  });
  $("btnCargarJSON").addEventListener("click", function () { $("archivoJSON").click(); });
  $("archivoJSON").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result); if (!d.fases || !d.asign) throw new Error("no es un archivo de PrograFAB");
        // todo lo del archivo queda como cambio pendiente para poder guardarlo en Trimble Connect
        d.fases.forEach(function (x) { pend.fases[x.id] = x; });
        Object.keys(d.asign).forEach(function (k) { pend.asign[k] = d.asign[k]; });
        datos = combinar(d); marcarCambio();
        estado("Fases cargadas de " + f.name + ". Presiona «Guardar en Trimble Connect» para compartirlas.");
      } catch (e) { estado("No se pudo leer el archivo: " + (e.message || e), true); }
    };
    rd.readAsText(f);
  });
  $("btnDiag").addEventListener("click", diagnostico);

  pintarFases();
  conectar();
})();
