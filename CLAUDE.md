# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# TRONWAY

Visualización 3D interactiva del Juego de la Vida de Conway con estética cyberpunk/TRON, construida con Three.js. Aplicación de página única, **sin build ni dependencias externas**: todas las librerías están incluidas en el repositorio.

## Comandos de desarrollo

No hay sistema de build, lint ni tests. La app se sirve estáticamente:

```bash
# Cualquier servidor estático sobre la raíz del proyecto
npx serve .                   # luego abrir http://localhost:8000
php -S localhost:8000
python3 -m http.server 8000   # evitar si python3 viene de pyenv (falla por getcwd)
```

> **Importante:** se usan ES modules con import maps **y un Web Worker de tipo módulo**. Abrir `index.html` con `file://` falla (CORS sobre módulos y el worker no carga → cae al fallback síncrono). Siempre servir por HTTP. Requiere navegador con WebGL 2.0, ES Modules / Import Maps, Web Workers de módulo y Fullscreen API.
>
> `.claude/launch.json` define un servidor `tronway` (`npx serve`) para la vista previa de Claude Code.

## Arquitectura

Aplicación de página única, sin framework ni paso de compilación:

| Archivo | Responsabilidad |
|---------|-----------------|
| [index.html](index.html) | DOM y UI: panel de controles colapsable, overlays de intro/reboot/tutorial, tablas de stats, importmap (`three` → `./three.module.js`, `three/addons/` → `./addons/`) |
| [style.css](style.css) | Estilos y animaciones: splash intro, scanlines CRT, fondo ambiente, overlay de reboot y tarjeta de tutorial |
| [main.js](main.js) | **La mayor parte de la lógica** (~2200 líneas): render Three.js, cámaras, modos de juego, raycasting, persistencia, audio, atajos y orquestación de la simulación |
| [simulacion.js](simulacion.js) | **Núcleo puro** del autómata: `calcular_siguiente_generacion()`, sin DOM ni estado global. Importado por `main.js` (fallback) y por el worker |
| [simulacion.worker.js](simulacion.worker.js) | Web Worker (módulo) que ejecuta el núcleo puro fuera del hilo principal |

`three.module.js` es la librería Three.js (1.2 MB). `addons/` contiene los addons usados vía importmap (`controls/`, `postprocessing/`, `shaders/`). La fuente retro está en `fonts/open-24-display/`.

### Patrón de `main.js`

Es un único módulo con **estado global mutable** (no hay clases ni componentes). Flujo:

1. Imports de Three.js, addons y `calcular_siguiente_generacion` (de `simulacion.js`).
2. Declaración de constantes y estado global (grid, arrays de simulación, parámetros de cámara/neón, estado de juego, temas, desafíos, worker).
3. `restaurar_ajustes()` se invoca **antes** de `init()` para aplicar ajustes guardados (y los de la URL compartida, que tienen prioridad).
4. `init()` monta escena, cámara, luces, controles, post-procesado y listeners.
5. `animate()` es el loop de `requestAnimationFrame`: solicita un paso de simulación si toca y el worker está libre, interpola escalas visuales, colorea, ajusta el bloom y renderiza. Respeta `gamePaused`.

> **Declaración de constantes de localStorage/URL arriba:** `STORAGE_KEY`, `SCORES_KEY`, `TUTORIAL_KEY`, `AJUSTES_STR`, `AJUSTES_BOOL` se declaran cerca del inicio del fichero **a propósito**, porque `restaurar_ajustes()` y el arranque las usan antes de alcanzar las secciones donde están sus funciones (evita errores de *temporal dead zone*).

**Arrays de simulación paralelos** (indexados por celda, longitud `GRID_TOTAL`):
- `grid` / `prevGrid` — estado vivo/muerto actual y anterior
- `patternMap` — celdas marcadas como estables
- `glowIntensity` — destello neón por celda (se desvanece por frame)
- `visualScales` — escala interpolada para transiciones suaves vida/muerte
- `cellAge` — generaciones consecutivas que lleva viva cada célula (alimenta el coloreado por edad)
- `rewindBuffer` — copias del grid de las últimas `REWIND_MAX` (40) generaciones, para rebobinar

**Render:** una sola `InstancedMesh` dibuja todas las células (hasta 40.000) en una draw call, con `DynamicDrawUsage` para actualizar matrices cada frame.

**Grid adaptativo a orientación:** por defecto 140×80 en landscape y 80×140 en portrait. Configurable 20–200 por slider.

### Simulación en Web Worker

