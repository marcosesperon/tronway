# TRONWAY

**Visualización 3D interactiva del Juego de la Vida de Conway** con estética cyberpunk/TRON, efecto neón, múltiples mundos y modos de juego. Construido con Three.js.

<!-- Reemplaza con una captura real del proyecto -->
<!-- ![TRONWAY Screenshot](screenshot.png) -->

## Características

- **Motor 3D** — Renderizado WebGL con Three.js e `InstancedMesh` para alto rendimiento (hasta 40,000 células)
- **Efecto Neón** — Post-procesado UnrealBloomPass con bloom dinámico que se adapta a la distancia de cámara
- **4 tipos de mundo** — Plano, Esférico, Toroide (donut) y Terreno Procedural con ruido discretizado
- **4 geometrías de célula** — Barras, Esferas, Pirámides y Toros con rotación animada
- **10 variantes de reglas** — Conway, HighLife, Day & Night, Seeds, Diamoeba, 2x2, Morley, Anneal, Replicator, Maze
- **3 modos de juego** — Visualización (sandbox), Supervivencia y Conquista
- **3 modos de cámara** — Manual, Órbita automática y Cinematográfico con interpolación suave
- **Grid configurable** — De 20×20 a 200×200 células
- **Intro animada** — Splash cyberpunk con efecto CRT scanlines y fuente retro
- **Responsive** — Soporte para pantalla completa y dispositivos táctiles

## Demo

Abre `index.html` en cualquier navegador moderno con soporte WebGL.

## Instalación

No requiere instalación, build ni dependencias externas. Todas las librerías están incluidas.

```bash
git clone https://github.com/tu-usuario/tronway.git
cd tronway
```

Abre `index.html` directamente en el navegador o sírvelo con cualquier servidor estático:

```bash
# Python
python3 -m http.server 8000

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8000
```

> **Nota:** Algunos navegadores bloquean ES modules al abrir archivos locales (`file://`). Si ocurre, usa un servidor local.

## Uso

### Controles generales

| Control | Descripción |
|---------|-------------|
| **Rueda del ratón** | Zoom |
| **Click + arrastrar** | Rotar cámara |
| **Click derecho + arrastrar** | Desplazar cámara |
| **Panel ☰** | Abrir/cerrar controles (esquina superior derecha) |
| **⛶** | Pantalla completa |

### Modo Visualización (sandbox)

El autómata celular evoluciona libremente. Puedes modificar el tipo de mundo, las reglas B/S, la geometría de las células, el tamaño del grid, la velocidad y el efecto neón. Cuando la población se estabiliza o se extingue, se reinicia automáticamente.

### Modo Supervivencia

Coloca tus células en el grid y pulsa **JUGAR**. Tu objetivo es que la colonia sobreviva el mayor número de generaciones posible. La partida termina por extinción o estabilización.

### Modo Conquista

Coloca células y acumula la mayor población total posible a lo largo de un número limitado de generaciones. Cada generación suma todas las células vivas a tu puntuación.

## Reglas del autómata celular

El sistema usa notación **B/S** (Birth/Survival) con topología toroidal:

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

## Estructura del proyecto

```
tronway/
├── index.html              # Aplicación completa (HTML + CSS + JS)
├── three.module.js         # Three.js (ES6 module)
├── fonts/
│   └── open-24-display/    # Fuente retro para UI
├── addons/
│   ├── controls/           # OrbitControls
│   ├── postprocessing/     # EffectComposer, RenderPass, UnrealBloomPass
│   └── shaders/            # Luminosity, Copy, LuminosityHighPass
└── README.md
```

## Stack tecnológico

- **Three.js** — Motor de renderizado 3D WebGL
- **ES6 Modules** — Import maps nativos del navegador
- **HTML5 / CSS3** — Interfaz, animaciones y efectos
- **Sin frameworks** — Vanilla JS, sin dependencias de build

## Compatibilidad

Requiere un navegador moderno con soporte para:
- WebGL 2.0
- ES6 Modules / Import Maps
- Fullscreen API

Probado en Chrome, Firefox, Safari y Edge.

## Licencia

Este proyecto es software propietario. Todos los derechos reservados.

---

<p align="center">
  <strong>TRONWAY</strong> — Game of Life 3D
</p>
