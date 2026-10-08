/*
 * Sincronización en los dos sentidos entre la app y la hoja de Google Sheets de Carlos.
 * - La hoja manda: si una fila cambió en el Excel desde la última lectura, el cambio de la app se descarta.
 * - Lo registrado en la app se envía al momento; sin conexión queda guardado y se envía al volver la red.
 * - La app lee la hoja al abrir, al volver a primer plano y cada 2 minutos.
 * - Todo va con la contraseña común (la comprueba el Apps Script).
 * - La app solo añade tareas e informes: corregir o borrar filas del Excel es cosa de Carlos (08/10/2026).
 * Necesita excel-parser.js (ParserExcelHuertos) y el Apps Script de google-apps-script/Codigo.gs.
 */
(function (raiz, fabrica) {
  const api = fabrica(typeof ParserExcelHuertos !== 'undefined' ? ParserExcelHuertos : require('./excel-parser.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.SincroSheets = api;
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  // URL de la aplicación web del Apps Script (termina en /exec). Se puede cambiar en Ajustes.
  const URL_POR_DEFECTO = '';
  const CLAVE_URL = 'huertos_sheets_url_v1';
  const CLAVE_BASE = 'huertos_sheets_base_v1';
  const CLAVE_CLAVE = 'huertos_sheets_clave_v1';
  const INTERVALO_MS = 2 * 60 * 1000;
  const MAX_BORRADOS_POR_LOTE = 20;
  const ID_DEL_EXCEL = /^(faena|informe)-.+-\d+$/;
  // Campos de la app que no tienen columna en el Excel (van a la pestaña oculta "App")
  const CAMPOS_SOLO_APP = ['estado', 'hora', 'plagas', 'plagasNegadas', 'hierba', 'observacionesEstructuradas',
    'tareasPendientes', 'informeId', 'esTratamiento', 'quimicoProducto', 'quimicoDosis'];

  let ctx = null;
  let enCurso = false;
  let repetir = false;
  let temporizador = null;
  let retardo = null;
  let ultimoEstado = '';
  const fotosEnMemoria = new Map();

  const almacen = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } }
  };

  function url() {
    return (almacen.get(CLAVE_URL) || URL_POR_DEFECTO || '').trim();
  }

  function cargarBase() {
    try { return JSON.parse(almacen.get(CLAVE_BASE) || 'null'); } catch (e) { return null; }
  }

  function clave() {
    return almacen.get(CLAVE_CLAVE) || '';
  }

  function tieneClave() {
    return Boolean(clave());
  }

  function conectada() {
    return Boolean(url()) && Boolean(cargarBase());
  }

  // FNV-1a de 32 bits: solo para detectar cambios, no es criptográfico
  function hashTexto(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  function codigos(f, codigoDe) {
    return (Array.isArray(f.operarios) ? f.operarios : []).map(codigoDe).join(', ');
  }

  function proyeccionRegistro(f, h) {
    return JSON.stringify([f.tipoRegistro, f.parcelaNombre || '', f.fecha || '', f.tipoFaena || '', f.notas || '',
      codigos(f, h.codigoDe), f.subparcela || '', h.normalizarEstado(f.estado), f.plagas || [],
      f.hierba || '', f.quimicoProducto || '', f.quimicoDosis || '', f.observacionesEstructuradas || null,
      f.tareasPendientes || null, f.informeId || '', f.hierbaTira || '', f.hierbaFrau || '']);
  }

  function hashRegistro(f, h) {
    return hashTexto(proyeccionRegistro(f, h));
  }

  function proyeccionParcela(p) {
    return JSON.stringify([p.nombre || '', p.cultiu || '', p.variedad || p.varietat || '', p.patron || '',
      p.marco || '', p.superficie || '', p.ubicacion || '']);
  }

  function hashParcela(p) {
    return hashTexto(proyeccionParcela(p));
  }

  function clonar(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function sinOrigen(f) {
    const c = clonar(f);
    delete c.origen;
    return c;
  }

  // ---------------------------------------------------------------------------
  // Hoja -> app: pestañas de huertos + datos extra de la pestaña "App"
  // ---------------------------------------------------------------------------
  function construirRemoto(datos) {
    const libro = P.parsearLibro(datos.hojas || []);
    const extras = (datos.app || []).filter(e => e && e.datos && typeof e.datos === 'object');
    const usados = new Set();
    const porId = new Map();
    const porHuella = new Map();
    extras.forEach(e => {
      porId.set(e.id, e);
      const k = e.hoja + '|' + e.huella;
      if (!porHuella.has(k)) porHuella.set(k, []);
      porHuella.get(k).push(e);
    });

    const registros = libro.faenas.map(r => ({ r, huella: P.huella(r.origen.celdas), ex: null, completo: false }));
    // 1º coincidencias exactas (misma fila sin tocar desde que la escribió la app)
    registros.forEach(x => {
      const e = porId.get(x.r.id);
      if (e && !usados.has(e) && e.tipo === x.r.tipoRegistro && e.hoja === x.r.parcelaNombre && e.huella === x.huella) {
        x.ex = e; x.completo = true; usados.add(e);
      }
    });
    // 2º filas desplazadas (alguien insertó filas): misma huella en la misma pestaña
    registros.forEach(x => {
      if (x.ex) return;
      const e = (porHuella.get(x.r.parcelaNombre + '|' + x.huella) || []).find(c => !usados.has(c) && c.tipo === x.r.tipoRegistro);
      if (e) { x.ex = e; x.completo = true; usados.add(e); }
    });
    // 3º fila editada en el Excel: se respeta el Excel y solo se añaden los datos que no tienen columna
    registros.forEach(x => {
      if (x.ex) return;
      const e = porId.get(x.r.id);
      if (e && !usados.has(e) && e.tipo === x.r.tipoRegistro) { x.ex = e; usados.add(e); }
    });

    const faenas = registros.map(x => {
      if (!x.ex) return x.r;
      const base = x.completo ? Object.assign({}, x.r, x.ex.datos) : Object.assign({}, x.r);
      // Lo que se ve en el Excel (fecha, texto, lugar) siempre viene del Excel
      base.fecha = x.r.fecha;
      base.notas = x.r.notas;
      if (x.r.tipoRegistro === 'informe') base.subparcela = x.r.subparcela;
      if (!x.completo) CAMPOS_SOLO_APP.forEach(k => { if (x.ex.datos[k] !== undefined) base[k] = x.ex.datos[k]; });
      base.id = x.r.id;
      base.parcelaId = x.r.parcelaId;
      base.parcelaNombre = x.r.parcelaNombre;
      base.origen = x.r.origen;
      return base;
    });

    // Tareas pendientes que solo existen en la app
    extras.filter(e => e.tipo === 'tarea').forEach(e => {
      const t = Object.assign({}, e.datos, { id: e.id });
      delete t.origen;
      faenas.push(t);
    });

    const huellasInfo = {};
    const exParcelas = new Map(extras.filter(e => e.tipo === 'parcela').map(e => [e.id, e]));
    const parcelas = libro.parcelas.map(p => {
      const hInfo = hashParcela(p);
      huellasInfo[p.id] = hInfo;
      const e = exParcelas.get(p.id);
      if (!e) return p;
      const intacta = e.huella === hInfo;
      const res = Object.assign({}, p);
      Object.keys(e.datos).forEach(k => {
        if (k === 'id' || k === 'nombre') return;
        const actual = res[k];
        const vacio = actual === undefined || actual === null || actual === '' || (Array.isArray(actual) && !actual.length);
        if (intacta || vacio) res[k] = e.datos[k];
      });
      return res;
    });

    return { parcelas, faenas, huellasInfo };
  }

  function hashes(estado, h) {
    const faenas = {};
    const parcelas = {};
    (estado.faenas || []).forEach(f => { faenas[f.id] = hashRegistro(f, h); });
    (estado.parcelas || []).forEach(p => { parcelas[p.id] = hashParcela(p); });
    return { faenas, parcelas };
  }

  // ---------------------------------------------------------------------------
  // App -> hoja: operaciones a partir de lo cambiado desde la última sincronización
  // ---------------------------------------------------------------------------
  function celdasRegistro(f, r, h) {
    const esInforme = f.tipoRegistro === 'informe';
    const nuevas = esInforme
      ? [f.fecha || '', codigos(f, h.codigoDe), f.subparcela || '', f.notas || '']
      : [f.fecha || '', f.tipoFaena || '', codigos(f, h.codigoDe), f.notas || ''];
    if (!r || !r.origen || !r.origen.celdas) return nuevas;
    // Conservar el texto original de las celdas que no han cambiado (p. ej. "Carlos" en vez de "C")
    const viejas = r.origen.celdas;
    const iguales = esInforme
      ? [f.fecha === r.fecha, codigos(f, h.codigoDe) === codigos(r, h.codigoDe), (f.subparcela || '') === (r.subparcela || ''), f.notas === r.notas]
      : [f.fecha === r.fecha, f.tipoFaena === r.tipoFaena, codigos(f, h.codigoDe) === codigos(r, h.codigoDe), f.notas === r.notas];
    if (iguales.every(Boolean)) return null;
    return nuevas.map((v, i) => (iguales[i] ? viejas[i] : v));
  }

  function opRegistro(f, r, h, opId) {
    const pendiente = f.tipoRegistro !== 'informe' && h.normalizarEstado(f.estado) === 'Pendientes';
    const tieneFila = Boolean(r && r.origen && r.origen.hoja);
    if (pendiente && !tieneFila) return { op: 'soloApp', opId, registro: sinOrigen(f), idAnterior: f.id };
    const op = {
      op: f.tipoRegistro === 'informe' ? 'informe' : 'faena',
      opId,
      hoja: tieneFila ? r.origen.hoja : f.parcelaNombre,
      // Las filas que ya existen no se reescriben: solo Carlos corrige el Excel
      celdas: tieneFila ? null : celdasRegistro(f, null, h),
      registro: sinOrigen(f),
      idAnterior: f.id
    };
    if (tieneFila) {
      op.huellaPrevia = P.huella(r.origen.celdas);
      if (op.op === 'informe') op.filaEncabezado = r.origen.filaEncabezado;
      else op.fila = r.origen.fila;
    }
    return op;
  }

  function calcularOps(base, local, remoto, h) {
    const primera = !base;
    const ops = [];
    let n = 0;
    const baseF = base ? base.faenas : {};

    // Los huertos los da de alta Carlos en el Excel: la app no crea ni cambia pestañas
    const remF = new Map(remoto.faenas.map(f => [f.id, f]));
    const orden = f => (f.tipoRegistro === 'informe' ? 0 : (h.normalizarEstado(f.estado) === 'Pendientes' ? 2 : 1));
    const locales = (local.faenas || []).slice().sort((a, b) => orden(a) - orden(b));
    locales.forEach(f => {
      const r = remF.get(f.id);
      const hb = baseF[f.id];
      if (!r) {
        if (hb !== undefined) return; // ya no está en el Excel: manda el Excel
        if (primera && ID_DEL_EXCEL.test(f.id)) return; // dato antiguo del Excel que ya no existe
        ops.push(opRegistro(f, null, h, 'o' + (n++)));
        return;
      }
      const hl = hashRegistro(f, h), hr = hashRegistro(r, h);
      if (hl === hr) return;
      if (primera) {
        // Primera vez: solo se suben los cambios de estado hechos en la app (pendiente/finalizada)
        if (h.normalizarEstado(f.estado) === h.normalizarEstado(r.estado)) return;
        const op = opRegistro(Object.assign({}, r, { estado: f.estado }), r, h, 'o' + (n++));
        ops.push(op);
        return;
      }
      if (hb !== hr) return; // el Excel cambió esta fila: manda el Excel
      if (hl === hb) return;
      ops.push(opRegistro(f, r, h, 'o' + (n++)));
    });

    if (!primera) {
      const idsLocales = new Set((local.faenas || []).map(f => f.id));
      const borrados = [];
      Object.keys(baseF).forEach(id => {
        if (idsLocales.has(id)) return;
        const r = remF.get(id);
        if (!r || hashRegistro(r, h) !== baseF[id]) return;
        if (r.origen && r.origen.hoja) return; // filas del Excel: solo las borra Carlos
        const o = r.origen || {};
        borrados.push({
          op: 'borrar', opId: 'o' + (n++), id, tipo: r.tipoRegistro, hoja: o.hoja || '',
          fila: o.fila, filaEncabezado: o.filaEncabezado, huellaPrevia: o.celdas ? P.huella(o.celdas) : ''
        });
      });
      // Protección: nunca vaciar el Excel por un estado local roto
      if (borrados.length > MAX_BORRADOS_POR_LOTE) {
        console.warn('[Sheets] Se han ignorado ' + borrados.length + ' borrados en bloque por seguridad');
      } else {
        borrados.forEach(b => ops.push(b));
      }
    }
    return ops;
  }

  // Lo cambiado en el móvil mientras se sincronizaba no se pierde
  function reaplicarCambiosLocales(final, antes, ahora, conservar, h) {
    const faenas = final.faenas.slice();
    const indice = new Map(faenas.map((f, i) => [f.id, i]));
    const idsAhora = new Set();
    (ahora.faenas || []).forEach(f => {
      idsAhora.add(f.id);
      const cambiada = antes.faenas[f.id] === undefined || antes.faenas[f.id] !== hashRegistro(f, h);
      if (!cambiada && !conservar.has(f.id)) return;
      if (indice.has(f.id)) faenas[indice.get(f.id)] = f;
      else faenas.push(f);
    });
    const restantes = faenas.filter(f => !(antes.faenas[f.id] !== undefined && !idsAhora.has(f.id)));
    const parcelas = final.parcelas.slice();
    (ahora.parcelas || []).forEach(p => {
      if (antes.parcelas[p.id] === undefined && !parcelas.some(x => x.id === p.id || x.nombre === p.nombre)) parcelas.push(p);
    });
    return { parcelas, faenas: restantes };
  }

  async function pedir(accion, extra, claveUsada) {
    const cuerpo = Object.assign({ accion, clave: claveUsada !== undefined ? claveUsada : clave() }, extra || {});
    const resp = await fetch(url(), {
      method: 'POST', redirect: 'follow', cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo)
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const datos = await resp.json();
    if (!datos || !datos.ok) {
      const error = (datos && datos.error) || 'Respuesta no válida';
      if (/^(CLAVE|SIN_CLAVE)/.test(error) && claveUsada === undefined) {
        almacen.del(CLAVE_CLAVE);
        if (ctx && ctx.pedirClave) ctx.pedirClave(error);
      }
      const e = new Error(error);
      e.deClave = /^(CLAVE|SIN_CLAVE|BLOQUEADO)/.test(error);
      throw e;
    }
    return datos;
  }

  async function comprobarClave(nueva) {
    await pedir('comprobar', null, String(nueva || ''));
    almacen.set(CLAVE_CLAVE, String(nueva));
    return true;
  }

  function olvidarClave() {
    almacen.del(CLAVE_CLAVE);
  }

  async function obtenerFoto(id) {
    if (fotosEnMemoria.has(id)) return fotosEnMemoria.get(id);
    const datos = await pedir('foto', { id });
    fotosEnMemoria.set(id, datos.datos);
    return datos.datos;
  }


  function avisarEstado(texto) {
    ultimoEstado = texto;
    if (ctx && ctx.alCambiarEstado) ctx.alCambiarEstado(texto);
  }

  function horaCorta() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  async function sincronizar(opciones) {
    const restaurar = Boolean(opciones && opciones.restaurar);
    if (!ctx || !url()) { avisarEstado('Sin conectar a Google Sheets'); return { ok: false, motivo: 'sin-url' }; }
    if (!tieneClave()) { avisarEstado('Falta la contraseña del cuaderno'); return { ok: false, motivo: 'sin-clave' }; }
    if (enCurso) { repetir = true; return { ok: false, motivo: 'en-curso' }; }
    const h = ctx;
    const local = h.obtenerEstado();
    if (!local) return { ok: false, motivo: 'bloqueada' };
    // Móvil sin datos (primera vez o datos borrados): se carga todo del Excel sin enviar nada
    const vacio = !Array.isArray(local.parcelas) || local.parcelas.length === 0;
    enCurso = true;
    avisarEstado('Sincronizando…');
    try {
      const antes = hashes(local, h);
      let datos = await pedir('leer');
      let remoto = construirRemoto(datos);
      h.normalizar(remoto);
      const soloLeer = restaurar || vacio;
      const base = soloLeer ? null : cargarBase();
      const ops = soloLeer ? [] : calcularOps(base, local, remoto, h);
      const conservar = new Set();
      let conflictos = 0;
      let errores = 0;
      if (ops.length) {
        avisarEstado('Enviando ' + ops.length + ' cambio(s) al Excel…');
        datos = await pedir('aplicar', { ops });
        (datos.resultados || []).forEach(res => {
          const op = ops.find(o => o.opId === res.opId);
          if (res.estado === 'conflicto') conflictos++;
          if (res.estado === 'error') {
            errores++;
            if (op && op.idAnterior) conservar.add(op.idAnterior);
            console.warn('[Sheets] Error al guardar en el Excel:', res.error);
          }
        });
        remoto = construirRemoto(datos);
        h.normalizar(remoto);
      }
      const firma = hashTexto(JSON.stringify(datos.hojas) + JSON.stringify(datos.app));
      const ahora = h.obtenerEstado();
      const final = soloLeer ? remoto : reaplicarCambiosLocales(remoto, antes, ahora, conservar, h);
      const anterior = cargarBase();
      const sinCambios = !soloLeer && !ops.length && anterior && anterior.firma === firma &&
        hashTexto(JSON.stringify(hashes(ahora, h))) === hashTexto(JSON.stringify(hashes(final, h)));
      const nuevaBase = hashes(remoto, h);
      nuevaBase.firma = firma;
      almacen.set(CLAVE_BASE, JSON.stringify(nuevaBase));
      if (!sinCambios) await h.aplicarEstado(final.parcelas, final.faenas);
      if (conflictos && h.avisar) h.avisar(conflictos + ' cambio(s) no se guardaron porque esa fila se cambió en el Excel (manda el Excel)', 'warning');
      if (errores && h.avisar) h.avisar(errores + ' cambio(s) no se pudieron guardar en el Excel; se reintentará', 'danger');
      avisarEstado((errores ? 'Con errores' : 'Sincronizado') + ' a las ' + horaCorta());
      return { ok: true, enviados: ops.length, conflictos, errores };
    } catch (e) {
      console.warn('[Sheets] Sin sincronizar:', e);
      avisarEstado(e && e.deClave ? 'Falta la contraseña del cuaderno' : 'Sin conexión con el Excel: se enviará al volver la red');
      return { ok: false, motivo: String(e && e.message || e) };
    } finally {
      enCurso = false;
      if (repetir) { repetir = false; setTimeout(() => sincronizar(), 500); }
    }
  }

  function programar() {
    if (!ctx || !url()) return;
    clearTimeout(retardo);
    retardo = setTimeout(() => sincronizar(), 1500);
  }

  function iniciar(contexto) {
    if (ctx) return;
    ctx = contexto;
    if (!url()) { avisarEstado('Sin conectar a Google Sheets'); return; }
    sincronizar();
    temporizador = setInterval(() => { if (!document.hidden) sincronizar(); }, INTERVALO_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
    window.addEventListener('online', () => sincronizar());
  }

  function configurarUrl(nueva) {
    const limpia = String(nueva || '').trim();
    if (limpia && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(limpia)) {
      throw new Error('La dirección debe ser la de la aplicación web del Apps Script (termina en /exec)');
    }
    if (limpia) almacen.set(CLAVE_URL, limpia); else almacen.del(CLAVE_URL);
    almacen.del(CLAVE_BASE);
    if (ctx && limpia && !temporizador) {
      const c = ctx; ctx = null; iniciar(c);
    } else if (limpia) {
      sincronizar();
    }
  }

  return {
    iniciar, sincronizar, programar, conectada, url, configurarUrl,
    tieneClave, comprobarClave, olvidarClave, obtenerFoto,
    restaurar: () => sincronizar({ restaurar: true }),
    estado: () => ultimoEstado,
    // expuesto para pruebas
    _interno: { construirRemoto, calcularOps, hashes, hashRegistro, reaplicarCambiosLocales, celdasRegistro }
  };
});