El cálculo de cada generación se delega a [simulacion.worker.js](simulacion.worker.js) para no bloquear el render en grids grandes:

- `updateSimulation()` envía `grid`/`prevGrid` al worker como `Int8Array` **transferibles** (sin copia costosa) y marca `workerBusy`.
- El worker llama a la función pura y devuelve el resultado (también transferible); `onmessage` lo aplica vía `aplicar_resultado_paso()`.
- `animate()` no avanza mientras `workerBusy` esté activo; el render sigue en cada frame.
- **Fallback síncrono:** si el worker no se crea (entorno sin soporte, `file://`), `simWorker` queda `null` y `updateSimulation()` calcula en el hilo principal con la misma función pura. Comportamiento idéntico.
- **Coherencia:** `invalidar_paso_worker()` se llama al inicio de toda función que reinicia o sustituye el grid fuera del flujo del worker (`resetGame`, `resizeGrid`, `switchGameMode`, `startGame`, `estampar_patron`, `rebobinar_simulacion`) para descartar un resultado en vuelo que llegaría tarde.

El hilo principal sigue siendo dueño del estado; el worker solo calcula. El worker **no** hereda el importmap de la página, por eso `simulacion.js` no tiene dependencias.

### Persistencia (localStorage)

Tres claves:
- `tronway_settings` — todos los controles, como un único JSON. `guardar_ajustes()` se llama tras cada cambio; `restaurar_ajustes()` se ejecuta antes de `init()`, restaura el DOM y **sincroniza las variables JS globales**.
- `tronway_scores` — mejores puntuaciones de Supervivencia/Conquista (`cargar_records()` / `obtener_record()` / `registrar_record()`).
- `tronway_tutorial_seen` — flag del mini-tutorial de primera visita.

Al añadir un control nuevo: persistirlo en `guardar_ajustes()` / `restaurar_ajustes()` **y** en `AJUSTES_STR` o `AJUSTES_BOOL` (para que viaje en la URL compartida).

### Compartir por URL

`construir_url_compartir()` serializa los controles (`AJUSTES_STR`/`AJUSTES_BOOL`) al querystring; el botón **🔗 COMPARTIR** copia la URL al portapapeles (con fallback a `prompt()`). `leer_ajustes_url()` lee esos parámetros al cargar y tienen **prioridad sobre `localStorage`**.

## Lógica del Juego de la Vida

Autómata celular con notación B/S (Birth/Survival) y topología toroidal (bordes conectados):
- **B** = nº de vecinos para que nazca una célula muerta.
- **S** = nº de vecinos para que sobreviva una célula viva.

`updateSimulation()` calcula la siguiente generación según la variante seleccionada.

### Variantes de reglas

| Regla | Notación | Comportamiento |
|-------|----------|----------------|
| Conway | B3/S23 | El clásico original |
| HighLife | B36/S23 | Replicador famoso |
| Day & Night | B3678/S34678 | Simétrico, patrones exóticos |
| Seeds | B2/S | Explosivo, células efímeras |
| Diamoeba | B35678/S5678 | Estructuras de diamante |
| 2x2 | B36/S125 | Bloques 2×2 estables |
| Morley | B368/S245 | "Move" |
| Anneal | B4678/S35678 | Grupos sólidos |
| Replicator | B1357/S1357 | Todo patrón se replica |
| Maze | B3/S12345 | Laberintos |
| Personalizado | (editable) | Notación B/S libre escrita por el usuario |

La regla `custom` se rellena en runtime desde el input de texto (`parsear_regla_bs()` → `aplicar_regla_personalizada()`); valida el formato `B3/S23` y marca el input en rojo si es inválido.

## Patrones y controles de simulación (modo Visualización)

- **Biblioteca de patrones** (`patrones`): glider, LWSS, blinker, faro, bloque, pulsar, cañón de Gosper. `estampar_patron()` pausa, limpia el grid y coloca el patrón centrado para estudiarlo aislado.
- **Pausa / paso / rebobinar** (`pausar_simulacion()`, `paso_simulacion()`, `rebobinar_simulacion()`): permiten avanzar generación a generación y deshacer (buffer `rewindBuffer`). Al pausar manualmente, `analyzeStatus()` **no** dispara el auto-reboot (guard `if (gamePaused) return`).

## Tipos de Mundo y Geometrías

**Mundos** (`updateWorldShell()`): Plano (predeterminado), Esférico, Donut (toroide) y Terreno Procedural (altura con ruido sinusoidal discretizado en 5 niveles vía `getNoiseHeight()`).

