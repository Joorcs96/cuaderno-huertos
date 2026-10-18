# CREDITOS.md — recursos descargados en el repositorio

Todo lo que se usa es **local**: no hay ninguna petición a Internet en tiempo de ejecución
(la auditoría lo comprueba: `PETICIONES EXTERNAS: 0`). El CSP de la app (`default-src 'self'`) lo
impide y así se mantiene.

## Tipografías (SIL Open Font License 1.1)

| Archivo | Familia | Uso | Autoría | Origen | Licencia |
|---|---|---|---|---|---|
| `assets/fonts/archivo-latin.woff2` (34 KB) | **Archivo** variable, pesos 400-700 | Interfaz completa: botones, etiquetas, datos, tablas | Omnibus-Type | <https://fonts.google.com/specimen/Archivo> | SIL OFL 1.1 |
| `assets/fonts/instrument-serif-latin.woff2` (21 KB) | **Instrument Serif**, peso 400 | Titulares: nombre de la app, títulos de sección y de ficha | Rodrigo Fuenzalida | <https://fonts.google.com/specimen/Instrument+Serif> | SIL OFL 1.1 |

- Se descargan solo los subconjuntos **latin** (55 KB en total) para que la app siga siendo ligera en el campo.
- Formato woff2, `font-display: swap`, declaradas en `styles.css` con `unicode-range` para no cargar glyphs
  que no se usan.
- Justificación de la elección: dos familias como máximo, ninguna genérica; Instrument Serif da carácter
  al cuaderno sin perder legibilidad porque solo se usa en títulos grandes, y Archivo cubre el 95 % de la
  interfaz con cifras tabulares (`font-variant-numeric: tabular-nums`), imprescindible para comparar
  números a ojo en una finca.

## Iconos (ISC License — Lucide)

- Origen: <https://lucide.dev/> · <https://github.com/lucide-icons/lucide> · licencia ISC
  (texto en <https://github.com/lucide-icons/lucide/blob/main/LICENSE>).
- Descarga: `node scripts/generar-iconos.js` (versión fijada `lucide-static@0.469.0`, 60 iconos, 13 KB).
- Copias originales: `assets/icons/<nombre>.svg`. Sprite generado: `assets/icons/sprite.svg`.
- El sprite se inyecta **inline** en `index.html` (13 KB) para que los iconos funcionen sin red,
  sin peticiones extra y también en modo campo sin cobertura.
- Uso: `assets/icons/*.svg` con licencia ISC. El nombre del proyecto es "Huertos Carlos" y su icono
  (`icon-192.png`, `icon-512.png`) **no se han tocado**.

### Relación de cada icono local con su nombre en Lucide

| Local | Lucide | Uso en la app |
|---|---|---|
| `tractor` | tractor | Cabecera, partes de faena, perfil de Juancarlos |
| `citrus` | citrus | Tarjetas de huerto y de semáforo |
| `clipboard` | clipboard-list | Apartado Faenas, tareas del informe |
| `note` | notebook-pen | Informes y tipo de registro |
| `chart` | chart-no-axes-column-increasing | Apartado Resumen |
| `bolt` | zap | Apartado Diario |
| `pen` | square-pen | Apartado Nueva, correcciones |
| `plus` | plus | Añadir tareas, cerrar filas |
| `close` | x | Cerrar modales |
| `chevrons` | chevrons-up-down | Plegar/desplegar periodos |
| `warning` | triangle-alert | Errores y alertas |
| `flask` | flask-conical | Tratamientos y químicos |
| `bug` | bug | Trip, Araña roja, Piojo rojo |
| `mosca` | bird | Mosca de la fruta |
| `polilla` | ghost | Mosca blanca |
| `cucaracha` | rat | Cotonet |
| `larva` | worm | Minador |
| `leaf` | leaf | Estado de la hierba |
| `drop` | droplet | Riego |
| `drop-alert` | droplet-off | Fuga de riego |
| `scissors` | scissors | Poda y deschuponado |
| `wheat` | wheat | Desbroce / control de hierba |
| `eye` | eye | Revisión general |
| `check` | check | Confirmaciones |
| `check-circle` | circle-check | Limpio, sin plagas |
| `clock` | clock | Pendiente, revisar |
| `circle-dot` | circle-dot | Nivel medio |
| `circle-x` | circle-x | Mucha, error |
| `info` | circle (patrón de information) | Estado sin registrar |
| `calendar` | calendar-days | Fechas |
| `user`, `users` | user, users | Operarios y equipos |
| `building` | building-2 | Cooperativa |
| `warehouse` | warehouse | Invernadero |
| `wrench` | wrench | Juan, reparación |
| `sprout` | sprout | Diego, buen estado |
| `lock`, `unlock` | lock, lock-open | Bóveda bloqueada / abierta |
| `shield`, `shield-check` | shield, shield-check | Seguridad e integridad |
| `key` | key-round | PIN de acceso |
| `save` | save | Guardar registro |
| `database` | database | Bóveda de datos |
| `download`, `upload` | download, upload | Exportar / cargar copia |
| `file-spreadsheet` | file-spreadsheet | Exportar CSV |
| `refresh` | rotate-ccw | Restaurar Excel |
| `folder` | folder-open | Cargar copia |
| `history` | history | Histórico de la ficha |
| `timer` | timer | Auto-bloqueo por inactividad |
| `sparkles` | sparkles | Bóveda restaurada |
| `arrow-left`, `arrow-right` | arrow-left, arrow-right | "Ver ficha", estado restaurado |
| `gauge`, `ruler`, `list-checks`, `search` | gauge, ruler, list-checks, search | Reservados para uso futuro |

## Recursos que NO se han usado

- Ninguna fuente de Google Fonts por CDN, ni Fontshare, ni cdnjs: todo va en `assets/`.
- Ninguna foto de stock, ninguna imagen generada, ningún gradiente decorativo, ninguna librería de
  animación, ningún `backdrop-filter` (el diseño anterior usaba cristal y resplandores).
- Ninguna afirmación, cifra o testimonio inventado: el texto visible sale de `datos_huertos.js`.