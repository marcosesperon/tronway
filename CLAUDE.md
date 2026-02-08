# TRONWAY

Visualización 3D del Juego de la Vida de Conway implementado con Three.js.

## Estructura de Archivos

```
conway/
├── conway.html          # Versión principal (local)
├── conway-online.html   # Versión simplificada para hosting online
├── three.module.js      # Librería Three.js (1.2MB)
├── fonts/
│   └── open-24-display/ # Fuente custom para overlay de reboot (woff, woff2, ttf)
└── addons/
    ├── controls/        # OrbitControls para rotación de cámara
    ├── postprocessing/  # Efectos visuales (EffectComposer, RenderPass, UnrealBloomPass)
    └── shaders/         # Shaders para efectos (Luminosity, Copy, LuminosityHighPass)
```

## Stack Tecnológico

- **Three.js** - Motor de renderizado 3D WebGL
- **ES6 Modules** - Import maps para gestión de dependencias
- **HTML5/CSS3** - Interfaz de usuario

## Características Técnicas

| Aspecto | Detalle |
|---------|---------|
| **Grid** | Configurable: 20-200 filas x 20-200 columnas (por defecto 140x80 = 11,200 células) |
| **Motor 3D** | Three.js con InstancedMesh para rendimiento |
| **Post-procesado** | UnrealBloomPass activo con efecto neón configurable |
| **Tone Mapping** | ACESFilmicToneMapping con exposición 1.0 |
| **Controles** | OrbitControls con 3 modos de cámara |
| **Modos de juego** | Visualización (sandbox), Supervivencia, Conquista |
| **Interacción** | Raycasting para colocar células en modos de juego |
| **Intro** | Splash animado cyberpunk/TRON con simulación pausada hasta interacción |
| **Fullscreen** | Botón de pantalla completa en el panel de controles |
| **UI** | Panel colapsable con botón hamburguesa, controles contextuales por modo |

## Tipos de Mundo

1. **Plano Bidimensional** (predeterminado) - Grid clásico plano
2. **Mundo Esférico** - Células sobre una esfera
3. **Donut (Toroide)** - Superficie toroidal
4. **Terreno Procedural** - Altura generada con ruido sinusoidal discretizado en 5 niveles (aspecto angular)

## Geometrías de Células

- **Barras (box)** - Geometría por defecto
- **Esferas** - SphereGeometry
- **Pirámides** - TetrahedronGeometry
- **Toros** - TorusGeometry con rotación animada

## Lógica del Juego de la Vida

El autómata celular usa notación B/S (Birth/Survival):
- **B** = número de vecinos para que nazca una célula muerta
- **S** = número de vecinos para que sobreviva una célula viva
- Topología toroidal (bordes conectados)

### Variantes Disponibles

| Regla | Notación | Comportamiento |
|-------|----------|----------------|
| Conway | B3/S23 | El clásico original |
| HighLife | B36/S23 | Tiene un replicador famoso |
| Day & Night | B3678/S34678 | Simétrico, patrones exóticos |
| Seeds | B2/S | Explosivo, células mueren siempre |
| Diamoeba | B35678/S5678 | Forma estructuras de diamante |
| 2x2 | B36/S125 | Bloques 2x2 estables |
| Morley | B368/S245 | También llamado "Move" |
| Anneal | B4678/S35678 | Tiende a formar grupos sólidos |
| Replicator | B1357/S1357 | Todo patrón se replica |
| Maze | B3/S12345 | Genera estructuras tipo laberinto |

## Sistema de Estados

### Modo Visualización

| Estado | Condición | Acción |
|--------|-----------|--------|
| **CAOS** | Población oscilando activamente | Continúa simulación |
| **ESTABLE** | Variación <5 en 40 ciclos | Reinicio automático (10s) |
| **EXTINCIÓN** | Población = 0 | Reinicio automático (10s) |

El overlay de reboot se muestra a pantalla completa con efecto blur, fuente custom "Open 24 Display" y animación de parpadeo.

### Modos de Juego

| Fase | Estado | Descripción |
|------|--------|-------------|
| **placing** | COLOCAR | Simulación pausada, jugador coloca células, malla visible |
| **running** | CAOS | Simulación activa, puntuación avanzando, malla oculta |
| **result** | FIN/ESTABLE/EXTINCIÓN | Simulación pausada, muestra puntos, malla visible |

En modos de juego `analyzeStatus()` no ejecuta la lógica de reboot; las condiciones de fin se gestionan en `updateGameState()`.

## Modos de Cámara