**Geometrías de célula:** Barras (box, default), Esferas, Pirámides (tetraedro) y Toros (con rotación animada).

## Modos de juego

El selector **MODO** cambia entre 4 modos; cambiar de modo resetea todo el estado (grid, cámara, contadores, reboot) vía `switchGameMode()`.

| Modo | Objetivo | Puntuación | Fin |
|------|----------|------------|-----|
| **Visualización** | Sandbox libre, sin interacción | — | Reinicio automático en estable/extinción |
| **Supervivencia** | Sobrevivir el máximo de generaciones | +1 por generación con población viva | Extinción o estabilización |
| **Conquista** | Acumular población total máxima | Suma de células vivas por generación | Límite de generaciones, extinción o estabilización |
| **Puzzle** | Superar un desafío concreto | — (victoria/derrota) | Cumplir el objetivo (victoria) o extinguirse/estabilizarse antes (derrota) |

Supervivencia, Conquista y Puzzle fuerzan mundo plano. Sus controles exclusivos (clase `game-only`: Células, Generaciones, Pausa, panel game-info con columna **Récord**) se muestran y los de mundo/reglas (clase `viz-only`) se ocultan.

**Récords:** Supervivencia y Conquista guardan su mejor puntuación en `tronway_scores`; al batirla, `endGame()` muestra "★ RÉCORD".

**Modo Puzzle:** el array `desafios` define cada reto (`reglas`, `budget`, `objetivo`). Tipos de objetivo: `poblacion` (≥N vivas a la vez), `supervivencia` (≥N generaciones), `puntos` (≥N población acumulada). El reto fija las reglas y el presupuesto (sliders ocultos vía clase `puzzle-hide`; selector de desafío vía clase `puzzle-only`, mostrado con `puzzle-active` en el panel). `updateGameState()` comprueba la victoria **antes** que las condiciones de fin.

### Flujo de partida (modos juego)

```
Seleccionar modo → grid limpio, pausa, malla visible
  → fase "placing" (COLOCAR): click en celdas para toggle, control de budget
  → JUGAR (runGame): simulación arranca, malla oculta, puntuación avanza ["running"]
  → condición de fin (endGame): muestra resultado, malla visible, REINTENTAR ["result"]
```

`updateGameState(alive, stable)` evalúa puntuación y condiciones de fin por generación. En modos de juego `analyzeStatus()` **no** ejecuta la lógica de reboot; el fin se gestiona en `updateGameState()`.

### Raycasting (colocar células)

- `getGridCellFromClick(event)` — convierte el click en índice de celda intersectando con un `THREE.Plane(Y=0)`.
- `onGridClick(event)` — toggle vivo/muerto con control de budget; discrimina click vs drag (umbral 5px).
- Listeners `pointerdown`/`pointerup` en el canvas del renderer.

### Malla de referencia

`createGridHelper()` crea un `THREE.LineSegments` (color de acento del tema vía `obtener_acento()`, opacidad 0.12, Y=0.01). `showGridHelper(visible)` la muestra/oculta: visible en `placing` y `result`, oculta en `running` y en modo Visualización. Se recrea al cambiar el tamaño del grid.

## Sistema de estados (modo Visualización)

`analyzeStatus()` detecta:

| Estado | Condición | Acción |
|--------|-----------|--------|
| **CAOS** | Población oscilando | Continúa |
| **ESTABLE** | Variación <5 en 40 ciclos | Reinicio automático (10s) |
| **EXTINCIÓN** | Población = 0 | Reinicio automático (10s) |

El overlay de reboot se muestra a pantalla completa con blur, fuente "Open 24 Display", cuenta atrás de 10s (`startRebootCountdown()` / `stopRebootCountdown()`) y estadísticas finales (generaciones, población, estables, pico máx).

## Cámara

`OrbitControls` con 3 modos: **Desactivado** (manual libre), **Órbita** (auto-rotación) y **Cinematográfico** (`initCinematicCamera()` / `updateCinematicCamera()`: interpolación lineal entre puntos de vista aleatorios en coordenadas esféricas). `fitCameraToWorld()` ajusta la cámara según tipo y tamaño del mundo.

## Efecto Neón (UnrealBloomPass)

Bloom dinámico vía post-procesado (`neonParams`: strength 1.75, radius 1.0, threshold 0.75):
- Toggle on/off desde el panel.
- **Ajuste por distancia:** la intensidad se reduce al acercar la cámara para evitar quemado.
- **Destello de nacimiento:** las células nuevas reciben `glowIntensity` extra que se desvanece (factor 0.88/frame).
- Valores de color >1.0 (`neonBoost` ≈ 1.15) activan el halo.

