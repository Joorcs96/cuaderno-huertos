// ============================================================================
// HUERTOS CARLOS - CUADERNO DE CAMPO Y GESTIÓN DE FAENAS AGRÍCOLAS
// ============================================================================

const STORAGE_KEY = 'huertos_carlos_db_v3';
const PREV_STORAGE_KEY = 'huertos_carlos_db_v2';
const USER_KEY = 'huertos_carlos_active_user';
// Acceso temporalmente abierto durante la fase de cesión/pruebas.
// El PIN y el cifrado siguen disponibles para reactivarlos al cerrar el proyecto.
const PIN_ENTRADA_ACTIVA = false;

// Catálogo completo de operarios y entidades según especificación y Excel de Carlos
// Helper de presentacion: devuelve el icono SVG local correspondiente. No altera logica ni datos.
function icono(nombre, clase) {
  return '<svg class="ic' + (clase ? ' ' + clase : '') + '" aria-hidden="true" focusable="false"><use href="#ic-' + nombre + '"></use></svg>';
};

const USUARIOS_DEFAULT = [
  { id: 'carlos', codigo: 'C', nombre: 'Carlos', rol: 'Administrador / Propietario', avatar: icono('user') },
  { id: 'jc', codigo: 'JC', nombre: 'Juancarlos', rol: 'Equipo de Campo', avatar: icono('tractor') },
  { id: 'diego', codigo: 'D', nombre: 'Diego', rol: 'Equipo de Campo', avatar: icono('sprout') },
  { id: 'juan', codigo: 'JT', nombre: 'Juan', rol: 'Operario / Tractorista', avatar: icono('wrench') },
  { id: 'juan-invernadero', codigo: 'JI', nombre: 'Juan (invernadero)', rol: 'Operario Invernadero (Juan tío)', avatar: icono('warehouse') },
  { id: 'jf', codigo: 'JF', nombre: 'Jorge i Flor', rol: 'Mantenimiento y Desbroce', avatar: icono('users') },
  { id: 'co', codigo: 'CO', nombre: 'Cooperativa', rol: 'Cooperativa', avatar: icono('building') },
  { id: 'crb', codigo: 'CRB', nombre: 'Comunidad de regantes Burriana', rol: 'Comunidad de Regantes', avatar: icono('drop') },
  { id: 'bagu', codigo: 'B', nombre: 'Bagu', rol: 'Operario', avatar: icono('tractor') },
  { id: 'alberto', codigo: 'A', nombre: 'Alberto', rol: 'Operario', avatar: icono('wheat') },
  { id: 'javi', codigo: 'JA', nombre: 'Javi', rol: 'Operario', avatar: icono('user') },
  { id: 'lida', codigo: 'LI', nombre: 'Lida', rol: 'Operaria', avatar: icono('user') }
];

function obtenerCatalogoUsuarios() {
  const custom = (typeof window !== 'undefined' && window.DATOS_INICIALES_CARLOS && Array.isArray(window.DATOS_INICIALES_CARLOS.usuarios))
    ? window.DATOS_INICIALES_CARLOS.usuarios
    : [];
  if (custom.length === 0) return USUARIOS_DEFAULT;
  const merged = [...USUARIOS_DEFAULT];
  custom.forEach(u => {
    if (!merged.some(m => m.id === u.id)) {
      merged.push(u);
    }
  });
  return merged;
}

const USUARIOS = obtenerCatalogoUsuarios();

// Helpers para manejo de operarios y retrocompatibilidad
function parsearOperarios(usuarioStr, usuarioId, operariosExistentes) {
  if (Array.isArray(operariosExistentes) && operariosExistentes.length > 0) {
    return operariosExistentes.map(op => String(op).trim()).filter(Boolean);
  }
  const str = String(usuarioStr || '').trim();
  if (!str) {
    return [usuarioId ? String(usuarioId).trim() : 'carlos'];
  }
  const tokens = str.split(/[,/+]|\by\b|\bi\b/i).map(t => t.trim()).filter(Boolean);
  const ids = [];
  tokens.forEach(tok => {
    const norm = tok.toLowerCase();
    if (norm === 'c' || norm === 'carlos') ids.push('carlos');
    else if (norm === 'jc' || norm === 'juancarlos' || norm === 'juan carlos') ids.push('jc');
    else if (norm === 'd' || norm === 'diego') ids.push('diego');
    else if (norm === 'ji' || norm.includes('invernadero') || norm === 'juan (invernadero)' || norm === 'j(inv)' || norm === 'j inv') ids.push('juan-invernadero');
    else if (norm === 'jt' || norm === 'j' || norm === 'juan' || norm === 'juan vidal' || norm === 'jv' || norm === 'juan tractorista') ids.push('juan');
    else if (norm === 'ja' || norm === 'javi') ids.push('javi');
    else if (norm === 'li' || norm === 'lida') ids.push('lida');
    else if (norm === 'jf' || norm.includes('jorge') || norm.includes('flor')) ids.push('jf');
    else if (norm === 'co' || norm.includes('cooperativa')) ids.push('co');
    else if (norm === 'crb' || norm.includes('regantes')) ids.push('crb');
    else if (norm === 'b' || norm === 'bagu') ids.push('bagu');
    else if (norm === 'a' || norm === 'alberto') ids.push('alberto');
    else {
      const match = USUARIOS.find(u => u.id === norm || u.codigo?.toLowerCase() === norm || u.nombre?.toLowerCase() === norm);
      if (match) ids.push(match.id);
      else if (tok.length > 0) ids.push(tok.toLowerCase().replace(/[^a-z0-9_-]/g, '_'));
    }
  });
  const unicos = Array.from(new Set(ids));
  return unicos.length > 0 ? unicos : [usuarioId ? String(usuarioId).trim() : 'carlos'];
}

function mapearNombresOperarios(operariosIds, huertoOregistro) {
  if (!operariosIds) return 'Carlos';
  let lista = [];
  if (Array.isArray(operariosIds)) {
    lista = operariosIds;
  } else if (typeof operariosIds === 'string') {
    lista = parsearOperarios(operariosIds);
  }
  if (lista.length === 0) return 'Carlos';

  let esInvernadero = false;
  if (typeof huertoOregistro === 'string') {
    esInvernadero = huertoOregistro.toLowerCase().includes('invernadero');
  } else if (huertoOregistro && typeof huertoOregistro === 'object') {
    const pId = String(huertoOregistro.parcelaId || '').toLowerCase();
    const pNom = String(huertoOregistro.parcelaNombre || huertoOregistro.nombre || '').toLowerCase();
    esInvernadero = pId.includes('invernadero') || pNom.includes('invernadero');
  }

  const nombres = lista.map(id => {
    const idLower = String(id).trim().toLowerCase();
    if (idLower === 'c' || idLower === 'carlos') return 'Carlos';
    if (idLower === 'jc' || idLower === 'juancarlos' || idLower === 'juan carlos') return 'Juancarlos';
    if (idLower === 'd' || idLower === 'diego') return 'Diego';
    if (idLower === 'juan-invernadero' || idLower === 'ji') return 'Juan tío';
    if (idLower === 'jt') return 'Juan tractorista';
    if (idLower === 'ja' || idLower === 'javi') return 'Javi';
    if (idLower === 'li' || idLower === 'lida') return 'Lida';
    if (idLower === 'juan' || idLower === 'j' || idLower === 'jv' || idLower === 'juan vidal') {
      return esInvernadero ? 'Juan tío' : 'Juan tractorista';
    }
    if (idLower === 'jf' || idLower === 'jorge-flor' || idLower === 'jorge i flor' || idLower === 'jorge y flor') return 'Jorge i Flor';
    if (idLower === 'co' || idLower === 'cooperativa') return 'Cooperativa';
    if (idLower === 'crb' || idLower === 'comunidad-regantes' || idLower.includes('regants') || idLower.includes('regantes')) return 'Comunidad de regantes Burriana';
    if (idLower === 'b' || idLower === 'bagu') return 'Bagu';
    if (idLower === 'a' || idLower === 'alberto') return 'Alberto';

    const u = USUARIOS.find(x => x.id === idLower || x.codigo?.toLowerCase() === idLower || x.nombre?.toLowerCase() === idLower);
    if (u) {
      if (u.id === 'juan') return esInvernadero ? 'Juan tío' : 'Juan tractorista';
      if (u.id === 'juan-invernadero') return 'Juan tío';
      return u.nombre;
    }
    return String(id).trim();
  });

  return Array.from(new Set(nombres)).join(', ');
}

function esInforme(registro) {
  if (!registro) return false;
  if (registro.tipoRegistro === 'informe') return true;
  if (registro.id && String(registro.id).startsWith('informe-')) return true;
  if (registro.tipoFaena && String(registro.tipoFaena).toLowerCase().includes('informe')) return true;
  return false;
}

function generarFichaTecnicaParcela(p) {
  if (!p) return [];
  if (Array.isArray(p.fichaTecnica) && p.fichaTecnica.length > 0) {
    return p.fichaTecnica;
  }
  const specs = [];
  const variedad = p.variedad || p.varietat;
  if (variedad && variedad !== 'Sin especificar' && variedad !== 'Variedad estándar') {
    specs.push({ campo: 'Variedad', valor: String(variedad) });
  }
  if (p.patron && p.patron !== 'Sin patrón') {
    specs.push({ campo: 'Patrón', valor: String(p.patron) });
  }
  if (p.marco && p.marco !== '-') {
    specs.push({ campo: 'Marco', valor: String(p.marco) });
  }
  const sup = p.superficie || p.superficieFa || p.superficieHa;
  if (sup && sup !== 'No especificada') {
    specs.push({ campo: 'Superficie', valor: String(sup) });
  }
  if (p.anyPlantacio && p.anyPlantacio !== 'No') {
    specs.push({ campo: 'Año Plantación', valor: String(p.anyPlantacio) });
  }
  if (p.cultiu && p.cultiu !== 'No') {
    specs.push({ campo: 'Cultivo', valor: String(p.cultiu) });
  }
  if (p.codic) {
    specs.push({ campo: 'Código', valor: String(p.codic) });
  }
  if (Array.isArray(p.subparcelas) && p.subparcelas.length > 0) {
    specs.push({ campo: 'Subparcelas', valor: p.subparcelas.join(', ') });
  }
  if (p.arboles) {
    specs.push({ campo: 'Árboles', valor: `${p.arboles}` });
  }
  return specs;
}

// Integración modular con CampoCarlos (con fallback para pruebas o antes de carga)
function getCampoCarlos() {
  if (typeof window !== 'undefined' && window.CampoCarlos && typeof window.CampoCarlos.resumenParcela === 'function') {
    return window.CampoCarlos;
  }
  return {
    analizarRegistro(registro) {
      if (!registro) return { plagas: [], sinPlagas: true, hierba: null, riego: null };
      if (registro.observacionesEstructuradas) {
        const obs = registro.observacionesEstructuradas;
        return {
          plagas: Array.isArray(obs.plagas) ? obs.plagas : [],
          sinPlagas: Boolean(obs.sinPlagas) || (!obs.plagas || obs.plagas.length === 0 || obs.plagas.every(p => p.presencia === 'ausente')),
          hierba: obs.hierba || null,
          riego: obs.riego || null
        };
      }
      const rawPlagas = Array.isArray(registro.plagas) ? registro.plagas : [];
      const plagas = rawPlagas
        .filter(p => p && !p.toLowerCase().includes('sin') && !p.toLowerCase().includes('limpio'))
        .map(nombre => ({
          nombre: String(nombre).trim(),
          presencia: registro.esTratamiento ? 'ausente' : 'presente',
          danos: 'desconocido',
          evidencia: registro.esTratamiento ? 'Tratamiento fitosanitario' : 'Detección visual'
        }));
      let hierba = null;
      if (registro.hierba) {
        const h = String(registro.hierba).toLowerCase();
        hierba = {
          nivel: h.includes('mucha') || h.includes('alta') ? 'alta' : (h.includes('poca') || h.includes('baja') ? 'baja' : 'limpio'),
          evidencia: registro.hierba
        };
      }
      const sinPlagas = plagas.length === 0 && (Boolean(registro.plagasNegadas && registro.plagasNegadas.length) || Boolean(registro.esTratamiento));
      return { plagas, sinPlagas, hierba, riego: null };
    },
    resumenParcela(registros) {
      if (!registros || !registros.length) {
        return { plagas: [], sinPlagas: true, hierba: null, riego: null };
      }
      const ordenados = [...registros].sort((a, b) => {
        const fA = a.fecha || '1970-01-01';
        const fB = b.fecha || '1970-01-01';
        return new Date(`${fB} ${b.hora || '12:00'}`) - new Date(`${fA} ${a.hora || '12:00'}`);
      });
      let plagas = [];
      let sinPlagas = false;
      let hierba = null;
      let riego = null;

      for (const reg of ordenados) {
        const an = this.analizarRegistro(reg);
        if (hierba === null && an.hierba) hierba = an.hierba;
        if (riego === null && an.riego) riego = an.riego;
        if (plagas.length === 0 && !sinPlagas) {
          if (reg.observacionesEstructuradas) {
            plagas = an.plagas || [];
            sinPlagas = an.sinPlagas;
          } else if (an.plagas && an.plagas.length > 0) {
            plagas = an.plagas;
          } else if (an.sinPlagas) {
            sinPlagas = true;
          }
        }
      }
      return {
        plagas,
        sinPlagas: sinPlagas || (plagas.length === 0),
        hierba,
        riego
      };
    }
  };
}

// Baseline inicial de parcelas y faenas extraídas del Excel
const PARCELAS_INICIALES = (typeof window !== 'undefined' && window.DATOS_INICIALES_CARLOS && window.DATOS_INICIALES_CARLOS.parcelas)
  ? window.DATOS_INICIALES_CARLOS.parcelas
  : [];

const FAENAS_INICIALES = (typeof window !== 'undefined' && window.DATOS_INICIALES_CARLOS && window.DATOS_INICIALES_CARLOS.faenas)
  ? window.DATOS_INICIALES_CARLOS.faenas
  : [];

// Estado en memoria (se mantiene vacío hasta descifrar la bóveda con el PIN)
let claveSesionActiva = sessionStorage.getItem('huertos_carlos_session_pass') || null;

let estado = {
  usuarioActivo: null,
  parcelas: [],
  faenas: []
};

// ============================================================================
// INICIALIZACIÓN CON BÓVEDA CRIPTOGRÁFICA Y CIBERSEGURIDAD
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  iniciarNavegacion();
  iniciarFormularioFaena();
  iniciarProteccionPrivacidad();

  if (!PIN_ENTRADA_ACTIVA) {
    if (necesitaClaveCuaderno()) {
      mostrarModalClave();
      return;
    }
    await arrancarCuaderno();
    return;
  }
  await arrancarConPin();
});

// Contraseña común (Carlos, Diego y Juan Carlos): sin ella no se muestran datos ni se toca el Excel
function necesitaClaveCuaderno() {
  return Boolean(window.SincroSheets && window.SincroSheets.url() && !window.SincroSheets.tieneClave());
}

function mostrarModalClave(mensaje) {
  const modal = document.getElementById('modal-clave');
  if (!modal) return;
  modal.classList.remove('hidden');
  const err = document.getElementById('clave-error');
  if (err) {
    err.textContent = mensaje || '';
    err.classList.toggle('hidden', !mensaje);
  }
  setTimeout(() => document.getElementById('clave-cuaderno')?.focus(), 50);
}

window.procesarClaveCuaderno = async function(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('clave-cuaderno');
  const btn = document.getElementById('btn-clave');
  const err = document.getElementById('clave-error');
  if (btn) btn.disabled = true;
  try {
    await window.SincroSheets.comprobarClave(input ? input.value : '');
    if (input) input.value = '';
    document.getElementById('modal-clave')?.classList.add('hidden');
    if (!sincroSheetsIniciada) await arrancarCuaderno();
    else window.SincroSheets.sincronizar();
  } catch (e) {
    const m = String(e && e.message || e);
    const texto = m.startsWith('CLAVE') ? 'Contraseña incorrecta'
      : m.startsWith('BLOQUEADO') ? 'Demasiados intentos: espera 15 minutos'
      : m.startsWith('SIN_CLAVE') ? 'Carlos aún no ha puesto la contraseña en el Excel (menú Huertos)'
      : 'No hay conexión con el Excel. Prueba de nuevo.';
    if (err) { err.textContent = texto; err.classList.remove('hidden'); }
  } finally {
    if (btn) btn.disabled = false;
  }
};

async function arrancarCuaderno() {
  await cargarDatos();
  const usuarioGuardado = localStorage.getItem(USER_KEY);
  estado.usuarioActivo = USUARIOS.find(u => u.id === usuarioGuardado) || USUARIOS[0];
  if (estado.usuarioActivo) {
    localStorage.setItem(USER_KEY, estado.usuarioActivo.id);
    actualizarHeaderUsuario();
  }
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
  renderizarTodo();
  actualizarEstadoCiberseguridadUI();
}

async function arrancarConPin() {
  // Comprobar si hay sesión descifrada activa en sessionStorage
  if (claveSesionActiva && window.HuertoSecurity && window.HuertoSecurity.tienePinActivo()) {
    const check = await window.HuertoSecurity.verificarPin(claveSesionActiva);
    if (check.success && !window.HuertoSecurity.estaSesionBloqueada()) {
      await cargarDatos();
      iniciarSesionUsuario();
      renderizarTodo();
      actualizarEstadoCiberseguridadUI();
      return;
    }
  }

  // Si no hay sesión desbloqueada, mostrar pantalla de bóveda protegida
  mostrarPantallaAutenticacionInicial();
}