| Modo | Descripción |
|------|-------------|
| **Desactivado** | Sin movimiento automático, control manual libre |
| **Órbita** | Auto-rotación constante alrededor del centro |
| **Cinematográfico** | Movimiento orgánico con interpolación suave entre puntos de vista aleatorios (distancia 30-75, ángulo variable) |

## Efecto Neón

Sistema de bloom dinámico basado en UnrealBloomPass:

| Parámetro | Valor |
|-----------|-------|
| **Strength** | 1.75 |
| **Radius** | 1.0 |
| **Threshold** | 0.75 |

- **Toggle on/off** desde el panel de controles
- **Ajuste dinámico por distancia**: la intensidad del bloom se reduce al acercar la cámara (rango dist 40-160, factor 0.4-1.0) para evitar quemado
- **Destello de nacimiento**: las células nuevas reciben un `glowIntensity` extra que se desvanece gradualmente (factor 0.88 por frame)
- Valores de color >1.0 (`neonBoost = 1.15`) activan el halo del bloom

## Modos de Juego

El selector **MODO** permite elegir entre 3 modos. Al cambiar de modo se resetea completamente el estado (grid, cámara, contadores, reboot).

### Visualización (predeterminado)

Sandbox libre sin interacción. El autómata celular evoluciona automáticamente con reinicio en extinción/estabilización. Todos los controles de mundo, reglas y opacidad disponibles.

### Supervivencia

- **Objetivo**: que la colonia sobreviva el mayor número de generaciones posible
- **Puntuación**: +1 punto por cada generación con población viva
- **Fin**: extinción (población = 0) o estabilización (variación < 5 en 40 ciclos)
- **Células**: configurables por slider (default 30), generaciones ilimitadas
- Mundo forzado a plano, reglas Conway

### Conquista

- **Objetivo**: acumular la mayor población total posible
- **Puntuación**: suma de todas las células vivas en cada generación
- **Fin**: al alcanzar el límite de generaciones, extinción o estabilización
- **Células**: configurables por slider (default 20)
- **Generaciones**: configurables por slider (default 100, 0 = sin límite)
- Mundo forzado a plano, reglas Conway

### Flujo de Partida (modos juego)

```
1. Seleccionar modo → grid se limpia, pausa activada, malla visible
2. Fase COLOCAR → click en celdas para colocar/quitar (toggle), budget se actualiza
3. Pulsar JUGAR → simulación arranca, malla se oculta, puntuación avanza
4. Condición de fin → muestra resultado, malla visible, opción REINTENTAR
```

### Controles exclusivos de modo juego (clase `game-only`)

- **Células** - Slider: número de células disponibles para colocar (5-100, paso 5)
- **Generaciones** - Slider: límite de generaciones (0-500, paso 10; 0 = ∞)
- **Pausa** - Botón pausa/reanudar simulación
- **Panel game-info** - Muestra Células restantes / Objetivo / Puntos
- **Tooltip** - Texto contextual en la parte inferior que explica qué hacer en cada fase y modo

### Controles ocultos en modo juego (clase `viz-only`)

- Tipo de Mundo, Opacidad Mundo, Reglas (B/S)

## Sistema de Raycasting

Para colocar células en modos de juego:
- `getGridCellFromClick(event)` - Convierte click en coordenada de celda via intersección con `THREE.Plane(Y=0)`
- `onGridClick(event)` - Toggle celda viva/muerta con control de budget; discrimina click vs drag (umbral 5px)
- Event listeners `pointerdown`/`pointerup` en el canvas del renderer

## Malla de Referencia (GridHelper)

- `createGridHelper()` - Crea `THREE.LineSegments` con líneas cada celda (GRID_ROWS+1 × GRID_COLS+1)
- Color `#00f2ff`, opacidad 0.12, posición Y=0.01
- Visible en fase `placing` y `result`, oculta en `running` y modo Visualización
- Se recrea al cambiar tamaño de grid

## Controles de Usuario

- **Modo** - Selector: Visualización / Supervivencia / Conquista
- **Movimiento Cámara** - Selector: Desactivado / Órbita / Cinematográfico
- **Tipo de Mundo** - Selector de geometría del mundo (reinicia al cambiar) `viz-only`
- **Opacidad Mundo** - Transparencia de la superficie del mundo (0-1) `viz-only`
- **Geometría Célula** - Forma de las células (barras, esferas, pirámides, toros)
- **Efecto Neón** - Toggle del sistema de bloom
- **Reglas (B/S)** - Selector de variante del autómata celular (reinicia al cambiar) `viz-only`
- **Filas (X)** - Slider para ajustar filas del grid (20-200, paso 10)
- **Columnas (Z)** - Slider para ajustar columnas del grid (20-200, paso 10)
- **Velocidad** - Intervalo entre generaciones (30-800ms)
- **Células** - Slider de budget para modos de juego (5-100) `game-only`
- **Generaciones** - Slider de límite de generaciones (0-500, 0=∞) `game-only`
- **Reiniciar Mundo / Jugar / Reintentar** - Botón contextual según modo y fase
- **Pausa** - Botón pausa/reanudar `game-only`

