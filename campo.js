/**
 * ============================================================================
 * CAMPO CARLOS - MÓDULO DE ANÁLISIS AGRONÓMICO Y RESUMEN PARCELARIO
 * ============================================================================
 * 
 * Módulo puro UMD (Universal Module Definition) para navegador y Node.js.
 * 
 * Funcionalidades clave:
 * 1. analizarRegistro(registro):
 *    Analiza un informe o faena agrícola individual y extrae de forma conservadora:
 *    - plagas: [{ nombre, presencia, danos, evidencia }]
 *    - sinPlagas: boolean
 *    - hierba: null | { nivel: 'limpio'|'baja'|'media'|'alta', evidencia }
 *    - riego: null | { nivel: 'correcto'|'revisar'|'fuga-leve'|'fuga-media'|'fuga-grave', evidencia }
 * 
 * 2. resumenParcela(registros):
 *    Reduce cronológicamente un conjunto de registros de una parcela, manteniendo
 *    el mismo esquema acumulado de plagas, hierba y riego.
 *    - Respeto estricto del principio conservador: lo no mencionado es desconocido (null/desconocido).
 *    - Solo faenas 'Finalizadas' resuelven hierba (desbrozar/herbicida) y riego (reparar).
 *    - Faenas 'Pendientes' nunca resuelven.
 *    - Informes nuevos globales sin plagas eliminan la presencia activa, conservando daños pasados.
 *    - Daños no presuponen presencia activa viva.
 *    - Diferenciación de tratamientos / tareas preventivas frente a presencia real.
 *    - Gestión de zonas múltiples dentro del mismo informe y negaciones locales sin falsos positivos.
 *    - Soporte e integración de observacionesEstructuradas manuales pre-validadas.
 */