async function cargarDatos() {
  try {
    // 1. Si existe clave de sesión activa, intentar cargar desde la bóveda cifrada AES-256-GCM
    if (claveSesionActiva && window.HuertoSecurity && window.HuertoSecurity.tieneBovedaCifrada()) {
      const res = await window.HuertoSecurity.cargarBovedaCifrada(claveSesionActiva);
      if (res.status === 'VERIFIED' && res.data) {
        estado.parcelas = res.data.parcelas || [];
        estado.faenas = res.data.faenas || [];
        normalizarColeccionesEnMemoria();
        return;
      } else if (res.status === 'WRONG_KEY') {
        throw new Error('Clave o PIN no válido para descifrar la bóveda');
      }
    }

    // 2. Si no hay bóveda cifrada aún, cargar datos base del proyecto (migración inicial)
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw && localStorage.getItem(PREV_STORAGE_KEY)) {
      raw = localStorage.getItem(PREV_STORAGE_KEY);
    }

    if (raw) {
      const parsed = window.HuertoSecurity ? window.HuertoSecurity.safeJsonParse(raw) : JSON.parse(raw);
      if (parsed && parsed.parcelas && parsed.parcelas.length >= 20) {
        estado.parcelas = parsed.parcelas;
        estado.faenas = parsed.faenas || JSON.parse(JSON.stringify(FAENAS_INICIALES));
      } else {
        estado.parcelas = JSON.parse(JSON.stringify(PARCELAS_INICIALES));
        estado.faenas = JSON.parse(JSON.stringify(FAENAS_INICIALES));
      }
    } else {
      estado.parcelas = JSON.parse(JSON.stringify(PARCELAS_INICIALES));
      estado.faenas = JSON.parse(JSON.stringify(FAENAS_INICIALES));
    }

    // Snapshot antes de persistir la migración
    if (window.HuertoSecurity && window.HuertoSecurity.crearSnapshotSeguridad) {
      window.HuertoSecurity.crearSnapshotSeguridad(STORAGE_KEY);
    }

    normalizarColeccionesEnMemoria();

    // Si ya tenemos clave de sesión, guardar de inmediato en bóveda cifrada AES-256
    if (claveSesionActiva && window.HuertoSecurity && window.HuertoSecurity.guardarBovedaCifrada) {
      await guardarDatos();
    }
  } catch (e) {
    console.warn('[Ciberseguridad] Error cargando datos de bóveda:', e);
    estado.parcelas = [];
    estado.faenas = [];
  }
}

function normalizarColeccionesEnMemoria(objetivo = estado) {
  // Con Google Sheets conectado la hoja es la fuente de verdad: no se rellenan datos del Excel antiguo
  const usarBaseline = objetivo === estado && !(window.SincroSheets && window.SincroSheets.conectada());
  const sanitizeId = (window.HuertoSecurity && window.HuertoSecurity.sanitizeId) ? window.HuertoSecurity.sanitizeId : s => s;

  // 1. Migración y enriquecimiento de parcelas desde baseline sin restablecer datos editados
  const baselineParcelasMap = new Map((usarBaseline ? PARCELAS_INICIALES || [] : []).map(p => [sanitizeId(p.id), p]));
  if (Array.isArray(objetivo.parcelas)) {
    objetivo.parcelas.forEach(p => {
      p.id = sanitizeId(p.id);
      const base = baselineParcelasMap.get(p.id);
      if (base) {
        // Enriquecer metadatos faltantes o placeholders antiguos ('Sin especificar', 'Variedad estándar')
        const varActual = p.variedad || p.varietat;
        if (!varActual || varActual === 'Sin especificar' || varActual === 'Variedad estándar') {
          p.variedad = base.variedad || base.varietat || varActual || 'Sin especificar';
          p.varietat = p.variedad;
        }
        if ((!p.patron || p.patron === 'Sin patrón') && base.patron) p.patron = base.patron;
        if ((!p.marco || p.marco === '-') && base.marco) p.marco = base.marco;
        if ((!p.superficie || p.superficie === 'No especificada') && base.superficie) p.superficie = base.superficie;
        if (!p.superficieHa && base.superficieHa) p.superficieHa = base.superficieHa;
        if (!p.superficieFa && base.superficieFa) p.superficieFa = base.superficieFa;
        if (!p.codic && base.codic) p.codic = base.codic;
        if (!p.cultiu && base.cultiu) p.cultiu = base.cultiu;
        if (!p.anyPlantacio && base.anyPlantacio) p.anyPlantacio = base.anyPlantacio;
        if ((!p.subparcelas || !p.subparcelas.length) && base.subparcelas) p.subparcelas = [...base.subparcelas];
        if (!p.fichaTecnica && base.fichaTecnica) p.fichaTecnica = JSON.parse(JSON.stringify(base.fichaTecnica));
      }
      p.fichaTecnica = generarFichaTecnicaParcela(p);
    });

    // Incorporar parcelas del baseline que falten por completo
    (usarBaseline ? PARCELAS_INICIALES || [] : []).forEach(base => {
      const baseId = sanitizeId(base.id);
      if (!objetivo.parcelas.some(p => sanitizeId(p.id) === baseId)) {
        const clon = JSON.parse(JSON.stringify(base));
        clon.id = baseId;
        clon.fichaTecnica = generarFichaTecnicaParcela(clon);
        objetivo.parcelas.push(clon);
      }
    });
  }

  // 2. Migración y normalización de faenas e informes
  const baselineFaenasMap = new Map((usarBaseline ? FAENAS_INICIALES || [] : []).map(f => [sanitizeId(f.id), f]));
  if (Array.isArray(objetivo.faenas)) {
    objetivo.faenas.forEach(f => {
      f.id = sanitizeId(f.id);
      if (f.parcelaId) f.parcelaId = sanitizeId(f.parcelaId);
      // Migrar 'En curso' a 'Pendientes'
      f.estado = normalizarEstado(f.estado || 'Finalizadas');
      // Identificar tipoRegistro
      f.tipoRegistro = esInforme(f) ? 'informe' : 'faena';
      // Multi-operario
      f.operarios = parsearOperarios(f.usuario, f.usuarioId, f.operarios);
      if (!f.usuarioId && f.operarios.length > 0) f.usuarioId = f.operarios[0];
      if (!f.usuario) f.usuario = mapearNombresOperarios(f.operarios);

      // Enriquecer baseline por ID si faltan metadatos, preservando notas y estados modificados
      const base = baselineFaenasMap.get(f.id);
      if (base) {
        if (!f.parcelaNombre && base.parcelaNombre) f.parcelaNombre = base.parcelaNombre;
        if (!f.parcelaId && base.parcelaId) f.parcelaId = sanitizeId(base.parcelaId);
        if (!f.quimicoProducto && base.quimicoProducto) f.quimicoProducto = base.quimicoProducto;
        if (!f.quimicoDosis && base.quimicoDosis) f.quimicoDosis = base.quimicoDosis;
        if (f.esTratamiento === undefined && base.esTratamiento !== undefined) f.esTratamiento = base.esTratamiento;
      }
    });

    // Incorporar faenas e informes del baseline que falten por completo (sin duplicar)
    (usarBaseline ? FAENAS_INICIALES || [] : []).forEach(base => {
      const baseId = sanitizeId(base.id);
      if (!objetivo.faenas.some(f => sanitizeId(f.id) === baseId)) {
        const clon = JSON.parse(JSON.stringify(base));
        clon.id = baseId;
        if (clon.parcelaId) clon.parcelaId = sanitizeId(clon.parcelaId);
        clon.estado = normalizarEstado(clon.estado || 'Finalizadas');
        clon.tipoRegistro = esInforme(clon) ? 'informe' : 'faena';
        clon.operarios = parsearOperarios(clon.usuario, clon.usuarioId, clon.operarios);
        if (!clon.usuarioId && clon.operarios.length > 0) clon.usuarioId = clon.operarios[0];
        if (!clon.usuario) clon.usuario = mapearNombresOperarios(clon.operarios);
        objetivo.faenas.push(clon);
      }
    });
  }
}

async function guardarDatos(opciones = {}) {
  const ok = await guardarDatosLocal();
  if (ok && !opciones.sinSincronizar && window.SincroSheets) window.SincroSheets.programar();
  return ok;
}

async function guardarDatosLocal() {
  try {
    const payload = {
      parcelas: estado.parcelas,
      faenas: estado.faenas
    };

    // Si tenemos clave activa, guardar cifrado con AES-256-GCM
    if (claveSesionActiva && window.HuertoSecurity && window.HuertoSecurity.guardarBovedaCifrada) {
      const res = await window.HuertoSecurity.guardarBovedaCifrada(payload, claveSesionActiva);
      if (!res || !res.success) {
        if (res && res.error === 'QUOTA_EXCEEDED') {
          mostrarToast(icono('warning') + ' Espacio local lleno. Descarga una copia de seguridad.', 'danger');
        } else {
          mostrarToast(icono('warning') + ' Error al cifrar y guardar en la bóveda: ' + (res?.error || 'fallo'), 'danger');
        }
        return false;
      }
      return true;
    } else if (window.HuertoSecurity && window.HuertoSecurity.guardarConIntegridad) {
      const res = await window.HuertoSecurity.guardarConIntegridad(STORAGE_KEY, payload);
      if (!res || !res.success) {
        mostrarToast(icono('warning') + ' Error al guardar con integridad: ' + (res?.error || 'fallo'), 'danger');
        return false;
      }
      return true;
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    }
  } catch (e) {
    console.error('[Ciberseguridad] Error guardando estado:', e);
    mostrarToast(icono('warning') + ' Error al guardar datos: ' + (e.message || 'error desconocido'), 'danger');
    return false;
  }
}

// ============================================================================
// GESTIÓN DE BÓVEDA, PIN Y CONTROL DE SESIÓN
// ============================================================================
function mostrarPantallaAutenticacionInicial() {
  const modal = document.getElementById('auth-modal');
  const viewUnlock = document.getElementById('vault-unlock-view');
  const viewSetup = document.getElementById('vault-setup-view');
  const viewUsers = document.getElementById('vault-users-view');
  if (!modal) return;

  modal.classList.remove('hidden');

  if (window.HuertoSecurity && window.HuertoSecurity.tienePinActivo()) {
    // Modo desbloqueo
    if (viewUnlock) viewUnlock.classList.remove('hidden');
    if (viewSetup) viewSetup.classList.add('hidden');
    if (viewUsers) viewUsers.classList.add('hidden');

    const pinInput = document.getElementById('auth-pin-input');
    if (pinInput) {
      pinInput.value = '';
      setTimeout(() => pinInput.focus(), 150);
    }

    // Verificar si hay bloqueo temporal activo por intentos fallidos
    const statusBloqueo = window.HuertoSecurity.verificarEstadoBloqueoIntentos();
    const errDiv = document.getElementById('auth-pin-error');
    const btnUnlock = document.getElementById('btn-submit-unlock');
    if (statusBloqueo.bloqueado) {
      if (errDiv) {
        errDiv.innerText = `Bóveda bloqueada por intentos fallidos. Espera ${statusBloqueo.segundosRestantes}s.`;
        errDiv.classList.remove('hidden');
      }
      if (btnUnlock) btnUnlock.disabled = true;
      setTimeout(() => {
        if (btnUnlock) btnUnlock.disabled = false;
        if (errDiv) errDiv.classList.add('hidden');
      }, statusBloqueo.segundosRestantes * 1000);
    } else {
      if (errDiv) errDiv.classList.add('hidden');
      if (btnUnlock) btnUnlock.disabled = false;
    }
  } else {
    // Primer arranque: configurar PIN maestro obligatorio
    if (viewUnlock) viewUnlock.classList.add('hidden');
    if (viewSetup) viewSetup.classList.remove('hidden');
    if (viewUsers) viewUsers.classList.add('hidden');
  }
}

window.procesarDesbloqueoPin = async function(event) {
  if (event) event.preventDefault();
  const pinInput = document.getElementById('auth-pin-input');
  const errDiv = document.getElementById('auth-pin-error');
  const btnUnlock = document.getElementById('btn-submit-unlock');
  const pin = pinInput ? pinInput.value.trim() : '';

  if (!pin) return;

  if (window.HuertoSecurity) {
    const res = await window.HuertoSecurity.verificarPin(pin);
    if (!res.success) {
      if (errDiv) {
        errDiv.innerText = res.mensaje || 'PIN incorrecto';
        errDiv.classList.remove('hidden');
      }
      if (res.bloqueado && btnUnlock) {
        btnUnlock.disabled = true;
        setTimeout(() => {
          btnUnlock.disabled = false;
          if (errDiv) errDiv.classList.add('hidden');
        }, (res.segundosRestantes || 30) * 1000);
      }
      return;
    }

    // PIN correcto: descifrar bóveda
    claveSesionActiva = pin;
    sessionStorage.setItem('huertos_carlos_session_pass', pin);
    window.HuertoSecurity.desbloquearSesion();

    await cargarDatos();

    const guardado = localStorage.getItem(USER_KEY);
    if (guardado && USUARIOS.some(u => u.id === guardado)) {
      estado.usuarioActivo = USUARIOS.find(u => u.id === guardado);
      const modal = document.getElementById('auth-modal');
      if (modal) modal.classList.add('hidden');
      actualizarHeaderUsuario();
      renderizarTodo();
      actualizarEstadoCiberseguridadUI();
      mostrarToast(icono('unlock') + ' Bóveda descifrada con éxito');
    } else {
      mostrarSelectorOperariosModal();
    }
  }
};

window.procesarCreacionPin = async function(event) {
  if (event) event.preventDefault();
  const p1 = document.getElementById('setup-pin-input')?.value.trim();
  const p2 = document.getElementById('setup-pin-confirm')?.value.trim();
  const errDiv = document.getElementById('setup-pin-error');

  if (!p1 || p1.length < 4) {
    if (errDiv) {
      errDiv.innerText = 'El PIN o clave debe tener al menos 4 caracteres';
      errDiv.classList.remove('hidden');
    }
    return;
  }

  if (p1 !== p2) {
    if (errDiv) {
      errDiv.innerText = 'Los PINs introducidos no coinciden';
      errDiv.classList.remove('hidden');
    }
    return;
  }

  try {
    await window.HuertoSecurity.configurarPinSeguridad(p1);
    claveSesionActiva = p1;
    sessionStorage.setItem('huertos_carlos_session_pass', p1);
    window.HuertoSecurity.desbloquearSesion();

    estado.parcelas = JSON.parse(JSON.stringify(PARCELAS_INICIALES));
    estado.faenas = JSON.parse(JSON.stringify(FAENAS_INICIALES));
    normalizarColeccionesEnMemoria();
    await guardarDatos();

    mostrarToast(icono('shield-check') + ' Bóveda AES-256 activada con éxito');
    mostrarSelectorOperariosModal();
  } catch (err) {
    if (errDiv) {
      errDiv.innerText = err.message;
      errDiv.classList.remove('hidden');
    }
  }
};

function mostrarSelectorOperariosModal() {
  const viewUnlock = document.getElementById('vault-unlock-view');
  const viewSetup = document.getElementById('vault-setup-view');
  const viewUsers = document.getElementById('vault-users-view');
  const selector = document.getElementById('usuarios-selector');
  if (!selector) return;

  if (viewUnlock) viewUnlock.classList.add('hidden');
  if (viewSetup) viewSetup.classList.add('hidden');
  if (viewUsers) viewUsers.classList.remove('hidden');

  selector.innerHTML = '';
  USUARIOS.forEach(u => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'user-select-btn';
    btn.innerHTML = `
      <span style="font-size:1.6rem;">${u.avatar}</span>
      <div style="text-align:left; flex:1;">
        <div>${u.nombre}</div>
        <div style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">${u.rol}</div>
      </div>
      <span>${icono('arrow-right')}</span>
    `;
    btn.onclick = () => seleccionarUsuario(u);
    selector.appendChild(btn);
  });
}

function seleccionarUsuario(usuario) {
  estado.usuarioActivo = usuario;
  localStorage.setItem(USER_KEY, usuario.id);
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
  actualizarHeaderUsuario();
  mostrarToast(`Sesión iniciada como ${usuario.nombre}`);
  renderizarOperariosChips();
  renderizarTodo();
  actualizarEstadoCiberseguridadUI();
}

window.cambiarUsuario = function() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('hidden');
  mostrarSelectorOperariosModal();
};

window.bloquearCuadernoManual = function(razon = 'manual') {
  claveSesionActiva = null;
  sessionStorage.removeItem('huertos_carlos_session_pass');
  if (window.HuertoSecurity) {
    window.HuertoSecurity.bloquearSesion();
  }
  // Purgar de memoria los datos sensibles
  estado.parcelas = [];
  estado.faenas = [];
  renderizarTodo();
  mostrarPantallaAutenticacionInicial();
  mostrarToast(razon === 'inactividad' ? icono('timer') + ' Cuaderno bloqueado por inactividad' : icono('lock') + ' Cuaderno de campo bloqueado');
};

function iniciarSesionUsuario() {
  const guardado = localStorage.getItem(USER_KEY);
  if (guardado) {
    const user = USUARIOS.find(u => u.id === guardado);
    if (user) {
      estado.usuarioActivo = user;
      actualizarHeaderUsuario();
      return;
    }
  }
  mostrarSelectorOperariosModal();
}

function actualizarHeaderUsuario() {
  const badge = document.getElementById('user-active-badge');
  const avatar = document.getElementById('user-avatar-btn');
  if (badge && estado.usuarioActivo) {
    badge.innerText = `Acceso: ${estado.usuarioActivo.nombre}`;
  }
  if (avatar && estado.usuarioActivo) {
    avatar.innerHTML = estado.usuarioActivo.avatar || icono('user');
  }
}