- **Pantalla completa** - Botón ⛶ junto al hamburguesa (Fullscreen API, icono cambia a ✖ en fullscreen)

El panel es colapsable mediante un botón hamburguesa (&#9776;) en la esquina superior derecha.

## Intro Splash

Animación de entrada a pantalla completa con estética cyberpunk/TRON:

| Elemento | Animación | Timing |
|----------|-----------|--------|
| **Línea horizontal** | Expande de 0 a 40vw con gradiente cyan | 0.6s, delay 0.6s |
| **"TRONWAY"** | Desenfoque → foco, spacing amplio → normal, scaleY comprimido → 1 | 1.2s, cubic-bezier |
| **"Game of Life 3D"** | Fade-in sutil desde abajo | 0.8s, delay 1.4s |
| **"Click para entrar"** | Pulso de opacidad infinito | loop, delay 2.5s |
| **Scanlines** | Líneas horizontales estáticas semitransparentes (efecto CRT) | permanente |
| **Glow** | Alternancia de intensidad text-shadow en título | loop infinito |

- Fuente: Open 24 Display St, color `#00f2ff`, fondo `#010105`
- La escena 3D se renderiza detrás pero la **simulación arranca pausada** (`gamePaused = true`)
- **Dismiss**: click, touch o cualquier tecla → fade-out 1s + `remove()` del DOM
- **600ms** después del dismiss se despausa la simulación (solo en modo visualización)
- Etiquetas SEO incluidas: meta description, keywords, Open Graph, Twitter Card

## Rendimiento

- Usa `InstancedMesh` para renderizar hasta 40,000 células (200x200) con una sola draw call
- Interpolación suave de escala (`visualScales`) para transiciones vida/muerte
- `DynamicDrawUsage` para actualizaciones frecuentes de matriz de instancias
- Material del mundo: `MeshStandardMaterial` con roughness 0.7, metalness 0.1

## Funciones Principales

### Intro
- `dismissIntro()` - Fade-out del overlay intro y despausa la simulación tras 600ms (IIFE autocontenida)

### Core
- `init()` - Inicialización de escena, cámara, luces, controles y eventos
- `updateSimulation()` - Cálculo de siguiente generación según reglas B/S seleccionadas
- `animate()` - Loop de renderizado, interpolación visual y actualización de bloom (respeta `gamePaused`)
- `getNoiseHeight()` - Generación procedural de terreno con ruido discretizado en 5 niveles
- `updateWorldShell()` - Cambio de geometría del mundo (plano, esfera, toroide, procedural)
- `analyzeStatus()` - Detección de estados (caos/estable/extinción); desactivada en modos de juego
- `fitCameraToWorld()` - Ajuste automático de cámara según tipo y tamaño del mundo
- `resizeGrid()` - Redimensionado del grid con reinicio completo de arrays y mesh
- `resetGame()` - Reset del sandbox en modo visualización
- `initCinematicCamera()` - Inicialización del modo cinematográfico desde la posición actual
- `updateCinematicCamera()` - Interpolación suave entre puntos de vista aleatorios
- `startRebootCountdown()` / `stopRebootCountdown()` - Control del overlay de reinicio automático

### Game Mode System
- `switchGameMode(mode)` - Transición entre modos con reset completo (grid, cámara, contadores, UI)
- `startGame(mode)` - Inicia partida: limpia grid, lee budget/generaciones de sliders, fase `placing`
- `runGame()` - Lanza simulación tras colocar células, fase `running`
- `updateGameState(alive, stable)` - Evalúa puntuación y condiciones de fin por generación
- `endGame(result)` - Fin de partida: pausa, muestra resultado, fase `result`
- `updateGameUI()` - Actualiza displays de budget/objetivo/puntos
- `updateGameTooltip()` - Texto contextual dinámico según modo y fase
- `createGridHelper()` - Crea malla de referencia `THREE.LineSegments` para posicionar células
- `showGridHelper(visible)` - Muestra/oculta la malla
- `getGridCellFromClick(event)` - Raycasting: convierte click en índice de celda del grid
- `onGridClick(event)` - Toggle celda viva/muerta con control de budget