Hay también un **Fondo Ambiente** togglable (`ambientToggle`, capas animadas en `#ambient-bg`).

## Color, temas y captura

- **Temas de color** (`temas`: TRON, Ámbar, Magenta, Fósforo): definen `hueBase` (matiz de las células), `acento` (color del mundo, malla y reboot) y `estable` (color RGB de células estables). `obtener_acento()` centraliza el color de acento; `aplicar_tema()` lo refresca. Afectan a la escena 3D; el *chrome* del panel (CSS) sigue en cyan.
- **Color por edad** (`ageColorEnabled`): en `animate()`, mapea `cellAge` a un degradado de calor cyan→rojo, ignorando el tema mientras está activo.
- **Captura PNG** (`capturar_pantalla()`): fuerza `composer.render()` y lee el canvas con `toDataURL()` en el mismo tick (sin `preserveDrawingBuffer`, para no penalizar el rendimiento); descarga `tronway-<timestamp>.png`.

## Atajos, tutorial y audio

- **Atajos de teclado** (`manejar_atajo_teclado`): Espacio (pausa), `S` (paso), `R` (reiniciar/reintentar), `←/→` (velocidad), `C` (captura), `N` (neón). Se ignoran cuando el foco está en un campo de texto.
- **Mini-tutorial** (`mostrar_tutorial()` / `cerrar_tutorial()`): overlay `#tutorial-overlay` en la primera visita (flag `tronway_tutorial_seen`), por detrás de la intro.
- **Audio sintético** (Web Audio API, sin assets): `iniciar_audio()` crea un pad ambiental (osciladores graves + filtro paso-bajo + LFO); `alternar_audio()` lo activa con fundido; `sonido_evento('win'|'lose')` para fin de partida. El `AudioContext` se crea bajo demanda tras un gesto del usuario (toggle o cierre de intro).

## Intro Splash

Animación de entrada cyberpunk a pantalla completa (`#intro-overlay`). La escena 3D se renderiza detrás pero **la simulación arranca pausada** (`gamePaused = true`). Al hacer click/touch/tecla se hace fade-out y 600ms después se despausa (solo en modo Visualización).

## Funciones principales

**Núcleo de simulación (`simulacion.js`):** `calcular_siguiente_generacion(grid, prevGrid, filas, columnas, regla)` — función pura, compartida con el worker.

**Simulación (`main.js`):** `updateSimulation()` (solicita el paso), `aplicar_resultado_paso(...)` (aplica el resultado), `invalidar_paso_worker()`, `pausar_simulacion()`, `paso_simulacion()`, `rebobinar_simulacion()`, `guardar_estado_rewind()`, `estampar_patron()`, `parsear_regla_bs()`, `aplicar_regla_personalizada()`

**Persistencia / compartir:** `guardar_ajustes()`, `restaurar_ajustes()`, `leer_ajustes_url()`, `construir_url_compartir()`, `compartir_configuracion()`

**Records / Puzzle:** `cargar_records()`, `obtener_record()`, `registrar_record()`, `formato_objetivo()`

**Visual / audio / tutorial:** `aplicar_tema()`, `obtener_acento()`, `capturar_pantalla()`, `iniciar_audio()`, `alternar_audio()`, `sonido_evento()`, `manejar_atajo_teclado()`, `alternar_pausa()`, `mostrar_tutorial()`, `cerrar_tutorial()`

**Core:** `init()`, `animate()`, `createInstancedMesh()`, `getNoiseHeight()`, `updateWorldShell()`, `analyzeStatus()`, `fitCameraToWorld()`, `resizeGrid()`, `resetGame()`, `onWindowResize()`

**Cámara:** `initCinematicCamera()`, `updateCinematicCamera()`

**Reboot:** `startRebootCountdown()`, `stopRebootCountdown()`

**Modos de juego:** `switchGameMode(mode)`, `startGame(mode)`, `runGame()`, `updateGameState(alive, stable)`, `endGame(result)`, `updateGameUI()`, `updateGameTooltip()`, `createGridHelper()`, `showGridHelper(visible)`, `getGridCellFromClick(event)`, `onGridClick(event)`

## Convenciones de código

- Comentarios y nombres en español. Las funciones propias nuevas usan `snake_case` (p. ej. `guardar_ajustes`); el código existente mezcla camelCase heredado de la API de Three.js y de versiones previas.
- Mantener los comentarios explicativos del "por qué" que ya pueblan `main.js`.
