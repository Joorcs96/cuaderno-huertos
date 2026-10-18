/*
 * Lector del libro de Google Sheets de Carlos (pestañas por huerto).
 * Réplica exacta de tools/procesar_excel_completo.py para que la app lea la hoja en vivo
 * y obtenga las mismas parcelas, faenas e informes (mismos IDs) que el extractor de Python.
 * Entrada: [{ nombre, valores: [[celda, ...], ...] }] con fechas ya convertidas a 'AAAA-MM-DD'.
 */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.ParserExcelHuertos = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CATALOGO_OPERARIOS = {
    'c': 'C', 'carlos': 'C', 'jc': 'JC', 'juan carlos': 'JC', 'd': 'D', 'diego': 'D',
    'j': 'J', 'juan': 'J', 'juan vidal': 'J', 'jv': 'J', 'juan-invernadero': 'J',
    'jf': 'JF', 'jorge flor': 'JF', 'jorge i flor': 'JF', 'jorge, flor': 'JF',
    'co': 'CO', 'cooperativa': 'CO', 'crb': 'CRB', 'comunitat regants': 'CRB', 'comunidad regantes': 'CRB',
    'b': 'B', 'bagu': 'B', 'a': 'A', 'alberto': 'A',
    // Códigos acordados con Carlos el 08/10/2026
    'jt': 'JT', 'juan tractorista': 'JT', 'ji': 'JI', 'juan invernadero': 'JI',
    'ja': 'JA', 'javi': 'JA', 'li': 'LI', 'lida': 'LI'
  };

  const PALABRAS_QUIMICO = ['turbo', 't1', 't2', 't5', 't9', 't10', 't11', 't15', 't16', 't21',
    't22', 't23', 't27', 't28', 't31', 'herbicida', 'abamectina', 'fe',
    'abon', 'spintor', 'cobre', 'trebon', 'trampes'];

  // Celda vacía = null en openpyxl = '' en Google Sheets
  function vacia(v) {
    return v === null || v === undefined || v === '';
  }

  // str() de Python para valores de celda
  function strPy(v) {
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    return String(v);
  }

  function serializar(v) {
    if (vacia(v)) return '';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return String(v);
      const r = Number(v.toFixed(4));
      return Number.isInteger(r) ? String(r) : String(r);
    }
    return strPy(v).trim();
  }

  function idParcela(nombreHoja) {
    return 'p-' + nombreHoja.toLowerCase().split(' ').join('-').split('.').join('')
      .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u');
  }

  function idFaena(nombreHoja, fila) {
    return 'faena-' + nombreHoja.toLowerCase().split(' ').join('-') + '-' + fila;
  }

  function idInforme(nombreHoja, fila) {
    return 'informe-' + nombreHoja.toLowerCase().split(' ').join('-') + '-' + fila;
  }

  // Huella de las celdas de una fila (misma fórmula en el Apps Script)
  function huella(celdas) {
    return JSON.stringify((celdas || []).map(serializar));
  }

  function parsearOperarios(personaRaw) {
    if (!personaRaw) return ['C'];
    const pStr = String(personaRaw).trim();
    if (!pStr || pStr === '-') return ['C'];
    const entero = pStr.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(CATALOGO_OPERARIOS, entero)) return [CATALOGO_OPERARIOS[entero]];
    const operarios = [];
    const anadir = id => { if (!operarios.includes(id)) operarios.push(id); };
    pStr.split(/[,/]+/).forEach(parte => {
      const pt = parte.trim();
      if (!pt) return;
      const ptL = pt.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(CATALOGO_OPERARIOS, ptL)) anadir(CATALOGO_OPERARIOS[ptL]);
      else {
        pt.split(/\s+(?:i|y|\+)\s+/i).forEach(sp => {
          const spL = sp.trim().toLowerCase();
          if (Object.prototype.hasOwnProperty.call(CATALOGO_OPERARIOS, spL)) anadir(CATALOGO_OPERARIOS[spL]);
          else if (spL) anadir(sp.trim().toUpperCase());
        });
      }
    });
    return operarios.length ? operarios : ['C'];
  }

  function usuarioIdLegado(operarios) {
    const orden = [['C', 'carlos'], ['JC', 'jc'], ['D', 'diego'], ['J', 'juan'], ['JT', 'juan'], ['JI', 'juan-invernadero'],
      ['JF', 'jorge-flor'], ['CO', 'cooperativa'], ['CRB', 'comunidad-regantes'], ['B', 'bagu'], ['A', 'alberto'],
      ['JA', 'javi'], ['LI', 'lida']];
    for (const [cod, id] of orden) if (operarios.includes(cod)) return id;
    return 'carlos';
  }

  // Tratamiento = código T (T1, T22...) o turbo/matxina/herbicida; trampes y abono no (Carlos, 08/10/2026)
  function esTratamientoCarlos(faena, comentario) {
    if (/\bt\d+\b/i.test(`${faena} ${comentario}`)) return true;
    const f = String(faena || '').toLowerCase();
    return ['turbo', 'matxina', 'maxina', 'herbicida'].some(k => f.includes(k));
  }

  function clasificarHierbaInforme(texto) {
    const t = texto.toLowerCase();
    if (['molta brossa', 'mucha hierba', 'plena de brossa', 'molta herba'].some(k => t.includes(k))) return 'Mucha hierba';
    if (['brossa', 'hierba', 'herba'].some(k => t.includes(k))) return 'Poca hierba';
    return 'Limpio';
  }

  // Diccionario con orden de inserción de Python (las claves numéricas no se reordenan)
  function dictPy() {
    const claves = [];
    const valores = new Map();
    return {
      set(k, v) { if (!valores.has(k)) claves.push(k); valores.set(k, v); },
      get(k) { return valores.has(k) ? valores.get(k) : undefined; },
      entries() { return claves.map(k => [k, valores.get(k)]); },
      toObject() { const o = {}; claves.forEach(k => { o[k] = valores.get(k); }); return o; }
    };
  }

  function parsearHoja(hoja) {
    const nombre = hoja.nombre;
    const valores = hoja.valores || [];
    const maxR = valores.length;
    const maxC = valores.reduce((m, f) => Math.max(m, f.length), 0);
    const celda = (r, c) => {
      const fila = valores[r - 1];
      if (!fila) return null;
      const v = fila[c - 1];
      return vacia(v) ? null : v;
    };

    const pId = idParcela(nombre);

    // A. Columna INFO y subparcelas
    let infoCol = null;
    for (let r = 1; r < Math.min(10, maxR + 1) && !infoCol; r++) {
      for (let c = 1; c <= maxC; c++) {
        const v = celda(r, c);
        if (v !== null && strPy(v).trim().toUpperCase() === 'INFO') { infoCol = c; break; }
      }
    }

    const subparcelas = [];
    let actual = null;
    let fincaHa = '';
    let fincaFa = '';
    if (infoCol) {
      for (let r = 1; r <= maxR; r++) {
        const lbl = celda(r, infoCol);
        const v = celda(r, infoCol + 1);
        if (lbl === null && v === null) continue;
        const lblS = lbl !== null ? strPy(lbl).trim() : '';
        const vS = serializar(v);
        const lblL = lblS.toLowerCase();
        if (lblL === 'parcela') {
          if (actual) subparcelas.push(actual);
          actual = dictPy();
          actual.set('nombre', vS);
        } else if (lblL === 'finca (ha)' || lblL === 'finca (fa)') {
          if (actual) { subparcelas.push(actual); actual = null; }
          if (lblL.includes('ha')) fincaHa = vS; else fincaFa = vS;
        } else if (actual !== null) {
          actual.set(lblS, vS);
        }
      }
      if (actual) subparcelas.push(actual);
    }

    const cultius = [], variedades = [], patrones = [], marcos = [], codics = [], anys = [], subNombres = [];
    const g = (sub, ...ks) => { for (const k of ks) { const v = sub.get(k); if (v) return v; } return ''; };
    subparcelas.forEach(sub => {
      const sNom = sub.get('nombre') || '';
      if (sNom && !subNombres.includes(sNom)) subNombres.push(sNom);
      const c = g(sub, 'Cultiu');
      if (c && !['no', 'res'].includes(c.toLowerCase()) && !cultius.includes(c)) cultius.push(c);
      const v = g(sub, 'Varietat', 'Varieteta');
      if (v && v.toLowerCase() !== 'no' && !variedades.includes(v)) variedades.push(v);
      const p = g(sub, 'Patró', 'Patro');
      if (p && p.toLowerCase() !== 'no' && !patrones.includes(p)) patrones.push(p);
      const m = g(sub, 'Marc de Plantació', 'Marc de plantacio');
      if (m && m.toLowerCase() !== 'no' && !marcos.includes(m)) marcos.push(m);
      const cd = g(sub, 'Codic');
      if (cd && !codics.includes(cd)) codics.push(cd);
      const ap = g(sub, 'Any de plantació', 'Any de plantacio');
      if (ap && ap.toLowerCase() !== 'no' && !anys.includes(ap)) anys.push(ap);
    });

    const esKakis = nombre === 'Kakis';
    const unir = (lista, sep) => lista.length ? lista.join(sep) : (esKakis ? 'No' : '');
    const cultiu = unir(cultius, ' / ');
    const varietat = unir(variedades, ' / ');
    const patron = unir(patrones, ' / ');
    const marco = unir(marcos, ' / ');
    const codic = codics.length ? codics.join(', ') : '';
    const anyPlantacio = unir(anys, ', ');

    const supHa = fincaHa ? `${fincaHa} Ha` : '';
    const supFa = fincaFa ? `${fincaFa} Hanegadas` : '';
    const partes = [];
    if (supFa) partes.push(supFa);
    if (supHa) partes.push(`(${supHa})`);
    const superficie = partes.length ? partes.join(' ') : 'Superficie en ficha';

    // B. Ficha técnica
    const ficha = [];
    if (cultiu) ficha.push({ campo: 'Cultiu', valor: cultiu });
    if (varietat) ficha.push({ campo: 'Varietat', valor: varietat });
    if (patron) ficha.push({ campo: 'Patró', valor: patron });
    if (marco) ficha.push({ campo: 'Marc de Plantació', valor: marco });
    if (supHa) ficha.push({ campo: 'Superficie Finca (Ha)', valor: supHa });
    if (supFa) ficha.push({ campo: 'Superficie Finca (Fa)', valor: supFa });
    if (codic) ficha.push({ campo: 'Còdic Cadastral', valor: codic });
    if (anyPlantacio) ficha.push({ campo: 'Any de plantació', valor: anyPlantacio });
    if (subparcelas.length > 1) {
      subparcelas.forEach(sub => {
        const sNom = sub.get('nombre') !== undefined ? sub.get('nombre') : 'Subparcela';
        sub.entries().forEach(([k, val]) => {
          if (k === 'nombre') return;
          if (val !== null && val !== undefined && String(val).trim()) ficha.push({ campo: `${sNom} · ${k}`, valor: String(val) });
        });
      });
    } else if (subparcelas.length === 1) {
      subparcelas[0].entries().forEach(([k, val]) => {
        if (val !== null && val !== undefined && String(val).trim() && k.toLowerCase() !== 'nombre') ficha.push({ campo: k, valor: String(val) });
      });
    }

    let analisisCol = null;
    for (let c = 1; c <= maxC && !analisisCol; c++) {
      for (let r = 1; r < 10; r++) {
        const v = celda(r, c);
        if (strPy(v === null || v === 0 || v === false ? '' : v).trim().toUpperCase() === 'ANALISIS') { analisisCol = c; break; }
      }
    }
    const analisis = dictPy();
    if (analisisCol) {
      for (let r = 1; r < Math.min(40, maxR + 1); r++) {
        const kv = celda(r, analisisCol);
        const k = strPy(kv === null || kv === 0 || kv === false ? '' : kv).trim();
        const vStr = serializar(celda(r, analisisCol + 1));
        if (k && vStr && !['analisis', 'parámetros', 'parametros', 'zona'].includes(k.toLowerCase())) analisis.set(k, vStr);
      }
    }

    const parcela = {
      id: pId,
      nombre: nombre,
      cultiu: cultiu,
      variedad: varietat,
      varietat: varietat,
      patron: patron,
      marco: marco,
      superficieHa: supHa,
      superficieFa: supFa,
      codic: codic,
      anyPlantacio: anyPlantacio,
      subparcelas: subNombres,
      subparcelasDetalle: subparcelas.map(s => s.toObject()),
      analisisSuelo: analisis.toObject(),
      superficie: superficie,
      fichaTecnica: ficha
    };

    const registros = [];

    // C. Faenas (columnas A-D)
    for (let r = 2; r <= maxR; r++) {
      const fetxa = celda(r, 1), faenaNom = celda(r, 2), persona = celda(r, 3), comentari = celda(r, 4);
      if (fetxa === null && faenaNom === null && comentari === null && persona === null) continue;
      const fStr = serializar(fetxa);
      if (fStr.toLowerCase() === 'fetxa') continue;
      const comStr = serializar(comentari);
      const faenaStr = serializar(faenaNom);
      const personaStr = serializar(persona);
      let quimico = '';
      if (PALABRAS_QUIMICO.some(k => faenaStr.toLowerCase().includes(k) || comStr.toLowerCase().includes(k))) {
        quimico = comStr ? `${faenaStr} - ${comStr}` : faenaStr;
      }
      const esTratamiento = esTratamientoCarlos(faenaStr, comStr);
      const operarios = parsearOperarios(personaStr);
      registros.push({
        id: idFaena(nombre, r),
        parcelaId: pId,
        parcelaNombre: nombre,
        tipoRegistro: 'faena',
        estado: 'Finalizadas',
        fecha: fStr,
        hora: '10:00',
        tipoFaena: faenaStr ? faenaStr : 'Trabajos de campo',
        usuario: personaStr ? personaStr : 'Equipo',
        usuarioId: usuarioIdLegado(operarios),
        operarios: operarios,
        quimicoProducto: quimico,
        quimicoDosis: quimico ? comStr : '',
        plagas: [],
        plagasNegadas: [],
        esTratamiento: esTratamiento,
        hierba: (faenaStr + ' ' + comStr).toLowerCase().includes('herbicida') ? 'Poca hierba' : 'Limpio',
        notas: comStr,
        origen: { hoja: nombre, fila: r, seccion: 'faenas', celdas: [fStr, faenaStr, personaStr, comStr] }
      });
    }

    // D. Informes (columnas F-K: encabezado 'Fetxa' y texto en la fila siguiente)
    for (let r = 1; r <= maxR; r++) {
      const c6 = celda(r, 6);
      if (c6 === null) continue;
      if (strPy(c6).trim().toLowerCase() !== 'fetxa') continue;
      const fechaInf = celda(r, 7), personaInf = celda(r, 9), parcelaSub = celda(r, 11);
      const filaTexto = r + 1;
      if (filaTexto > maxR) continue;
      const cand = celda(filaTexto, 6);
      if (cand === null) continue;
      const texto = strPy(cand).trim();
      if (!texto || ['fetxa', 'informe'].includes(texto.toLowerCase())) continue;
      const fInf = serializar(fechaInf);
      const pInf = personaInf ? serializar(personaInf) : 'Carlos';
      const subInf = parcelaSub ? serializar(parcelaSub) : '';
      const operarios = parsearOperarios(pInf);
      registros.push({
        id: idInforme(nombre, filaTexto),
        parcelaId: pId,
        parcelaNombre: nombre,
        tipoRegistro: 'informe',
        estado: '',
        fecha: fInf,
        hora: '12:00',
        tipoFaena: 'Informe de Estado / Revisión',
        usuario: pInf,
        usuarioId: usuarioIdLegado(operarios),
        operarios: operarios,
        subparcela: subInf,
        quimicoProducto: '',
        quimicoDosis: '',
        plagas: [],
        plagasNegadas: [],
        esTratamiento: false,
        hierba: clasificarHierbaInforme(texto),
        notas: texto,
        origen: {
          hoja: nombre, fila: filaTexto, filaEncabezado: r, subparcela: subInf, seccion: 'informes',
          celdas: [fInf, serializar(personaInf), serializar(parcelaSub), texto]
        }
      });
    }

    return { parcela, registros };
  }

  function parsearLibro(hojas) {
    const parcelas = [];
    const faenas = [];
    (hojas || []).forEach(h => {
      const res = parsearHoja(h);
      parcelas.push(res.parcela);
      res.registros.forEach(r => faenas.push(r));
    });
    return { parcelas, faenas };
  }

  return { parsearLibro, parsearHoja, parsearOperarios, esTratamientoCarlos, serializar, huella, idParcela, idFaena, idInforme, CATALOGO_OPERARIOS };
});