(function (root, factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CampoCarlos = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Constantes de enums permitidos
  const NIVELES_PRESENCIA = ['ausente', 'baja', 'media', 'alta', 'presente', 'desconocida'];
  const NIVELES_DANOS = ['ausente', 'bajo', 'medio', 'alto', 'presente', 'desconocido'];
  const NIVELES_HIERBA = ['limpio', 'baja', 'media', 'alta', 'sin-hierba', 'poca-hierba', 'mucha-hierba'];
  const NIVELES_RIEGO = ['correcto', 'revisar', 'fuga-leve', 'fuga-media', 'fuga-grave', 'sin-agua'];

  // Especies canónicas de plagas en la citricultura de Carlos
  const PLAGAS_CANONICAS = [
    'Araña roja',
    'Pulgón',
    'Ácaro de Texas',
    'Serpeta',
    'Mosca blanca',
    'Piojo rojo',
    'Mosca de la fruta',
    'Trip',
    'Minador',
    'Cotonet'
  ];

  // Jerarquía para resolución de severidad en agregaciones
  const PESO_PRESENCIA = {
    'alta': 5,
    'media': 4,
    'presente': 3,
    'baja': 2,
    'ausente': 1,
    'desconocida': 0
  };

  const PESO_DANOS = {
    'alto': 5,
    'medio': 4,
    'presente': 3,
    'bajo': 2,
    'ausente': 1,
    'desconocido': 0
  };

  /**
   * Normaliza el estado de una faena o informe
   */
  function normalizarEstado(estado) {
    if (!estado) return 'Finalizadas';
    const norm = String(estado).trim().toLowerCase();
    if (norm.startsWith('pend')) return 'Pendientes';
    if (norm.includes('curso') || norm.includes('proceso')) return 'En curso';
    if (norm.startsWith('fin') || norm.startsWith('hech') || norm.startsWith('complet')) return 'Finalizadas';
    return 'Finalizadas';
  }

  /**
   * Determina si un registro es un informe o una faena
   */
  function obtenerTipoRegistro(registro) {
    if (!registro) return 'faena';
    if (registro.tipoRegistro) {
      return String(registro.tipoRegistro).trim().toLowerCase();
    }
    const tipoFaena = String(registro.tipoFaena || '').toLowerCase();
    const id = String(registro.id || '').toLowerCase();
    if (tipoFaena.includes('informe') || id.startsWith('informe-')) {
      return 'informe';
    }
    return 'faena';
  }

  /**
   * Determina si un registro es un trabajo de desbroce / herbicida
   */
  function esTrabajoHerbicidaODesbroce(registro) {
    if (!registro) return false;
    const txt = `${registro.tipoFaena || ''} ${registro.quimicoProducto || ''} ${registro.notas || ''}`.toLowerCase();
    if (/\b(?:no|pendent|pendiente|cal|falta)\b/.test(txt)) return false;
    return /\b(?:herbicida|desbrozar|desbroçar|desbroce|desbrozadora|segar|sega|picar\s+(?:brossa|brosa|herba)|triturar\s+(?:brossa|brosa|herba)|triturado|triturar|motocultor)\b/i.test(txt);
  }

  /**
   * Determina si un registro es un trabajo de reparación de riego
   */
  function esTrabajoReparacionRiego(registro) {
    if (!registro) return false;
    const txt = `${registro.tipoFaena || ''} ${registro.notas || ''}`.toLowerCase();
    if (/\b(?:no|pendent|pendiente|cal|falta)\b/.test(txt)) return false;
    return /\b(?:revisi[oó]n?\s+(?:de\s+)?riego|revisi[oó]n?\s+(?:de\s+)?reg|arreglat\s+goteo|arreglar\s+goteo|reparar\s+goteo|reparar\s+reg|reparar\s+riego|arreglar\s+riego|reparar\s+tub|reparar\s+tubo|arreglar\s+fuga|reparar\s+fuga|reparar\s+fugues|reparaes\s+les\s+fugues|ficar\s+m[eé]s\s+gomes|canviar\s+gomes|arreglat\s+el\s+reg)\b/i.test(txt);
  }

  /**
   * Comprueba si una mención de plaga es puramente preventiva, hipotética o faena
   * ("No atribuir plaga por tratamiento/prevision/vigilar/trampes/turbo")
   */
  function esMencionPreventivaOTratamiento(clausula, textoTotal, registro) {
    const cl = clausula.toLowerCase();
    const isFaena = obtenerTipoRegistro(registro) === 'faena';

    // Faenas fitosanitarias sin notas de observación biológica
    if (isFaena) {
      const notas = String(registro.notas || '').trim();
      const notasPuras = /^(?:-|t\d+|\d+|turbo|ok|fet|hecho|\s*)$/i.test(notas);
      if (notasPuras || registro.esTratamiento) {
        if (!/\b(?:hi\s+ha|es\s+veu|se\s+ve|viva|pres[èe]ncia|mals?|danys?|daños?|afectat|tocat)\b/i.test(notas)) {
          return true;
        }
      }
    }

    // En texto libre: expresiones preventivas, trampas, monitoreo o previsiones
    const patronesPreventivos = [
      /\b(?:turbo\s+(?:ar|cotonet)|fer\s+turbo)\b/i,
      /\b(?:vigilar|cuidar|mirar\s+si\s+ix|mirar\s+si\s+ve|si\s+apareix|si\s+torna)\b/i,
      /\b(?:previsi[oó]n?\s+(?:de\s+)?tractar|pensar\s+en\s+tractar|pensar\s+si\s+tractar)\b/i,
      /\b(?:tractament\s+preventiu|tractar\s+per\s+a\s+la|tractar\s+per\s+al)\b/i,
      /\b(?:posar\s+trampes|col[·.]locar\s+trampes|trampes?\s+(?:de\s+)?(?:mosca|ceratitis))\b/i,
      /\b(?:maxina\s+mosca|cuidar\s+mosca)\b/i
    ];

    for (const pat of patronesPreventivos) {
      if (pat.test(cl)) {
        if (!/\b(?:hi\s+ha|es\s+veu|se\s+ve|viva|mals?\s+de|danys?\s+de|daños?\s+de|afectat|tocat)\b/i.test(cl)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Detecta si una cláusula o texto tiene una negación global de plagas
   * Contempla erratas comunes: "plages", "plsgues", "no presencia de plages", etc.
   */
  function tieneNegacionGlobalPlagas(texto) {
    if (!texto) return false;
    const txt = String(texto).toLowerCase();

    const patrones = [
      /\bno\s+(?:pres[èe]ncia|presencia)\s+de\s+pla(?:g|sg)u?es?\b/i,
      /\bno\s+pla(?:g|sg)u?es?\b/i,
      /\bno\s+(?:hi\s+ha|hia|es\s+veu|se\s+veu|veig|he\s+vist|tenim)\s+pla(?:g|sg)u?es?\b/i,
      /\b(?:sense|sin|quasi\s+zero)\s+pla(?:g|sg)u?es?\b/i,
      /\b(?:net[a]?|limpi[oa]s?)\s+de\s+(?:totes\s+les|todas\s+las|todas)?\s*pla(?:g|sg)u?es?\b/i,
      /\bno\s+(?:es\s+veu|se\s+ve|veig|he\s+vist|hi\s+ha|hay|se\s+ven)\s+plagas?\b/i,
      /\b(?:sense|sin|net|limpio)\s+de\s+plaga\b/i,
      /\bsense\s+plaga\b/i,
      /\bsin\s+plagas?\b/i
    ];

    // A clean subset (plantones, some leaves) is not a clean whole orchard.
    return txt.split(/[.;\n]/).some(cl => patrones.some(p => p.test(cl)) &&
      !/\b(?:plantons?|plantones|plantona|banca|bancada|hojas|fulles|algunos|alguns|zona)\b/.test(cl));
  }

  /**
   * Patrones regex precisos para cada plaga canónica, protegiendo AR/MB/PRC
   */
  function buscarPlagasEnTexto(texto) {
    if (!texto) return [];
    const halladas = [];

    // 1. Araña roja: AR en mayúsculas estricto o términos descriptivos
    const matchARCode = /(?<![a-zA-ZÀ-ÿ0-9])AR(?![a-zA-ZÀ-ÿ0-9])/.test(texto);
    const matchARWord = /\b(?:araña\s+roja|aranya\s+roja|araña|aranya|àcars?|ácaros?|tetranychus)\b/i.test(texto);
    if (matchARCode || matchARWord) {
      halladas.push('Araña roja');
    }

    // 2. Mosca blanca: MB en mayúsculas estricto o mosca blanca / aleurothrixus
    const matchMBCode = /(?<![a-zA-ZÀ-ÿ0-9])MB(?![a-zA-ZÀ-ÿ0-9])/.test(texto);
    const matchMBWord = /\b(?:mosca\s+blanca|aleurothrixus)\b/i.test(texto);
    if (matchMBCode || matchMBWord) {
      halladas.push('Mosca blanca');
    }

    // 3. Piojo rojo: PRC / PR estricto o nombres comunes
    const matchPRCCode = /(?<![a-zA-ZÀ-ÿ0-9])PRC(?![a-zA-ZÀ-ÿ0-9])/.test(texto);
    const matchPRContext = /(?<![a-zA-ZÀ-ÿ0-9])PR(?![a-zA-ZÀ-ÿ0-9])/.test(texto) &&
      /\b(?:poc\s+de|res\s+de|mals?\s+de|pres[èe]ncia\s+de|i\s+ar|i\s+mb)\b/i.test(texto);
    const matchPRWord = /\b(?:piojo\s+rojo(?:\s+de\s+california)?|poll\s+roig|caparreta)\b/i.test(texto) ||
      (/\bpiojo\b/i.test(texto) && !/\bpiojo\s+blanco\b/i.test(texto));
    if (matchPRCCode || matchPRContext || matchPRWord) {
      halladas.push('Piojo rojo');
    }

    // 4. Pulgón
    if (/\b(?:pulg[oó]n|pulgo|afid|aphis)\b/i.test(texto)) {
      halladas.push('Pulgón');
    }

    // 5. Ácaro de Texas
    if (/\b(?:[aá]car(?:o)?\s+de\s+texas|texas|eutetranychus)\b/i.test(texto)) {
      halladas.push('Ácaro de Texas');
    }

    // 6. Serpeta
    if (/\b(?:serpeta|lepidosaphes)\b/i.test(texto)) {
      halladas.push('Serpeta');
    }

    // 7. Mosca de la fruta: ceratitis o mosca de la fruita/fruta, o mosca aislada si no es blanca
    const matchCeratitis = /\b(?:ceratitis(?:\s+capitata)?|mosca\s+de\s+la\s+(?:fruita|fruta))\b/i.test(texto);
    const matchMoscaSola = /\bmosca\b/i.test(texto) && !/\bmosca\s+blanca\b/i.test(texto) && !matchMBCode;
    if (matchCeratitis || (matchMoscaSola && /\b(?:fruita|fruta|picada|ceratitis|capturen|teronges)\b/i.test(texto))) {
      halladas.push('Mosca de la fruta');
    }

    // 8. Trip: trips, tryps, peiró
    if (/\b(?:trips?|tryps?|peiró|peiro|scirtothrips)\b/i.test(texto)) {
      halladas.push('Trip');
    }

    // 9. Minador: minador, minaor, phyllocnistis
    if (/\b(?:minadors?|minaors?|phyllocnistis)\b/i.test(texto)) {
      halladas.push('Minador');
    }

    // 10. Cotonet: cotonet, cotoni, planococcus
    if (/\b(?:cotonet|cotoni|planococcus|pseudococcus)\b/i.test(texto)) {
      halladas.push('Cotonet');
    }

    return halladas;
  }

  /**
   * Analiza una cláusula o fragmento para una especie concreta
   */
  function evaluarEspecieEnClausula(clausula, especie) {
    const cl = clausula.trim();
    let clLower = cl.toLowerCase().replace(/\baranya\b/g, 'araña').replace(/\bmosca blanca\b/g, 'mb').replace(/\bpiojo rojo\b/g, 'prc');
    const aliases = {
      'Araña roja': /\b(?:araña(?: roja)?|ar|acaros?|ácaros?)\b/g,
      'Pulgón': /\b(?:pulg[oó]n|pulgo|afid|aphis)\b/g,
      'Ácaro de Texas': /\b(?:[aá]car(?:o)?\s+de\s+texas|texas|eutetranychus)\b/g,
      'Serpeta': /\b(?:serpeta|lepidosaphes)\b/g,
      'Mosca blanca': /\b(?:mb|aleurothrixus)\b/g,
      'Piojo rojo': /\b(?:prc|poll roig|caparreta)\b/g,
      'Mosca de la fruta': /\b(?:mosca(?: de la (?:fruta|fruita))?|ceratitis)\b/g,
      'Trip': /\b(?:trips?|tryps?|scirtothrips)\b/g,
      'Minador': /\b(?:minador|minaor|phyllocnistis)\b/g,
      'Cotonet': /\b(?:cotonet|planococcus|pseudococcus)\b/g
    };
    for (const [nombre, patron] of Object.entries(aliases)) {
      if (nombre !== especie) clLower = clLower.replace(patron, 'otraespecie');
    }

    // 1. Detección de Daños
    let danos = 'desconocido';
    const hasDanos = /\b(?:mals?|danys?|daños?|afectat|afectats|afectades|afectada|afectado|afectados|tocat|tocada|tocaes|tocats|deforma[de]s|defoliaci[oó])\b/i.test(clLower);
    if (hasDanos) {
      if (/\b(?:no\s+(?:he\s+vist|es\s+veu|se\s+ve|hi\s+ha)\s+daños?|sense\s+(?:mals?|danys?)|sin\s+daños?)\b/i.test(clLower)) {
        danos = 'ausente';
      } else if (/\b(?:molt\s+de\s+mal|molts\s+danys|cr[ií]tic|barbaridad\s+de\s+daño|perder[aá]n\s+el\s+100%|molt\s+afectat|molta\s+defoliaci[oó]|situaci[oó]n?\s+es\s+critica)\b/i.test(clLower)) {
        danos = 'alto';
      } else if (/\b(?:bastant\s+mal|bastants\s+danys|prou\s+mals|daño\s+medio|dany\s+mitj[aà])\b/i.test(clLower)) {
        danos = 'medio';
      } else if (/\b(?:poc\s+mal|pocs\s+danys|daño\s+bajo|daño\s+leve|dany\s+lleu|alguna\s+fulla\s+amb\s+mals?|algo\s+de\s+mal|alguns\s+mals)\b/i.test(clLower)) {
        danos = 'bajo';
      } else {
        danos = 'presente';
      }
    }

    // 2. Detección de Presencia viva / activa
    let presencia = 'desconocida';

    // Negación explícita de presencia viva para esta especie
    // "AR limpio", "sense araña", "no han tingut araña", "no trobe viva", "res de MB", "limpio de araña"
    const esAusente = (
      /\bno\s+(?:hi\s+ha|hay)\b[^.;]*\bni\s+(?:ar|mb|prc|araña|cotonet|mosca|trip|minador|pulg[oó]n|texas|serpeta)\b/i.test(clLower) ||
      /\b(?:ar|mb|prc|cotonet|mosca|trip|minador|pulg[oó]n|texas|serpeta)\s+(?:limpi[oa]|net[a]|controlad[ao]|zero|cero)\b/i.test(clLower) ||
      /\b(?:limpi[oa]s?|net[a]?s?|sense|sin|res\s+de|nada\s+de|cero|zero)\s+(?:gaire\s+|massa\s+|gens\s+de\s+)?(?:de\s+)?(?:ar|mb|prc|araña|aranya|cotonet|mosca|trip|minador|poll|pulg[oó]n|texas|serpeta)\b/i.test(clLower) ||
      /\bno\s+(?:hi\s+ha|hay|es\s+veu|se\s+veu|se\s+ve|veig|he\s+vist|he\s+visto|trobe|t[eé]|tiene|tienen|tenen|queden?|ha\s+tingut)\s+(?:nada\s+de\s+|cap\s+de\s+|ni\s+|gaire\s+)?(?:ar|mb|prc|araña|aranya|cotonet|mosca|trip|minador|pulg[oó]n|texas|serpeta)\b/i.test(clLower) ||
      /\bno\s+(?:trobe|he\s+vist|es\s+veu|se\s+veu)\s+viva?\b/i.test(clLower) ||
      /\bno\s+capturen\s+ceratitis\b/i.test(clLower) ||
      /\bbastante\s+limpios?\s+de\s+(?:ar|araña|mb|cotonet|trip|minador|pulg[oó]n|texas|serpeta)\b/i.test(clLower)
    );

    // "No he trobat apenes AR no es cero" -> presencia: 'baja'
    const esApenes = /\b(?:apenes?|apenas)\s+(?:(?:hi\s+ha|hay|se\s+ven?|es\s+veu)\s+)?(?:ar|araña|mb|prc|cotonet|mosca|trip|minador|pulg[oó]n|texas|serpeta)\b/i.test(clLower);

    if (esAusente && !esApenes) {
      presencia = 'ausente';
    } else if (
      /\b(?:mucha\s+incidencia\s+y\s+presencia|mucha\s+presencia|molta\s+pres[èe]ncia|alta\s+incid[èe]ncia|alta\s+pres[èe]ncia|alta\s+presencia)\b/i.test(clLower) ||
      /\b(?:plen[ao]s?|llen[ao]s?|infestat|infestada)\s+de\s+(?:ar|araña|mb|cotonet|trip|minador)\b/i.test(clLower) ||
      /\b(?:molta|mucha)\s+(?:ar|araña|mb|cotonet|trip|minador)\b/i.test(clLower)
    ) {
      presencia = 'alta';
    } else if (
      /\b(?:pres[èe]ncia\s+m[eè]dia|incid[èe]ncia\s+m[eè]dia|presencia\s+media|incidencia\s+media)\b/i.test(clLower) ||
      /\b(?:bastant|bastante|prou)\s+(?:ar|araña|mb|cotonet|trip|minador)\b/i.test(clLower)
    ) {
      presencia = 'media';
    } else if (
      esApenes ||
      /\b(?:pres[èe]ncia|presencia|incidencia|incidència)[^.;!?\n]{0,35}\b(?:molt\s+baixa|muy\s+baja|baixa|baja|lleu|leve)\b/i.test(clLower) ||
      /\b(?:ar|araña|mb|cotonet|trip|minador)[^.;!?\n]{0,35}\b(?:molt\s+baixa|muy\s+baja|baixa|baja|lleu|leve)\b/i.test(clLower) ||
      /\b(?:algo\s+(?:poc\s+)?de|poc\s+de|poca|poco\s+de)\s+(?:ar|araña|mb|cotonet|trip|minador|prc|pr)\b/i.test(clLower) ||
      /\b(?:algun[ao]?|algunos?|alguns?)\s+(?:ar|araña|mb|cotonet|trip|minador)\b/i.test(clLower) ||
      /\b(?:escasa|escassa)\s+(?:ar|araña|mb|cotonet|trip|minador)\b/i.test(clLower) ||
      /\b(?:soles\s+en\s+algun\s+marge)\b/i.test(clLower) ||
      /\balgun\s+arbre\s+que\s+t[eé]\s+algo\s+de\s+(?:ar|araña)\b/i.test(clLower)
    ) {
      presencia = 'baja';
    } else if (
      /\b(?:hi\s+ha|hay|es\s+veu|se\s+ve)\s+(?:algo\s+de\s+)?(?:ar|araña|mb|cotonet|trip|minador)\b/i.test(clLower) ||
      /\b(?:ar|araña|cotonet)\s+viva?\b/i.test(clLower) ||
      /\bencara\s+hi\s+ha\s+(?:ar|araña|cotonet)\b/i.test(clLower) ||
      /\bpres[èe]ncia\s+de\s+(?:ar|araña|mb|cotonet|trip|minador|prc)\b/i.test(clLower) ||
      /\bpresencia\s+de\s+(?:ar|araña|mb|cotonet|trip|minador|prc)\b/i.test(clLower) ||
      /\bmosca\s+se\s+aguanta\b/i.test(clLower) ||
      /\bt[eé]\s+algo\s+de\s+(?:ar|araña)\b/i.test(clLower)
    ) {
      presencia = 'presente';
    }

    // Uncertain phrases and damaged leaves are not proof of living insects.
    if (/\b(?:no\s+s[eé]\s+(?:de|si)|no\s+se\s+de|potser|tal\s+vez|quiz[aá]s)\b/i.test(clLower)) presencia = 'desconocida';
    return {
      presencia,
      danos,
      evidencia: cl
    };
  }

  /**
   * Divide un texto en oraciones y cláusulas conservando el contexto
   */
  function dividirEnClausulas(texto) {
    if (!texto) return [];
    // Dividir por saltos de línea, punto y coma, punto, o signos de admiración/interrogación
    const partes = texto
      // Separate independent assertions, keeping modifiers such as "pero muy baja".
      .replace(/\s+(?:pero|però|per[oó]|tot i que)\s+(?=(?:no\b|hi\b|hay\b|se\b|es\b|encara\b|sense\b|sin\b))/gi, '. ')
      .replace(/[,;]\s*(?=(?:no\s+(?:hi|he|se|es)|hi\s+ha|hay\b|sense\b|sin\b|algo\b|poc[ao]?\b|molta?\b))/gi, '. ')
      .replace(/\s+[iy]\s+(?=(?:hi\s+ha|hay\b|pres[èe]ncia\b|presencia\b|no\s+(?:hi|se|es)|algo\b|poc[ao]?\b|molta?\b))/gi, '. ')
      .replace(/([.:;!?\n]+)/g, '$1\u00A7')
      .split('\u00A7')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return partes;
  }

  /**
   * Extrae la evaluación de hierba de un registro
   */
  function evaluarHierbaRegistro(registro) {
    if (!registro) return null;
    const isFaena = obtenerTipoRegistro(registro) === 'faena';
    const estadoNorm = normalizarEstado(registro.estado);
    const texto = `${registro.tipoFaena || ''} ${registro.notas || ''}`.trim();
    const hierbaField = registro.hierba ? String(registro.hierba).trim() : '';

    // Si es faena de desbroce / herbicida
    if (isFaena && esTrabajoHerbicidaODesbroce(registro)) {
      if (estadoNorm === 'Finalizadas') {
        return {
          nivel: 'limpio',
          evidencia: texto || 'Trabajo completado de desbroce/herbicida'
        };
      } else {
        // Pendiente o en curso: no resuelve ni certifica estado limpio
        return null;
      }
    }

    // Análisis de texto libre para hierba
    if (texto) {
      if (/\b(?:no\s+(?:hi\s+ha|hia|es\s+veu|se\s+veu|veig)\s+(?:brossa|brosa|herba|hierba)|no\s+(?:brossa|brosa|herba)|sense\s+(?:brossa|brosa|herba)|net[a]?\s+d['’]herba|limpio\s+de\s+hierba|brosa\s+controla(?:da)?\s+y\s+seca|brosa\s+seca\s+y\s+controlada)\b/i.test(texto)) {
        return { nivel: 'limpio', evidencia: texto };
      }
      if (/\b(?:molta\s+(?:brossa|brosa|herba)|mucha\s+hierba|brossa\s+resisten|brossa\s+alta|herba\s+alta|ple\s+d['’]herba|brossa\s+pa\s+fese|fer\s+brossa|fa\s+falta\s+fer\s+la\s+brossa|fa\s+falta\s+segar\s+brossa)\b/i.test(texto)) {
        return { nivel: 'alta', evidencia: texto };
      }
      if (/\b(?:poca\s+(?:brossa|brosa|herba|hierba)|no\s+se\s+ha\s+desmadrat|brossa\s+controlada|parcheo\s+de\s+brosa)\b/i.test(texto)) {
        return { nivel: 'baja', evidencia: texto };
      }
      if (/\b(?:hierba\s+media|mitja\s+brossa|brossa\s+mitja|regular\s+de\s+brossa)\b/i.test(texto)) {
        return { nivel: 'media', evidencia: texto };
      }
    }

    // Si viene campo explícito hierba (común en informes)
    if (hierbaField && registro.observacionManual === true) {
      const hLower = hierbaField.toLowerCase();
      if (hLower.includes('sin') || hLower.includes('limpio') || hLower.includes('neta')) {
        return { nivel: 'limpio', evidencia: hierbaField };
      }
      if (hLower.includes('poca') || hLower.includes('baja')) {
        return { nivel: 'baja', evidencia: hierbaField };
      }
      if (hLower.includes('media') || hLower.includes('mitja')) {
        return { nivel: 'media', evidencia: hierbaField };
      }
      if (hLower.includes('mucha') || hLower.includes('molta') || hLower.includes('alta')) {
        return { nivel: 'alta', evidencia: hierbaField };
      }
    }

    return null;
  }

  /**
   * Extrae la evaluación de riego de un registro
   */
  function evaluarRiegoRegistro(registro) {
    if (!registro) return null;
    const isFaena = obtenerTipoRegistro(registro) === 'faena';
    const estadoNorm = normalizarEstado(registro.estado);
    const texto = `${registro.tipoFaena || ''} ${registro.notas || ''}`.trim();

    // Faenas de reparación de riego
    if (isFaena && esTrabajoReparacionRiego(registro)) {
      if (estadoNorm === 'Finalizadas') {
        return {
          nivel: 'correcto',
          evidencia: texto || 'Reparación de riego completada'
        };
      } else {
        return null;
      }
    }

    // Análisis en texto libre
    if (texto) {
      const sinFugas = /\b(?:no\s+(?:hi\s+ha|hay|se\s+ven)|sense|sin)\s+(?:fugues|fuites|fugas?)\b/i.test(texto);
      if (sinFugas && !/\b(?:pero|però)\b/i.test(texto)) {
        return { nivel: /\brevisar\b/i.test(texto) ? 'revisar' : 'correcto', evidencia: texto };
      }
      // 1. Fuga grave
      if (/\b(?:fuga\s+grave|gran\s+fuga|revent[oó]n|goma\s+tallada|tub\s+trencat|tuber[ií]a\s+trencada|toda\s+la\s+calle\s+est[aá]\s+encharcada|urgen\s+arreglar\s+fuga)\b/i.test(texto)) {
        return { nivel: 'fuga-grave', evidencia: texto };
      }

      // 2. Fuga leve
      if (/\b(?:fuga\s+leve|fuga\s+lleu|xicoteta\s+fuga|pequeña\s+fuga|goteig\s+lleu|gotera\s+leve|p[èe]rdua\s+xicoteta)\b/i.test(texto)) {
        return { nivel: 'fuga-leve', evidencia: texto };
      }

      // 3. Fuga media
      if (/\b(?:fuga\s+de\s+\d+\s*mm|tubo\s+del\s+\d+|tuberia\s+del\s+\d+|fuga\s+en\s+el\s+goteo|arreglar\s+fuga|reparar\s+fuga|fuga\s+mitja|fuga\s+media|fuga|p[èe]rdua\s+d['’]aigua)\b/i.test(texto)) {
        return { nivel: 'fuga-media', evidencia: texto };
      }

      // 4. Revisar (falta de agua, sed, charcos, tomas, etc.)
      if (/\b(?:revisar\s+(?:el\s+)?reg|revisar\s+(?:el\s+)?goteo|revisar\s+tomes|repasar\s+tomes\s+de\s+reg|revisar\s+aigua|falta\s+reparar\s+aigua|reparar\s+aigua|falta\s+(?:de\s+)?aigua|falte\s+aigua|passa\s+sed|passant\s+sed|marca\s+sed|marcant\s+sed|marcan\s+mucha\s+sed|s[ií]ntomes\s+set|arbre\s+mort\s+per\s+sed|arbres?\s+patisca\s+sed|evitar\s+clots|massa\s+basses|solventar.*basses|ficar\s+m[eé]s\s+gomes|ficar\s+gota\s+a\s+les\s+puntes|canvi\s+de\s+gomes|falta\s+goma)\b/i.test(texto)) {
        return { nivel: 'revisar', evidencia: texto };
      }

      // 5. Correcto
      if (/\b(?:riego\s+correcto|reg\s+bo|bon\s+reg|reg\s+correcte|sense\s+problemes\s+de\s+reg|riego\s+ok|reg\s+ok|arreglat\s+goteo)\b/i.test(texto)) {
        return { nivel: 'correcto', evidencia: texto };
      }
    }

    return null;
  }

  /**
   * Analiza un registro individual devolviendo el contrato exacto
   * 
   * @param {Object} registro Registro de faena o informe
   * @returns {Object} { plagas, sinPlagas, hierba, riego }
   */
  function analizarRegistro(registro) {
    if (!registro || typeof registro !== 'object') {
      return {
        plagas: [],
        sinPlagas: false,
        hierba: null,
        riego: null
      };
    }

    // 1. Verificar si existen observacionesEstructuradas válidas pre-existentes
    const struct = registro.observacionesEstructuradas;
    let plagasResultado = null;
    let sinPlagasResultado = null;
    let hierbaResultado = undefined;
    let riegoResultado = undefined;

    if (struct && typeof struct === 'object') {
      // A. Categoría explícita: plagas
      if (Array.isArray(struct.plagas)) {
        plagasResultado = struct.plagas.map(p => ({
          nombre: String(p.nombre || ''),
          presencia: NIVELES_PRESENCIA.includes(p.presencia) ? p.presencia : 'desconocida',
          danos: NIVELES_DANOS.includes(p.danos) ? p.danos : 'desconocido',
          evidencia: String(p.evidencia || '')
        }));
      }

      // B. Categoría explícita: sinPlagas
      if (typeof struct.sinPlagas === 'boolean') {
        sinPlagasResultado = struct.sinPlagas;
      }

      // C. Categoría explícita: hierba
      if (struct.hierba !== undefined) {
        if (struct.hierba === null) {
          hierbaResultado = null;
        } else if (typeof struct.hierba === 'object' && NIVELES_HIERBA.includes(struct.hierba.nivel)) {
          hierbaResultado = {
            nivel: struct.hierba.nivel,
            evidencia: String(struct.hierba.evidencia || '')
          };
          // Zonas Tira (línea de árboles) y Frau (calle), si el informe las trae
          if (struct.hierba.tira) hierbaResultado.tira = struct.hierba.tira;
          if (struct.hierba.frau) hierbaResultado.frau = struct.hierba.frau;
        }
      }

      // D. Categoría explícita: riego
      if (struct.riego !== undefined) {
        if (struct.riego === null) {
          riegoResultado = null;
        } else if (typeof struct.riego === 'object' && NIVELES_RIEGO.includes(struct.riego.nivel)) {
          riegoResultado = {
            nivel: struct.riego.nivel,
            evidencia: String(struct.riego.evidencia || '')
          };
        }
      }
    }

    // 2. Extraer o completar hierba y riego si no estaban fijados explícitamente
    if (hierbaResultado === undefined) {
      hierbaResultado = evaluarHierbaRegistro(registro);
    }
    if (riegoResultado === undefined) {
      riegoResultado = evaluarRiegoRegistro(registro);
    }

    // 3. Extraer o completar plagas si no estaban fijadas explícitamente
    if (plagasResultado === null) {
      const texto = `${registro.tipoFaena || ''} ${registro.notas || ''}`.trim();
      const globalNegation = tieneNegacionGlobalPlagas(texto);
      const clausulas = dividirEnClausulas(texto);

      // Mapa temporal de observaciones por especie
      // nombre -> { presencia, danos, evidencias: [] }
      const plagasMap = new Map();

      // Recorrer cláusulas
      for (const cl of clausulas) {
        const especiesEnCl = buscarPlagasEnTexto(cl);
        for (const esp of especiesEnCl) {
          // Descartar si es mención meramente preventiva / faena de tratamiento
          if (esMencionPreventivaOTratamiento(cl, texto, registro)) {
            continue;
          }

          const evalEsp = evaluarEspecieEnClausula(cl, esp);
          if (!plagasMap.has(esp)) {
            plagasMap.set(esp, {
              presencia: evalEsp.presencia,
              danos: evalEsp.danos,
              evidencias: [evalEsp.evidencia]
            });
          } else {
            const act = plagasMap.get(esp);
            // Regla de oro multizona: la presencia positiva en cualquier zona vence a la ausencia local
            if (PESO_PRESENCIA[evalEsp.presencia] > PESO_PRESENCIA[act.presencia]) {
              act.presencia = evalEsp.presencia;
            }
            if (PESO_DANOS[evalEsp.danos] > PESO_DANOS[act.danos]) {
              act.danos = evalEsp.danos;
            }
            act.evidencias.push(evalEsp.evidencia);
          }
        }
      }

      // Si hay una negación global en el informe ("No presència de plages", "No plagues", etc.)
      // y ninguna especie ha afirmado presencia positiva en ninguna zona:
      let hayPresenciaPositiva = false;
      for (const [esp, datos] of plagasMap.entries()) {
        if (['alta', 'media', 'presente', 'baja'].includes(datos.presencia)) {
          hayPresenciaPositiva = true;
          break;
        }
      }

      if (globalNegation && !hayPresenciaPositiva) {
        sinPlagasResultado = true;
        // La negación global elimina presencia activa viva para todas las especies mencionadas,
        // pero NO elimina sus daños
        for (const [esp, datos] of plagasMap.entries()) {
          datos.presencia = 'ausente';
        }
      } else {
        sinPlagasResultado = hayPresenciaPositiva ? false : (sinPlagasResultado || false);
      }

      // Convertir mapa a array de plagas válidas
      plagasResultado = [];
      for (const [esp, datos] of plagasMap.entries()) {
        // Solo incluir plagas que tengan daño o presencia conocida
        if (datos.presencia !== 'desconocida' || datos.danos !== 'desconocido') {
          plagasResultado.push({
            nombre: esp,
            presencia: datos.presencia,
            danos: datos.danos,
            evidencia: datos.evidencias.join('; ')
          });
        }
      }
    }

    if (sinPlagasResultado === null) {
      sinPlagasResultado = false;
    }

    return {
      plagas: plagasResultado,
      sinPlagas: sinPlagasResultado,
      hierba: hierbaResultado,
      riego: riegoResultado
    };
  }

  /**
   * Reduce cronológicamente un conjunto de registros de una parcela,
   * manteniendo el estado acumulado exacto.
   * 
   * @param {Array} registros Lista de informes y faenas
   * @returns {Object} Esquema acumulado { plagas, sinPlagas, hierba, riego }
   */
  function resumenParcela(registros) {
    if (!Array.isArray(registros) || registros.length === 0) {
      return {
        plagas: [],
        sinPlagas: false,
        hierba: null,
        riego: null
      };
    }

    // 1. Ordenar cronológicamente ascendente de forma estable
    const ordenados = registros.slice().sort((a, b) => {
      const fechaA = String(a.fecha || '');
      const fechaB = String(b.fecha || '');
      if (fechaA !== fechaB) {
        return fechaA.localeCompare(fechaB);
      }
      const horaA = String(a.hora || '');
      const horaB = String(b.hora || '');
      return horaA.localeCompare(horaB);
    });

    let estadoHierba = null;
    let estadoRiego = null;
    let estadoSinPlagas = false;
    // Mapa acumulado por especie canónica:
    // nombre -> { nombre, presencia, danos, evidencia }
    const plagasAcumuladas = new Map();

    for (const reg of ordenados) {
      const isFaena = obtenerTipoRegistro(reg) === 'faena';
      const estadoNorm = normalizarEstado(reg.estado);
      // A planned task is not an observation and cannot change the current state.
      if (isFaena && estadoNorm !== 'Finalizadas') continue;
      const analisis = analizarRegistro(reg);

      // A. Actualización de Hierba
      // Solo trabajos 'Finalizadas' resuelven hierba al desbrozar/herbicida; pendientes nunca
      if (isFaena && esTrabajoHerbicidaODesbroce(reg)) {
        if (estadoNorm === 'Finalizadas') {
          estadoHierba = {
            nivel: 'limpio',
            evidencia: `${reg.tipoFaena || 'Herbicida/Desbroce'}${reg.notas ? ' - ' + reg.notas : ''}`
          };
        }
        // Si está pendiente, no hace nada: conserva el estado anterior
      } else if (analisis.hierba !== null) {
        // Nuevas observaciones directas de informes o faenas descriptivas
        estadoHierba = { ...analisis.hierba };
      }

      // B. Actualización de Riego
      // Solo trabajos 'Finalizadas' resuelven riego al reparar; pendientes nunca
      if (isFaena && esTrabajoReparacionRiego(reg)) {
        if (estadoNorm === 'Finalizadas') {
          estadoRiego = {
            nivel: 'correcto',
            evidencia: `${reg.tipoFaena || 'Reparación de riego'}${reg.notas ? ' - ' + reg.notas : ''}`
          };
        }
        // Si está pendiente, no resuelve
      } else if (analisis.riego !== null) {
        estadoRiego = { ...analisis.riego };
      }

      // C. Actualización de Plagas
      // Informes nuevos sin plagas / no es veu plaga eliminan presencia activa, no necesariamente daños
      if (analisis.sinPlagas) {
        for (const [esp, datos] of plagasAcumuladas.entries()) {
          datos.presencia = 'ausente';
          if (reg.notas) {
            datos.evidencia = reg.notas;
          }
        }
        estadoSinPlagas = true;
      }

      // Integrar las plagas específicas mencionadas en este registro
      for (const p of analisis.plagas) {
        if (!plagasAcumuladas.has(p.nombre)) {
          plagasAcumuladas.set(p.nombre, {
            nombre: p.nombre,
            presencia: p.presencia,
            danos: p.danos,
            evidencia: p.evidencia
          });
        } else {
          const acumulada = plagasAcumuladas.get(p.nombre);
          // Si el nuevo registro aporta datos de presencia concretos
          if (p.presencia !== 'desconocida') {
            acumulada.presencia = p.presencia;
          }
          // Si el nuevo registro aporta datos de daños concretos
          if (p.danos !== 'desconocido') {
            acumulada.danos = p.danos;
          }
          acumulada.evidencia = p.evidencia;
        }

        // Si alguna plaga reporta presencia activa positiva, se revoca el estado sinPlagas global
        if (['alta', 'media', 'presente', 'baja'].includes(p.presencia)) {
          estadoSinPlagas = false;
        }
      }

      // Si no hubo plagas activas y se afirmó sinPlagas, mantenerlo
      if (analisis.sinPlagas && plagasAcumuladas.size === 0) {
        estadoSinPlagas = true;
      }
    }

    return {
      plagas: Array.from(plagasAcumuladas.values()),
      sinPlagas: estadoSinPlagas,
      hierba: estadoHierba,
      riego: estadoRiego
    };
  }

  return {
    analizarRegistro,
    resumenParcela,
    normalizarEstado,
    PLAGAS_CANONICAS,
    NIVELES_PRESENCIA,
    NIVELES_DANOS,
    NIVELES_HIERBA,
    NIVELES_RIEGO,
    VERSION: '1.0.0-campo-carlos'
  };
});
