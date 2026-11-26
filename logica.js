// PrograFAB - lógica pura (sin Trimble Connect) para poder probarla aparte.
(function (raiz) {
  "use strict";

  function num(v) {
    if (typeof v === "number") return v;
    var m = String(v === undefined || v === null ? "" : v).replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(",", ".")) : NaN;
  }
  function n0(v) { var x = num(v); return isFinite(x) ? x : 0; }
  function cmpNat(a, b) { return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" }); }

  // valor de una propiedad del grupo indicado (sin importar mayúsculas)
  function prop(obj, set, nombre) {
    var sets = obj.properties || [];
    for (var s = 0; s < sets.length; s++) {
      if (String(sets[s].name || "").toLowerCase() !== set.toLowerCase()) continue;
      var ps = sets[s].properties || [];
      for (var k = 0; k < ps.length; k++) if (String(ps[k].name || "").toLowerCase() === nombre.toLowerCase()) return ps[k].value;
    }
    return undefined;
  }

  // Objeto de Trimble Connect -> pieza (o null si no trae las propiedades de Nabla)
  function leerParte(obj, C) {
    var g = function (n) { return prop(obj, C.pset, n); };
    var rol = g("ModelRole");
    if (rol === undefined && g("SinglePartMark") === undefined) return null;
    var sp = String(g("SinglePartMark") || "").trim();
    return {
      id: obj.id,
      spm: sp,
      mpm: String(g("MainPartMark") || "").trim(),
      rol: String(rol || "").trim(),
      nombre: String(g("ElementName") || (obj.product && obj.product.name) || "").trim(),
      perfil: String(g("Profile") || "").trim(),
      largo: n0(g("LengthNet_mm")),
      peso: n0(g("WeightNet_kg")),
      pintura: n0(g("PaintArea_m2")),
      esp: n0(g("Thickness_mm")),
      areaPl: n0(g("PlateArea_m2")),
      ent: String(g("IfcEntity") || obj.class || "").toUpperCase(),
      main: /^\.?t/i.test(String(g("IsMainPart") || "")) || g("IsMainPart") === true,
      handle: String(g("Handle") || "").trim(),
      material: String(g("Material") || "").trim()
    };
  }

  // prefijo de la marca: letras iniciales (CL8100 -> CL, PAC8001 -> PAC)
  function prefijo(m) { var x = String(m || "").toUpperCase().match(/^[A-Z]+/); return x ? x[0] : "(sin prefijo)"; }

  // "PL 1/2"x0.2032x3.7339" -> { espTxt:'1/2"', a:0.2032, b:3.7339 } (m)
  function dimsPL(nombre) {
    var m = String(nombre || "").match(/^\s*PL\s*([\d\s\/.]+)\s*(?:"|in|'')?\s*x\s*([\d.]+)\s*x\s*([\d.]+)/i);
    if (!m) return null;
    return { espTxt: m[1].trim() + '"', a: parseFloat(m[2]), b: parseFloat(m[3]) };
  }

  function esPlaca(p) { return /PLATE/.test(p.ent) || /^\s*PL\b/i.test(p.nombre); }
  function esRecta(p, tol) {
    var d = dimsPL(p.nombre);
    if (!d || !p.areaPl) return false;
    var ab = d.a * d.b;
    return ab > 0 && Math.abs(ab - p.areaPl) / ab <= (tol || 0.01);
  }

  // tipo de pieza para los resúmenes
  function tipoParte(p, C) {
    if ((C.rolesNoFabrica || []).indexOf(p.rol) >= 0 || /FASTENER/.test(p.ent)) return "nofab";
    var pat = (C.rolesPatin || []).indexOf(p.rol) >= 0, alm = (C.rolesAlma || []).indexOf(p.rol) >= 0;
    if (esPlaca(p)) {
      if (pat || alm) return esRecta(p, C.tolRecta) ? (pat ? "patin" : "alma") : "armadoNoRecto";
      return "placa";
    }
    return "perfil";
  }

  // texto de espesor para una placa
  function espesorTxt(p) {
    var d = dimsPL(p.nombre);
    if (d) return "PL " + d.espTxt;
    return p.esp ? "PL " + p.esp + " mm" : "PL ?";
  }

  // -------------------------------------------------------------- listado (columnas A a M del 2 ASM)
  // grupos: [{ marca, cant, partes }]  (partes = piezas de UNA instancia representativa)
  function filasListado(grupos, meta, C) {
    var aoa = [];
    var tot = { ens: 0, kg: 0, m2: 0 };
    grupos.slice().sort(function (a, b) { return cmpNat(a.marca, b.marca); }).forEach(function (g) {
      var partes = g.partes.filter(function (p) { return tipoParte(p, C) !== "nofab"; });
      var main = partes.filter(function (p) { return p.main; })[0] || partes[0] || {};
      aoa.push([meta.alias, meta.proy, g.marca, g.cant, main.perfil || main.nombre || "", "", "", "", "", "", "", "", ""]);
      var por = {};
      partes.forEach(function (p) {
        var k = p.spm || p.nombre;
        (por[k] = por[k] || { p: p, q: 0 }).q++;
      });
      var kgA = 0, m2A = 0;
      Object.keys(por).sort(cmpNat).forEach(function (k) {
        var x = por[k], p = x.p;
        aoa.push([meta.alias, meta.proy, p.spm, x.q, p.nombre, r3(p.peso), "", r3(p.peso * x.q), "", r3(p.pintura), r3(p.pintura * x.q), p.rol, ""]);
        kgA += p.peso * x.q; m2A += p.pintura * x.q;
      });
      aoa.push(["", "", "", "", "", "[Wn]Assembly", "", r3(kgA), "", "[A]Assembly", r3(m2A), "", ""]);
      tot.ens += g.cant; tot.kg += kgA * g.cant; tot.m2 += m2A * g.cant;
    });
    return { aoa: aoa, tot: tot };
  }
  function r3(x) { return Math.round((x || 0) * 1000) / 1000; }
  function r2(x) { return Math.round((x || 0) * 100) / 100; }

  // -------------------------------------------------------------- metros lineales y placas
  // instancias: [{ marca, partes }] (todas las instancias de la fase, una por ensamble físico)
  function resumenMateriales(instancias, C) {
    var perf = {}, pa = {}, noRecto = {}, placas = {}, nofab = 0;
    instancias.forEach(function (ins) {
      ins.partes.forEach(function (p) {
        var t = tipoParte(p, C);
        if (t === "nofab") { nofab++; return; }
        if (t === "perfil") {
          var k = p.perfil || p.nombre || "(sin perfil)";
          var r = perf[k] = perf[k] || { perfil: k, material: p.material, pz: 0, m: 0, kg: 0 };
          r.pz++; r.m += (p.largo || 0) / 1000; r.kg += p.peso;
        } else if (t === "patin" || t === "alma") {
          var d = dimsPL(p.nombre);
          var ancho = Math.round(Math.min(d.a, d.b) * 1000), largo = Math.max(d.a, d.b);
          var k2 = t + "|" + d.espTxt + "|" + ancho;
          var r2_ = pa[k2] = pa[k2] || { tipo: t === "patin" ? "Patín" : "Alma", esp: "PL " + d.espTxt, espMm: p.esp, ancho: ancho, material: p.material, pz: 0, m: 0, kg: 0 };
          r2_.pz++; r2_.m += largo; r2_.kg += p.peso;
        } else {
          var bolsa = t === "armadoNoRecto" ? noRecto : placas;
          var k3 = (t === "armadoNoRecto" ? p.rol + "|" : "") + espesorTxt(p);
          var r3_ = bolsa[k3] = bolsa[k3] || { rol: p.rol, esp: espesorTxt(p), espMm: p.esp, pz: 0, m2: 0, kg: 0 };
          r3_.pz++; r3_.m2 += p.areaPl || 0; r3_.kg += p.peso;
        }
      });
    });
    var vals = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
    return {
      perfiles: vals(perf).sort(function (a, b) { return cmpNat(a.perfil, b.perfil); }),
      patinesAlmas: vals(pa).sort(function (a, b) { return a.tipo < b.tipo ? 1 : a.tipo > b.tipo ? -1 : (a.espMm - b.espMm) || (a.ancho - b.ancho); }),
      noRectos: vals(noRecto).sort(function (a, b) { return cmpNat(a.rol, b.rol) || (a.espMm - b.espMm); }),
      placas: vals(placas).sort(function (a, b) { return a.espMm - b.espMm || cmpNat(a.esp, b.esp); }),
      noFabricadas: nofab
    };
  }

  function filasMateriales(res) {
    var aoa = [], sum = function (l, k) { return l.reduce(function (s, x) { return s + (x[k] || 0); }, 0); };
    aoa.push(["1. PERFILES — metros lineales por perfil"]);
    aoa.push(["Perfil", "Material", "Piezas", "Metros lineales", "Peso (kg)"]);
    res.perfiles.forEach(function (r) { aoa.push([r.perfil, r.material, r.pz, r2(r.m), r2(r.kg)]); });
    aoa.push(["Total perfiles", "", sum(res.perfiles, "pz"), r2(sum(res.perfiles, "m")), r2(sum(res.perfiles, "kg"))]);
    aoa.push([]);
    aoa.push(["2. PATINES Y ALMAS RECTOS — metros lineales por sección de placa (espesor x ancho)"]);
    aoa.push(["Tipo", "Espesor", "Ancho (mm)", "Piezas", "Metros lineales", "Peso (kg)", "Material"]);
    res.patinesAlmas.forEach(function (r) { aoa.push([r.tipo, r.esp, r.ancho, r.pz, r2(r.m), r2(r.kg), r.material]); });
    aoa.push(["Total patines y almas rectos", "", "", sum(res.patinesAlmas, "pz"), r2(sum(res.patinesAlmas, "m")), r2(sum(res.patinesAlmas, "kg"))]);
    aoa.push([]);
    aoa.push(["3. PATINES Y ALMAS NO RECTOS (acartelados) — se cortan de plancha"]);
    aoa.push(["Rol", "Espesor", "Piezas", "Área de placa (m²)", "Peso (kg)"]);
    res.noRectos.forEach(function (r) { aoa.push([r.rol, r.esp, r.pz, r2(r.m2), r2(r.kg)]); });
    aoa.push(["Total no rectos", "", sum(res.noRectos, "pz"), r2(sum(res.noRectos, "m2")), r2(sum(res.noRectos, "kg"))]);
    aoa.push([]);
    aoa.push(["4. OTRAS PLACAS — por espesor"]);
    aoa.push(["Espesor", "", "Piezas", "Área de placa (m²)", "Peso (kg)"]);
    res.placas.forEach(function (r) { aoa.push([r.esp, "", r.pz, r2(r.m2), r2(r.kg)]); });
    aoa.push(["Total otras placas", "", sum(res.placas, "pz"), r2(sum(res.placas, "m2")), r2(sum(res.placas, "kg"))]);
    aoa.push([]);
    var kg = sum(res.perfiles, "kg") + sum(res.patinesAlmas, "kg") + sum(res.noRectos, "kg") + sum(res.placas, "kg");
    aoa.push(["PESO TOTAL DE LA SELECCIÓN (kg)", "", "", "", r2(kg)]);
    if (res.noFabricadas) aoa.push(["No incluye " + res.noFabricadas + " objetos con rol «no se fabrica» (pernos, anclajes…)"]);
    return aoa;
  }


  // -------------------------------------------------------------- detalle por espesor (placas) y por perfil
  // instancias: [{ marca, fase, partes }]. Devuelve grupos ordenados con sus filas (una por fase + marca de pieza)
  function detalleMateriales(instancias, C) {
    var pl = {}, pf = {};
    var nombreTipo = { placa: "Placa", patin: "Patín recto", alma: "Alma recta", armadoNoRecto: "Acartelada" };
    instancias.forEach(function (ins) {
      ins.partes.forEach(function (p) {
        var t = tipoParte(p, C);
        if (t === "nofab") return;
        var fase = ins.fase || "";
        if (t === "perfil") {
          var gk = p.perfil || p.nombre || "(sin perfil)";
          var g = pf[gk] = pf[gk] || { grupo: gk, orden: gk, filas: {} };
          var fk = fase + "|" + p.spm + "|" + Math.round(p.largo);
          var f = g.filas[fk] = g.filas[fk] || { fase: fase, spm: p.spm, desc: p.nombre, rol: p.rol, material: p.material,
                                                 largo: Math.round(p.largo), cant: 0, m: 0, kgU: p.peso, kg: 0, ens: {} };
          f.cant++; f.m += p.largo / 1000; f.kg += p.peso; f.ens[ins.marca] = (f.ens[ins.marca] || 0) + 1;
        } else {
          var esp = espesorTxt(p);
          var g2 = pl[esp] = pl[esp] || { grupo: esp, orden: p.esp || 999, filas: {} };
          var fk2 = fase + "|" + p.spm + "|" + p.nombre;
          var f2 = g2.filas[fk2] = g2.filas[fk2] || { fase: fase, spm: p.spm, desc: p.nombre, rol: p.rol, tipo: nombreTipo[t] || t,
                                                     material: p.material, cant: 0, m2: 0, kgU: p.peso, kg: 0, ens: {} };
          f2.cant++; f2.m2 += p.areaPl || 0; f2.kg += p.peso; f2.ens[ins.marca] = (f2.ens[ins.marca] || 0) + 1;
        }
      });
    });
    var cerrar = function (o, cmpG) {
      return Object.keys(o).map(function (k) {
        var g = o[k];
        g.filas = Object.keys(g.filas).map(function (x) {
          var f = g.filas[x];
          f.ensTxt = Object.keys(f.ens).sort(cmpNat).map(function (m) { return m + " (" + f.ens[m] + ")"; }).join(", ");
          f.nEns = Object.keys(f.ens).length;
          return f;
        }).sort(function (a, b) { return cmpNat(a.fase, b.fase) || cmpNat(a.spm, b.spm) || cmpNat(a.desc, b.desc); });
        g.cant = g.filas.reduce(function (s, f) { return s + f.cant; }, 0);
        g.kg = g.filas.reduce(function (s, f) { return s + f.kg; }, 0);
        g.m = g.filas.reduce(function (s, f) { return s + (f.m || 0); }, 0);
        g.m2 = g.filas.reduce(function (s, f) { return s + (f.m2 || 0); }, 0);
        return g;
      }).sort(cmpG);
    };
    return {
      placas: cerrar(pl, function (a, b) { return a.orden - b.orden || cmpNat(a.grupo, b.grupo); }),
      perfiles: cerrar(pf, function (a, b) { return cmpNat(a.grupo, b.grupo); })
    };
  }

  var api = { num: num, prop: prop, leerParte: leerParte, prefijo: prefijo, dimsPL: dimsPL, esRecta: esRecta,
              tipoParte: tipoParte, filasListado: filasListado, resumenMateriales: resumenMateriales,
              filasMateriales: filasMateriales, cmpNat: cmpNat, detalleMateriales: detalleMateriales, espesorTxt: espesorTxt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.LogicaPF = api;
})(this);