// ============================================================================
// NAVEGACIÓN ERGONÓMICA
// ============================================================================
function iniciarNavegacion() {
  const tabs = document.querySelectorAll('.nav-btn');
  const fab = document.querySelector('.mobile-fab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      const panel = document.getElementById(targetId);
      if (panel) panel.classList.add('active');

      if (fab) {
        // El botón flotante se decide desde CSS: en móvil se oculta para no tapar los
        // botones de estado de las tarjetas y la acción queda a un toque en la pestaña Nueva.
        fab.style.display = 'none';
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

window.abrirNuevaFaena = function(parcelaIdPrevia = null) {
  const tabBtn = document.querySelector('[data-tab="tab-nueva"]');
  if (tabBtn) tabBtn.click();

  if (parcelaIdPrevia) {
    const sel = document.getElementById('faena-huerto');
    if (sel) sel.value = parcelaIdPrevia;
  }
};

// ============================================================================
// RENDERIZADO PRINCIPAL
// ============================================================================
function renderizarTodo() {
  iniciarSincroSheets();
  renderizarFeed();
  renderizarInformes();
  renderizarDevops();
  renderizarParcelas();
  renderizarSelectoresHuertos();
  renderizarOperariosChips();
  renderizarSemaforo();
}

// ============================================================================
// HELPERS KANBAN & PERIODOS (AÑO Y MES)
// ============================================================================
const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Hierba por zonas (Tira = línea de árboles, Frau = calle). Se guarda también el peor nivel para el resumen.
const ORDEN_HIERBA = ['limpio', 'baja', 'alta'];
function nivelHierbaDeEtiqueta(et) {
  const t = String(et || '').toLowerCase();
  if (t.startsWith('mucha') || t === 'alta') return 'alta';
  if (t.startsWith('poca') || t === 'baja') return 'baja';
  return 'limpio';
}
function etiquetaHierba(nivel) {
  return nivel === 'alta' ? 'Mucha hierba' : (nivel === 'baja' ? 'Poca hierba' : 'Limpio');
}
function peorHierba(a, b) {
  return ORDEN_HIERBA[Math.max(ORDEN_HIERBA.indexOf(a), ORDEN_HIERBA.indexOf(b), 0)];
}
function textoZonasHierba(h) {
  if (!h || (!h.tira && !h.frau)) return '';
  const corto = n => (n === 'alta' ? 'mucha' : (n === 'baja' ? 'poca' : 'limpio'));
  return ` (Tira: ${corto(h.tira)} · Frau: ${corto(h.frau)})`;
}

function normalizarEstado(estado) {
  if (!estado) return 'Finalizadas';
  const norm = String(estado).trim().toLowerCase();
  if (norm.startsWith('pend') || norm.includes('curso') || norm.includes('proceso')) return 'Pendientes';
  if (norm.startsWith('fin') || norm.startsWith('hech') || norm.startsWith('complet')) return 'Finalizadas';
  return 'Finalizadas';
}

function obtenerInfoMesAno(fechaStr) {
  if (!fechaStr) return { clave: 'sin-fecha', etiqueta: 'Sin fecha', ano: 0, mes: 0 };
  const partes = String(fechaStr).split('-');
  if (partes.length >= 2) {
    const ano = parseInt(partes[0], 10);
    const mesIndex = parseInt(partes[1], 10) - 1;
    const nombreMes = MESES_ES[mesIndex] || partes[1];
    return {
      clave: `${partes[0]}-${partes[1]}`,
      etiqueta: `${nombreMes} ${ano}`,
      ano: ano,
      mes: mesIndex + 1
    };
  }
  return { clave: 'desconocido', etiqueta: fechaStr, ano: 0, mes: 0 };
}

// Control de meses colapsados en el acordeón
const mesesColapsados = new Set();
let acordeonInicializado = false;

window.toggleMesAcordeon = function(periodoClave) {
  if (mesesColapsados.has(periodoClave)) {
    mesesColapsados.delete(periodoClave);
  } else {
    mesesColapsados.add(periodoClave);
  }
  const el = document.getElementById(`month-group-${periodoClave}`);
  if (el) {
    el.classList.toggle('collapsed');
  }
};

window.toggleTodosLosMeses = function() {
  const groups = document.querySelectorAll('.kanban-month-group');
  if (!groups || groups.length === 0) return;
  const algunAbierto = Array.from(groups).some(g => !g.classList.contains('collapsed'));
  groups.forEach(g => {
    const periodo = g.getAttribute('data-periodo');
    if (algunAbierto) {
      g.classList.add('collapsed');
      if (periodo) mesesColapsados.add(periodo);
    } else {
      g.classList.remove('collapsed');
      if (periodo) mesesColapsados.delete(periodo);
    }
  });
};
window.toggleTodosLosMesesDevops = window.toggleTodosLosMeses;

window.scrollHaciaColumna = function(periodoClave, estadoNombre) {
  const colId = `col-${periodoClave}-${estadoNombre.replace(/\s+/g, '-')}`;
  const col = document.getElementById(colId);
  if (col) {
    col.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    const switcher = document.getElementById(`switcher-${periodoClave}`);
    if (switcher) {
      switcher.querySelectorAll('.col-switch-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = switcher.querySelector(`[data-target="${estadoNombre}"]`);
      if (activeBtn) activeBtn.classList.add('active');
    }
  }
};

// Drag and drop para escritorio
window.onFaenaDragStart = function(event, faenaId) {
  if (event && event.dataTransfer) {
    event.dataTransfer.setData('text/plain', faenaId);
    event.dataTransfer.effectAllowed = 'move';
  }
};

window.onFaenaDragOver = function(event) {
  if (event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const col = event.currentTarget;
    if (col && !col.classList.contains('drag-over')) {
      col.classList.add('drag-over');
    }
  }
};

window.onFaenaDragLeave = function(event) {
  if (event && event.currentTarget) {
    event.currentTarget.classList.remove('drag-over');
  }
};

window.onFaenaDrop = function(event, nuevoEstado) {
  if (event) {
    event.preventDefault();
    if (event.currentTarget) event.currentTarget.classList.remove('drag-over');
    const faenaId = event.dataTransfer ? event.dataTransfer.getData('text/plain') : null;
    if (faenaId) {
      cambiarEstadoFaena(faenaId, nuevoEstado);
    }
  }
};

// Cambio de estado verificable con 1 clic desde móvil o acción directa
window.cambiarEstadoFaena = async function(faenaId, nuevoEstado, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const faena = estado.faenas.find(f => f.id === faenaId);
  if (!faena) return;

  const estadoNormalizado = normalizarEstado(nuevoEstado);
  if (normalizarEstado(faena.estado) === estadoNormalizado) return;

  faena.estado = estadoNormalizado;
  const ok = await guardarDatos();
  if (!ok) return;

  // Preservar la posición vertical del scroll para evitar saltos en móvil
  const scrollActual = window.scrollY;

  renderizarDevops();
  renderizarFeed();
  renderizarInformes();

  // Restaurar posición de scroll
  window.scrollTo(0, scrollActual);

  mostrarToast(`Faena en ${faena.parcelaNombre} movida a "${estadoNormalizado}"`);
};

// Generador de Tarjeta de Tarea en Histórico
function generarTarjetaFaenaHtml(f) {
  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => (s || '');
  const safeId = (window.HuertoSecurity && window.HuertoSecurity.sanitizeId) ? window.HuertoSecurity.sanitizeId(f.id) : f.id;
  const opDisplay = mapearNombresOperarios(f.operarios || f.usuario, f);

  // Badge químico si aplica
  let quimicoHtml = '';
  if (f.quimicoProducto) {
    quimicoHtml = `
      <div class="feed-quimicos-badge" style="margin-top:0.4rem;">
        <span>${icono('flask')}</span>
        <strong>${esc(f.quimicoProducto)}</strong>
        ${f.quimicoDosis ? `(${esc(f.quimicoDosis)})` : ''}
      </div>
    `;
  }

  const estadoActual = normalizarEstado(f.estado);

  return `
    <div class="feed-card" draggable="true" ondragstart="onFaenaDragStart(event, '${safeId}')" id="card-${safeId}">
      <div class="feed-header">
        <div class="feed-title-wrap">
          <strong>${esc(f.parcelaNombre)}</strong>
          <div class="feed-meta">
            <span>${icono('user')} ${esc(opDisplay)}</span>
            <span>·</span>
            <span>${icono('calendar')} ${esc(formatFecha(f.fecha))}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; justify-content:flex-end;">
          <span class="feed-task-badge">${icono('tractor')} ${esc(f.tipoFaena)}</span>
          <span class="col-count-pill" style="background:var(--accent-fondo); color:var(--accent-fuerte); font-size:0.75rem;">Tarea</span>
        </div>
      </div>

      ${quimicoHtml}

      ${f.notas ? `<div class="feed-notas" style="margin-top:0.5rem;">"${esc(f.notas)}"</div>` : ''}

      <div class="card-status-bar">
        <div class="status-bar-header">
          <span>Estado:</span>
          <span style="font-weight:700; color: ${estadoActual === 'Pendientes' ? 'var(--aviso)' : 'var(--accent-fuerte)'}">
            ${estadoActual === 'Pendientes' ? icono('clock') + ' Pendiente' : icono('check-circle') + ' Finalizada'}
          </span>
        </div>
        <div class="status-btn-group">
          <button type="button" 
                  class="btn-status ${estadoActual === 'Pendientes' ? 'active pendientes' : ''}" 
                  onclick="cambiarEstadoFaena('${safeId}', 'Pendientes', event)" 
                  title="Marcar como Pendiente">
            ${icono('clock')} Pendiente
          </button>
          <button type="button" 
                  class="btn-status ${estadoActual === 'Finalizadas' ? 'active finalizadas' : ''}" 
                  onclick="cambiarEstadoFaena('${safeId}', 'Finalizadas', event)" 
                  title="Marcar como Finalizada">
            ${icono('check-circle')} Finalizada
          </button>
        </div>
      </div>
    </div>
  `;
}

// Generador de Tarjeta de Informe en Histórico
function generarTarjetaInformeHtml(inf) {
  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => (s || '');
  const safeId = (window.HuertoSecurity && window.HuertoSecurity.sanitizeId) ? window.HuertoSecurity.sanitizeId(inf.id) : inf.id;
  const opDisplay = mapearNombresOperarios(inf.operarios || inf.usuario, inf);

  const CC = getCampoCarlos();
  const analisis = CC.analizarRegistro(inf);

  // Tags de plagas (distinguiendo daño vs presencia)
  let tagsPlagasHtml = '';
  if (analisis.plagas && analisis.plagas.length > 0) {
    analisis.plagas.forEach(p => {
      const cls = p.presencia === 'ausente' ? 'tratamiento' : 'alerta';
      const icon = p.presencia === 'ausente' ? icono('flask') : icono('warning');
      const danosStr = p.danos && p.danos !== 'desconocido' ? ` · daños: ${p.danos}` : '';
      const text = p.presencia === 'ausente' ? `Sin plaga viva (${p.nombre}${danosStr})` : `${p.nombre} (${p.presencia}${danosStr})`;
      tagsPlagasHtml += `<span class="tag-plaga ${cls}">${icon} ${esc(text)}</span>`;
    });
  } else if (analisis.sinPlagas) {
    tagsPlagasHtml += `<span class="tag-plaga limpio">${icono('check-circle')} Sin plagas detectadas</span>`;
  }

  // Tag hierba
  let tagHierbaHtml = '';
  if (analisis.hierba) {
    const niv = analisis.hierba.nivel;
    const cls = (niv === 'limpio' || niv === 'sin-hierba') ? 'limpio' : ((niv === 'baja' || niv === 'poca-hierba') ? 'poca' : 'mucha');
    const label = (niv === 'limpio' || niv === 'sin-hierba') ? 'Sin hierba' : ((niv === 'baja' || niv === 'poca-hierba') ? 'Poca hierba' : 'Mucha hierba');
    tagHierbaHtml += `<span class="tag-hierba ${cls}">${icono('leaf')} Hierba: ${esc(label + textoZonasHierba(analisis.hierba))}</span>`;
  }

  // Tag riego
  let tagRiegoHtml = '';
  if (analisis.riego) {
    const niv = analisis.riego.nivel;
    const cls = niv === 'correcto' ? 'limpio' : (niv.includes('fuga') || niv === 'sin-agua' ? 'alerta' : 'poca');
    let label = 'Correcto';
    if (niv === 'fuga-leve') label = 'Fuga leve';
    else if (niv === 'fuga-grave') label = 'Fuga grave';
    else if (niv === 'sin-agua') label = 'Sin agua';
    else if (niv === 'revisar') label = 'Revisión necesaria';
    tagRiegoHtml += `<span class="tag-riego ${cls}">${icono('drop')} Riego: ${esc(label)}</span>`;
  }

  // Tareas vinculadas generadas desde este informe
  const tareasVinculadas = estado.faenas.filter(t => t.informeId === inf.id);
  const totalTareas = Math.max(tareasVinculadas.length, (inf.tareasPendientes || []).length);
  const tareasPendientesCount = tareasVinculadas.filter(t => normalizarEstado(t.estado) === 'Pendientes').length;

  let tareasBlockHtml = '';
  if (totalTareas > 0) {
    tareasBlockHtml = `
      <div class="informe-tareas-block" style="margin-top:0.75rem; padding:0.6rem; background:var(--aviso-fondo); border-radius:var(--radius-sm); border:1px solid var(--aviso-linea);">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; font-weight:600;">
          <span>${icono('clipboard')} Tareas generadas por el informe (${totalTareas})</span>
          <span style="font-size:0.75rem; color:${tareasPendientesCount > 0 ? 'var(--aviso)' : 'var(--accent-fuerte)'};">
            ${tareasPendientesCount > 0 ? `${tareasPendientesCount} pendiente(s)` : `${icono('check-circle')} Todas realizadas`}
          </span>
        </div>
        <div style="margin-top:0.4rem; display:flex; flex-direction:column; gap:0.35rem;">
          ${tareasVinculadas.map(t => {
            const safeTid = (window.HuertoSecurity && window.HuertoSecurity.sanitizeId) ? window.HuertoSecurity.sanitizeId(t.id) : t.id;
            const esPend = normalizarEstado(t.estado) === 'Pendientes';
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; background:var(--bg-card); padding:0.35rem 0.5rem; border-radius:var(--radius-xs);">
                <span>${esPend ? icono('clock') : icono('check-circle')} <strong>${esc(t.tipoFaena)}:</strong> ${esc(t.notas ? t.notas.replace(/^Tarea generada desde informe:\s*/, '') : 'Trabajo')}</span>
                ${esPend ? `<button type="button" class="btn-secondary-xs" onclick="cambiarEstadoFaena('${safeTid}', 'Finalizadas', event)">Marcar Hecha</button>` : `<span style="color:var(--accent-fuerte); font-size:0.75rem; font-weight:600;">Completada</span>`}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="feed-card informe-card" id="card-${safeId}">
      <div class="feed-header">
        <div class="feed-title-wrap">
          <strong>${esc(inf.parcelaNombre)}</strong>
          <div class="feed-meta">
            <span>${icono('user')} ${esc(opDisplay)}</span>
            <span>·</span>
            <span>${icono('calendar')} ${formatFecha(inf.fecha)}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; justify-content:flex-end;">
          <span class="feed-task-badge" style="background:var(--info-fondo); color:var(--info); border:1px solid var(--info-linea);">${icono('note')} Informe de Estado</span>
        </div>
      </div>

      <div class="feed-tags-row" style="margin-top:0.5rem; display:flex; gap:0.4rem; flex-wrap:wrap;">
        ${tagRiegoHtml}
        ${tagHierbaHtml}
        ${tagsPlagasHtml}
      </div>

      ${inf.notas ? `<div class="feed-notas" style="margin-top:0.5rem;">"${esc(inf.notas)}"</div>` : ''}
      ${botonFotosHtml(inf)}

      ${tareasBlockHtml}
    </div>
  `;
}

// 1. Renderizar Muro Histórico (Unifica Tareas e Informes en estricto orden cronológico)
function renderizarFeed(filtroHuerto, filtroUsuario, filtroTipo) {
  const container = document.getElementById('feed-container');
  const countBadge = document.getElementById('count-faenas');
  if (!container) return;

  const huertoSel = filtroHuerto !== undefined ? filtroHuerto : (document.getElementById('filtro-huerto-feed')?.value || 'todos');
  const usuarioSel = filtroUsuario !== undefined ? filtroUsuario : (document.getElementById('filtro-usuario-feed')?.value || 'todos');
  const tipoSel = filtroTipo !== undefined ? filtroTipo : (document.getElementById('filtro-tipo-feed')?.value || 'todos');

  // Ordenar TODOS los registros cronológicamente inverso (más reciente primero)
  let registrosFiltrados = estado.faenas.slice().sort((a, b) => {
    const fA = a.fecha || '0000-00-00';
    const fB = b.fecha || '0000-00-00';
    if (fA !== fB) return fB.localeCompare(fA);
    const hA = a.hora || '12:00';
    const hB = b.hora || '12:00';
    return hB.localeCompare(hA);
  });

  if (huertoSel !== 'todos') {
    registrosFiltrados = registrosFiltrados.filter(f => f.parcelaId === huertoSel);
  }
  if (usuarioSel !== 'todos') {
    registrosFiltrados = registrosFiltrados.filter(f => 
      f.usuarioId === usuarioSel || 
      (Array.isArray(f.operarios) && f.operarios.includes(usuarioSel)) || 
      (Array.isArray(f.operarios) && f.operarios.some(op => {
        const u = USUARIOS.find(x => x.id === usuarioSel);
        return u && (op === u.codigo || op === u.id || op.toLowerCase() === u.nombre.toLowerCase());
      })) ||
      f.usuario === usuarioSel ||
      (f.usuario && f.usuario.toLowerCase().includes(usuarioSel))
    );
  }
  if (tipoSel === 'tarea' || tipoSel === 'faena') {
    registrosFiltrados = registrosFiltrados.filter(f => !esInforme(f));
  } else if (tipoSel === 'informe') {
    registrosFiltrados = registrosFiltrados.filter(f => esInforme(f));
  }

  const nTareas = registrosFiltrados.filter(f => !esInforme(f)).length;
  const nInformes = registrosFiltrados.filter(f => esInforme(f)).length;

  if (countBadge) {
    countBadge.innerText = `${registrosFiltrados.length} registros (${nTareas} tareas · ${nInformes} informes)`;
  }

  if (registrosFiltrados.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-lg);">
        <p style="font-size:2rem; margin-bottom:0.5rem;">${icono('clipboard')}</p>
        <p>No hay tareas ni informes con estos filtros en el histórico.</p>
        <button class="btn-new-task" style="margin-top:1rem;" onclick="abrirNuevaFaena()">+ Registrar Nueva Tarea o Informe</button>
      </div>
    `;
    return;
  }

  container.innerHTML = registrosFiltrados.map(item => {
    return esInforme(item) ? generarTarjetaInformeHtml(item) : generarTarjetaFaenaHtml(item);
  }).join('');
}



window.filtrarFeedPorHuerto = function(huertoId) {
  const usuario = document.getElementById('filtro-usuario-feed')?.value || 'todos';
  const plaga = document.getElementById('filtro-plaga-feed')?.value || 'todos';
  renderizarFeed(huertoId, usuario, plaga);
};

window.filtrarFeedPorUsuario = function(usuarioId) {
  const huerto = document.getElementById('filtro-huerto-feed')?.value || 'todos';
  const plaga = document.getElementById('filtro-plaga-feed')?.value || 'todos';
  renderizarFeed(huerto, usuarioId, plaga);
};

window.filtrarFeedPorPlaga = function(plagaId) {
  const huerto = document.getElementById('filtro-huerto-feed')?.value || 'todos';
  const usuario = document.getElementById('filtro-usuario-feed')?.value || 'todos';
  renderizarFeed(huerto, usuario, plagaId);
};

// 1b. Renderizar Muro Histórico de Informes de Estado y Revisiones
function renderizarInformes(filtroHuerto, filtroUsuario, filtroTipo) {
  const container = document.getElementById('informes-container');
  const countBadge = document.getElementById('count-informes');
  if (!container) return;

  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => (s || '');
  const sanitizeId = (window.HuertoSecurity && window.HuertoSecurity.sanitizeId) ? window.HuertoSecurity.sanitizeId : s => s;

  const huertoSel = filtroHuerto !== undefined ? filtroHuerto : (document.getElementById('filtro-huerto-informes')?.value || 'todos');
  const usuarioSel = filtroUsuario !== undefined ? filtroUsuario : (document.getElementById('filtro-usuario-informes')?.value || 'todos');
  const tipoSel = filtroTipo !== undefined ? filtroTipo : (document.getElementById('filtro-tipo-informes')?.value || 'todos');

  // Filtrar exclusivamente informes
  let informesFiltrados = estado.faenas.filter(f => esInforme(f)).sort((a, b) => {
    const fA = a.fecha || '0000-00-00';
    const fB = b.fecha || '0000-00-00';
    return new Date(`${fB} ${b.hora || '12:00'}`) - new Date(`${fA} ${a.hora || '12:00'}`);
  });

  if (huertoSel !== 'todos') {
    informesFiltrados = informesFiltrados.filter(f => f.parcelaId === huertoSel);
  }
  if (usuarioSel !== 'todos') {
    informesFiltrados = informesFiltrados.filter(f => 
      f.usuarioId === usuarioSel || 
      (Array.isArray(f.operarios) && f.operarios.includes(usuarioSel)) || 
      f.usuario === usuarioSel
    );
  }
  if (tipoSel === 'con-plagas') {
    informesFiltrados = informesFiltrados.filter(f => {
      const CC = getCampoCarlos();
      const a = CC.analizarRegistro(f);
      return a.plagas && a.plagas.some(p => p.presencia !== 'ausente');
    });
  } else if (tipoSel === 'limpio') {
    informesFiltrados = informesFiltrados.filter(f => {
      const CC = getCampoCarlos();
      const a = CC.analizarRegistro(f);
      return a.sinPlagas || (a.plagas && a.plagas.every(p => p.presencia === 'ausente'));
    });
  } else if (tipoSel === 'con-pendientes') {
    informesFiltrados = informesFiltrados.filter(f => {
      const linked = estado.faenas.filter(t => t.informeId === f.id);
      return (f.tareasPendientes && f.tareasPendientes.length > 0) || linked.length > 0;
    });
  }

  if (countBadge) {
    countBadge.innerText = `${informesFiltrados.length} informes`;
  }

  if (informesFiltrados.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-lg);">
        <p style="font-size:2rem; margin-bottom:0.5rem;">${icono('note')}</p>
        <p>No hay informes de estado con estos filtros.</p>
        <button class="btn-new-task" style="margin-top:1rem;" onclick="abrirNuevoInforme()">+ Registrar Informe de Estado</button>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  informesFiltrados.forEach(inf => {
    const safeId = sanitizeId(inf.id);
    const card = document.createElement('div');
    card.className = 'feed-card informe-card';
    card.id = `informe-${safeId}`;

    const CC = getCampoCarlos();
    const analisis = CC.analizarRegistro(inf);

    // Tags de plagas
    let tagsPlagasHtml = '';
    if (analisis.plagas && analisis.plagas.length > 0) {
      analisis.plagas.forEach(p => {
        const cls = p.presencia === 'ausente' ? 'tratamiento' : 'alerta';
        const icon = p.presencia === 'ausente' ? icono('flask') : icono('warning');
        const danosStr = p.danos && p.danos !== 'desconocido' ? ` · daños: ${p.danos}` : '';
        tagsPlagasHtml += `<span class="tag-plaga ${cls}">${icon} ${esc(p.nombre)} (${esc(p.presencia)}${esc(danosStr)})</span>`;
      });
    } else if (analisis.sinPlagas) {
      tagsPlagasHtml += `<span class="tag-plaga limpio">${icono('check-circle')} Sin plagas</span>`;
    }

    // Tag hierba
    let tagHierbaHtml = '';
    if (analisis.hierba) {
      const niv = analisis.hierba.nivel;
      const cls = niv === 'limpio' ? 'limpio' : (niv === 'baja' ? 'poca' : 'mucha');
      tagHierbaHtml += `<span class="tag-hierba ${cls}">${icono('leaf')} Hierba: ${esc(niv + textoZonasHierba(analisis.hierba))}</span>`;
    }

    // Tag riego
    let tagRiegoHtml = '';
    if (analisis.riego) {
      const niv = analisis.riego.nivel;
      const cls = niv === 'correcto' ? 'limpio' : (niv.includes('fuga') ? 'alerta' : 'poca');
      tagRiegoHtml += `<span class="tag-riego ${cls}">${icono('drop')} Riego: ${esc(niv)}</span>`;
    }

    // Tareas vinculadas generadas desde este informe
    const tareasVinculadas = estado.faenas.filter(t => t.informeId === inf.id);
    const totalTareas = Math.max(tareasVinculadas.length, (inf.tareasPendientes || []).length);
    const tareasPendientesCount = tareasVinculadas.filter(t => normalizarEstado(t.estado) === 'Pendientes').length;

    let tareasBlockHtml = '';
    if (totalTareas > 0) {
      tareasBlockHtml = `
        <div class="informe-tareas-block" style="margin-top:0.75rem; padding:0.6rem; background:var(--aviso-fondo); border-radius:var(--radius-sm); border:1px solid var(--aviso-fondo);">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; font-weight:600;">
            <span>${icono('clipboard')} Tareas Vinculadas al Informe (${totalTareas})</span>
            <span style="font-size:0.75rem; color:${tareasPendientesCount > 0 ? 'var(--aviso)' : 'var(--accent-fuerte)'};">
              ${tareasPendientesCount > 0 ? `${icono('clock')} ${tareasPendientesCount} pendiente${tareasPendientesCount > 1 ? 's' : ''}` : icono('check-circle') + ' Todas completadas'}
            </span>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.35rem; margin-top:0.4rem;">
            ${tareasVinculadas.map(t => `
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; background:var(--bg-card); padding:0.35rem 0.6rem; border-radius:4px;">
                <span>${esc(t.tipoFaena)}: ${esc(t.notas || t.id)}</span>
                <span style="font-size:0.7rem; font-weight:700; color:${normalizarEstado(t.estado) === 'Pendientes' ? 'var(--aviso)' : 'var(--accent-fuerte)'};">
                  ${normalizarEstado(t.estado) === 'Pendientes' ? icono('clock') + ' Pendiente' : icono('check-circle') + ' Hecho'}
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    const operariosDisplay = inf.operarios && inf.operarios.length > 0 ? mapearNombresOperarios(inf.operarios) : (inf.usuario || 'Carlos');

    card.innerHTML = `
      <div class="feed-header">
        <div class="feed-title-wrap">
          <strong>${esc(inf.parcelaNombre)}</strong>
          <div class="feed-meta">
            <span>${icono('user')} ${esc(operariosDisplay)}</span>
            <span>·</span>
            <span>${icono('calendar')} ${formatFecha(inf.fecha)}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; justify-content:flex-end;">
          <span class="feed-task-badge" style="background:var(--info-fondo); color:var(--info);">${icono('note')} ${esc(inf.tipoFaena || 'Informe de Estado')}</span>
        </div>
      </div>

      <div class="feed-tags-row" style="margin-top:0.5rem; display:flex; gap:0.4rem; flex-wrap:wrap;">
        ${tagRiegoHtml}
        ${tagHierbaHtml}
        ${tagsPlagasHtml}
      </div>

      ${inf.notas ? `<div class="feed-notas" style="margin-top:0.5rem;">"${esc(inf.notas)}"</div>` : ''}
      ${botonFotosHtml(inf)}

      ${tareasBlockHtml}
    `;

    container.appendChild(card);
  });
}

window.filtrarInformesPorHuerto = function(huertoId) {
  const usuario = document.getElementById('filtro-usuario-informes')?.value || 'todos';
  const tipo = document.getElementById('filtro-tipo-informes')?.value || 'todos';
  renderizarInformes(huertoId, usuario, tipo);
};

window.filtrarInformesPorUsuario = function(usuarioId) {
  const huerto = document.getElementById('filtro-huerto-informes')?.value || 'todos';
  const tipo = document.getElementById('filtro-tipo-informes')?.value || 'todos';
  renderizarInformes(huerto, usuarioId, tipo);
};

window.filtrarInformesPorTipo = function(tipoId) {
  const huerto = document.getElementById('filtro-huerto-informes')?.value || 'todos';
  const usuario = document.getElementById('filtro-usuario-informes')?.value || 'todos';
  renderizarInformes(huerto, usuario, tipoId);
};

window.abrirNuevoInforme = function(parcelaIdPrevia = null) {
  const tabBtn = document.querySelector('[data-tab="tab-nueva"]');
  if (tabBtn) tabBtn.click();
  if (typeof cambiarTipoRegistroFormulario === 'function') {
    cambiarTipoRegistroFormulario('informe');
  }
  if (parcelaIdPrevia) {
    const sel = document.getElementById('faena-huerto');
    if (sel) sel.value = parcelaIdPrevia;
  }
};

// 1c. Renderizar Trabajo Diario (Tablero DevOps Kanban 2 Columnas: Pendientes y Finalizadas)
function renderizarDevops(filtroHuerto, filtroUsuario, filtroPeriodo) {
  const container = document.getElementById('devops-kanban-container');
  const countBadge = document.getElementById('count-devops');
  if (!container) return;

  const huertoSel = filtroHuerto !== undefined ? filtroHuerto : (document.getElementById('filtro-huerto-devops')?.value || 'todos');
  const usuarioSel = filtroUsuario !== undefined ? filtroUsuario : (document.getElementById('filtro-usuario-devops')?.value || 'todos');
  const periodoSel = filtroPeriodo !== undefined ? filtroPeriodo : (document.getElementById('filtro-periodo-devops')?.value || 'todos');

  // Incluir tareas e informes ordenados cronológicamente
  let faenasFiltradas = estado.faenas.slice().sort((a, b) => {
    const fA = a.fecha || '0000-00-00';
    const fB = b.fecha || '0000-00-00';
    return new Date(`${fB} ${b.hora || '12:00'}`) - new Date(`${fA} ${a.hora || '12:00'}`);
  });

  if (huertoSel !== 'todos') {
    faenasFiltradas = faenasFiltradas.filter(f => f.parcelaId === huertoSel);
  }
  if (usuarioSel !== 'todos') {
    faenasFiltradas = faenasFiltradas.filter(f => 
      f.usuarioId === usuarioSel || 
      (Array.isArray(f.operarios) && f.operarios.includes(usuarioSel)) || 
      (Array.isArray(f.operarios) && f.operarios.some(op => {
        const u = USUARIOS.find(x => x.id === usuarioSel);
        return u && (op === u.codigo || op === u.id || op.toLowerCase() === u.nombre.toLowerCase());
      })) ||
      f.usuario === usuarioSel ||
      (f.usuario && f.usuario.toLowerCase().includes(usuarioSel))
    );
  }
  if (periodoSel !== 'todos') {
    faenasFiltradas = faenasFiltradas.filter(f => f.fecha && f.fecha.startsWith(periodoSel));
  }

  const nPendTotal = faenasFiltradas.filter(f => !esInforme(f) && normalizarEstado(f.estado) === 'Pendientes').length;
  const nFinTotal = faenasFiltradas.filter(f => normalizarEstado(f.estado) === 'Finalizadas').length;

  if (countBadge) {
    countBadge.innerText = `${faenasFiltradas.length} registros (${nPendTotal} pend. · ${nFinTotal} fin.)`;
  }

  if (faenasFiltradas.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-lg);">
        <p style="font-size:2rem; margin-bottom:0.5rem;">${icono('bolt')}</p>
        <p>No hay tareas ni informes registrados en Trabajo Diario con estos filtros.</p>
        <button class="btn-new-task" style="margin-top:1rem;" onclick="abrirNuevaFaena()">+ Nueva Tarea</button>
      </div>
    `;
    return;
  }

  // Agrupar registros por Año y Mes (usando f.fecha YYYY-MM)
  const gruposMes = new Map();
  faenasFiltradas.forEach(f => {
    const clave = (f.fecha && f.fecha.length >= 7) ? f.fecha.slice(0, 7) : 'sin-fecha';
    if (!gruposMes.has(clave)) {
      gruposMes.set(clave, {
        clave: clave,
        info: obtenerInfoMesAno(f.fecha),
        faenas: []
      });
    }
    gruposMes.get(clave).faenas.push(f);
  });

  // Ordenar grupos de mes de más reciente a más antiguo
  const clavesOrdenadas = Array.from(gruposMes.keys()).sort().reverse();

  if (!acordeonInicializado && periodoSel === 'todos') {
    clavesOrdenadas.forEach((clave, idx) => {
      if (idx > 0) {
        const faenasGrupo = gruposMes.get(clave).faenas;
        const tieneActivas = faenasGrupo.some(f => normalizarEstado(f.estado) !== 'Finalizadas');
        if (!tieneActivas) {
          mesesColapsados.add(clave);
        }
      }
    });
    acordeonInicializado = true;
  }

  let htmlGrupos = '';

  clavesOrdenadas.forEach(clave => {
    const grupo = gruposMes.get(clave);
    const faenasGrupo = grupo.faenas;

    const pendientes = faenasGrupo.filter(f => !esInforme(f) && normalizarEstado(f.estado) === 'Pendientes');
    const finalizadas = faenasGrupo.filter(f => normalizarEstado(f.estado) === 'Finalizadas');

    const estaColapsado = (periodoSel === 'todos') ? mesesColapsados.has(clave) : false;

    const tarjetasPendientesHtml = pendientes.length === 0
      ? `<div class="kanban-empty-col">Sin tareas pendientes</div>`
      : pendientes.map(generarTarjetaFaenaHtml).join('');

    const tarjetasFinalizadasHtml = finalizadas.length === 0
      ? `<div class="kanban-empty-col">Sin tareas ni informes finalizados</div>`
      : finalizadas.map(f => esInforme(f) ? generarTarjetaInformeHtml(f) : generarTarjetaFaenaHtml(f)).join('');

    htmlGrupos += `
      <div class="kanban-month-group ${estaColapsado ? 'collapsed' : ''}" id="month-group-${clave}" data-periodo="${clave}">
        <div class="kanban-month-header" onclick="toggleMesAcordeon('${clave}')">
          <div class="kanban-month-title">
            <span style="font-size:1.2rem;">${icono('calendar')}</span>
            <h3>${grupo.info.etiqueta}</h3>
            <span class="month-summary-badge">${faenasGrupo.length} registros</span>
            ${pendientes.length > 0 ? `<span class="col-count-pill" style="background:var(--aviso-fondo); color:var(--aviso); font-size:0.7rem;">${icono('clock')} ${pendientes.length} pend.</span>` : ''}
            ${finalizadas.length > 0 ? `<span class="col-count-pill" style="background:var(--accent-fondo); color:var(--accent-fuerte); font-size:0.7rem;">${icono('check-circle')} ${finalizadas.length} fin.</span>` : ''}
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="toggle-arrow">▼</span>
          </div>
        </div>

        <div class="kanban-month-body">
          <!-- Selector rápido de columna para móvil -->
          <div class="mobile-col-switcher" id="switcher-${clave}">
            <button type="button" class="col-switch-btn active" data-target="Pendientes" onclick="scrollHaciaColumna('${clave}', 'Pendientes')">
              ${icono('clock')} Pendientes (${pendientes.length})
            </button>
            <button type="button" class="col-switch-btn" data-target="Finalizadas" onclick="scrollHaciaColumna('${clave}', 'Finalizadas')">
              ${icono('check-circle')} Realizadas (${finalizadas.length})
            </button>
          </div>

          <!-- Tablero Kanban de 2 columnas -->
          <div class="kanban-board" id="board-${clave}">
            
            <!-- Columna 1: Tareas Pendientes -->
            <div class="kanban-column col-pendientes" id="col-${clave}-Pendientes" 
                 ondragover="onFaenaDragOver(event)" ondragleave="onFaenaDragLeave(event)" ondrop="onFaenaDrop(event, 'Pendientes')">
              <div class="kanban-column-header">
                <div class="kanban-column-title-wrap">
                  <span>${icono('clock')}</span>
                  <h4>Tareas Pendientes</h4>
                </div>
                <span class="col-count-pill">${pendientes.length}</span>
              </div>
              <div class="kanban-cards-list" id="cards-${clave}-Pendientes">
                ${tarjetasPendientesHtml}
              </div>
            </div>

            <!-- Columna 2: Tareas Realizadas e Informes -->
            <div class="kanban-column col-finalizadas" id="col-${clave}-Finalizadas"
                 ondragover="onFaenaDragOver(event)" ondragleave="onFaenaDragLeave(event)" ondrop="onFaenaDrop(event, 'Finalizadas')">
              <div class="kanban-column-header">
                <div class="kanban-column-title-wrap">
                  <span>${icono('check-circle')}</span>
                  <h4>Realizadas / Informes</h4>
                </div>
                <span class="col-count-pill">${finalizadas.length}</span>
              </div>
              <div class="kanban-cards-list" id="cards-${clave}-Finalizadas">
                ${tarjetasFinalizadasHtml}
              </div>
            </div>

          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = htmlGrupos;
}

window.filtrarDevopsPorHuerto = function(huertoId) {
  const usuario = document.getElementById('filtro-usuario-devops')?.value || 'todos';
  const periodo = document.getElementById('filtro-periodo-devops')?.value || 'todos';
  renderizarDevops(huertoId, usuario, periodo);
};

window.filtrarDevopsPorUsuario = function(usuarioId) {
  const huerto = document.getElementById('filtro-huerto-devops')?.value || 'todos';
  const periodo = document.getElementById('filtro-periodo-devops')?.value || 'todos';
  renderizarDevops(huerto, usuarioId, periodo);
};

window.filtrarDevopsPorPeriodo = function(periodo) {
  const huerto = document.getElementById('filtro-huerto-devops')?.value || 'todos';
  const usuario = document.getElementById('filtro-usuario-devops')?.value || 'todos';
  renderizarDevops(huerto, usuario, periodo);
};

// 2. Renderizar Catálogo de Parcelas (Baseline - Protegido Anti-XSS)
function renderizarParcelas() {
  const grid = document.getElementById('parcelas-grid');
  if (!grid) return;

  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => (s || '');
  const sanitizeId = (window.HuertoSecurity && window.HuertoSecurity.sanitizeId) ? window.HuertoSecurity.sanitizeId : s => s;

  grid.innerHTML = '';
  estado.parcelas.forEach(p => {
    const safeId = sanitizeId(p.id);
    // Buscar última faena realizada en esta parcela
    const faenasDeEsta = estado.faenas
      .filter(f => f.parcelaId === p.id)
      .sort((a, b) => new Date(`${b.fecha} ${b.hora || '12:00'}`) - new Date(`${a.fecha} ${a.hora || '12:00'}`));
    
    const ultima = faenasDeEsta[0];

    const card = document.createElement('div');
    card.className = 'parcela-card';
    card.onclick = () => verDetalleParcela(safeId);

    card.innerHTML = `
      <div class="parcela-head">
        <div class="parcela-title">
          <h3>${esc(p.nombre)}</h3>
          <span style="font-size:0.75rem; color:var(--accent-fuerte); font-weight:600;">${esc(p.superficie)}</span>
        </div>
        <span style="font-size:1.4rem;">${icono('citrus')}</span>
      </div>

      <div class="parcela-specs-grid">
        <div class="spec-item">
          <span>Variedad</span>
          <strong>${esc(p.variedad || 'Sin especificar')}</strong>
        </div>
        <div class="spec-item">
          <span>Patrón</span>
          <strong>${esc(p.patron || 'Sin patrón')}</strong>
        </div>
        <div class="spec-item">
          <span>Marco</span>
          <strong>${esc(p.marco || '-')}</strong>
        </div>
        <div class="spec-item">
          <span>Árboles</span>
          <strong>${p.arboles ? `${esc(p.arboles)} pies` : '-'}</strong>
        </div>
      </div>

      <div class="parcela-footer">
        <span>${ultima ? `Última: ${esc(ultima.tipoFaena)} (${esc(formatFecha(ultima.fecha))})` : 'Sin partes registrados'}</span>
        <strong style="color:var(--accent-fuerte);">Ver Ficha ${icono('arrow-right')}</strong>
      </div>
    `;
    grid.appendChild(card);
  });
}

// 3. Renderizar Selectores en Formulario y Filtros (Protegido Anti-XSS)
function renderizarSelectoresHuertos() {
  const selForm = document.getElementById('faena-huerto');
  const selFeed = document.getElementById('filtro-huerto-feed');
  const selFeedUser = document.getElementById('filtro-usuario-feed');

  const selInformesHuerto = document.getElementById('filtro-huerto-informes');
  const selInformesUser = document.getElementById('filtro-usuario-informes');

  const selDevops = document.getElementById('filtro-huerto-devops');
  const selDevopsUser = document.getElementById('filtro-usuario-devops');
  const selDevopsPeriodo = document.getElementById('filtro-periodo-devops');

  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => (s || '');
  const sanitizeId = (window.HuertoSecurity && window.HuertoSecurity.sanitizeId) ? window.HuertoSecurity.sanitizeId : s => s;

  if (selForm) {
    selForm.innerHTML = estado.parcelas.map(p => `
      <option value="${sanitizeId(p.id)}">${esc(p.nombre)}</option>
    `).join('');
  }

  const optionsHuertos = `
    <option value="todos">Todos los huertos (${estado.parcelas.length})</option>
    ${estado.parcelas.map(p => `<option value="${sanitizeId(p.id)}">${esc(p.nombre)}</option>`).join('')}
  `;

  if (selFeed) selFeed.innerHTML = optionsHuertos;
  if (selInformesHuerto) selInformesHuerto.innerHTML = optionsHuertos;
  if (selDevops) selDevops.innerHTML = optionsHuertos;

  const optionsUsers = `
    <option value="todos">Todos los operarios</option>
    ${USUARIOS.map(u => `<option value="${esc(u.id)}">${u.codigo ? `[${esc(u.codigo)}] ` : ''}${esc(u.nombre)}</option>`).join('')}
  `;

  if (selFeedUser) selFeedUser.innerHTML = optionsUsers;
  if (selInformesUser) selInformesUser.innerHTML = optionsUsers;
  if (selDevopsUser) selDevopsUser.innerHTML = optionsUsers;

  if (selDevopsPeriodo) {
    const periodosMap = new Map();
    estado.faenas.forEach(f => {
      if (f.fecha && f.fecha.length >= 7) {
        const clave = f.fecha.slice(0, 7);
        periodosMap.set(clave, (periodosMap.get(clave) || 0) + 1);
      }
    });

    const periodosOrdenados = Array.from(periodosMap.keys()).sort().reverse();
    const valorSeleccionado = selDevopsPeriodo.value || 'todos';

    selDevopsPeriodo.innerHTML = `
      <option value="todos">${icono('calendar')} Todos los periodos (${estado.faenas.length})</option>
      ${periodosOrdenados.map(p => {
        const info = obtenerInfoMesAno(`${p}-01`);
        const total = periodosMap.get(p);
        return `<option value="${esc(p)}">${esc(info.etiqueta)} (${total})</option>`;
      }).join('')}
    `;

    if (periodosMap.has(valorSeleccionado) || valorSeleccionado === 'todos') {
      selDevopsPeriodo.value = valorSeleccionado;
    }
  }
}

let operariosSeleccionadosIds = new Set(['carlos']);

function renderizarOperariosChips() {
  const chipsWrap = document.getElementById('operarios-chips');
  if (!chipsWrap) return;

  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => (s || '');
  const sanitizeId = (window.HuertoSecurity && window.HuertoSecurity.sanitizeId) ? window.HuertoSecurity.sanitizeId : s => s;

  if (operariosSeleccionadosIds.size === 0 && estado.usuarioActivo) {
    operariosSeleccionadosIds.add(estado.usuarioActivo.id);
  }

  chipsWrap.innerHTML = USUARIOS.map(u => {
    const safeId = sanitizeId(u.id);
    const activo = operariosSeleccionadosIds.has(safeId);
    return `
      <button type="button" class="user-chip-btn ${activo ? 'active' : ''}" 
              onclick="toggleChipOperario('${safeId}')" id="chip-user-${safeId}">
        ${u.avatar || ''} ${u.codigo ? `<strong>[${esc(u.codigo)}]</strong> ` : ''}${esc(u.nombre)}
      </button>
    `;
  }).join('');
}

window.toggleChipOperario = function(id) {
  if (operariosSeleccionadosIds.has(id)) {
    if (operariosSeleccionadosIds.size > 1) {
      operariosSeleccionadosIds.delete(id);
    }
  } else {
    operariosSeleccionadosIds.add(id);
  }
  renderizarOperariosChips();
};

window.seleccionarChipOperario = function(id, nombre) {
  window.toggleChipOperario(id);
};

// 4. Renderizar Semáforo de Huertos (Resumen recalculado con CampoCarlos)
function renderizarSemaforo() {
  const container = document.getElementById('resumen-semaforo');
  if (!container) return;

  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => (s || '');
  const sanitizeId = (window.HuertoSecurity && window.HuertoSecurity.sanitizeId) ? window.HuertoSecurity.sanitizeId : s => s;

  container.innerHTML = '';
  const CC = getCampoCarlos();

  estado.parcelas.forEach(p => {
    const safeId = sanitizeId(p.id);
    const registrosParcela = estado.faenas
      .filter(f => f.parcelaId === p.id)
      .sort((a, b) => {
        const fA = a.fecha || '0000-00-00';
        const fB = b.fecha || '0000-00-00';
        return new Date(`${fB} ${b.hora || '12:00'}`) - new Date(`${fA} ${a.hora || '12:00'}`);
      });

    const resumen = CC.resumenParcela(registrosParcela);
    const ultima = registrosParcela[0];

    // 1. Plagas: diferenciar presencia activa viva de solo daños; múltiples plagas simultáneas; eliminación de amenaza si se afirma sin plagas o ausente
    let tagsPlagasHtml = '';
    const plagasActivas = (resumen.plagas || []).filter(plg => plg.presencia && plg.presencia !== 'ausente' && plg.presencia !== 'desconocida');
    const plagasSoloDanos = (resumen.plagas || []).filter(plg => (plg.presencia === 'ausente' || plg.presencia === 'desconocida') && (plg.danos && plg.danos !== 'desconocido' && plg.danos !== 'ninguno' && plg.danos !== 'ausente'));

    if (plagasActivas.length > 0 || plagasSoloDanos.length > 0) {
      plagasActivas.forEach(plg => {
        const danosStr = (plg.danos && plg.danos !== 'desconocido') ? ` · Daños: ${plg.danos}` : '';
        tagsPlagasHtml += `<span class="tag-plaga alerta">${icono('warning')} ${esc(plg.nombre)}: Presencia ${esc(plg.presencia)}${esc(danosStr)}</span>`;
      });
      plagasSoloDanos.forEach(plg => {
        tagsPlagasHtml += `<span class="tag-plaga tratamiento">${icono('info')} ${esc(plg.nombre)}: Daños ${esc(plg.danos)} (Sin plaga viva)</span>`;
      });
    } else if (resumen.sinPlagas || (resumen.plagas && resumen.plagas.length > 0 && resumen.plagas.every(p => p.presencia === 'ausente'))) {
      tagsPlagasHtml = `<span class="tag-plaga limpio">${icono('check-circle')} Sin plagas detectadas (Limpio)</span>`;
    } else {
      tagsPlagasHtml = `<span class="tag-plaga desconocido">${icono('info')} Sin plagas registradas</span>`;
    }

    // 2. Hierba: Sin hierba, Poca hierba, Mucha hierba. Cuando se desbroza/herbicida pasa a Sin hierba
    let tagHierbaHtml = '';
    if (resumen.hierba) {
      const niv = String(resumen.hierba.nivel || '').toLowerCase();
      if (niv === 'limpio' || niv.includes('sin')) {
        tagHierbaHtml = `<span class="tag-hierba limpio">${icono('check-circle')} Sin hierba${esc(textoZonasHierba(resumen.hierba))}</span>`;
      } else if (niv === 'baja' || niv.includes('poca')) {
        tagHierbaHtml = `<span class="tag-hierba poca">${icono('clock')} Poca hierba${esc(textoZonasHierba(resumen.hierba))}</span>`;
      } else {
        tagHierbaHtml = `<span class="tag-hierba mucha">${icono('circle-x')} Mucha hierba${esc(textoZonasHierba(resumen.hierba))}</span>`;
      }
    } else {
      tagHierbaHtml = `<span class="tag-hierba desconocido">${icono('leaf')} Sin datos</span>`;
    }

    // 3. Riego: Correcto, Revisión necesaria, Fuga leve, Fuga grave, Sin agua
    let tagRiegoHtml = '';
    if (resumen.riego) {
      const niv = String(resumen.riego.nivel || '').toLowerCase();
      if (niv === 'correcto') {
        tagRiegoHtml = `<span class="tag-riego limpio">${icono('check-circle')} Correcto</span>`;
      } else if (niv === 'revisar') {
        tagRiegoHtml = `<span class="tag-riego poca">${icono('clock')} Revisión necesaria</span>`;
      } else if (niv === 'fuga-leve') {
        tagRiegoHtml = `<span class="tag-riego alerta">${icono('circle-dot')} Fuga leve</span>`;
      } else if (niv === 'fuga-grave') {
        tagRiegoHtml = `<span class="tag-riego alerta" style="background:var(--peligro-fondo); color:var(--peligro);">${icono('warning')} Fuga grave</span>`;
      } else if (niv === 'sin-agua') {
        tagRiegoHtml = `<span class="tag-riego alerta" style="background:var(--peligro-fondo); color:var(--peligro);">${icono('warning')} Sin agua</span>`;
      } else {
        tagRiegoHtml = `<span class="tag-riego alerta">${icono('drop')} ${esc(niv)}</span>`;
      }
    } else {
      tagRiegoHtml = `<span class="tag-riego desconocido">${icono('drop')} Sin datos</span>`;
    }

    const card = document.createElement('div');
    card.className = 'semaforo-card';
    card.innerHTML = `
      <div class="semaforo-title">
        <div>
          <strong style="font-size:1.05rem;">${esc(p.nombre)}</strong>
          <div style="font-size:0.75rem; color:var(--text-muted);">${esc(p.variedad || 'Cítricos')} · ${esc(p.superficie || '')}</div>
        </div>
        <span style="font-size:1.4rem;">${icono('citrus')}</span>
      </div>

      <div style="font-size:0.8rem; margin-top:0.6rem; display:flex; flex-direction:column; gap:0.4rem;">
        <div><strong>Plagas:</strong> <div style="display:flex; gap:0.3rem; flex-wrap:wrap; margin-top:0.2rem;">${tagsPlagasHtml}</div></div>
        <div><strong>Hierba:</strong> <div style="display:inline-block; margin-top:0.2rem;">${tagHierbaHtml}</div></div>
        <div><strong>Riego:</strong> <div style="display:inline-block; margin-top:0.2rem;">${tagRiegoHtml}</div></div>
        <div style="font-size:0.75rem; color:var(--text-subtle); margin-top:0.2rem;">
          Último registro: ${ultima ? `${esc(formatFecha(ultima.fecha))} (${esc(ultima.tipoFaena)})` : 'Nunca'}
        </div>
      </div>

      <button type="button" class="btn-secondary-sm" onclick="abrirModalEditarResumen('${safeId}')" style="margin-top:0.85rem; width:100%;">
        ${icono('pen')} Editar Estado de este Huerto
      </button>
    `;
    container.appendChild(card);
  });
}

// Control del Modal de Edición de Resumen
window.abrirModalEditarResumen = function(parcelaId) {
  const p = estado.parcelas.find(item => item.id === parcelaId);
  if (!p) return;

  const sanitizeId = (window.HuertoSecurity && window.HuertoSecurity.sanitizeId) ? window.HuertoSecurity.sanitizeId : s => s;
  const safeId = sanitizeId(p.id);

  const inputParcela = document.getElementById('resumen-edit-parcela-id');
  if (inputParcela) inputParcela.value = safeId;

  const titulo = document.getElementById('modal-resumen-titulo');
  if (titulo) titulo.innerText = `Editar Estado: ${p.nombre}`;

  const fechaInput = document.getElementById('resumen-edit-fecha');
  if (fechaInput) {
    fechaInput.value = new Date().toISOString().split('T')[0];
  }

  const CC = getCampoCarlos();
  const registrosParcela = estado.faenas.filter(f => f.parcelaId === p.id);
  const resumen = CC.resumenParcela(registrosParcela);

  // Checkbox sin plagas
  const chkSinPlagas = document.getElementById('resumen-check-sin-plagas');
  if (chkSinPlagas) {
    chkSinPlagas.checked = Boolean(resumen.sinPlagas);
  }

  // Lista de plagas
  const listaPlagas = document.getElementById('resumen-plagas-lista');
  if (listaPlagas) {
    listaPlagas.innerHTML = '';
    if (resumen.plagas && resumen.plagas.length > 0 && !resumen.sinPlagas) {
      resumen.plagas.forEach(plg => {
        anadirFilaPlagaResumen(plg.nombre, plg.presencia, plg.danos);
      });
    }
  }

  // Hierba
  const nivelHierba = nivelHierbaDeEtiqueta(resumen.hierba ? resumen.hierba.nivel : 'limpio');
  ['tira', 'frau'].forEach(zona => {
    const nivelZona = (resumen.hierba && resumen.hierba[zona]) || nivelHierba;
    const radio = document.querySelector(`input[name="resumen-hierba-${zona}"][value="${nivelZona}"]`);
    if (radio) radio.checked = true;
  });

  // Riego
  const nivelRiego = resumen.riego ? resumen.riego.nivel : 'correcto';
  const radioRiego = document.querySelector(`input[name="resumen-riego"][value="${nivelRiego}"]`);
  if (radioRiego) radioRiego.checked = true;

  // Notas
  const notasArea = document.getElementById('resumen-edit-notas');
  if (notasArea) notasArea.value = '';

  const modal = document.getElementById('modal-editar-resumen');
  if (modal) modal.classList.remove('hidden');
};

window.cerrarModalEditarResumen = function() {
  const modal = document.getElementById('modal-editar-resumen');
  if (modal) modal.classList.add('hidden');
};

window.anadirFilaPlagaResumen = function(nombre = '', presencia = 'presente', danos = 'medio') {
  const container = document.getElementById('resumen-plagas-lista');
  if (!container) return;
  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => (s || '');

  // Desmarcar sin plagas al añadir una plaga
  const chkSinPlagas = document.getElementById('resumen-check-sin-plagas');
  if (chkSinPlagas) chkSinPlagas.checked = false;

  const row = document.createElement('div');
  row.className = 'plaga-edit-row';
  row.style.cssText = 'display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-bottom:0.5rem; background:var(--bg-surface); padding:0.5rem; border-radius:var(--radius-sm); border:1px solid var(--border-color);';

  row.innerHTML = `
    <input type="text" class="form-input plaga-nombre-input" placeholder="Nombre plaga (ej: Mosca, Trip...)" value="${esc(nombre)}" style="flex:1.5; min-width:130px;" required>
    <select class="form-select-sm plaga-presencia-select" style="flex:1; min-width:110px;">
      <option value="presente" ${presencia === 'presente' ? 'selected' : ''}>Presente</option>
      <option value="baja" ${presencia === 'baja' ? 'selected' : ''}>Baja</option>
      <option value="media" ${presencia === 'media' ? 'selected' : ''}>Media</option>
      <option value="alta" ${presencia === 'alta' ? 'selected' : ''}>Alta</option>
      <option value="ausente" ${presencia === 'ausente' ? 'selected' : ''}>Ausente / Tratada</option>
      <option value="desconocida" ${presencia === 'desconocida' ? 'selected' : ''}>Desconocida</option>
    </select>
    <select class="form-select-sm plaga-danos-select" style="flex:1; min-width:110px;">
      <option value="desconocido" ${danos === 'desconocido' ? 'selected' : ''}>Daños: Desc.</option>
      <option value="ausente" ${danos === 'ausente' ? 'selected' : ''}>Daños: Ausente</option>
      <option value="bajo" ${danos === 'bajo' ? 'selected' : ''}>Daños: Bajo</option>
      <option value="medio" ${danos === 'medio' ? 'selected' : ''}>Daños: Medio</option>
      <option value="alto" ${danos === 'alto' ? 'selected' : ''}>Daños: Alto</option>
    </select>
    <button type="button" class="btn-close" style="font-size:1rem; padding:0.2rem 0.5rem;" onclick="this.closest('.plaga-edit-row').remove()" title="Eliminar plaga">✕</button>
  `;

  container.appendChild(row);
};

window.toggleSinPlagasResumen = function(checked) {
  if (checked) {
    const container = document.getElementById('resumen-plagas-lista');
    if (container) container.innerHTML = '';
  }
};

window.guardarCorreccionResumen = async function(e) {
  if (e) e.preventDefault();
  const parcelaId = document.getElementById('resumen-edit-parcela-id')?.value;
  const p = estado.parcelas.find(item => item.id === parcelaId);
  if (!p) {
    mostrarToast('Parcela no encontrada', 'danger');
    return;
  }

  const fechaInput = document.getElementById('resumen-edit-fecha');
  const fecha = (fechaInput && fechaInput.value) ? fechaInput.value : new Date().toISOString().split('T')[0];

  const chkSinPlagas = document.getElementById('resumen-check-sin-plagas');
  const sinPlagas = chkSinPlagas ? chkSinPlagas.checked : false;

  const rows = document.querySelectorAll('#resumen-plagas-lista .plaga-edit-row');
  const plagasEstructuradas = [];
  if (!sinPlagas) {
    rows.forEach(r => {
      const nombre = r.querySelector('.plaga-nombre-input')?.value.trim();
      const presencia = r.querySelector('.plaga-presencia-select')?.value || 'presente';
      const danos = r.querySelector('.plaga-danos-select')?.value || 'desconocido';
      if (nombre) {
        plagasEstructuradas.push({
          nombre: nombre,
          presencia: presencia,
          danos: danos,
          evidencia: 'correccion-resumen'
        });
      }
    });
  }

  const hierbaTira = document.querySelector('input[name="resumen-hierba-tira"]:checked')?.value || 'limpio';
  const hierbaFrau = document.querySelector('input[name="resumen-hierba-frau"]:checked')?.value || 'limpio';
  const hierbaNivel = peorHierba(hierbaTira, hierbaFrau);

  const radioRiego = document.querySelector('input[name="resumen-riego"]:checked');
  const riegoNivel = radioRiego ? radioRiego.value : 'correcto';

  const notas = document.getElementById('resumen-edit-notas')?.value.trim() || 'Actualización de estado desde resumen';

  const ahora = new Date();
  const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  const opId = estado.usuarioActivo ? estado.usuarioActivo.id : 'carlos';
  const opNombre = estado.usuarioActivo ? estado.usuarioActivo.nombre : 'Carlos';

  const rawInforme = {
    id: 'informe-' + Date.now(),
    tipoRegistro: 'informe',
    tipoFaena: 'Informe de Estado',
    parcelaId: p.id,
    parcelaNombre: p.nombre,
    fecha: fecha,
    hora: hora,
    operarios: [opId],
    usuario: opNombre,
    usuarioId: opId,
    estado: 'Finalizadas',
    plagas: plagasEstructuradas.map(plg => plg.nombre),
    hierba: etiquetaHierba(hierbaNivel),
    hierbaTira: hierbaTira,
    hierbaFrau: hierbaFrau,
    notas: notas,
    observacionesEstructuradas: {
      plagas: plagasEstructuradas,
      sinPlagas: sinPlagas || (plagasEstructuradas.length === 0),
      hierba: { nivel: hierbaNivel, tira: hierbaTira, frau: hierbaFrau, evidencia: 'correccion-resumen' },
      riego: { nivel: riegoNivel, evidencia: 'correccion-resumen' }
    }
  };

  const informeValidado = (window.HuertoSecurity && window.HuertoSecurity.validateFaena)
    ? window.HuertoSecurity.validateFaena(rawInforme, estado.parcelas)
    : rawInforme;

  estado.faenas.unshift(informeValidado);
  const ok = await guardarDatos();
  if (!ok) return;

  renderizarTodo();
  cerrarModalEditarResumen();
  mostrarToast(`${icono('check')} Estado de ${p.nombre} actualizado cronológicamente`);
};

// ============================================================================
// FORMULARIO DE NUEVA FAENA
// ============================================================================
let tipoFaenaSeleccionada = 'Tratamiento Fitosanitario';
let tipoRegistroFormulario = 'faena';
let tareasPendientesFormulario = [];

function iniciarFormularioFaena() {
  const prevFotos = document.getElementById('fotos-preview');
  if (prevFotos) prevFotos.textContent = '';
  const selHuerto = document.getElementById('faena-huerto');
  if (selHuerto && !selHuerto.dataset.subparcelas) {
    selHuerto.dataset.subparcelas = '1';
    selHuerto.addEventListener('change', actualizarSubparcelasFormulario);
  }
  const dateInput = document.getElementById('faena-fecha');
  if (dateInput && !dateInput.value) {
    const hoy = new Date().toISOString().split('T')[0];
    dateInput.value = hoy;
  }

  // Chips de tipo de faena
  const tipoBtns = document.querySelectorAll('#tipo-faena-chips .chip-btn');
  tipoBtns.forEach(btn => {
    btn.onclick = () => {
      tipoBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tipoFaenaSeleccionada = btn.getAttribute('data-val');

      const seccionQuimicos = document.getElementById('seccion-quimicos');
      if (seccionQuimicos) {
        if (tipoFaenaSeleccionada.includes('Tratamiento') || tipoFaenaSeleccionada.includes('Abonado')) {
          seccionQuimicos.style.display = 'block';
        } else {
          seccionQuimicos.style.display = 'none';
        }
      }
    };
  });
}

// Lugar exacto del informe: "Tot" (todo el huerto) o una subparcela de la tabla INFO de su pestaña
function actualizarSubparcelasFormulario() {
  const sel = document.getElementById('faena-subparcela');
  const huertoId = document.getElementById('faena-huerto')?.value;
  if (!sel) return;
  const p = estado.parcelas.find(x => x.id === huertoId);
  const subs = (p && Array.isArray(p.subparcelas)) ? p.subparcelas.filter(n => n && n !== 'Tot') : [];
  sel.innerHTML = '';
  const tot = document.createElement('option');
  tot.value = 'Tot';
  tot.textContent = 'Tot (todo el huerto)';
  sel.appendChild(tot);
  subs.forEach(n => {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n;
    sel.appendChild(o);
  });
}

window.cambiarTipoRegistroFormulario = function(tipo) {
  tipoRegistroFormulario = tipo;
  const grupoSubparcela = document.getElementById('grupo-subparcela');
  if (grupoSubparcela) grupoSubparcela.style.display = tipo === 'informe' ? 'block' : 'none';
  const seccionFotos = document.getElementById('seccion-fotos-form');
  if (seccionFotos) seccionFotos.style.display = tipo === 'informe' ? 'block' : 'none';
  if (tipo === 'informe') actualizarSubparcelasFormulario();
  const chipFaena = document.getElementById('chip-tipo-faena');
  const chipInforme = document.getElementById('chip-tipo-informe');
  const radioFaena = document.querySelector('input[name="registro-tipo"][value="faena"]');
  const radioInforme = document.querySelector('input[name="registro-tipo"][value="informe"]');

  const titulo = document.getElementById('form-titulo-texto');
  const subtitulo = document.getElementById('form-subtitulo-texto');
  const grupoEstado = document.getElementById('grupo-faena-estado');
  const grupoTipoFaena = document.getElementById('grupo-tipo-faena');
  const seccionQuimicos = document.getElementById('seccion-quimicos');
  const seccionRiego = document.getElementById('seccion-riego-form');
  const seccionPendientes = document.getElementById('seccion-informe-pendientes');
  const labelNotas = document.getElementById('label-faena-notas');
  const btnSubmit = document.getElementById('btn-submit-registro');

  if (tipo === 'informe') {
    if (chipFaena) chipFaena.classList.remove('active');
    if (chipInforme) chipInforme.classList.add('active');
    if (radioInforme) radioInforme.checked = true;

    if (titulo) titulo.innerText = 'Informe de Estado / Revisión';
    if (subtitulo) subtitulo.innerText = 'Registra observaciones de campo, estado de plagas, hierba, riego y genera tareas pendientes vinculadas.';
    if (grupoEstado) grupoEstado.style.display = 'none';
    if (grupoTipoFaena) grupoTipoFaena.style.display = 'none';
    if (seccionQuimicos) seccionQuimicos.style.display = 'none';
    if (seccionRiego) seccionRiego.style.display = 'block';
    if (seccionPendientes) seccionPendientes.classList.remove('hidden');
    if (labelNotas) labelNotas.innerText = 'Observaciones del Informe';
    if (btnSubmit) btnSubmit.innerHTML = '<span>' + icono('save') + ' Guardar Informe y Tareas Vinculadas</span>';
  } else {
    if (chipInforme) chipInforme.classList.remove('active');
    if (chipFaena) chipFaena.classList.add('active');
    if (radioFaena) radioFaena.checked = true;

    if (titulo) titulo.innerText = 'Parte de Faena en Campo';
    if (subtitulo) subtitulo.innerText = 'Rellena en 1 minuto los trabajos y estado del huerto.';
    if (grupoEstado) grupoEstado.style.display = 'block';
    if (grupoTipoFaena) grupoTipoFaena.style.display = 'block';
    if (seccionQuimicos) {
      seccionQuimicos.style.display = (tipoFaenaSeleccionada.includes('Tratamiento') || tipoFaenaSeleccionada.includes('Abonado')) ? 'block' : 'none';
    }
    if (seccionRiego) seccionRiego.style.display = 'none';
    if (seccionPendientes) seccionPendientes.classList.add('hidden');
    if (labelNotas) labelNotas.innerText = 'Observaciones / Notas de Campo';
    if (btnSubmit) btnSubmit.innerHTML = '<span>' + icono('save') + ' Guardar Registro y Publicar</span>';
  }
};

window.anadirTareaPendienteFormulario = function() {
  tareasPendientesFormulario.push({
    titulo: '',
    tipoFaena: 'Reparación / Trabajo'
  });
  renderizarTareasPendientesFormulario();
};

window.eliminarTareaPendienteFormulario = function(index) {
  tareasPendientesFormulario.splice(index, 1);
  renderizarTareasPendientesFormulario();
};

window.actualizarTareaPendienteTitulo = function(index, val) {
  if (tareasPendientesFormulario[index]) {
    tareasPendientesFormulario[index].titulo = val;
  }
};

window.actualizarTareaPendienteTipo = function(index, val) {
  if (tareasPendientesFormulario[index]) {
    tareasPendientesFormulario[index].tipoFaena = val;
  }
};

function renderizarTareasPendientesFormulario() {
  const container = document.getElementById('lista-tareas-pendientes-form');
  if (!container) return;
  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => (s || '');

  if (tareasPendientesFormulario.length === 0) {
    container.innerHTML = `
      <div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:0.6rem; border:1px dashed var(--border-color); border-radius:var(--radius-sm);">
        No hay trabajos pendientes añadidos. Pulsa "+ Añadir Trabajo Pendiente" para especificar qué faenas deben realizarse a raíz de este informe.
      </div>
    `;
    return;
  }

  container.innerHTML = tareasPendientesFormulario.map((t, idx) => `
    <div class="tarea-pendiente-card" style="display:flex; gap:0.5rem; align-items:center; background:var(--bg-surface); padding:0.5rem; border-radius:var(--radius-sm); border-left:3px solid var(--warning); flex-wrap:wrap;">
      <select class="form-select-sm" style="flex:1; min-width:130px;" onchange="actualizarTareaPendienteTipo(${idx}, this.value)">
        <option value="Riego y Reparación" ${t.tipoFaena === 'Riego y Reparación' ? 'selected' : ''}>${icono('drop')} Riego / Fuga</option>
        <option value="Tratamiento Fitosanitario" ${t.tipoFaena === 'Tratamiento Fitosanitario' ? 'selected' : ''}>${icono('flask')} Tratamiento</option>
        <option value="Control de Hierba" ${t.tipoFaena === 'Control de Hierba' ? 'selected' : ''}>${icono('wheat')} Desbroce</option>
        <option value="Poda y Deschuponado" ${t.tipoFaena === 'Poda y Deschuponado' ? 'selected' : ''}>${icono('scissors')} Poda</option>
        <option value="Reparación / Trabajo" ${t.tipoFaena === 'Reparación / Trabajo' ? 'selected' : ''}>${icono('wrench')} Reparación</option>
      </select>
      <input type="text" class="form-input" style="flex:2; min-width:140px;" placeholder="Descripción de la tarea pendiente..."
             value="${esc(t.titulo)}" oninput="actualizarTareaPendienteTitulo(${idx}, this.value)" required>
      <button type="button" class="btn-close" style="font-size:1rem; padding:0.2rem 0.5rem;" onclick="eliminarTareaPendienteFormulario(${idx})" title="Eliminar tarea">✕</button>
    </div>
  `).join('');
}

window.toggleSinPlagasFormulario = function(checked) {
  if (checked) {
    const checkboxes = document.querySelectorAll('#plagas-tickmarks input[name="plagas"]');
    checkboxes.forEach(c => { c.checked = false; });
  }
};

window.alCambiarPlagaFormulario = function() {
  const chkSinPlagas = document.getElementById('check-sin-plagas-form');
  if (chkSinPlagas) {
    const algunMarcado = document.querySelectorAll('#plagas-tickmarks input[name="plagas"]:checked').length > 0;
    if (algunMarcado) {
      chkSinPlagas.checked = false;
    }
  }
};

window.guardarNuevaFaena = async function(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('btn-submit-registro') || e.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const huertoId = document.getElementById('faena-huerto').value;
    const fecha = document.getElementById('faena-fecha').value;
    const huerto = estado.parcelas.find(p => p.id === huertoId);
    if (!huerto) throw new Error('Debes seleccionar un huerto');

    const notas = document.getElementById('faena-notas').value.trim();

    // Multi-operario
    const operarios = operariosSeleccionadosIds.size > 0
      ? Array.from(operariosSeleccionadosIds)
      : (estado.usuarioActivo ? [estado.usuarioActivo.id] : ['carlos']);
    const usuarioNombre = mapearNombresOperarios(operarios, huerto);
    const usuarioIdPrincipal = operarios[0] || 'carlos';

    // Tickmarks de plagas
    const chkSinPlagas = document.getElementById('check-sin-plagas-form');
    const sinPlagasMarcado = chkSinPlagas ? chkSinPlagas.checked : false;
    const checkboxes = document.querySelectorAll('#plagas-tickmarks input[name="plagas"]:checked');
    const plagas = sinPlagasMarcado ? [] : Array.from(checkboxes).map(c => c.value);

    // Hierba en Tira y Frau
    const hierbaTira = nivelHierbaDeEtiqueta(document.querySelector('input[name="hierba-tira"]:checked')?.value);
    const hierbaFrau = nivelHierbaDeEtiqueta(document.querySelector('input[name="hierba-frau"]:checked')?.value);
    const hierba = etiquetaHierba(peorHierba(hierbaTira, hierbaFrau));

    const ahora = new Date();
    const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

    if (tipoRegistroFormulario === 'informe') {
      const radioRiego = document.querySelector('input[name="form-riego"]:checked');
      const nivelRiego = radioRiego ? radioRiego.value : 'correcto';
      const informeId = 'informe-' + Date.now();

      const radioAfectacion = document.querySelector('input[name="plagas-afectacion"]:checked');
      const esSoloDanos = radioAfectacion && radioAfectacion.value === 'danos';

      const plagasEstructuradas = plagas.map(p => ({
        nombre: p,
        presencia: esSoloDanos ? 'ausente' : 'presente',
        danos: esSoloDanos ? 'medio' : 'desconocido',
        evidencia: esSoloDanos ? 'formulario-informe-danos' : 'formulario-informe-presencia'
      }));

      const tareasValidas = tareasPendientesFormulario.filter(t => t.titulo && t.titulo.trim().length > 0);

      const rawInforme = {
        id: informeId,
        tipoRegistro: 'informe',
        tipoFaena: 'Informe de Estado',
        parcelaId: huertoId,
        parcelaNombre: huerto.nombre,
        subparcela: document.getElementById('faena-subparcela')?.value || 'Tot',
        fotos: await leerFotosFormulario(),
        fecha: fecha,
        hora: hora,
        operarios: operarios,
        usuario: usuarioNombre,
        usuarioId: usuarioIdPrincipal,
        estado: 'Finalizadas',
        plagas: plagas,
        hierba: hierba,
        hierbaTira: hierbaTira,
        hierbaFrau: hierbaFrau,
        notas: notas,
        observacionesEstructuradas: {
          plagas: plagasEstructuradas,
          sinPlagas: sinPlagasMarcado || (plagas.length === 0),
          hierba: {
            nivel: peorHierba(hierbaTira, hierbaFrau),
            tira: hierbaTira,
            frau: hierbaFrau,
            evidencia: 'formulario-informe'
          },
          riego: { nivel: nivelRiego, evidencia: 'formulario-informe' }
        },
        tareasPendientes: tareasValidas.map((t, idx) => ({
          id: `f-tarea-${Date.now()}-${idx}`,
          titulo: t.titulo.trim(),
          tipoFaena: t.tipoFaena || 'Reparación / Trabajo'
        }))
      };

      const informeValidado = (window.HuertoSecurity && window.HuertoSecurity.validateFaena)
        ? window.HuertoSecurity.validateFaena(rawInforme, estado.parcelas)
        : rawInforme;

      estado.faenas.unshift(informeValidado);

      // Generar tareas vinculadas con estado Pendientes e informeId
      for (const t of informeValidado.tareasPendientes) {
        const rawTarea = {
          id: t.id,
          tipoRegistro: 'faena',
          tipoFaena: t.tipoFaena || 'Reparación / Trabajo',
          parcelaId: huertoId,
          parcelaNombre: huerto.nombre,
          fecha: fecha,
          hora: hora,
          operarios: [...operarios],
          usuario: usuarioNombre,
          usuarioId: usuarioIdPrincipal,
          estado: 'Pendientes',
          informeId: informeId,
          notas: `Tarea generada desde informe: ${t.titulo}. ${notas ? `[Contexto: ${notas}]` : ''}`
        };
        const tareaValidada = (window.HuertoSecurity && window.HuertoSecurity.validateFaena)
          ? window.HuertoSecurity.validateFaena(rawTarea, estado.parcelas)
          : rawTarea;
        estado.faenas.unshift(tareaValidada);
      }

      const ok = await guardarDatos();
      if (!ok) return;

      renderizarTodo();
      tareasPendientesFormulario = [];
      renderizarTareasPendientesFormulario();
      document.getElementById('form-faena').reset();
      iniciarFormularioFaena();

      mostrarToast(`${icono('note')} Informe guardado en ${huerto.nombre} con ${tareasValidas.length} tareas pendientes vinculadas`);

      const tabFeed = document.querySelector('[data-tab="tab-feed"]');
      if (tabFeed) tabFeed.click();

    } else {
      const producto = document.getElementById('faena-quimico-producto')?.value.trim() || '';
      const dosis = document.getElementById('faena-quimico-dosis')?.value.trim() || '';

      // Tratamiento = código T (T1, T22...) o turbo/matxina/herbicida; trampes y abono no (Carlos, 08/10/2026)
      const esTratamiento = window.ParserExcelHuertos
        ? window.ParserExcelHuertos.esTratamientoCarlos(tipoFaenaSeleccionada, `${producto} ${dosis} ${notas}`)
        : /\bt\d+\b|turbo|matxina|maxina|herbicida/i.test(`${tipoFaenaSeleccionada} ${producto}`);

      const rawFaena = {
        id: 'f-' + Date.now(),
        tipoRegistro: 'faena',
        fecha: fecha,
        hora: hora,
        operarios: operarios,
        usuario: usuarioNombre,
        usuarioId: usuarioIdPrincipal,
        parcelaId: huertoId,
        parcelaNombre: huerto.nombre,
        tipoFaena: tipoFaenaSeleccionada,
        estado: 'Finalizadas',
        quimicoProducto: producto,
        quimicoDosis: dosis,
        plagas: plagas,
        esTratamiento: esTratamiento,
        hierba: hierba,
        hierbaTira: hierbaTira,
        hierbaFrau: hierbaFrau,
        notas: notas
      };

      const nuevaFaena = (window.HuertoSecurity && window.HuertoSecurity.validateFaena)
        ? window.HuertoSecurity.validateFaena(rawFaena, estado.parcelas)
        : rawFaena;

      estado.faenas.unshift(nuevaFaena);
      const ok = await guardarDatos();
      if (!ok) return;

      renderizarTodo();
      mostrarToast(`${icono('check')} Tarea registrada con éxito en ${nuevaFaena.parcelaNombre}`);

      document.getElementById('form-faena').reset();
      iniciarFormularioFaena();

      const tabFeed = document.querySelector('[data-tab="tab-feed"]');
      if (tabFeed) tabFeed.click();
    }
  } catch (err) {
    mostrarToast(`${icono('warning')} Error de validación: ${err.message}`, 'danger');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

// ============================================================================
// MODAL DETALLE DE PARCELA (HISTÓRICO COMPLETO - PROTEGIDO ANTI-XSS)
// ============================================================================
window.verDetalleParcela = function(parcelaId) {
  const p = estado.parcelas.find(item => item.id === parcelaId);
  if (!p) return;

  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => (s || '');

  const modal = document.getElementById('modal-detalle-parcela');
  document.getElementById('modal-parcela-nombre').innerText = p.nombre;
  document.getElementById('modal-parcela-baseline').innerText = `${p.superficie || ''} · ${p.ubicacion || ''}`;

  const specsGrid = document.getElementById('modal-parcela-specs');
  const itemsFicha = (Array.isArray(p.fichaTecnica) && p.fichaTecnica.length > 0)
    ? p.fichaTecnica
    : generarFichaTecnicaParcela(p);

  specsGrid.innerHTML = itemsFicha.map(item => `
    <div class="spec-item">
      <span>${esc(item.campo)}:</span>
      <strong>${esc(item.valor)}</strong>
    </div>
  `).join('');

  // 1. Desglose completo de Subparcelas del Excel (Patrón, variedad, marcos de plantación, etc.)
  const subparcelasContainer = document.getElementById('modal-parcela-subparcelas');
  if (subparcelasContainer) {
    if (Array.isArray(p.subparcelasDetalle) && p.subparcelasDetalle.length > 0) {
      subparcelasContainer.innerHTML = `
        <h4 style="margin: 1.25rem 0 0.5rem 0; font-size:1rem; font-weight:700;">
          ${icono('citrus')} Desglose de Subparcelas y Variedades (${p.subparcelasDetalle.length})
        </h4>
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          ${p.subparcelasDetalle.map(sp => {
            const nom = sp.nombre || sp.Nombre || 'Subparcela';
            const var_ = sp['Varietat'] || sp['Variedad'] || sp['Varieteta'] || '';
            const pat_ = sp['Patró'] || sp['Patron'] || sp['Patrón'] || '';
            const mar_ = sp['Marc de Plantació'] || sp['Marco'] || '';
            const sup_ = sp['Superficie Total'] ? `${sp['Superficie Total']} Ha` : (sp['Superficie'] || '');
            const cul_ = sp['Cultiu'] || sp['Cultivo'] || '';
            const mad_ = sp['Madera Intermitja'] && sp['Madera Intermitja'] !== 'No' ? sp['Madera Intermitja'] : '';
            const any_ = sp['Any de plantació'] || sp['anyPlantacio'] || '';
            const cod_ = sp['Codic'] || sp['codic'] || '';

            return `
              <div style="background:var(--bg-surface); padding:0.65rem 0.85rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); font-size:0.825rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                  <strong style="color:var(--accent-fuerte); font-size:0.9rem;">${esc(nom)}</strong>
                  ${sup_ ? `<span style="font-weight:600; color:var(--text-muted);">${esc(sup_)}</span>` : ''}
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:0.4rem; color:var(--ink-2);">
                  ${var_ ? `<div><span style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">Variedad:</span> <strong>${esc(var_)}</strong></div>` : ''}
                  ${pat_ ? `<div><span style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">Patrón:</span> <strong>${esc(pat_)}</strong></div>` : ''}
                  ${mar_ ? `<div><span style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">Marco:</span> <strong>${esc(mar_)}</strong></div>` : ''}
                  ${cul_ ? `<div><span style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">Cultivo:</span> <strong>${esc(cul_)}</strong></div>` : ''}
                  ${any_ ? `<div><span style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">Año:</span> <strong>${esc(any_)}</strong></div>` : ''}
                  ${mad_ ? `<div><span style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">Madera Int.:</span> <strong>${esc(mad_)}</strong></div>` : ''}
                  ${cod_ ? `<div><span style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">Código:</span> <strong>${esc(cod_)}</strong></div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      subparcelasContainer.innerHTML = '';
    }
  }

  // 2. Análisis de Suelo y Fertilidad del Excel
  const analisisContainer = document.getElementById('modal-parcela-analisis');
  if (analisisContainer) {
    if (p.analisisSuelo && Object.keys(p.analisisSuelo).length > 0) {
      const su = p.analisisSuelo;
      analisisContainer.innerHTML = `
        <h4 style="margin: 1.25rem 0 0.5rem 0; font-size:1rem; font-weight:700;">
          ${icono('flask')} Análisis de Suelo y Fertilidad (${esc(su['Fetxa'] ? `Muestreo: ${su['Fetxa']}` : 'Datos de Laboratorio')})
        </h4>
        <div class="parcela-specs-grid" style="grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));">
          ${su['pH'] ? `<div class="spec-item"><span>pH</span><strong>${esc(su['pH'])}</strong></div>` : ''}
          ${su['CE (dS/m)'] ? `<div class="spec-item"><span>Conductividad</span><strong>${esc(su['CE (dS/m)'])} dS/m</strong></div>` : ''}
          ${su['MO (%)'] ? `<div class="spec-item"><span>Mat. Orgánica</span><strong>${esc(su['MO (%)'])} %</strong></div>` : ''}
          ${su['NO3 (mg/kg)'] ? `<div class="spec-item"><span>Nitratos</span><strong>${esc(su['NO3 (mg/kg)'])} mg/kg</strong></div>` : ''}
          ${su['P (mg/kg)'] ? `<div class="spec-item"><span>Fósforo (P)</span><strong>${esc(su['P (mg/kg)'])} mg/kg</strong></div>` : ''}
          ${su['K (mg/kg)'] ? `<div class="spec-item"><span>Potasio (K)</span><strong>${esc(su['K (mg/kg)'])} mg/kg</strong></div>` : ''}
          ${su['Ca (mg/kg)'] ? `<div class="spec-item"><span>Calcio (Ca)</span><strong>${esc(su['Ca (mg/kg)'])} mg/kg</strong></div>` : ''}
          ${su['Mg (mg/kg)'] ? `<div class="spec-item"><span>Magnesio (Mg)</span><strong>${esc(su['Mg (mg/kg)'])} mg/kg</strong></div>` : ''}
          ${su['Arcilla (%)'] ? `<div class="spec-item"><span>Textura</span><strong>${esc(su['Arcilla (%)'])}% Arc / ${esc(su['Arena (%)'] || '0')}% Are</strong></div>` : ''}
        </div>
      `;
    } else {
      analisisContainer.innerHTML = '';
    }
  }

  // Historial de faenas e informes de esta parcela
  const faenasDeEsta = estado.faenas
    .filter(f => f.parcelaId === parcelaId)
    .sort((a, b) => {
      const fA = a.fecha || '0000-00-00';
      const fB = b.fecha || '0000-00-00';
      return new Date(`${fB} ${b.hora || '12:00'}`) - new Date(`${fA} ${a.hora || '12:00'}`);
    });

  const historialContainer = document.getElementById('modal-parcela-historial');

  if (faenasDeEsta.length === 0) {
    historialContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; padding:1rem 0;">Aún no hay registros en este huerto.</p>';
  } else {
    historialContainer.innerHTML = faenasDeEsta.map(f => {
      const isInf = esInforme(f);
      const opDisplay = f.operarios && f.operarios.length > 0 ? mapearNombresOperarios(f.operarios) : (f.usuario || 'Carlos');
      return `
        <div style="background:var(--bg-surface); padding:0.75rem; border-radius:var(--radius-sm); margin-bottom:0.5rem; border-left:3px solid ${isInf ? 'var(--info)' : 'var(--accent)'};">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:700;">
            <span>${isInf ? icono('note') : icono('tractor')}${esc(f.tipoFaena)}</span>
            <span style="color:var(--text-muted); font-size:0.75rem;">${esc(formatFecha(f.fecha))} · ${esc(opDisplay)}</span>
          </div>
          ${f.quimicoProducto ? `<div style="font-size:0.8rem; color:var(--aviso); margin-top:2px;">${icono('flask')} ${esc(f.quimicoProducto)} (${esc(f.quimicoDosis)})</div>` : ''}
          ${f.esTratamiento && f.plagas && f.plagas.length ? `<div style="font-size:0.75rem; color:var(--info); margin-top:2px;">${icono('flask')} Tratamiento plagas: ${f.plagas.map(esc).join(', ')}</div>` : ''}
          ${!f.esTratamiento && f.plagas && f.plagas.length ? `<div style="font-size:0.75rem; color:var(--peligro); margin-top:2px;">${icono('warning')} Plagas detectadas: ${f.plagas.map(esc).join(', ')}</div>` : ''}
          ${f.plagasNegadas && f.plagasNegadas.length && (!f.plagas || !f.plagas.length) ? `<div style="font-size:0.75rem; color:var(--accent-fuerte); margin-top:2px;">${icono('check-circle')} Revisión sin plagas (${f.plagasNegadas.map(esc).join(', ')})</div>` : ''}
          ${f.notas ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">"${esc(f.notas)}"</div>` : ''}
        </div>
      `;
    }).join('');
  }

  modal.classList.remove('hidden');
};

window.cerrarModalParcela = function() {
  document.getElementById('modal-detalle-parcela').classList.add('hidden');
};

// ============================================================================
// MODAL CREAR NUEVO HUERTO (VALIDADO)
// ============================================================================
window.abrirModalNuevaParcela = function() {
  document.getElementById('modal-crear-huerto').classList.remove('hidden');
};

window.cerrarModalCrearHuerto = function() {
  document.getElementById('modal-crear-huerto').classList.add('hidden');
};

window.guardarNuevoHuerto = function(e) {
  e.preventDefault();
  try {
    const rawHuerto = {
      nombre: document.getElementById('nuevo-huerto-nombre').value,
      superficie: document.getElementById('nuevo-huerto-superficie').value,
      variedad: document.getElementById('nuevo-huerto-variedad').value,
      patron: document.getElementById('nuevo-huerto-patron').value,
      marco: document.getElementById('nuevo-huerto-marco').value,
      ubicacion: document.getElementById('nuevo-huerto-ubicacion').value
    };

    const nuevo = (window.HuertoSecurity && window.HuertoSecurity.validateParcela)
      ? window.HuertoSecurity.validateParcela(rawHuerto)
      : { id: 'p-' + Date.now(), ...rawHuerto };

    estado.parcelas.push(nuevo);
    guardarDatos();
    renderizarTodo();
    cerrarModalCrearHuerto();
    mostrarToast(`Huerto "${nuevo.nombre}" guardado con éxito`);
  } catch (err) {
    mostrarToast(`${icono('warning')} Error: ${err.message}`, 'danger');
  }
};

// ============================================================================
// EXPORTACIÓN / IMPORTACIÓN PROTEGIDA Y BÓVEDA SEGURA
// ============================================================================

async function solicitarAutorizacionPin(accionDescripcion, callback) {
  if (!window.HuertoSecurity || !window.HuertoSecurity.tienePinActivo()) {
    return callback();
  }
  const pin = prompt(`${icono('shield')} AUTORIZACIÓN DE SEGURIDAD\n\nPor protección contra extracción no autorizada de datos sensibles, confirma tu PIN para:\n"${accionDescripcion}"`);
  if (pin === null) {
    mostrarToast('Operación cancelada', 'warning');
    return;
  }
  const res = await window.HuertoSecurity.verificarPin(pin);
  if (res.success) {
    callback();
  } else {
    mostrarToast(`${icono('circle-x')} ${res.mensaje || 'PIN incorrecto. Operación bloqueada.'}`, 'danger');
  }
}

// 1. Exportación JSON Protegida con PIN
window.exportarDatosSeguros = function() {
  solicitarAutorizacionPin('Descargar copia de seguridad en archivo JSON', () => {
    const payloadLimpio = (window.HuertoSecurity && window.HuertoSecurity.deepSanitizeObject)
      ? window.HuertoSecurity.deepSanitizeObject(estado)
      : estado;

    const exportObject = {
      _metadatos: {
        tipo: 'Huertos Carlos - Backup Protegido',
        fechaExportacion: new Date().toISOString(),
        usuarioAutorizado: estado.usuarioActivo?.nombre || 'Carlos',
        totalParcelas: estado.parcelas.length,
        totalFaenas: estado.faenas.length
      },
      parcelas: payloadLimpio.parcelas,
      faenas: payloadLimpio.faenas
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObject, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `huertos_carlos_respaldo_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    mostrarToast(icono('check') + ' Copia de seguridad JSON exportada con éxito');
  });
};

window.exportarDatos = window.exportarDatosSeguros;

// 2. Exportación CSV Protegida con PIN y Anti-Inyección de fórmulas para Excel/Calc
window.exportarDatosSegurosCsv = function() {
  if (!estado.faenas || estado.faenas.length === 0) {
    mostrarToast('No hay faenas para exportar a CSV');
    return;
  }

  solicitarAutorizacionPin('Exportar partes de faena a hoja CSV', () => {
    const sanitizeCell = (window.HuertoSecurity && window.HuertoSecurity.sanitizeCsvCell)
      ? window.HuertoSecurity.sanitizeCsvCell
      : val => `"${String(val || '').replace(/"/g, '""')}"`;

    const headers = ['ID', 'Fecha', 'Hora', 'Huerto', 'Operario', 'Tipo Faena', 'Estado', 'Quimico', 'Dosis', 'Plagas', 'Hierba', 'Notas'];
    const rows = [headers.map(h => `"${h}"`).join(',')];

    estado.faenas.forEach(f => {
      const plagasStr = (f.plagas && Array.isArray(f.plagas)) ? f.plagas.join('; ') : '';
      const fila = [
        sanitizeCell(f.id),
        sanitizeCell(f.fecha),
        sanitizeCell(f.hora || ''),
        sanitizeCell(f.parcelaNombre),
        sanitizeCell(f.usuario),
        sanitizeCell(f.tipoFaena),
        sanitizeCell(f.estado || 'Finalizadas'),
        sanitizeCell(f.quimicoProducto || ''),
        sanitizeCell(f.quimicoDosis || ''),
        sanitizeCell(plagasStr),
        sanitizeCell(f.hierba || 'Limpio'),
        sanitizeCell(f.notas || '')
      ];
      rows.push(fila.join(','));
    });

    const csvContent = "\uFEFF" + rows.join('\r\n'); // BOM UTF-8 para Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `huertos_carlos_faenas_seguras_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    mostrarToast(icono('check') + ' CSV exportado con protección anti-inyección');
  });
};

// 3. Exportación de Bóveda Directamente Cifrada (.hcenc)
window.exportarCopiaCifradaBoveda = function() {
  const rawVault = localStorage.getItem('huertos_carlos_vault_v4');
  if (!rawVault) {
    mostrarToast('No hay bóveda cifrada disponible para exportar', 'warning');
    return;
  }
  const blob = new Blob([rawVault], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `huertos_carlos_boveda_cifrada_${new Date().toISOString().split('T')[0]}.hcenc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  mostrarToast(icono('shield-check') + ' Bóveda militar AES-256 exportada (.hcenc)');
};

function parseCsvSimple(text) {
  const p = [];
  let row = [''];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      p.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    p.push(row);
  }
  return p;
}

// 4. Importación Segura (JSON / CSV / Bóveda Cifrada .hcenc)
window.importarDatos = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    mostrarToast(icono('warning') + ' Archivo demasiado grande (máximo 10 MB)', 'danger');
    event.target.value = '';
    return;
  }

  const isEncryptedVault = file.name.endsWith('.hcenc');

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      if (window.HuertoSecurity && window.HuertoSecurity.crearSnapshotSeguridad) {
        window.HuertoSecurity.crearSnapshotSeguridad(STORAGE_KEY);
      }

      if (isEncryptedVault) {
        const pin = prompt('Introduce el PIN con el que se cifró esta copia de bóveda:');
        if (!pin) {
          mostrarToast('Importación cancelada', 'warning');
          return;
        }
        const paquete = window.HuertoSecurity.safeJsonParse(e.target.result);
        const decrypted = await window.HuertoSecurity.decryptData(paquete, pin);
        if (!decrypted || !decrypted.parcelas) {
          throw new Error('Estructura de bóveda no válida');
        }
        estado.parcelas = decrypted.parcelas;
        estado.faenas = decrypted.faenas || [];
        claveSesionActiva = pin;
        sessionStorage.setItem('huertos_carlos_session_pass', pin);
        await window.HuertoSecurity.configurarPinSeguridad(pin);
        await guardarDatos();
        renderizarTodo();
        actualizarEstadoCiberseguridadUI();
        mostrarToast(icono('sparkles') + ' Bóveda cifrada restaurada con éxito');
        return;
      }

      if (file.name.endsWith('.csv')) {
        const text = e.target.result;
        const parsedRows = parseCsvSimple(text);
        if (parsedRows.length <= 1) {
          throw new Error('El archivo CSV no contiene registros válidos');
        }
        let countFaenas = 0;
        for (let i = 1; i < parsedRows.length; i++) {
          const row = parsedRows[i];
          if (!row || row.length < 4 || !row.some(c => c.trim().length > 0)) continue;

          const rawId = row[0]?.trim();
          const fecha = row[1]?.trim() || '';
          const hora = row[2]?.trim() || '';
          const huertoNombre = row[3]?.trim() || '';
          const operarioStr = row[4]?.trim() || 'Carlos';
          const tipoFaena = row[5]?.trim() || 'Faena General';
          const estadoStr = row[6]?.trim() || 'Finalizadas';
          const producto = row[7]?.trim() || '';
          const dosis = row[8]?.trim() || '';
          const plagasStr = row[9]?.trim() || '';
          const hierbaStr = row[10]?.trim() || 'Limpio';
          const notas = row[11]?.trim() || '';

          const pMatch = estado.parcelas.find(p => p.nombre.toLowerCase() === huertoNombre.toLowerCase()) || estado.parcelas[0];
          const operarios = parsearOperarios(operarioStr, null, null);

          const rawFaena = {
            id: rawId ? rawId : ('f-' + Date.now() + '-' + i),
            fecha: fecha,
            hora: hora,
            parcelaId: pMatch ? pMatch.id : 'p-desconocida',
            parcelaNombre: huertoNombre || (pMatch ? pMatch.nombre : 'Huerto'),
            operarios: operarios,
            usuario: operarioStr,
            usuarioId: operarios[0] || 'carlos',
            tipoFaena: tipoFaena,
            estado: normalizarEstado(estadoStr),
            quimicoProducto: producto,
            quimicoDosis: dosis,
            plagas: plagasStr ? plagasStr.split(';').map(s => s.trim()).filter(Boolean) : [],
            hierba: hierbaStr,
            notas: notas
          };

          const validada = (window.HuertoSecurity && window.HuertoSecurity.validateFaena)
            ? window.HuertoSecurity.validateFaena(rawFaena, estado.parcelas)
            : rawFaena;

          const idxExistente = estado.faenas.findIndex(f => f.id === validada.id);
          if (idxExistente >= 0) {
            estado.faenas[idxExistente] = validada;
          } else {
            estado.faenas.push(validada);
          }
          countFaenas++;
        }

        normalizarColeccionesEnMemoria();
        await guardarDatos();
        renderizarTodo();
        actualizarEstadoCiberseguridadUI();
        mostrarToast(`¡Importadas con éxito ${countFaenas} faenas desde archivo CSV!`);
        return;
      }

      const data = (window.HuertoSecurity && window.HuertoSecurity.safeJsonParse)
        ? window.HuertoSecurity.safeJsonParse(e.target.result)
        : JSON.parse(e.target.result);

      if (!data || typeof data !== 'object') {
        throw new Error('Estructura de archivo corrupta o vacía');
      }

      let countParcelas = 0;
      let countFaenas = 0;

      if (data.parcelas && Array.isArray(data.parcelas)) {
        estado.parcelas = data.parcelas.map(p => {
          return (window.HuertoSecurity && window.HuertoSecurity.validateParcela)
            ? window.HuertoSecurity.validateParcela(p)
            : p;
        });
        countParcelas = estado.parcelas.length;
      }

      if (data.faenas && Array.isArray(data.faenas)) {
        estado.faenas = data.faenas.map(f => {
          f.estado = normalizarEstado(f.estado || 'Finalizadas');
          return (window.HuertoSecurity && window.HuertoSecurity.validateFaena)
            ? window.HuertoSecurity.validateFaena(f, estado.parcelas)
            : f;
        });
        countFaenas = estado.faenas.length;
      }

      normalizarColeccionesEnMemoria();
      await guardarDatos();
      renderizarTodo();
      actualizarEstadoCiberseguridadUI();
      mostrarToast(`¡Importados con éxito ${countParcelas} huertos y ${countFaenas} faenas!`);
    } catch (err) {
      console.error('[Ciberseguridad] Error en importación:', err);
      mostrarToast(`${icono('warning')} Error en importación: ${err.message}`, 'danger');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
};

window.deshacerUltimaAccion = function() {
  if (window.HuertoSecurity && window.HuertoSecurity.restaurarSnapshotSeguridad) {
    const ok = window.HuertoSecurity.restaurarSnapshotSeguridad(STORAGE_KEY);
    if (ok) {
      cargarDatos().then(() => {
        renderizarTodo();
        actualizarEstadoCiberseguridadUI();
        mostrarToast(icono('arrow-left') + ' Estado restaurado al punto previo a la importación');
      });
      return;
    }
  }
  mostrarToast('No hay punto de restauración disponible');
};

window.restablecerDatosExcel = function() {
  if (window.SincroSheets && window.SincroSheets.url()) {
    solicitarAutorizacionPin('Recargar todos los datos desde Google Sheets', async () => {
      if (!confirm('¿Recargar todo desde el Excel de Google Sheets?\nLo que no se haya enviado todavía desde este móvil se perderá.')) return;
      if (window.HuertoSecurity && window.HuertoSecurity.crearSnapshotSeguridad) {
        window.HuertoSecurity.crearSnapshotSeguridad(STORAGE_KEY);
      }
      const res = await window.SincroSheets.restaurar();
      mostrarToast(res.ok ? 'Datos recargados desde Google Sheets' : 'No se pudo leer el Excel: ' + (res.motivo || 'sin conexión'), res.ok ? 'success' : 'danger');
    });
    return;
  }
  solicitarAutorizacionPin('Restablecer todos los huertos y faenas al Excel original de Carlos', async () => {
    if (confirm('¿Seguro que deseas restablecer los 30 huertos originales del Excel de Carlos?\n(Se creará una copia de seguridad automática de tu estado actual)')) {
      if (window.HuertoSecurity && window.HuertoSecurity.crearSnapshotSeguridad) {
        window.HuertoSecurity.crearSnapshotSeguridad(STORAGE_KEY);
      }
      estado.parcelas = JSON.parse(JSON.stringify(PARCELAS_INICIALES));
      estado.faenas = JSON.parse(JSON.stringify(FAENAS_INICIALES));
      normalizarColeccionesEnMemoria();
      await guardarDatos();
      renderizarTodo();
      actualizarEstadoCiberseguridadUI();
      mostrarToast('¡Cuaderno restaurado al Excel de Carlos (30 huertos)!');
    }
  });
};

// ============================================================================
// FUNCIONES DE CONTROL DE CIBERSEGURIDAD, INTEGRIDAD Y PRIVACIDAD EN CAMPO
// ============================================================================
function actualizarEstadoCiberseguridadUI() {
  const pinBadge = document.getElementById('pin-status-badge');
  const vaultBadge = document.getElementById('vault-status-badge');
  const btnPin = document.getElementById('btn-gestionar-pin');

  if (window.HuertoSecurity) {
    const tienePin = window.HuertoSecurity.tienePinActivo();
    const tieneBoveda = window.HuertoSecurity.tieneBovedaCifrada();

    if (pinBadge) {
      pinBadge.innerText = tienePin ? 'PIN Protegido' : 'Sin Configurar';
      pinBadge.style.color = tienePin ? 'var(--accent-fuerte)' : 'var(--peligro)';
    }
    if (vaultBadge) {
      vaultBadge.innerHTML = (tieneBoveda || claveSesionActiva) ? icono('shield-check') + ' AES-256 Activo' : icono('shield') + ' Integridad SHA-256';
      vaultBadge.style.color = 'var(--accent-fuerte)';
    }
    if (btnPin) {
      btnPin.innerHTML = tienePin ? icono('key') + ' Cambiar PIN de Acceso' : icono('shield-check') + ' Configurar PIN de Seguridad';
    }
  }
}

window.verificarIntegridadManual = async function() {
  if (window.HuertoSecurity) {
    const hash = localStorage.getItem('huertos_carlos_integrity_hash_v3') || 'Bóveda Cifrada';
    alert(
      `${icono('shield')} REPORTE DE CIBERSEGURIDAD Y PROTECCIÓN DE DATOS\n` +
      `==================================================\n\n` +
      `• Bóveda Local: Cifrado simétrico militar AES-256-GCM + PBKDF2 (100.000 iteraciones)\n` +
      `• Red: solo la propia web y el Excel de Google Sheets (script.google.com)\n` +
      `• Integridad Criptográfica: SHA-256 verificado (${hash.substring(0, 16)}...)\n` +
      `• Prevención de Inyecciones: Anti-XSS y Anti-CSV Formula Injection activos\n` +
      `• Anti-Fuerza Bruta: Rate-limiting y bloqueo exponencial tras intentos fallidos\n` +
      `• Auto-bloqueo: Cierre automático tras 10 min de inactividad o pantalla oculta\n\n` +
      `Estado actual: ${window.HuertoSecurity.tienePinActivo() ? icono('check') + ' Cuaderno 100% Blindado' : icono('warning') + ' Pendiente de configurar PIN'}`
    );
  }
};

window.gestionarPinSeguridad = async function() {
  if (!window.HuertoSecurity) return;
  if (window.HuertoSecurity.tienePinActivo()) {
    const pinActual = prompt('Introduce tu PIN actual para verificar tu identidad:');
    if (pinActual === null) return;
    const check = await window.HuertoSecurity.verificarPin(pinActual);
    if (!check.success) {
      alert(check.mensaje || 'PIN actual incorrecto');
      return;
    }
    const nuevoPin = prompt('Introduce tu NUEVO PIN o Clave Maestra (mínimo 4 caracteres):');
    if (nuevoPin === null) return;
    if (nuevoPin.length < 4) {
      alert('Error: El PIN debe tener al menos 4 caracteres.');
      return;
    }
    const confirmar = prompt('Confirma de nuevo el NUEVO PIN:');
    if (confirmar !== nuevoPin) {
      alert('Los PINs introducidos no coinciden.');
      return;
    }
    await window.HuertoSecurity.configurarPinSeguridad(nuevoPin);
    claveSesionActiva = nuevoPin;
    sessionStorage.setItem('huertos_carlos_session_pass', nuevoPin);
    await guardarDatos();
    actualizarEstadoCiberseguridadUI();
    mostrarToast(icono('key') + ' PIN actualizado y bóveda recifrada con éxito');
  } else {
    mostrarPantallaAutenticacionInicial();
  }
};

function iniciarProteccionPrivacidad() {
  if (window.HuertoSecurity && window.HuertoSecurity.iniciarDetectorInactividad) {
    window.HuertoSecurity.iniciarDetectorInactividad(10, (razon) => {
      window.bloquearCuadernoManual(razon);
    });
  }
}

// ============================================================================
// UTILIDADES
// ============================================================================
// ============================================================================
// SINCRONIZACIÓN CON GOOGLE SHEETS (sincro-sheets.js)
// ============================================================================
let sincroSheetsIniciada = false;

function codigoOperario(id) {
  const u = USUARIOS.find(x => x.id === id);
  if (u && u.codigo) return u.codigo;
  return String(id || '').toUpperCase();
}

function cuadernoBloqueado() {
  const auth = document.getElementById('auth-modal');
  return Boolean(auth && !auth.classList.contains('hidden'));
}

function iniciarSincroSheets() {
  if (sincroSheetsIniciada || !window.SincroSheets || !window.ParserExcelHuertos) return;
  if (necesitaClaveCuaderno() || cuadernoBloqueado()) return;
  sincroSheetsIniciada = true;
  window.SincroSheets.iniciar({
    obtenerEstado: () => (cuadernoBloqueado() ? null : { parcelas: estado.parcelas, faenas: estado.faenas }),
    pedirClave: (motivo) => mostrarModalClave(String(motivo).startsWith('SIN_CLAVE')
      ? 'Carlos aún no ha puesto la contraseña en el Excel (menú Huertos)'
      : 'La contraseña ha cambiado: escribe la nueva'),
    normalizar: (datos) => normalizarColeccionesEnMemoria(datos),
    normalizarEstado: (e) => normalizarEstado(e),
    codigoDe: codigoOperario,
    aplicarEstado: async (parcelas, faenas) => {
      estado.parcelas = parcelas;
      estado.faenas = faenas;
      normalizarColeccionesEnMemoria();
      await guardarDatos({ sinSincronizar: true });
      const scroll = window.scrollY;
      const formularioAbierto = document.activeElement && document.activeElement.closest && document.activeElement.closest('#form-faena');
      if (formularioAbierto) {
        renderizarFeed(); renderizarInformes(); renderizarDevops(); renderizarParcelas(); renderizarSemaforo();
      } else {
        renderizarTodo();
      }
      window.scrollTo(0, scroll);
    },
    avisar: (msg, tipo) => mostrarToast(icono('warning') + ' ' + msg, tipo === 'warning' ? 'danger' : tipo),
    alCambiarEstado: (texto) => {
      const el = document.getElementById('sheets-estado');
      if (el) el.textContent = texto;
    }
  });
}

// ---- Fotos de los informes (Google Drive, nunca el Excel) ----
const MAX_FOTOS = 6;

function comprimirFoto(archivo) {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const max = 1600;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * k);
      lienzo.height = Math.round(img.height * k);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      URL.revokeObjectURL(url);
      resolver({ nombre: String(archivo.name || 'foto.jpg').slice(0, 80), datos: lienzo.toDataURL('image/jpeg', 0.7) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}

async function leerFotosFormulario() {
  const input = document.getElementById('faena-fotos');
  const archivos = input && input.files ? Array.from(input.files).slice(0, MAX_FOTOS) : [];
  const fotos = [];
  for (const a of archivos) fotos.push(await comprimirFoto(a));
  return fotos;
}

window.alCambiarFotosFormulario = function() {
  const input = document.getElementById('faena-fotos');
  const prev = document.getElementById('fotos-preview');
  const n = input && input.files ? input.files.length : 0;
  if (prev) prev.textContent = n ? `${Math.min(n, MAX_FOTOS)} foto(s) seleccionada(s)${n > MAX_FOTOS ? ` (solo se guardan ${MAX_FOTOS})` : ''}` : '';
};

function botonFotosHtml(inf) {
  const n = Array.isArray(inf.fotos) ? inf.fotos.length : 0;
  if (!n) return '';
  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => (s || '');
  return `<button type="button" class="btn-secondary-sm" style="margin-top:0.5rem;" data-id="${esc(inf.id)}" onclick="verFotosInforme(this.dataset.id)">Ver ${n} foto${n > 1 ? 's' : ''}</button>`;
}

window.verFotosInforme = function(id) {
  const inf = estado.faenas.find(f => f.id === id);
  if (!inf || !Array.isArray(inf.fotos)) return;
  const capa = document.createElement('div');
  capa.className = 'modal-overlay';
  capa.style.zIndex = '2000';
  const caja = document.createElement('div');
  caja.className = 'modal-content';
  caja.style.maxHeight = '90vh';
  caja.style.overflowY = 'auto';
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'btn-secondary';
  cerrar.textContent = 'Cerrar';
  cerrar.onclick = () => capa.remove();
  caja.appendChild(cerrar);
  inf.fotos.forEach(f => {
    const img = document.createElement('img');
    img.alt = f.nombre || 'Foto del informe';
    img.style.cssText = 'display:block; width:100%; height:auto; margin-top:0.75rem; border-radius:8px;';
    if (f.datos) {
      img.src = f.datos;
    } else if (f.id && window.SincroSheets) {
      img.alt = 'Cargando foto…';
      window.SincroSheets.obtenerFoto(f.id)
        .then(src => { if (/^data:image\//.test(src)) img.src = src; })
        .catch(() => { img.alt = 'No se pudo cargar la foto'; });
    }
    caja.appendChild(img);
  });
  capa.appendChild(caja);
  capa.addEventListener('click', e => { if (e.target === capa) capa.remove(); });
  document.body.appendChild(capa);
};

window.sincronizarAhora = async function() {
  if (!window.SincroSheets || !window.SincroSheets.url()) {
    mostrarToast('Primero pon el enlace del Excel de Google Sheets', 'danger');
    return;
  }
  const res = await window.SincroSheets.sincronizar();
  if (res.ok) mostrarToast(`${icono('check')} Sincronizado con Google Sheets`);
  else if (res.motivo !== 'en-curso') mostrarToast('No se pudo sincronizar: ' + res.motivo, 'danger');
};

window.configurarEnlaceSheets = function() {
  if (!window.SincroSheets) return;
  solicitarAutorizacionPin('Cambiar el enlace de Google Sheets', () => {
    const nueva = prompt('Enlace de la aplicación web del Excel (termina en /exec).\nDéjalo vacío para desconectar.', window.SincroSheets.url());
    if (nueva === null) return;
    try {
      window.SincroSheets.configurarUrl(nueva);
      mostrarToast(nueva.trim() ? 'Enlace guardado: sincronizando…' : 'Google Sheets desconectado');
    } catch (err) {
      mostrarToast(`${icono('warning')} ${err.message}`, 'danger');
    }
  });
};

function formatFecha(fechaStr) {
  if (!fechaStr || fechaStr === 'sin-fecha' || fechaStr === 'undefined' || fechaStr === 'null') {
    return 'Sin fecha';
  }
  const str = String(fechaStr).trim();
  if (!str) return 'Sin fecha';
  const partes = str.split('-');
  if (partes.length === 3 && partes[0].length === 4) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return str;
}

function mostrarToast(mensaje, tipo = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const esc = (window.HuertoSecurity && window.HuertoSecurity.escapeHtml) ? window.HuertoSecurity.escapeHtml : s => s;

  const toast = document.createElement('div');
  toast.className = 'toast';
  const icon = tipo === 'danger' ? icono('warning') : tipo === 'warning' ? icono('timer') : icono('sprout');
  toast.innerHTML = `<span>${icon}</span> <span>${esc(mensaje)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}
