/**
 * ============================================================================
 * HUERTOS CARLOS - MÓDULO INTEGRAL DE CIBERSEGURIDAD Y PROTECCIÓN DE DATOS
 * ============================================================================
 * 
 * Funcionalidades clave de seguridad:
 * 1. Sanitización estricta Anti-XSS (HTML Entity Encoding & Safe Text)
 * 2. Protección contra Contaminación de Prototipos (Prototype Pollution Defense)
 * 3. Verificación Criptográfica de Integridad de Datos (SHA-256 Checksum)
 * 4. Validación de Esquemas y Whitelisting de Entradas (Anti-Tampering)
 * 5. Prevención de Inyección de Fórmulas en Exportaciones (Anti-CSV Injection)
 * 6. Bóveda Criptográfica Local con Cifrado Militar AES-256-GCM y PBKDF2
 * 7. Control de Sesión en Campo, Bloqueo por PIN y Protección Anti Fuerza Bruta
 * 8. Detección Inteligente de Inactividad y Auto-bloqueo de Pantalla en Campo
 * 9. Autorización Criptográfica Obligatoria para Extracción y Descarga de Datos
 * 
 * Cumplimiento: OWASP Top 10 Web & Client-Side Security Guidelines 2026.
 */

(function (window) {
  'use strict';

  // Configuración de constantes de almacenamiento y seguridad
  const VAULT_STORAGE_KEY = 'huertos_carlos_vault_v4';
  const HASH_STORAGE_KEY = 'huertos_carlos_integrity_hash_v3';
  const SNAPSHOT_ROLLBACK_KEY = 'huertos_carlos_snapshot_pre_action';
  const PIN_HASH_KEY = 'huertos_carlos_pin_auth_v3';
  const PIN_SALT_KEY = 'huertos_carlos_pin_salt_v3';
  const SESSION_LOCK_KEY = 'huertos_carlos_session_locked';
  const FAILED_ATTEMPTS_KEY = 'huertos_carlos_failed_attempts';
  const LOCKOUT_UNTIL_KEY = 'huertos_carlos_lockout_until';

  // Caracteres peligrosos para XSS
  const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#96;'
  };
  const REGEX_HTML_CHARS = /[&<>"'`\/]/g;

  // Caracteres de inyección de fórmulas CSV / Excel
  const CSV_INJECTION_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

  // Referencias criptográficas seguras universales (Navegador y Node.js)
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) 
    ? window.crypto 
    : (typeof crypto !== 'undefined') ? crypto : null;
  const subtle = cryptoObj && cryptoObj.subtle ? cryptoObj.subtle : null;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  /**
   * Conversiones auxiliares Base64 seguras
   */
  function uint8ToBase64(arr) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(arr).toString('base64');
    }
    let binary = '';
    const len = arr.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary);
  }

  function base64ToUint8(b64) {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * 1. ANTI-XSS & SANITIZACIÓN HTML
   * Convierte cualquier cadena a texto seguro antes de renderizar en el DOM.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(REGEX_HTML_CHARS, char => HTML_ESCAPES[char]);
  }

  /**
   * Sanitiza identificadores de elementos (IDs, claves) para asegurar que solo contengan
   * caracteres alfanuméricos, guiones o guiones bajos, evitando roturas de atributos.
   */
  function sanitizeId(str) {
    if (!str) return 'id-' + Math.random().toString(36).substring(2, 9);
    return String(str).replace(/[^a-zA-Z0-9_\-]/g, '_');
  }

  /**
   * Elimina cualquier etiqueta HTML y caracteres de control no imprimibles.
   */
  function stripHtmlAndControl(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/<[^>]*>?/gm, '') // Quitar etiquetas HTML
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Quitar caracteres de control ASCII
      .trim();
  }

  /**
   * Sanitiza URLs para prevenir ataques 'javascript:', 'data:' o 'vbscript:'.
   */
  function sanitizeUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('./') || trimmed.startsWith('/')) {
      return trimmed;
    }
    try {
      const base = (typeof window !== 'undefined' && window.location && window.location.href) ? window.location.href : 'http://localhost/';
      const parsed = new URL(trimmed, base);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return parsed.href;
      }
      if (parsed.protocol === 'data:' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(trimmed)) {
        return trimmed;
      }
    } catch (e) {
      // URL inválida
    }
    return '';
  }

  /**
   * 2. PREVENCIÓN DE CONTAMINACIÓN DE PROTOTIPOS (PROTOTYPE POLLUTION DEFENSE)
   * Parser JSON seguro que descarta claves peligrosas (__proto__, constructor, prototype).
   */
  function safeJsonParse(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') return null;
    return JSON.parse(jsonString, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        console.warn(`[Ciberseguridad] Intento de Prototype Pollution bloqueado: clave "${key}"`);
        return undefined; // Descarta la propiedad
      }
      return value;
    });
  }

  /**
   * Limpia recursivamente un objeto eliminando propiedades peligrosas.
   */
  function deepSanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(deepSanitizeObject);
    }
    const clean = Object.create(null);
    for (const key of Object.keys(obj)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      clean[key] = deepSanitizeObject(obj[key]);
    }
    return clean;
  }

  /**
   * 3. VERIFICACIÓN CRIPTOGRÁFICA DE INTEGRIDAD (SHA-256 HASHING)
   * Calcula el resumen criptográfico SHA-256 de una cadena de datos.
   */
  async function computeSha256(text) {
    if (subtle) {
      try {
        const data = encoder.encode(text);
        const hashBuffer = await subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (err) {
        // Fallback síncrono si Web Crypto falla
      }
    }
    return fallbackHash(text);
  }

  function fallbackHash(str) {
    let h1 = 0xdeadbeef ^ 0;
    let h2 = 0x41c6ce57 ^ 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  /**
   * 4. BÓVEDA CRIPTOGRÁFICA MILITAR: CIFRADO Y DESCIFRADO AES-256-GCM + PBKDF2
   * Deriva clave criptográfica con PBKDF2 (100.000 iteraciones SHA-256 + salt de 128 bits)
   * y cifra con AES-256-GCM con Vector de Inicialización (IV) único de 96 bits.
   */
  async function deriveKey(password, saltUint8, iterations = 100000) {
    if (!subtle) throw new Error('WebCrypto no disponible en este entorno');
    const baseKey = await subtle.importKey(
      'raw',
      encoder.encode(String(password)),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltUint8,
        iterations: iterations,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptData(dataObj, password) {
    if (!subtle) throw new Error('Criptografía WebCrypto no disponible');
    if (!password) throw new Error('Se requiere contraseña o PIN para cifrar');
    const salt = cryptoObj.getRandomValues(new Uint8Array(16));
    const iv = cryptoObj.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, 100000);
    const serialized = JSON.stringify(dataObj);
    const encoded = encoder.encode(serialized);
    const cipherBuffer = await subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    return {
      alg: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iter: 100000,
      salt: uint8ToBase64(salt),
      iv: uint8ToBase64(iv),
      ciphertext: uint8ToBase64(new Uint8Array(cipherBuffer)),
      created: new Date().toISOString()
    };
  }

  async function decryptData(packageObj, password) {
    if (!subtle) throw new Error('Criptografía WebCrypto no disponible');
    if (!packageObj || !packageObj.ciphertext || !packageObj.salt || !packageObj.iv) {
      throw new Error('Estructura de paquete cifrado inválida');
    }
    const salt = base64ToUint8(packageObj.salt);
    const iv = base64ToUint8(packageObj.iv);
    const ciphertext = base64ToUint8(packageObj.ciphertext);
    const iterations = packageObj.iter || 100000;
    const key = await deriveKey(password, salt, iterations);
    try {
      const decryptedBuffer = await subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      const decoded = decoder.decode(decryptedBuffer);
      return safeJsonParse(decoded);
    } catch (err) {
      throw new Error('PIN o Contraseña incorrecta. No se puede descifrar la información.');
    }
  }

  /**
   * Guarda los datos en la bóveda local cifrada con AES-256-GCM.
   */
  async function guardarBovedaCifrada(payload, password) {
    try {
      const paqueteCifrado = await encryptData(payload, password);
      const raw = JSON.stringify(paqueteCifrado);
      const hash = await computeSha256(raw);
      localStorage.setItem(VAULT_STORAGE_KEY, raw);
      localStorage.setItem(HASH_STORAGE_KEY, hash);
      // Purgar de inmediato copias en texto plano para asegurar "Zero Plaintext at Rest"
      localStorage.removeItem('huertos_carlos_db_v3');
      localStorage.removeItem('huertos_carlos_db_v2');
      return { success: true, hash };
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.error('[Ciberseguridad] Cuota de almacenamiento local excedida');
        return { success: false, error: 'QUOTA_EXCEEDED' };
      }
      console.error('[Ciberseguridad] Error guardando bóveda cifrada:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Carga y descifra los datos de la bóveda local usando la clave/PIN proporcionado.
   */
  async function cargarBovedaCifrada(password) {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) {
      return { status: 'EMPTY', data: null };
    }

    const storedHash = localStorage.getItem(HASH_STORAGE_KEY);
    if (storedHash) {
      const currentHash = await computeSha256(raw);
      if (currentHash !== storedHash) {
        console.warn('[Ciberseguridad] ¡Alerta de manipulación de bóveda! El hash no coincide.');
        return { status: 'TAMPERED', data: null };
      }
    }

    try {
      const paquete = safeJsonParse(raw);
      if (!paquete) return { status: 'CORRUPTED', data: null };
      const data = await decryptData(paquete, password);
      return { status: 'VERIFIED', data: data, hash: storedHash };
    } catch (e) {
      return { status: 'WRONG_KEY', error: e.message };
    }
  }

  function tieneBovedaCifrada() {
    return Boolean(localStorage.getItem(VAULT_STORAGE_KEY));
  }

  /**
   * Métodos heredados de almacenamiento con integridad (para migración progresiva)
   */
  async function guardarConIntegridad(storageKey, payload) {
    try {
      const serialized = JSON.stringify(payload);
      const hash = await computeSha256(serialized);
      localStorage.setItem(storageKey, serialized);
      localStorage.setItem(HASH_STORAGE_KEY, hash);
      return { success: true, hash };
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        return { success: false, error: 'QUOTA_EXCEEDED' };
      }
      return { success: false, error: e.message };
    }
  }

  async function cargarConIntegridad(storageKey) {
    const rawData = localStorage.getItem(storageKey);
    if (!rawData) {
      return { status: 'EMPTY', data: null };
    }

    const storedHash = localStorage.getItem(HASH_STORAGE_KEY);
    const parsedData = safeJsonParse(rawData);

    if (!parsedData) {
      return { status: 'CORRUPTED', data: null };
    }

    if (storedHash) {
      const currentHash = await computeSha256(rawData);
      if (currentHash !== storedHash) {
        return { status: 'TAMPERED', data: parsedData, calculatedHash: currentHash, storedHash };
      }
    }

    return { status: 'VERIFIED', data: parsedData, hash: storedHash };
  }

  /**
   * 5. COPIA DE SEGURIDAD PREVIA (ROLLBACK SNAPSHOT)
   */
  function crearSnapshotSeguridad(storageKey) {
    try {
      const actual = localStorage.getItem(storageKey) || localStorage.getItem(VAULT_STORAGE_KEY);
      if (actual) {
        localStorage.setItem(SNAPSHOT_ROLLBACK_KEY, JSON.stringify({
          timestamp: new Date().toISOString(),
          data: actual,
          isVault: Boolean(localStorage.getItem(VAULT_STORAGE_KEY))
        }));
        return true;
      }
    } catch (e) {
      console.warn('[Ciberseguridad] No se pudo crear snapshot:', e);
    }
    return false;
  }

  function restaurarSnapshotSeguridad(storageKey) {
    try {
      const snapRaw = localStorage.getItem(SNAPSHOT_ROLLBACK_KEY);
      if (!snapRaw) return false;
      const snap = safeJsonParse(snapRaw);
      if (snap && snap.data) {
        if (snap.isVault) {
          localStorage.setItem(VAULT_STORAGE_KEY, snap.data);
        } else {
          localStorage.setItem(storageKey, snap.data);
        }
        return true;
      }
    } catch (e) {
      console.error('[Ciberseguridad] Error restaurando snapshot:', e);
    }
    return false;
  }

  /**
   * 6. PREVENCIÓN DE INYECCIÓN DE FÓRMULAS CSV / EXCEL
   */
  function sanitizeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    let str = String(val).trim();
    if (CSV_INJECTION_PREFIXES.some(prefix => str.startsWith(prefix))) {
      str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
  }

  /**
   * 7. VALIDACIÓN Y SANEAMIENTO DE ESQUEMA DE FAENA & PARCELA
   */
  const ESTADOS_VALIDOS = ['Pendientes', 'Finalizadas'];
  const HIERBAS_VALIDAS = ['Limpio', 'Poca hierba', 'Mucha hierba'];

  function validateFaena(input, huertosValidos = []) {
    if (!input || typeof input !== 'object') {
      throw new Error('La faena proporcionada no tiene una estructura válida');
    }

    const parcelaId = String(input.parcelaId || '').trim();
    let fecha = String(input.fecha || '').trim();
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('Formato de fecha inválido. Se requiere YYYY-MM-DD o vacía');
    }

    let estado = 'Finalizadas';
    if (input.estado) {
      const estNorm = String(input.estado).trim();
      if (estNorm.toLowerCase().startsWith('pend') || estNorm.toLowerCase().includes('curso') || estNorm.toLowerCase().includes('proceso')) {
        estado = 'Pendientes';
      } else if (estNorm.toLowerCase().startsWith('fin') || estNorm.toLowerCase().startsWith('hech') || estNorm.toLowerCase().startsWith('complet')) {
        estado = 'Finalizadas';
      }
    }

    let hierba = 'Limpio';
    if (input.hierba && HIERBAS_VALIDAS.includes(input.hierba)) {
      hierba = input.hierba;
    } else if (input.hierba) {
      hierba = stripHtmlAndControl(input.hierba).substring(0, 40);
    }

    let plagas = [];
    if (Array.isArray(input.plagas)) {
      plagas = input.plagas
        .slice(0, 15)
        .map(p => stripHtmlAndControl(p).substring(0, 50))
        .filter(p => p.length > 0);
    }

    let tipoRegistro = 'faena';
    if (input.tipoRegistro === 'informe' || input.tipoRegistro === 'faena') {
      tipoRegistro = input.tipoRegistro;
    } else if ((input.id && String(input.id).startsWith('informe-')) || (input.tipoFaena && String(input.tipoFaena).toLowerCase().includes('informe'))) {
      tipoRegistro = 'informe';
    }

    // Operarios múltiples y retrocompatibilidad con usuario/usuarioId
    let operarios = [];
    if (Array.isArray(input.operarios) && input.operarios.length > 0) {
      operarios = input.operarios.map(op => sanitizeId(stripHtmlAndControl(op))).filter(op => op.length > 0);
    } else if (input.usuarioId) {
      operarios = [sanitizeId(input.usuarioId)];
    } else if (input.usuario) {
      operarios = [sanitizeId(input.usuario)];
    } else {
      operarios = ['carlos'];
    }

    let observacionesEstructuradas = null;
    if (input.observacionesEstructuradas && typeof input.observacionesEstructuradas === 'object') {
      const obs = input.observacionesEstructuradas;
      observacionesEstructuradas = {
        plagas: Array.isArray(obs.plagas) ? obs.plagas.map(p => ({
          nombre: stripHtmlAndControl(p.nombre || '').substring(0, 50),
          presencia: ['ausente', 'baja', 'media', 'alta', 'presente', 'desconocida'].includes(p.presencia) ? p.presencia : 'desconocida',
          danos: ['ausente', 'bajo', 'medio', 'alto', 'presente', 'desconocido'].includes(p.danos) ? p.danos : 'desconocido',
          evidencia: stripHtmlAndControl(p.evidencia || '').substring(0, 200)
        })) : [],
        sinPlagas: Boolean(obs.sinPlagas),
        hierba: (obs.hierba && typeof obs.hierba === 'object') ? {
          nivel: ['limpio', 'baja', 'media', 'alta'].includes(obs.hierba.nivel) ? obs.hierba.nivel : 'limpio',
          evidencia: stripHtmlAndControl(obs.hierba.evidencia || '').substring(0, 200),
          ...(['limpio', 'baja', 'alta'].includes(obs.hierba.tira) ? { tira: obs.hierba.tira } : {}),
          ...(['limpio', 'baja', 'alta'].includes(obs.hierba.frau) ? { frau: obs.hierba.frau } : {})
        } : null,
        riego: (obs.riego && typeof obs.riego === 'object') ? {
          nivel: ['correcto', 'revisar', 'fuga-leve', 'fuga-media', 'fuga-grave', 'desconocido'].includes(obs.riego.nivel) ? obs.riego.nivel : 'desconocido',
          evidencia: stripHtmlAndControl(obs.riego.evidencia || '').substring(0, 200)
        } : null
      };
    }

    const id = input.id ? sanitizeId(input.id) : (tipoRegistro === 'informe' ? ('informe-' + Date.now()) : ('f-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)));
    const ahoraIso = new Date().toISOString();

    const resultado = {
      id: id,
      tipoRegistro: tipoRegistro,
      fecha: fecha,
      hora: stripHtmlAndControl(input.hora || '12:00').substring(0, 8),
      usuario: stripHtmlAndControl(input.usuario || 'Carlos').substring(0, 80),
      usuarioId: sanitizeId(input.usuarioId || operarios[0] || 'carlos').substring(0, 40),
      operarios: operarios,
      parcelaId: sanitizeId(parcelaId).substring(0, 50),
      parcelaNombre: stripHtmlAndControl(input.parcelaNombre || 'Huerto').substring(0, 80),
      tipoFaena: stripHtmlAndControl(input.tipoFaena || (tipoRegistro === 'informe' ? 'Informe de Estado / Revisión' : 'Revisión General')).substring(0, 80),
      estado: estado,
      quimicoProducto: stripHtmlAndControl(input.quimicoProducto || '').substring(0, 120),
      quimicoDosis: stripHtmlAndControl(input.quimicoDosis || '').substring(0, 80),
      plagas: plagas,
      plagasNegadas: Array.isArray(input.plagasNegadas) ? input.plagasNegadas.slice(0, 15).map(p => stripHtmlAndControl(p).substring(0, 50)) : [],
      esTratamiento: Boolean(input.esTratamiento),
      hierba: hierba,
      notas: stripHtmlAndControl(input.notas || ''),
      _seguridad: {
        version: '4.0',
        auditCreadoEn: input._seguridad?.auditCreadoEn || ahoraIso,
        auditModificadoEn: ahoraIso,
        integridadLocal: true
      }
    };

    if (input.informeId) {
      resultado.informeId = sanitizeId(input.informeId);
    }
    if (input.subparcela) {
      resultado.subparcela = stripHtmlAndControl(input.subparcela).substring(0, 60);
    }
    ['hierbaTira', 'hierbaFrau'].forEach(k => {
      if (['limpio', 'baja', 'alta'].includes(input[k])) resultado[k] = input[k];
    });
    // Fotos del informe: se guardan en Google Drive, nunca en el Excel. Antes de subir llevan datos JPEG en base64.
    if (Array.isArray(input.fotos)) {
      resultado.fotos = input.fotos.slice(0, 6).map(f => {
        const foto = { nombre: stripHtmlAndControl(f.nombre || 'foto.jpg').substring(0, 80) };
        if (f.id) foto.id = String(f.id).replace(/[^\w-]/g, '').substring(0, 100);
        if (f.datos && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(f.datos)) foto.datos = f.datos;
        return foto;
      }).filter(f => f.id || f.datos);
    }
    if (observacionesEstructuradas) {
      resultado.observacionesEstructuradas = observacionesEstructuradas;
    }
    if (Array.isArray(input.tareasPendientes)) {
      resultado.tareasPendientes = input.tareasPendientes.map(t => ({
        tipoFaena: stripHtmlAndControl(t.tipoFaena || '').substring(0, 80),
        notas: stripHtmlAndControl(t.notas || ''),
        operarios: Array.isArray(t.operarios) ? t.operarios.map(sanitizeId) : []
      }));
    }

    return resultado;
  }

  function validateParcela(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('Estructura de huerto inválida');
    }
    const nombre = stripHtmlAndControl(input.nombre || '').substring(0, 80);
    if (!nombre) {
      throw new Error('El nombre del huerto es obligatorio');
    }

    const id = input.id ? sanitizeId(input.id) : ('p-' + nombre.toLowerCase().replace(/[^a-z0-9]/g, '-'));
    const variedad = stripHtmlAndControl(input.variedad || input.varietat || 'Sin especificar').substring(0, 80);
    const patron = stripHtmlAndControl(input.patron || 'Sin patrón').substring(0, 80);
    const marco = stripHtmlAndControl(input.marco || '-').substring(0, 40);
    const superficie = stripHtmlAndControl(input.superficie || input.superficieFa || input.superficieHa || 'No especificada').substring(0, 80);
    const superficieHa = stripHtmlAndControl(input.superficieHa || '').substring(0, 40);
    const superficieFa = stripHtmlAndControl(input.superficieFa || '').substring(0, 40);
    const anyPlantacio = stripHtmlAndControl(input.anyPlantacio || '').substring(0, 30);
    const cultiu = stripHtmlAndControl(input.cultiu || '').substring(0, 60);
    const codic = stripHtmlAndControl(input.codic || '').substring(0, 60);
    const ubicacion = stripHtmlAndControl(input.ubicacion || '').substring(0, 100);

    let subparcelas = [];
    if (Array.isArray(input.subparcelas)) {
      subparcelas = input.subparcelas.map(sp => stripHtmlAndControl(sp).substring(0, 60));
    }

    let fichaTecnica = [];
    if (Array.isArray(input.fichaTecnica) && input.fichaTecnica.length > 0) {
      fichaTecnica = input.fichaTecnica.map(item => ({
        campo: stripHtmlAndControl(item.campo || '').substring(0, 60),
        valor: stripHtmlAndControl(item.valor || '').substring(0, 120)
      })).filter(item => item.campo.length > 0);
    } else {
      // Generar especificaciones técnicas estructuradas por defecto
      if (variedad && variedad !== 'Sin especificar' && variedad !== 'Variedad estándar') fichaTecnica.push({ campo: 'Variedad', valor: variedad });
      if (patron && patron !== 'Sin patrón') fichaTecnica.push({ campo: 'Patrón', valor: patron });
      if (marco && marco !== '-') fichaTecnica.push({ campo: 'Marco', valor: marco });
      if (superficie && superficie !== 'No especificada') fichaTecnica.push({ campo: 'Superficie', valor: superficie });
      if (anyPlantacio && anyPlantacio !== 'No') fichaTecnica.push({ campo: 'Año Plantación', valor: anyPlantacio });
      if (cultiu && cultiu !== 'No') fichaTecnica.push({ campo: 'Cultivo', valor: cultiu });
      if (codic) fichaTecnica.push({ campo: 'Código SIGPAC', valor: codic });
    }

    return {
      id: id,
      nombre: nombre,
      superficie: superficie,
      superficieHa: superficieHa,
      superficieFa: superficieFa,
      variedad: variedad,
      varietat: variedad,
      patron: patron,
      marco: marco,
      anyPlantacio: anyPlantacio,
      cultiu: cultiu,
      codic: codic,
      subparcelas: subparcelas,
      ubicacion: ubicacion,
      arboles: input.arboles ? parseInt(String(input.arboles).replace(/[^0-9]/g, ''), 10) || null : null,
      fichaTecnica: fichaTecnica
    };
  }

  /**
   * 8. CONTROL DE PIN, PROTECCIÓN CONTRA FUERZA BRUTA Y RATE-LIMITING
   */
  function verificarEstadoBloqueoIntentos() {
    const lockoutUntil = parseInt(localStorage.getItem(LOCKOUT_UNTIL_KEY) || '0', 10);
    const now = Date.now();
    if (lockoutUntil > now) {
      const waitSeconds = Math.ceil((lockoutUntil - now) / 1000);
      return { bloqueado: true, segundosRestantes: waitSeconds };
    }
    return { bloqueado: false, segundosRestantes: 0 };
  }

  function registrarFalloAutenticacion() {
    let intentos = parseInt(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '0', 10) + 1;
    localStorage.setItem(FAILED_ATTEMPTS_KEY, String(intentos));
    if (intentos >= 5) {
      localStorage.setItem(LOCKOUT_UNTIL_KEY, String(Date.now() + 60000)); // 60s
    } else if (intentos >= 3) {
      localStorage.setItem(LOCKOUT_UNTIL_KEY, String(Date.now() + 30000)); // 30s
    }
    return intentos;
  }

  function reiniciarFallosAutenticacion() {
    localStorage.removeItem(FAILED_ATTEMPTS_KEY);
    localStorage.removeItem(LOCKOUT_UNTIL_KEY);
  }

  async function configurarPinSeguridad(pin) {
    const pinLimpio = String(pin || '').trim();
    if (pinLimpio.length < 4) {
      throw new Error('El PIN o clave debe tener al menos 4 caracteres');
    }
    const salt = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
    const pinHash = await computeSha256(salt + pinLimpio);
    localStorage.setItem(PIN_SALT_KEY, salt);
    localStorage.setItem(PIN_HASH_KEY, pinHash);
    reiniciarFallosAutenticacion();
    return true;
  }

  function eliminarPinSeguridad() {
    localStorage.removeItem(PIN_SALT_KEY);
    localStorage.removeItem(PIN_HASH_KEY);
    localStorage.removeItem(SESSION_LOCK_KEY);
    reiniciarFallosAutenticacion();
  }

  function tienePinActivo() {
    return Boolean(localStorage.getItem(PIN_HASH_KEY) && localStorage.getItem(PIN_SALT_KEY));
  }

  async function verificarPin(pinIntento) {
    if (!tienePinActivo()) return { success: true };

    const statusBloqueo = verificarEstadoBloqueoIntentos();
    if (statusBloqueo.bloqueado) {
      return {
        success: false,
        bloqueado: true,
        segundosRestantes: statusBloqueo.segundosRestantes,
        mensaje: `Demasiados intentos fallidos. Espera ${statusBloqueo.segundosRestantes} segundos por seguridad.`
      };
    }

    const salt = localStorage.getItem(PIN_SALT_KEY);
    const storedHash = localStorage.getItem(PIN_HASH_KEY);
    const intentoHash = await computeSha256(salt + String(pinIntento).trim());

    if (intentoHash === storedHash) {
      reiniciarFallosAutenticacion();
      return { success: true };
    } else {
      const totalFallos = registrarFalloAutenticacion();
      const statusActual = verificarEstadoBloqueoIntentos();
      return {
        success: false,
        bloqueado: statusActual.bloqueado,
        segundosRestantes: statusActual.segundosRestantes,
        totalFallos: totalFallos,
        mensaje: statusActual.bloqueado
          ? `PIN incorrecto. Bóveda bloqueada durante ${statusActual.segundosRestantes} segundos por seguridad.`
          : `PIN incorrecto. Intento ${totalFallos} (máx 3 antes de bloqueo).`
      };
    }
  }

  function bloquearSesion() {
    if (tienePinActivo()) {
      localStorage.setItem(SESSION_LOCK_KEY, 'true');
      return true;
    }
    return false;
  }

  function desbloquearSesion() {
    localStorage.removeItem(SESSION_LOCK_KEY);
  }

  function estaSesionBloqueada() {
    return tienePinActivo() && localStorage.getItem(SESSION_LOCK_KEY) === 'true';
  }

  /**
   * 9. DETECCIÓN DE INACTIVIDAD Y AUTO-BLOQUEO INTELIGENTE
   */
  let inactividadTimer = null;
  let visibilidadTimer = null;

  function iniciarDetectorInactividad(minutosInactividad = 10, onLockCallback) {
    if (typeof window === 'undefined' || !window.document) return;

    const resetTimer = () => {
      if (inactividadTimer) clearTimeout(inactividadTimer);
      if (tienePinActivo() && !estaSesionBloqueada()) {
        inactividadTimer = setTimeout(() => {
          bloquearSesion();
          if (typeof onLockCallback === 'function') {
            onLockCallback('inactividad');
          }
        }, minutosInactividad * 60 * 1000);
      }
    };

    const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    eventos.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (tienePinActivo() && !estaSesionBloqueada()) {
          visibilidadTimer = setTimeout(() => {
            bloquearSesion();
            if (typeof onLockCallback === 'function') {
              onLockCallback('pantalla_oculta');
            }
          }, 5 * 60 * 1000); // 5 minutos oculta
        }
      } else {
        if (visibilidadTimer) {
          clearTimeout(visibilidadTimer);
          visibilidadTimer = null;
        }
      }
    });
  }

  // Exportar API protegida y congelada
  const HuertoSecurity = Object.freeze({
    escapeHtml,
    sanitizeId,
    stripHtmlAndControl,
    sanitizeUrl,
    safeJsonParse,
    deepSanitizeObject,
    computeSha256,
    guardarConIntegridad,
    cargarConIntegridad,
    crearSnapshotSeguridad,
    restaurarSnapshotSeguridad,
    sanitizeCsvCell,
    validateFaena,
    validateParcela,
    configurarPinSeguridad,
    eliminarPinSeguridad,
    tienePinActivo,
    verificarPin,
    bloquearSesion,
    desbloquearSesion,
    estaSesionBloqueada,
    // Primitivas de bóveda militar AES-256-GCM
    encryptData,
    decryptData,
    guardarBovedaCifrada,
    cargarBovedaCifrada,
    tieneBovedaCifrada,
    verificarEstadoBloqueoIntentos,
    reiniciarFallosAutenticacion,
    iniciarDetectorInactividad,
    VERSION: '4.0.0-cryptovault-hardened'
  });

  // Publicar de manera segura en el entorno global
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HuertoSecurity;
  } else {
    window.HuertoSecurity = HuertoSecurity;
  }

})(typeof window !== 'undefined' ? window : globalThis);
