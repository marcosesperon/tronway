// =====================================================================
// TRONWAY — Juego de la Vida 3D con Three.js
// =====================================================================
// Visualizacion interactiva del automata celular de Conway en 3D.
// Soporta multiples geometrias de mundo (plano, esfera, toroide,
// procedural), varias reglas de automata celular, modos de juego
// (Supervivencia, Conquista) y efectos de post-procesado (bloom/neon).
// =====================================================================

// --- Imports de Three.js y addons ---
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// =====================================================================
// CONFIGURACION DEL GRID
// =====================================================================
// Dimensiones del grid: se adaptan a la orientacion de la pantalla.
// En horizontal (landscape): 140 filas x 80 columnas.
// En vertical (portrait):    80 filas x 140 columnas.
var GRID_ROWS = window.innerHeight > window.innerWidth ? 80 : 140;
var GRID_COLS = window.innerHeight > window.innerWidth ? 140 : 80;
var GRID_TOTAL = GRID_ROWS * GRID_COLS;

// =====================================================================
// VARIABLES GLOBALES DE THREE.JS
// =====================================================================
let scene, camera, renderer, composer, controls, mesh, worldShell, bloomPass;

// =====================================================================
// ARRAYS DE ESTADO DE LA SIMULACION
// =====================================================================
// grid[]           — estado actual de cada celula (0 = muerta, 1 = viva)
// prevGrid[]       — estado de la generacion anterior (para detectar patrones estables)
// patternMap[]     — marca celulas estables (1 = estable, 0 = no)
// glowIntensity[]  — intensidad del destello neon por celula (se desvanece con el tiempo)
// visualScales[]   — escala visual interpolada para transiciones suaves vida/muerte
let grid = [], prevGrid = [], patternMap = [], glowIntensity = [], visualScales = [];

// Objeto auxiliar para calcular matrices de transformacion de cada instancia
let dummy = new THREE.Object3D();

// =====================================================================
// VARIABLES DE CONTROL DE LA SIMULACION
// =====================================================================
let lastStepTime = 0;          // timestamp del ultimo paso de simulacion
let simulationSpeed = 150;     // intervalo entre generaciones en ms (configurable 30-800)
let popHistory = [];           // historial de poblacion (ultimas 40 generaciones)
let generationCount = 0;       // contador de generaciones desde el ultimo reset

// =====================================================================
// VARIABLES DEL SISTEMA DE REBOOT
// =====================================================================
// Cuando la simulacion se estabiliza o se extingue, se muestra un overlay
// con estadisticas finales y una cuenta atras de 10 segundos para reiniciar.
let rebootTime = 10;           // segundos restantes para el reinicio
let rebootInterval = null;     // referencia al setInterval de la cuenta atras

// Semilla aleatoria para la generacion de terreno procedural
let worldSeed = Math.random() * 100;

// =====================================================================
// PARAMETROS DEL EFECTO NEON (UnrealBloomPass)
// =====================================================================
// El bloom se ajusta dinamicamente segun la distancia de la camara
// para evitar quemado visual al acercarse.
let neonParams = {
  strength: 1.75,   // intensidad del halo
  radius: 1,        // dispersion del halo
  threshold: 0.75   // umbral minimo de luminosidad para activar el bloom
};

// =====================================================================
// GEOMETRIAS DE CELULAS
// =====================================================================
// Cada celula puede representarse con una de estas formas.
// Se usa InstancedMesh para renderizar todas con una sola draw call.
const geometries = {
    box: new THREE.BoxGeometry(0.85, 0.85, 0.85),
    sphere: new THREE.SphereGeometry(0.5, 12, 12),
    pyramid: new THREE.TetrahedronGeometry(0.6),
    donut: new THREE.TorusGeometry(0.4, 0.15, 8, 16)
};

// =====================================================================
// ESTADO DE CONTROLES ACTIVOS
// =====================================================================
let currentShape = 'box';          // geometria de celula activa
let currentWorld = 'plane';        // tipo de mundo: plane | sphere | torus | procedural
let currentRules = 'conway';       // variante de reglas del automata celular
let currentCameraMode = 'off';     // modo de camara: off | orbit | cinematic
let neonGlowEnabled = true;        // efecto neon activado/desactivado

// =====================================================================
// CAMARA CINEMATOGRAFICA
// =====================================================================
// Sistema de movimiento automatico de camara que interpola linealmente
// entre puntos de vista aleatorios en coordenadas esfericas.
// Usa velocidades constantes (no exponenciales) para un movimiento uniforme.
var cinematic = {
    targetDistance: 50,        // distancia objetivo al centro
    targetAngleH: 0,           // angulo horizontal objetivo (radianes)
    targetAngleV: 0.4,        // angulo vertical objetivo (radianes)
    currentDistance: 50,        // distancia actual
    currentAngleH: 0,          // angulo horizontal actual
    currentAngleV: 0.4,        // angulo vertical actual
    nextChangeTime: 0,         // (sin uso actualmente, se genera nuevo objetivo por proximidad)
    transitionSpeed: 0.02      // (sin uso actualmente, reemplazado por steps lineales)
};

// =====================================================================
// ESTADO DEL SISTEMA DE JUEGO
// =====================================================================
// Maquina de estados: visualization (sandbox libre) | survival | conquest
// Fases: idle -> placing (colocar celulas) -> running (simulacion) -> result (fin)
var gameMode = 'visualization';
var gamePhase = 'idle';
var gamePaused = true;         // inicia pausado para la pantalla de intro
var cellBudget = 0;            // celulas disponibles para colocar
var cellsPlaced = 0;           // celulas ya colocadas por el jugador
var gameScore = 0;             // puntuacion acumulada
var gameGenLimit = 0;          // limite de generaciones (0 = sin limite)
var playerCells = [];          // indices de celulas colocadas por el jugador

// =====================================================================
// RAYCASTING — Interaccion con el grid
// =====================================================================
// Sistema que convierte clicks/taps en la pantalla a coordenadas de celda
// del grid, permitiendo al jugador colocar/quitar celulas en modos de juego.
// Usa un plano invisible (Y=0) como superficie de interseccion.
var raycaster = new THREE.Raycaster();
var mouseVec = new THREE.Vector2();
var gridPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
var gridHelper = null;         // malla visual de referencia (THREE.LineSegments)

// =====================================================================
// REGLAS DEL AUTOMATA CELULAR
// =====================================================================
// Notacion B/S (Birth/Survival):
//   birth    — numero de vecinos necesarios para que nazca una celula muerta
//   survival — numero de vecinos necesarios para que sobreviva una celula viva
// Topologia toroidal: los bordes del grid se conectan entre si.
const rules = {
    conway:     { birth: [3],              survival: [2, 3] },
    highlife:   { birth: [3, 6],           survival: [2, 3] },
    daynight:   { birth: [3, 6, 7, 8],    survival: [3, 4, 6, 7, 8] },
    seeds:      { birth: [2],              survival: [] },
    diamoeba:   { birth: [3, 5, 6, 7, 8], survival: [5, 6, 7, 8] },
    '2x2':      { birth: [3, 6],           survival: [1, 2, 5] },
    morley:     { birth: [3, 6, 8],        survival: [2, 4, 5] },
    anneal:     { birth: [4, 6, 7, 8],     survival: [3, 5, 6, 7, 8] },
    replicator: { birth: [1, 3, 5, 7],     survival: [1, 3, 5, 7] },
    maze:       { birth: [3],              survival: [1, 2, 3, 4, 5] }
};

/**
 * getNoiseHeight — Genera altura de terreno procedural
 *
 * Utiliza funciones sinusoidales combinadas como ruido pseudo-aleatorio,
 * luego discretiza el resultado en 5 niveles para un aspecto angular
 * (tipo escalones/terrazas). Se usa para el tipo de mundo "procedural".
 *
 * @param {number} x    — coordenada fila de la celda
 * @param {number} z    — coordenada columna de la celda
 * @param {number} seed — semilla aleatoria para variar el terreno
 * @returns {number} altura en unidades 3D (rango aprox. -8 a +8)
 */
function getNoiseHeight(x, z, seed) {
    var fx = x * 0.12;
    var fz = z * 0.12;
    var h = Math.sin(fx + seed) * Math.cos(fz + seed);
    h += Math.sin(fx * 2 + seed) * Math.cos(fz * 1.5) * 0.4;
    var levels = 5;
    h = Math.floor(h * levels) / levels;
    return h * 8;
}

// =====================================================================
// PERSISTENCIA DE AJUSTES (localStorage)
// =====================================================================
// Todos los ajustes de controles se guardan como un unico objeto JSON
// en la clave 'tronway_settings'. Se restauran al cargar la pagina
// (antes de init) y se guardan en cada cambio de control.

var STORAGE_KEY = 'tronway_settings';

/**
 * guardar_ajustes — Serializa el estado actual de los controles a localStorage
 *
 * Recoge los valores de todos los controles de la UI y los guarda
 * como un unico JSON. Se invoca tras cada cambio de control.
 */
function guardar_ajustes() {
    var ajustes = {
        gameMode: document.getElementById('gameMode').value,
        cameraMode: document.getElementById('cameraMode').value,
        worldSelect: document.getElementById('worldSelect').value,
        worldOpacity: document.getElementById('worldOpacity').value,
        shapeSelect: document.getElementById('shapeSelect').value,
        neonToggle: document.getElementById('neonToggle').checked,
        ambientToggle: document.getElementById('ambientToggle').checked,
        rulesSelect: document.getElementById('rulesSelect').value,
        rowsRange: document.getElementById('rowsRange').value,
        colsRange: document.getElementById('colsRange').value,
        speedRange: document.getElementById('speedRange').value,
        budgetRange: document.getElementById('budgetRange').value,
        genLimitRange: document.getElementById('genLimitRange').value
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ajustes));
    } catch (e) { /* localStorage no disponible o lleno, ignorar */ }
}

/**
 * restaurar_ajustes — Lee los ajustes de localStorage y los aplica
 *
 * Se ejecuta antes de init(). Restaura los valores de los controles HTML,
 * y sincroniza las variables JS globales con esos valores para que init()
 * trabaje con la configuracion guardada. Si no hay datos guardados o hay
 * error, se usan los valores por defecto del HTML.
 */
function restaurar_ajustes() {
    var json;
    try {
        json = localStorage.getItem(STORAGE_KEY);
    } catch (e) { return; }
    if (!json) return;
    var a;
    try {
        a = JSON.parse(json);
    } catch (e) { return; }

    // Selects
    if (a.cameraMode) document.getElementById('cameraMode').value = a.cameraMode;
    if (a.worldSelect) document.getElementById('worldSelect').value = a.worldSelect;
    if (a.shapeSelect) document.getElementById('shapeSelect').value = a.shapeSelect;
    if (a.rulesSelect) document.getElementById('rulesSelect').value = a.rulesSelect;
    if (a.gameMode) document.getElementById('gameMode').value = a.gameMode;

    // Ranges
    if (a.worldOpacity) document.getElementById('worldOpacity').value = a.worldOpacity;
    if (a.rowsRange) {
        document.getElementById('rowsRange').value = a.rowsRange;
        document.getElementById('rowsVal').innerText = a.rowsRange;
    }
    if (a.colsRange) {
        document.getElementById('colsRange').value = a.colsRange;
        document.getElementById('colsVal').innerText = a.colsRange;
    }
    if (a.speedRange) document.getElementById('speedRange').value = a.speedRange;
    if (a.budgetRange) {
        document.getElementById('budgetRange').value = a.budgetRange;
        document.getElementById('budgetVal').innerText = a.budgetRange;
    }
    if (a.genLimitRange) {
        document.getElementById('genLimitRange').value = a.genLimitRange;
        var v = parseInt(a.genLimitRange);
        document.getElementById('genLimitVal').innerText = v === 0 ? '∞' : v;
    }

    // Checkboxes
    if (typeof a.neonToggle === 'boolean') document.getElementById('neonToggle').checked = a.neonToggle;
    if (typeof a.ambientToggle === 'boolean') document.getElementById('ambientToggle').checked = a.ambientToggle;

    // Sincronizar variables JS con los valores restaurados
    GRID_ROWS = parseInt(document.getElementById('rowsRange').value);
    GRID_COLS = parseInt(document.getElementById('colsRange').value);
    GRID_TOTAL = GRID_ROWS * GRID_COLS;
    currentWorld = document.getElementById('worldSelect').value;
    currentShape = document.getElementById('shapeSelect').value;
    currentRules = document.getElementById('rulesSelect').value;
    currentCameraMode = document.getElementById('cameraMode').value;
    simulationSpeed = 830 - parseInt(document.getElementById('speedRange').value);
    neonGlowEnabled = document.getElementById('neonToggle').checked;
    if (!document.getElementById('ambientToggle').checked) {
        document.getElementById('ambient-bg').style.display = 'none';
    }
}

// Restaurar ajustes ANTES de inicializar la escena
restaurar_ajustes();

// =====================================================================
// ARRANQUE DE LA APLICACION
// =====================================================================
init();
animate();

// Aplicar ajustes que dependen de objetos creados en init()
// (bloomPass, controls, gameMode) tras la inicializacion
(function() {
    // Neon: aplicar estado del toggle restaurado
    if (!neonGlowEnabled) {
        bloomPass.strength = 0.2;
        bloomPass.radius = 0.1;
        bloomPass.threshold = 0.8;
    }
    // Camara: activar modo restaurado
    controls.autoRotate = (currentCameraMode === 'orbit');
    if (currentCameraMode === 'cinematic') initCinematicCamera();
    // Modo de juego: activar si estaba en modo juego
    var savedMode = document.getElementById('gameMode').value;
    if (savedMode !== 'visualization') {
        switchGameMode(savedMode);
    }
    // Mostrar tooltip de reglas en modo visualizacion al cargar
    updateGameTooltip();
})();

// =====================================================================
// DETECCION DE CAPACIDADES DEL DISPOSITIVO
// =====================================================================
// Comprueba las capacidades graficas del dispositivo al iniciar.
// Si el hardware es limitado, desactiva automaticamente los efectos
// mas costosos (neon/bloom y fondo ambient) y deshabilita sus controles.
//
// Criterios de deteccion:
//   1. GPU integrada o de bajo rendimiento (Intel, SwiftShader, Mesa, etc.)
//   2. Memoria del dispositivo < 4 GB (navigator.deviceMemory)
//   3. Nucleos de CPU < 4 (navigator.hardwareConcurrency)
//   4. Dispositivo movil con pantalla tactil y ancho < 900px
//   5. MAX_TEXTURE_SIZE de WebGL < 4096
(function() {
    var dominated = false;
    var gl = renderer.getContext();
    var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
        var gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
        var lowGPU = ['intel', 'swiftshader', 'llvmpipe', 'mesa', 'microsoft basic'];
        for (var i = 0; i < lowGPU.length; i++) {
            if (gpuRenderer.indexOf(lowGPU[i]) !== -1) { dominated = true; break; }
        }
    }
    if (navigator.deviceMemory && navigator.deviceMemory < 4) dominated = true;
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) dominated = true;
    if ('ontouchstart' in window && window.innerWidth < 900) dominated = true;
    var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (maxTex < 4096) dominated = true;

    if (dominated) {
        // Desactivar efecto neon (bloom minimo)
        var neonToggle = document.getElementById('neonToggle');
        neonToggle.checked = false;
        neonToggle.disabled = true;
        neonGlowEnabled = false;
        bloomPass.strength = 0.2;
        bloomPass.radius = 0.1;
        bloomPass.threshold = 0.8;
        // Desactivar fondo ambient animado
        var ambientToggle = document.getElementById('ambientToggle');
        ambientToggle.checked = false;
        ambientToggle.disabled = true;
        document.getElementById('ambient-bg').style.display = 'none';
    }
})();

// =====================================================================
// PANTALLA DE INTRO (SPLASH)
// =====================================================================
// Muestra el titulo "TRONWAY" a pantalla completa con animaciones
// cyberpunk (glow, scanlines, linea expandible). La simulacion permanece
// pausada hasta que el usuario interactua (click, touch o tecla).
// Tras el dismiss, se desvanece con fadeout y arranca la simulacion
// despues de un breve delay de 600ms.
(function() {
    var overlay = document.getElementById('intro-overlay');
    var title = document.getElementById('intro-title');
    var subtitle = document.getElementById('intro-subtitle');
    var line = document.getElementById('intro-line');
    var hint = document.getElementById('intro-hint');
    // Lanzar animaciones CSS tras el primer frame de pintura
    requestAnimationFrame(function() {
        line.classList.add('visible');
        title.classList.add('visible');
        subtitle.classList.add('visible');
        hint.classList.add('visible');
    });
    /**
     * dismissIntro — Cierra la pantalla de intro
     * Aplica animacion de fadeout y arranca la simulacion tras 600ms.
     * Solo se ejecuta una vez (proteccion contra multiples llamadas).
     */
    function dismissIntro() {
        if (overlay.classList.contains('fade-out')) return;
        overlay.classList.add('fade-out');
        overlay.addEventListener('animationend', function() {
            overlay.remove();
        });
        setTimeout(function() {
            if (gameMode === 'visualization') gamePaused = false;
        }, 600);
    }
    overlay.addEventListener('click', dismissIntro);
    overlay.addEventListener('touchstart', dismissIntro);
    document.addEventListener('keydown', function handler() {
        dismissIntro();
        document.removeEventListener('keydown', handler);
    });
})();

// =====================================================================
// init() — Inicializacion principal
// =====================================================================
// Configura la escena 3D (Three.js), la camara, el renderer, las luces,
// el sistema de post-procesado (bloom), crea el grid inicial con celulas
// aleatorias, y registra todos los event listeners de la interfaz.
function init() {
    // Sincronizar sliders de filas/columnas con los valores iniciales
    document.getElementById('rowsRange').value = GRID_ROWS;
    document.getElementById('rowsVal').innerText = GRID_ROWS;
    document.getElementById('colsRange').value = GRID_COLS;
    document.getElementById('colsVal').innerText = GRID_COLS;

    // --- Escena ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010105);      // negro casi puro
    scene.fog = new THREE.FogExp2(0x010105, 0.01);     // niebla exponencial para profundidad

    // --- Camara ---
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

    // --- Renderer ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));  // limitar a 2x para rendimiento
    renderer.toneMapping = THREE.ACESFilmicToneMapping;            // tone mapping cinematografico
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);

    // --- Controles de orbita ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;      // inercia suave al soltar
    controls.autoRotate = false;
    controls.autoRotateSpeed = 1.0;

    // --- Luces ---
    // Luz hemisferica: iluminacion ambiental cielo/suelo
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.8);
    scene.add(hemiLight);
    // Luz direccional: sombras y volumen
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    // --- Inicializar elementos 3D ---
    createInstancedMesh();    // crear InstancedMesh para las celulas
    updateWorldShell();       // crear la geometria del mundo (plano, esfera, etc.)
    fitCameraToWorld();       // posicionar la camara segun el tamaño del mundo

    // --- Poblar grid con celulas aleatorias (15% de probabilidad de vida) ---
    for (let i = 0; i < GRID_TOTAL; i++) {
        grid[i] = Math.random() > 0.85 ? 1 : 0;
        prevGrid[i] = 0;
        patternMap[i] = 0;
        glowIntensity[i] = grid[i] ? 1.0 : 0;
        visualScales[i] = grid[i] ? 1.0 : 0;
    }

    // --- Post-procesado (bloom/neon) ---
    // Pipeline: RenderPass (escena normal) -> UnrealBloomPass (halo neon)
    const renderPass = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        neonParams.strength,
        neonParams.radius,
        neonParams.threshold
    );
    composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    // =================================================================
    // EVENT LISTENERS — Controles de interfaz
    // =================================================================

    // Velocidad de simulacion: slider invertido (valor alto = mas rapido)
    document.getElementById('speedRange').addEventListener('input', (e) => { simulationSpeed = 830 - e.target.value; guardar_ajustes(); });

    // Pantalla completa: toggle usando Fullscreen API
    document.getElementById('fullscreenBtn').addEventListener('click', function() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });
    // Actualizar icono del boton segun estado fullscreen
    document.addEventListener('fullscreenchange', function() {
        var btn = document.getElementById('fullscreenBtn');
        btn.innerHTML = document.fullscreenElement ? '&#x2716;' : '&#x26F6;';
        btn.title = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
    });

    // Toggle del panel de controles (hamburguesa / X)
    document.getElementById('toggleBtn').addEventListener('click', () => {
        var wrapper = document.getElementById('controls-wrapper');
        var btn = document.getElementById('toggleBtn');
        var panel = document.getElementById('ui-panel');
        if (wrapper.style.display === 'none') {
            wrapper.style.display = 'block';
            btn.innerHTML = '&#10005;';
            panel.classList.remove('collapsed');
        } else {
            wrapper.style.display = 'none';
            btn.innerHTML = '&#9776;';
            panel.classList.add('collapsed');
        }
    });

    // Filas del grid: actualizar label en tiempo real, redimensionar al soltar
    document.getElementById('rowsRange').addEventListener('input', (e) => {
        document.getElementById('rowsVal').innerText = e.target.value;
    });
    document.getElementById('rowsRange').addEventListener('change', (e) => {
        GRID_ROWS = parseInt(e.target.value);
        resizeGrid();
        if (gameMode !== 'visualization') {
            createGridHelper();
            startGame(gameMode);
        }
        guardar_ajustes();
    });

    // Columnas del grid: misma logica que filas
    document.getElementById('colsRange').addEventListener('input', (e) => {
        document.getElementById('colsVal').innerText = e.target.value;
    });
    document.getElementById('colsRange').addEventListener('change', (e) => {
        GRID_COLS = parseInt(e.target.value);
        resizeGrid();
        if (gameMode !== 'visualization') {
            createGridHelper();
            startGame(gameMode);
        }
        guardar_ajustes();
    });

    // Boton principal: contexto segun modo y fase del juego
    //   - Visualizacion: reinicia el mundo
    //   - Modo juego + placing: lanza la simulacion (JUGAR)
    //   - Modo juego + running/result: reinicia la partida (REINTENTAR)
    document.getElementById('resetBtn').addEventListener('click', function() {
        if (gameMode === 'visualization') {
            resetGame();
        } else if (gamePhase === 'placing') {
            runGame();
        } else {
            startGame(gameMode);
        }
    });

    // Modo de camara: desactivado / orbita / cinematografico
    document.getElementById('cameraMode').addEventListener('change', (e) => {
        currentCameraMode = e.target.value;
        controls.autoRotate = (currentCameraMode === 'orbit');
        if (currentCameraMode === 'cinematic') {
            initCinematicCamera();
        }
        guardar_ajustes();
    });

    // Opacidad del mundo (superficie)
    document.getElementById('worldOpacity').addEventListener('input', (e) => {
        if (worldShell) worldShell.material.opacity = parseFloat(e.target.value);
        guardar_ajustes();
    });

    // Geometria de las celulas
    document.getElementById('shapeSelect').addEventListener('change', (e) => {
        currentShape = e.target.value;
        createInstancedMesh();
        guardar_ajustes();
    });

    // Toggle efecto neon: activa/desactiva el bloom
    document.getElementById('neonToggle').addEventListener('change', (e) => {
        neonGlowEnabled = e.target.checked;
        if (neonGlowEnabled) {
            bloomPass.strength = neonParams.strength;
            bloomPass.radius = neonParams.radius;
            bloomPass.threshold = neonParams.threshold;
        } else {
            // Bloom minimo (no se puede desactivar completamente sin quitar el pass)
            bloomPass.strength = 0.2;
            bloomPass.radius = 0.1;
            bloomPass.threshold = 0.8;
        }
        guardar_ajustes();
    });

    // Toggle fondo ambient animado
    document.getElementById('ambientToggle').addEventListener('change', function(e) {
        document.getElementById('ambient-bg').style.display = e.target.checked ? '' : 'none';
        guardar_ajustes();
    });

    // Tipo de mundo: cambia la geometria y reinicia
    document.getElementById('worldSelect').addEventListener('change', (e) => {
        currentWorld = e.target.value;
        updateWorldShell();
        resetGame();
        guardar_ajustes();
    });

    // Reglas del automata celular: cambia las reglas y reinicia
    document.getElementById('rulesSelect').addEventListener('change', (e) => {
        currentRules = e.target.value;
        resetGame();
        updateGameTooltip();
        guardar_ajustes();
    });

    // --- Controles del modo de juego ---

    // Selector de modo de juego
    document.getElementById('gameMode').addEventListener('change', function(e) {
        switchGameMode(e.target.value);
        guardar_ajustes();
    });

    // Slider de presupuesto de celulas (modo juego)
    document.getElementById('budgetRange').addEventListener('input', function(e) {
        document.getElementById('budgetVal').innerText = e.target.value;
    });
    document.getElementById('budgetRange').addEventListener('change', function(e) {
        if (gameMode !== 'visualization') startGame(gameMode);
        guardar_ajustes();
    });

    // Slider de limite de generaciones (modo juego)
    document.getElementById('genLimitRange').addEventListener('input', function(e) {
        var v = parseInt(e.target.value);
        document.getElementById('genLimitVal').innerText = v === 0 ? '∞' : v;
    });
    document.getElementById('genLimitRange').addEventListener('change', function(e) {
        if (gameMode !== 'visualization') startGame(gameMode);
        guardar_ajustes();
    });

    // Boton de pausa (solo visible en modo juego)
    document.getElementById('pauseBtn').addEventListener('click', function() {
        gamePaused = !gamePaused;
        this.innerText = gamePaused ? '▶ REANUDAR' : '⏸ PAUSA';
    });

    // --- Raycasting: discriminar click vs. drag ---
    // Se guarda la posicion del pointerdown y se compara con pointerup.
    // Solo se considera click si el movimiento fue < 5px (evita falsos
    // positivos al rotar la camara con OrbitControls).
    var mouseDownPos = { x: 0, y: 0 };
    renderer.domElement.addEventListener('pointerdown', function(e) {
        mouseDownPos = { x: e.clientX, y: e.clientY };
    });
    renderer.domElement.addEventListener('pointerup', function(e) {
        if (Math.abs(e.clientX - mouseDownPos.x) < 5 && Math.abs(e.clientY - mouseDownPos.y) < 5) {
            onGridClick(e);
        }
    });

    // Redimensionar al cambiar tamaño de ventana
    window.addEventListener('resize', onWindowResize);
}

/**
 * updateWorldShell — Crea o reemplaza la geometria del mundo
 *
 * Genera la superficie 3D sobre la que viven las celulas.
 * Soporta 4 tipos: plano, esfera, toroide y procedural (terreno).
 * El material es semitransparente con color cyan y roughness alta.
 * Al cambiar de tipo, destruye la geometria anterior para liberar memoria.
 */
function updateWorldShell() {
    if (worldShell) {
        scene.remove(worldShell);
        worldShell.geometry.dispose();
    }

    let geo;
    const opacity = document.getElementById('worldOpacity').value;
    const mat = new THREE.MeshStandardMaterial({
        color: 0x00f2ff,
        roughness: 0.7,
        metalness: 0.1,
        transparent: true,
        opacity: parseFloat(opacity),
        side: THREE.DoubleSide
    });

    if (currentWorld === 'plane') {
        geo = new THREE.PlaneGeometry(GRID_ROWS, GRID_COLS, 20, 20);
        worldShell = new THREE.Mesh(geo, mat);
        worldShell.rotation.x = -Math.PI / 2;
        worldShell.position.y = -0.5;
    }
    else if (currentWorld === 'procedural') {
        // Segmentos independientes para filas y columnas
        const segmentsX = GRID_ROWS - 1;
        const segmentsZ = GRID_COLS - 1;
        const halfX = segmentsX / 2;
        const halfZ = segmentsZ / 2;
        geo = new THREE.PlaneGeometry(segmentsX, segmentsZ, segmentsX, segmentsZ);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i); // -halfX a halfX
            const vy = pos.getY(i); // -halfZ a halfZ
            // vx -> row: vx + halfX = 0..GRID_ROWS-1
            const row = vx + halfX;
            // vy se invierte con la rotacion -90 grados, invertimos el mapeo
            const col = halfZ - vy;
            pos.setZ(i, getNoiseHeight(row, col, worldSeed));
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        worldShell = new THREE.Mesh(geo, mat);
        worldShell.rotation.x = -Math.PI / 2;
        // Offset -0.5 en X y Z para alinear vertices con centros de celulas
        worldShell.position.set(-0.5, 0, -0.5);
    }
    else if (currentWorld === 'sphere') {
        geo = new THREE.SphereGeometry(25, 32, 32);
        worldShell = new THREE.Mesh(geo, mat);
    }
    else if (currentWorld === 'torus') {
        geo = new THREE.TorusGeometry(25, 10, 32, 64);
        worldShell = new THREE.Mesh(geo, mat);
    }
    scene.add(worldShell);
}

/**
 * createInstancedMesh — Crea el InstancedMesh de celulas
 *
 * Usa InstancedMesh de Three.js para renderizar hasta 40.000 celulas
 * (200x200) con una sola draw call. La geometria depende de currentShape.
 * DynamicDrawUsage permite actualizaciones frecuentes de la matriz.
 * Si ya existia un mesh anterior, lo destruye primero.
 */
function createInstancedMesh() {
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
    const material = new THREE.MeshStandardMaterial({ metalness: 0.1, roughness: 0.3, emissiveIntensity: 0.5 });
    mesh = new THREE.InstancedMesh(geometries[currentShape], material, GRID_TOTAL);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
}

/**
 * startRebootCountdown — Inicia la cuenta atras para reinicio automatico
 *
 * Se invoca cuando la simulacion alcanza estado EXTINCION o ESTABLE.
 * Muestra un overlay con estadisticas finales (generaciones, poblacion,
 * celulas estables, pico maximo) en estilo cyberpunk. La cuenta atras
 * de 10 segundos aparece en la esquina inferior derecha. Al llegar a 0,
 * se oculta el overlay y se reinicia la simulacion.
 *
 * @param {string} statusType — 'extincion' o 'estable', determina el
 *                               color y texto del titulo del overlay
 */
function startRebootCountdown(statusType) {
    if (rebootInterval) return;
    rebootTime = 10;
    var overlay = document.getElementById('reboot-overlay');
    var statusEl = document.getElementById('reboot-status');
    var lineEl = document.getElementById('reboot-line');
    var statsEl = document.getElementById('reboot-stats');
    document.getElementById('reboot-gen').innerText = generationCount;
    document.getElementById('reboot-pop').innerText = popHistory.length > 0 ? popHistory[popHistory.length - 1] : 0;
    document.getElementById('reboot-stable').innerText = document.getElementById('patternCount').innerText;
    var peakPop = popHistory.length > 0 ? Math.max.apply(null, popHistory) : 0;
    document.getElementById('reboot-peak').innerText = peakPop;
    // Status title
    statusEl.className = '';
    if (statusType === 'extincion') {
        statusEl.innerText = 'EXTINCION';
        statusEl.classList.add('status-ext');
    } else {
        statusEl.innerText = 'ESTABLE';
        statusEl.classList.add('status-stb');
    }
    // Reset animations by cloning
    lineEl.style.animation = 'none';
    statsEl.style.animation = 'none';
    void lineEl.offsetWidth;
    lineEl.style.animation = '';
    statsEl.style.animation = '';
    // Show overlay
    overlay.style.display = 'block';
    document.getElementById('timer').innerText = rebootTime;
    if (worldShell) worldShell.material.color.setHex(statusType === 'extincion' ? 0xff0055 : 0x00f2ff);
    rebootInterval = setInterval(function() {
        rebootTime--;
        document.getElementById('timer').innerText = rebootTime;
        if (rebootTime <= 0) {
            clearInterval(rebootInterval); rebootInterval = null;
            overlay.style.display = 'none'; resetGame();
        }
    }, 1000);
}

/**
 * stopRebootCountdown — Cancela la cuenta atras de reinicio
 *
 * Se invoca cuando la simulacion vuelve al estado CAOS (la poblacion
 * deja de estar estable) o al cambiar de modo de juego. Limpia el
 * intervalo, oculta el overlay y restaura el color del mundo a cyan.
 */
function stopRebootCountdown() {
    if (rebootInterval) {
        clearInterval(rebootInterval); rebootInterval = null;
        document.getElementById('reboot-overlay').style.display = 'none';
        if (worldShell) worldShell.material.color.setHex(0x00f2ff);
    }
}

/**
 * updateSimulation — Calcula la siguiente generacion del automata celular
 *
 * Recorre todas las celulas del grid, cuenta los vecinos vivos (topologia
 * toroidal) y aplica las reglas B/S seleccionadas para determinar el
 * siguiente estado. Tambien detecta celulas estables (misma posicion en
 * 3 generaciones consecutivas), activa el destello neon en celulas que
 * nacen, y actualiza los contadores de la interfaz. Al final, invoca
 * analyzeStatus() para deteccion de estados y updateGameState() si
 * hay una partida en curso.
 */
function updateSimulation() {
    let nextGrid = [];
    let totalAlive = 0, stableCount = 0;
    for (let i = 0; i < GRID_TOTAL; i++) {
        const x = Math.floor(i / GRID_COLS);  // fila
        const z = i % GRID_COLS;              // columna
        let neighbors = 0;
        for(let ix=-1; ix<=1; ix++) {
            for(let iz=-1; iz<=1; iz++) {
                if(ix===0 && iz===0) continue;
                const nx = (x + ix + GRID_ROWS) % GRID_ROWS;
                const nz = (z + iz + GRID_COLS) % GRID_COLS;
                neighbors += grid[nx * GRID_COLS + nz];
            }
        }
        const isAlive = grid[i] === 1;
        const rule = rules[currentRules];
        if (isAlive) {
            nextGrid[i] = rule.survival.includes(neighbors) ? 1 : 0;
        } else {
            nextGrid[i] = rule.birth.includes(neighbors) ? 1 : 0;
        }
        if (nextGrid[i] === 1 && nextGrid[i] === grid[i] && grid[i] === prevGrid[i]) {
            patternMap[i] = 1; stableCount++;
        } else { patternMap[i] = 0; }
        // Activar destello neon en celulas que nacen
        if (nextGrid[i] === 1 && grid[i] === 0) {
            glowIntensity[i] = 1.0;
        }
        if (nextGrid[i] === 1) totalAlive++;
    }
    prevGrid = [...grid]; grid = [...nextGrid];
    generationCount++;
    document.getElementById('genCount').innerText = generationCount;
    document.getElementById('popCount').innerText = totalAlive;
    document.getElementById('patternCount').innerText = stableCount;
    analyzeStatus(totalAlive);
    if (gamePhase === 'running') {
        updateGameState(totalAlive, stableCount);
    }
}

/**
 * initCinematicCamera — Inicializa el modo de camara cinematografico
 *
 * Captura la posicion actual de la camara y la convierte a coordenadas
 * esfericas (distancia, angulo horizontal, angulo vertical). Estas se
 * usan como punto de partida para la interpolacion lineal hacia puntos
 * de vista aleatorios en updateCinematicCamera().
 */
function initCinematicCamera() {
    var dist = camera.position.length();
    cinematic.currentDistance = dist;
    cinematic.targetDistance = dist;
    cinematic.currentAngleH = Math.atan2(camera.position.x, camera.position.z);
    cinematic.targetAngleH = cinematic.currentAngleH;
    cinematic.currentAngleV = Math.asin(camera.position.y / dist);
    cinematic.targetAngleV = cinematic.currentAngleV;
    cinematic.nextChangeTime = 0;
}

/**
 * updateCinematicCamera — Actualiza la posicion de la camara cinematografica
 *
 * Mueve la camara con interpolacion lineal (velocidad constante) hacia
 * un punto de vista aleatorio en coordenadas esfericas. Cuando se acerca
 * lo suficiente al objetivo, genera un nuevo destino aleatorio:
 *   - Distancia: 30-75 unidades
 *   - Angulo horizontal: giro gradual desde la posicion actual
 *   - Angulo vertical: 0.15-1.0 radianes (rasante a cenital)
 *
 * @param {number} time — timestamp del frame actual (no usado directamente)
 */
function updateCinematicCamera(time) {
    var distDiff = Math.abs(cinematic.targetDistance - cinematic.currentDistance);
    var angleHDiff = Math.abs(cinematic.targetAngleH - cinematic.currentAngleH);
    var angleVDiff = Math.abs(cinematic.targetAngleV - cinematic.currentAngleV);

    // Generar nuevo objetivo cuando estamos cerca del actual
    if (distDiff < 1 && angleHDiff < 0.05 && angleVDiff < 0.03) {
        cinematic.targetDistance = 30 + Math.random() * 45;
        cinematic.targetAngleH = cinematic.currentAngleH + (Math.random() - 0.5) * Math.PI * 0.8;
        cinematic.targetAngleV = 0.15 + Math.random() * 0.85;
    }

    // Interpolacion lineal: velocidad constante hacia el objetivo
    var stepDist = 0.08;
    var stepAngleH = 0.0008;
    var stepAngleV = 0.0004;

    var dd = cinematic.targetDistance - cinematic.currentDistance;
    if (Math.abs(dd) > stepDist) cinematic.currentDistance += (dd > 0 ? stepDist : -stepDist);
    else cinematic.currentDistance = cinematic.targetDistance;

    var dh = cinematic.targetAngleH - cinematic.currentAngleH;
    if (Math.abs(dh) > stepAngleH) cinematic.currentAngleH += (dh > 0 ? stepAngleH : -stepAngleH);
    else cinematic.currentAngleH = cinematic.targetAngleH;

    var dv = cinematic.targetAngleV - cinematic.currentAngleV;
    if (Math.abs(dv) > stepAngleV) cinematic.currentAngleV += (dv > 0 ? stepAngleV : -stepAngleV);
    else cinematic.currentAngleV = cinematic.targetAngleV;

    // Calcular posicion de camara en coordenadas esfericas
    var dist = cinematic.currentDistance;
    var angleH = cinematic.currentAngleH;
    var angleV = cinematic.currentAngleV;

    camera.position.x = dist * Math.cos(angleV) * Math.sin(angleH);
    camera.position.y = dist * Math.sin(angleV);
    camera.position.z = dist * Math.cos(angleV) * Math.cos(angleH);

    camera.lookAt(0, 0, 0);
}

/**
 * analyzeStatus — Analiza el estado de la simulacion
 *
 * Mantiene un historial de las ultimas 40 generaciones de poblacion.
 * Determina el estado actual:
 *   - EXTINCION: poblacion = 0 → inicia cuenta atras de reboot
 *   - ESTABLE:   variacion < 5 en 40 ciclos → inicia cuenta atras
 *   - CAOS:      poblacion oscilando → cancela reboot si estaba activo
 *
 * En modo juego, no interviene (la logica de fin la gestiona el game state).
 *
 * @param {number} currentPop — poblacion total de la generacion actual
 */
function analyzeStatus(currentPop) {
    popHistory.push(currentPop);
    if (popHistory.length > 40) popHistory.shift();
    if (gameMode !== 'visualization') return;
    const statusBox = document.getElementById('status-box');
    statusBox.className = "";
    if (currentPop === 0) {
        statusBox.innerText = "EXTINCIÓN"; statusBox.classList.add('status-extincion');
        startRebootCountdown('extincion');
    } else if (popHistory.length >= 40) {
        const range = Math.max(...popHistory) - Math.min(...popHistory);
        if (range < 5) {
            statusBox.innerText = "ESTABLE"; statusBox.classList.add('status-estable');
            startRebootCountdown('estable');
        } else {
            statusBox.innerText = "CAOS"; statusBox.classList.add('status-caos');
            stopRebootCountdown();
        }
    }
}

/**
 * animate — Bucle principal de renderizado (requestAnimationFrame)
 *
 * Se ejecuta en cada frame del navegador (~60fps). Responsabilidades:
 *   1. Ejecutar paso de simulacion si ha pasado el intervalo y no esta pausado
 *   2. Interpolar suavemente la escala visual de cada celula (transicion vida/muerte)
 *   3. Posicionar cada instancia segun el tipo de mundo (plano, esfera, toroide, procedural)
 *   4. Calcular colores: celulas estables (naranja), normales (cyan degradado),
 *      con boost neon y destello para celulas recien nacidas
 *   5. Actualizar camara cinematografica si esta activa
 *   6. Ajustar intensidad del bloom segun distancia de camara (evita quemado)
 *   7. Renderizar la escena con el compositor de post-procesado
 *
 * @param {number} time — timestamp en ms proporcionado por requestAnimationFrame
 */
function animate(time) {
    requestAnimationFrame(animate);
    if (!gamePaused && time - lastStepTime > simulationSpeed) { updateSimulation(); lastStepTime = time; }
    const color = new THREE.Color();

    for (let i = 0; i < GRID_TOTAL; i++) {
        const isAlive = grid[i] === 1;
        const isStable = patternMap[i] === 1;

        // Interpolar escala visual hacia el estado objetivo (suavizado)
        var targetScale = isAlive ? 1.0 : 0;
        var speed = 0.15;
        visualScales[i] += (targetScale - visualScales[i]) * speed;
        var s = visualScales[i];

        if (s < 0.01) {
            dummy.scale.set(0, 0, 0);
        } else {
            const row = Math.floor(i / GRID_COLS);
            const col = i % GRID_COLS;
            dummy.rotation.set(0, 0, 0);

            if (currentWorld === 'plane') {
                dummy.position.set(row - GRID_ROWS / 2, 0.5, col - GRID_COLS / 2);
                dummy.scale.set(0.9 * s, s, 0.9 * s);
            }
            else if (currentWorld === 'sphere') {
                const radius = 25;
                const phi = (row / GRID_ROWS) * Math.PI;
                const theta = (col / GRID_COLS) * Math.PI * 2;
                dummy.position.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi));
                dummy.lookAt(0, 0, 0);
                if (currentShape === 'sphere' || currentShape === 'donut') {
                    dummy.scale.set(s, s, s);
                } else {
                    dummy.scale.set(s, s, 2 * s);
                }
            }
            else if (currentWorld === 'torus') {
                const R = 25, r = 10;
                const u = (row / GRID_ROWS) * Math.PI * 2, v = (col / GRID_COLS) * Math.PI * 2;
                dummy.position.set((R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v));
                dummy.lookAt(R * Math.cos(u), R * Math.sin(u), 0);
                dummy.scale.set(s, s, s);
            }
            else if (currentWorld === 'procedural') {
                const terrainY = getNoiseHeight(row, col, worldSeed);
                dummy.position.set(row - GRID_ROWS / 2, terrainY + 0.5, col - GRID_COLS / 2);
                dummy.scale.set(0.9 * s, s, 0.9 * s);
            }

            if (currentShape === 'donut') dummy.rotation.x += time * 0.001;

            // Color base
            if (isStable) {
                color.setRGB(2.5, 0.6, 0.0);
            } else {
                color.setHSL(0.5 + (row / GRID_ROWS) * 0.1, 1.0, 0.5);
            }

            // Efecto neón: valores ligeramente >1 activan el halo del bloom
            if (neonGlowEnabled) {
                var neonBoost = 1.15;
                color.r *= neonBoost;
                color.g *= neonBoost;
                color.b *= neonBoost;
            }

            // Efecto destello extra para celulas nuevas
            if (glowIntensity[i] > 0) {
                const glow = glowIntensity[i];
                // Aumentar luminosidad para activar el bloom
                color.r *= 1 + glow * 0.8;
                color.g *= 1 + glow * 0.8;
                color.b *= 1 + glow * 0.8;
                // Desvanecer el glow
                glowIntensity[i] *= 0.88;
                if (glowIntensity[i] < 0.01) glowIntensity[i] = 0;
            }

            mesh.setColorAt(i, color);
        }
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Actualizar camara segun el modo
    if (currentCameraMode === 'cinematic') {
        updateCinematicCamera(time);
    }

    // Ajustar bloom según distancia de cámara (evita quemarse al acercar)
    if (neonGlowEnabled) {
        var dist = camera.position.length();
        // Rango: dist 40-160, factor 0.4-1.0
        var factor = Math.min(1.0, Math.max(0.4, (dist - 40) / 120));
        bloomPass.strength = neonParams.strength * factor;
    }

    controls.update(); composer.render();
}

/**
 * fitCameraToWorld — Ajusta la posicion de la camara al mundo actual
 *
 * Calcula la distancia optima para encuadrar el mundo completo segun
 * su tipo y dimensiones. Para mundos planos y procedurales, usa una
 * vista cenital; para esfera y toroide, una vista en perspectiva.
 */
function fitCameraToWorld() {
    const fov = camera.fov * (Math.PI / 180);
    const aspect = window.innerWidth / window.innerHeight;
    let worldSize, distance;

    if (currentWorld === 'sphere') {
        worldSize = 25 * 2; // diametro de la esfera
        distance = (worldSize / 2) / Math.tan(fov / 2);
        distance *= 1.2; // margen
        camera.position.set(0, distance * 0.5, distance * 0.7);
    } else if (currentWorld === 'torus') {
        worldSize = (25 + 10) * 2; // diametro del toro
        distance = (worldSize / 2) / Math.tan(fov / 2);
        distance *= 1.2;
        camera.position.set(0, distance * 0.5, distance * 0.7);
    } else {
        // plane y procedural - vista cenital ajustada al grid rectangular
        // Calcular distancia para que quepa vertical y horizontalmente
        const halfTanFov = Math.tan(fov / 2);
        const distForRows = (GRID_ROWS / 2) / (halfTanFov * aspect);  // ancho del grid
        const distForCols = (GRID_COLS / 2) / halfTanFov;             // alto del grid
        distance = Math.max(distForRows, distForCols) * 1.05;         // 5% margen
        // vista cenital (desde arriba)
        camera.position.set(0, distance, 0.01);
    }
    controls.target.set(0, 0, 0);
    controls.update();
}

/**
 * resizeGrid — Redimensiona el grid y reinicia la simulacion
 *
 * Se invoca al cambiar el numero de filas o columnas. Recalcula
 * GRID_TOTAL, reinicializa todos los arrays de estado, recrea el
 * InstancedMesh y el mundo, reposiciona la camara y limpia el
 * historial de poblacion. En modo cinematografico, reinicializa
 * la camara desde la posicion actual.
 */
function resizeGrid() {
    generationCount = 0;
    document.getElementById('genCount').innerText = 0;
    GRID_TOTAL = GRID_ROWS * GRID_COLS;
    // Reinicializar arrays
    grid = [];
    prevGrid = [];
    patternMap = [];
    glowIntensity = [];
    visualScales = [];
    for (let i = 0; i < GRID_TOTAL; i++) {
        grid[i] = Math.random() > 0.85 ? 1 : 0;
        prevGrid[i] = 0;
        patternMap[i] = 0;
        glowIntensity[i] = grid[i] ? 1.0 : 0;
        visualScales[i] = grid[i] ? 1.0 : 0;
    }
    // Recrear mesh con nuevo tamaño
    createInstancedMesh();
    updateWorldShell();
    fitCameraToWorld();
    popHistory = [];
    stopRebootCountdown();
    if (currentCameraMode === 'cinematic') {
        initCinematicCamera();
    }
}

// =====================================================================
// SISTEMA DE MODOS DE JUEGO
// =====================================================================
// Modos disponibles:
//   - Visualizacion (sandbox libre, sin interaccion con celulas)
//   - Supervivencia (colocar celulas, objetivo: sobrevivir el maximo)
//   - Conquista (colocar celulas, objetivo: maximizar poblacion total)
//
// Maquina de estados por fase:
//   idle → placing (colocar celulas, pausa) → running (simulacion)
//   → result (fin de partida, opcion de reintentar)
// =====================================================================

/**
 * createGridHelper — Crea la malla visual de referencia para colocacion
 *
 * Genera un conjunto de lineas (THREE.LineSegments) que dibujan una
 * cuadricula sobre el plano Y=0, una linea por cada celda del grid.
 * Se usa en modos de juego para que el jugador vea donde colocar celulas.
 * Color cyan semitransparente (opacidad 12%).
 */
function createGridHelper() {
    if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper.geometry.dispose();
        gridHelper.material.dispose();
    }
    // Lineas de la malla: una por cada celda
    var positions = [];
    var halfR = GRID_ROWS / 2;
    var halfC = GRID_COLS / 2;
    // Lineas horizontales (a lo largo de Z)
    for (var r = 0; r <= GRID_ROWS; r++) {
        var x = r - halfR - 0.5;
        positions.push(x, 0.01, -halfC - 0.5, x, 0.01, halfC - 0.5);
    }
    // Lineas verticales (a lo largo de X)
    for (var c = 0; c <= GRID_COLS; c++) {
        var z = c - halfC - 0.5;
        positions.push(-halfR - 0.5, 0.01, z, halfR - 0.5, 0.01, z);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    var mat = new THREE.LineBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.12 });
    gridHelper = new THREE.LineSegments(geo, mat);
    gridHelper.visible = false;
    scene.add(gridHelper);
}

/**
 * showGridHelper — Muestra u oculta la malla de referencia
 * @param {boolean} visible — true para mostrar, false para ocultar
 */
function showGridHelper(visible) {
    if (!gridHelper) createGridHelper();
    gridHelper.visible = visible;
}

/**
 * getGridCellFromClick — Convierte un click/tap en indice de celda del grid
 *
 * Usa raycasting: normaliza las coordenadas del evento, lanza un rayo
 * desde la camara e intersecta con el plano invisible Y=0 (gridPlane).
 * Convierte la posicion 3D resultante a coordenadas de fila/columna y
 * devuelve el indice lineal (row * GRID_COLS + col).
 *
 * @param {PointerEvent} event — evento de pointer del navegador
 * @returns {number} indice de la celda, o -1 si fuera de rango
 */
function getGridCellFromClick(event) {
    var rect = renderer.domElement.getBoundingClientRect();
    mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseVec, camera);
    var intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(gridPlane, intersection)) {
        var row = Math.round(intersection.x + GRID_ROWS / 2);
        var col = Math.round(intersection.z + GRID_COLS / 2);
        if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
            return row * GRID_COLS + col;
        }
    }
    return -1;
}

/**
 * onGridClick — Maneja el click sobre el grid en modo juego
 *
 * Solo actua si estamos en modo juego y en fase 'placing'.
 * Comportamiento toggle:
 *   - Si la celda esta viva y fue colocada por el jugador → la quita
 *     (devuelve al budget)
 *   - Si la celda esta muerta y hay budget disponible → la coloca
 * Actualiza arrays de estado, contadores y la interfaz.
 *
 * @param {PointerEvent} event — evento de pointer del navegador
 */
function onGridClick(event) {
    if (gameMode === 'visualization' || gamePhase !== 'placing') return;
    var index = getGridCellFromClick(event);
    if (index === -1) return;
    if (grid[index] === 1 && playerCells.indexOf(index) !== -1) {
        // Remove player cell
        grid[index] = 0;
        visualScales[index] = 0;
        glowIntensity[index] = 0;
        cellsPlaced--;
        cellBudget++;
        playerCells.splice(playerCells.indexOf(index), 1);
    } else if (grid[index] === 0 && cellBudget > 0) {
        // Place player cell
        grid[index] = 1;
        visualScales[index] = 1.0;
        glowIntensity[index] = 1.0;
        cellsPlaced++;
        cellBudget--;
        playerCells.push(index);
    }
    updateGameUI();
}

/**
 * switchGameMode — Transicion entre modos de juego
 *
 * Gestiona el cambio completo entre visualizacion y modos de juego.
 * Realiza un reset total: limpia el grid, reinicia contadores, restaura
 * la camara a modo libre, para el reboot si estaba activo.
 *
 * En modo visualizacion: restaura controles normales, oculta elementos
 * de juego (.game-only), muestra los de visualizacion (.viz-only), y
 * genera un grid aleatorio.
 *
 * En modo juego: fuerza mundo plano + reglas Conway, muestra controles
 * de juego, crea la malla de referencia y arranca startGame().
 * Configura valores por defecto distintos segun el modo:
 *   - Supervivencia: 30 celulas, sin limite de generaciones
 *   - Conquista: 20 celulas, 100 generaciones limite
 *
 * @param {string} mode — 'visualization', 'survival' o 'conquest'
 */
function switchGameMode(mode) {
    gameMode = mode;
    var panel = document.getElementById('ui-panel');
    gamePaused = false;
    gamePhase = 'idle';
    gameScore = 0;
    cellsPlaced = 0;
    cellBudget = 0;
    playerCells = [];
    popHistory = [];
    generationCount = 0;
    stopRebootCountdown();

    // Reset contadores UI
    document.getElementById('genCount').innerText = 0;
    document.getElementById('popCount').innerText = 0;
    document.getElementById('patternCount').innerText = 0;
    document.getElementById('pauseBtn').innerText = '⏸ PAUSA';

    // Reset camara a modo libre
    currentCameraMode = 'off';
    document.getElementById('cameraMode').value = 'off';
    controls.autoRotate = false;

    // Limpiar grid completo
    for (var i = 0; i < GRID_TOTAL; i++) {
        grid[i] = 0;
        prevGrid[i] = 0;
        patternMap[i] = 0;
        glowIntensity[i] = 0;
        visualScales[i] = 0;
    }

    if (mode === 'visualization') {
        panel.classList.remove('game-active');
        showGridHelper(false);
        document.getElementById('resetBtn').innerText = 'REINICIAR MUNDO';
        updateGameTooltip();
        // Restaurar mundo desde selectores UI
        currentWorld = document.getElementById('worldSelect').value;
        currentRules = document.getElementById('rulesSelect').value;
        updateWorldShell();
        fitCameraToWorld();
        if (worldShell) worldShell.material.color.setHex(0x00f2ff);
        // Poblar grid aleatorio
        for (var i = 0; i < GRID_TOTAL; i++) {
            grid[i] = Math.random() > 0.85 ? 1 : 0;
            visualScales[i] = grid[i] ? 1.0 : 0;
            glowIntensity[i] = grid[i] ? 1.0 : 0;
        }
    } else {
        panel.classList.add('game-active');
        // Forzar mundo plano y Conway para modos de juego
        currentWorld = 'plane';
        currentRules = 'conway';
        document.getElementById('worldSelect').value = 'plane';
        document.getElementById('rulesSelect').value = 'conway';
        updateWorldShell();
        fitCameraToWorld();
        // Valores por defecto segun modo
        if (mode === 'survival') {
            document.getElementById('budgetRange').value = 30;
            document.getElementById('budgetVal').innerText = 30;
            document.getElementById('genLimitRange').value = 0;
            document.getElementById('genLimitVal').innerText = '∞';
        } else if (mode === 'conquest') {
            document.getElementById('budgetRange').value = 20;
            document.getElementById('budgetVal').innerText = 20;
            document.getElementById('genLimitRange').value = 100;
            document.getElementById('genLimitVal').innerText = 100;
        }
        // Recrear y mostrar malla de referencia
        createGridHelper();
        showGridHelper(true);
        startGame(mode);
    }
}

/**
 * startGame — Inicia una nueva partida
 *
 * Limpia el grid, reinicia contadores, lee el presupuesto de celulas
 * y el limite de generaciones de los sliders de la UI, y pone la
 * simulacion en pausa (fase 'placing') para que el jugador coloque
 * sus celulas. Muestra la malla de referencia y actualiza la interfaz.
 *
 * @param {string} mode — 'survival' o 'conquest'
 */
function startGame(mode) {
    for (var i = 0; i < GRID_TOTAL; i++) {
        grid[i] = 0;
        prevGrid[i] = 0;
        patternMap[i] = 0;
        glowIntensity[i] = 0;
        visualScales[i] = 0;
    }
    generationCount = 0;
    gameScore = 0;
    cellsPlaced = 0;
    playerCells = [];
    popHistory = [];
    stopRebootCountdown();
    document.getElementById('genCount').innerText = 0;
    document.getElementById('popCount').innerText = 0;
    document.getElementById('patternCount').innerText = 0;

    // Leer valores de los sliders
    var uiBudget = parseInt(document.getElementById('budgetRange').value);
    var uiGenLimit = parseInt(document.getElementById('genLimitRange').value);

    if (mode === 'survival') {
        cellBudget = uiBudget;
        gameGenLimit = 0;
    } else if (mode === 'conquest') {
        cellBudget = uiBudget;
        gameGenLimit = uiGenLimit;
    }

    gamePhase = 'placing';
    gamePaused = true;
    document.getElementById('pauseBtn').innerText = '⏸ PAUSA';
    document.getElementById('resetBtn').innerText = '▶ JUGAR';
    showGridHelper(true);
    updateGameUI();

    var statusBox = document.getElementById('status-box');
    statusBox.className = '';
    statusBox.classList.add('status-caos');
    statusBox.innerText = 'COLOCAR';
}

/**
 * runGame — Lanza la simulacion tras la fase de colocacion
 *
 * Cambia la fase a 'running', despausa la simulacion, oculta la malla
 * de referencia y actualiza el boton a "REINTENTAR". Requiere que el
 * jugador haya colocado al menos una celula.
 */
function runGame() {
    if (cellsPlaced === 0) return;
    gamePhase = 'running';
    gamePaused = false;
    showGridHelper(false);
    document.getElementById('resetBtn').innerText = '↻ REINTENTAR';
    var statusBox = document.getElementById('status-box');
    statusBox.className = '';
    statusBox.classList.add('status-caos');
    statusBox.innerText = 'CAOS';
}

/**
 * updateGameState — Evalua el progreso de la partida en cada generacion
 *
 * Actualiza la puntuacion segun el modo:
 *   - Supervivencia: +1 punto por cada generacion con vida
 *   - Conquista: +N puntos por generacion (N = celulas vivas)
 *
 * Comprueba condiciones de fin:
 *   - Extincion: poblacion = 0
 *   - Limite de generaciones alcanzado (solo conquista)
 *   - Estabilidad: variacion < 5 en 40 generaciones
 *
 * @param {number} alive  — numero total de celulas vivas
 * @param {number} stable — numero de celulas en patron estable
 */
function updateGameState(alive, stable) {
    if (gameMode === 'survival') {
        gameScore += alive > 0 ? 1 : 0;
    } else if (gameMode === 'conquest') {
        gameScore += alive;
    }

    // Condiciones de fin
    var ended = false;
    var result = '';

    if (alive === 0) {
        ended = true;
        result = 'EXTINCIÓN';
    } else if (gameGenLimit > 0 && generationCount >= gameGenLimit) {
        ended = true;
        result = 'FIN - ' + gameScore + ' PTS';
    } else if (popHistory.length >= 40) {
        var range = Math.max.apply(null, popHistory) - Math.min.apply(null, popHistory);
        if (range < 5) {
            ended = true;
            result = 'ESTABLE - ' + gameScore + ' PTS';
        }
    }

    if (ended) {
        endGame(result);
    }

    updateGameUI();
}

/**
 * endGame — Finaliza la partida actual
 *
 * Pausa la simulacion, muestra la malla de referencia, actualiza el
 * status box con el resultado y detiene cualquier reboot en curso.
 *
 * @param {string} result — texto del resultado (ej: 'EXTINCIÓN', 'ESTABLE - 150 PTS')
 */
function endGame(result) {
    gamePhase = 'result';
    gamePaused = true;
    showGridHelper(true);
    document.getElementById('resetBtn').innerText = '↻ REINTENTAR';
    var statusBox = document.getElementById('status-box');
    statusBox.className = '';
    statusBox.classList.add('status-estable');
    statusBox.innerText = result;
    stopRebootCountdown();
}

/**
 * updateGameUI — Actualiza la interfaz del panel de juego
 *
 * Sincroniza los displays de celulas restantes, puntuacion y objetivo
 * con el estado actual del juego. Tambien invoca updateGameTooltip()
 * para actualizar el texto de ayuda contextual.
 */
function updateGameUI() {
    document.getElementById('cellsRemaining').innerText = cellBudget;
    document.getElementById('gameScore').innerText = gameScore;
    if (gameMode === 'survival') {
        document.getElementById('gameTarget').innerText = '∞';
    } else if (gameMode === 'conquest') {
        document.getElementById('gameTarget').innerText = gameGenLimit > 0 ? gameGenLimit + ' gen' : '∞';
    } else {
        document.getElementById('gameTarget').innerText = '-';
    }
    updateGameTooltip();
}

/**
 * updateGameTooltip — Muestra instrucciones contextuales del modo de juego
 *
 * Genera un texto HTML explicativo en la parte inferior del panel de
 * controles, que cambia segun:
 *   - El modo de juego activo (survival / conquest)
 *   - La fase actual (placing / running / result)
 * En modo visualizacion, el tooltip se vacia.
 */
function updateGameTooltip() {
    var el = document.getElementById('game-tooltip');
    var genTxt = gameGenLimit > 0 ? gameGenLimit + ' generaciones' : 'sin límite de generaciones';
    // Descripciones de las reglas del automata celular para modo visualizacion
    var rulesTips = {
        conway: '<strong>Conway (B3/S23)</strong> &mdash; La regla clásica original. Una célula nace con exactamente 3 vecinos y sobrevive con 2 o 3. Produce planeadores, osciladores y naves espaciales.',
        highlife: '<strong>HighLife (B36/S23)</strong> &mdash; Similar a Conway pero las células también nacen con 6 vecinos. Famosa por su replicador: un patrón que se copia a sí mismo.',
        daynight: '<strong>Day &amp; Night (B3678/S34678)</strong> &mdash; Regla simétrica: el negativo de cualquier patrón se comporta igual. Genera estructuras grandes y exóticas.',
        seeds: '<strong>Seeds (B2/S)</strong> &mdash; Altamente explosiva: las células nacen con 2 vecinos pero nunca sobreviven. Genera expansiones caóticas desde cualquier semilla.',
        diamoeba: '<strong>Diamoeba (B35678/S5678)</strong> &mdash; Tiende a formar grandes estructuras con forma de diamante o ameba. Las poblaciones crecen y se estabilizan en bloques sólidos.',
        '2x2': '<strong>2x2 (B36/S125)</strong> &mdash; Genera bloques estables de 2x2 células. Los patrones tienden a cristalizar en cuadrículas regulares.',
        morley: '<strong>Morley (B368/S245)</strong> &mdash; También llamada "Move". Produce patrones complejos con osciladores y naves. Comportamiento entre caótico y ordenado.',
        anneal: '<strong>Anneal (B4678/S35678)</strong> &mdash; Simula un proceso de recocido: las poblaciones tienden a formar grupos sólidos grandes que se compactan con el tiempo.',
        replicator: '<strong>Replicator (B1357/S1357)</strong> &mdash; Regla completamente simétrica: todo patrón finito se replica indefinidamente generando fractales expansivos.',
        maze: '<strong>Maze (B3/S12345)</strong> &mdash; Genera estructuras tipo laberinto. Las células sobreviven fácilmente (1-5 vecinos) pero solo nacen con 3, creando pasillos y muros.'
    };
    var tips = {
        survival: {
            placing: '<strong>Supervivencia</strong> &mdash; Coloca hasta <strong>' + cellBudget + '</strong> células en la malla haciendo click. Pulsa <strong>JUGAR</strong>. Tu objetivo: que la colonia sobreviva el mayor número de generaciones posible sin extinguirse ni estabilizarse.',
            running: '<strong>Supervivencia</strong> &mdash; Cada generación con vida suma 1 punto. La partida termina si la población se extingue o se estabiliza.',
            result: '<strong>Supervivencia</strong> &mdash; Partida terminada. Pulsa <strong>REINTENTAR</strong> para volver a intentarlo o cambia de modo.'
        },
        conquest: {
            placing: '<strong>Conquista</strong> &mdash; Coloca hasta <strong>' + cellBudget + '</strong> células estratégicamente. Pulsa <strong>JUGAR</strong>. Tu objetivo: acumular la mayor población total durante ' + genTxt + '. Cada célula viva por generación suma puntos.',
            running: '<strong>Conquista</strong> &mdash; Cada célula viva suma puntos por generación. Expansión = más puntos. ' + (gameGenLimit > 0 ? 'Termina en la generación ' + gameGenLimit + '.' : 'Sin límite, termina al estabilizarse o extinguirse.'),
            result: '<strong>Conquista</strong> &mdash; Partida terminada. Pulsa <strong>REINTENTAR</strong> para volver a intentarlo o cambia de modo.'
        }
    };
    if (gameMode === 'visualization') {
        var desc = rulesTips[currentRules] || '';
        el.innerHTML = desc;
        el.classList.toggle('visible', desc.length > 0);
        return;
    }
    if (!tips[gameMode]) {
        el.innerHTML = '';
        el.classList.remove('visible');
        return;
    }
    var phase = gamePhase === 'idle' ? 'placing' : gamePhase;
    el.innerHTML = tips[gameMode][phase] || '';
    el.classList.toggle('visible', el.innerHTML.length > 0);
}

// =====================================================================
// FIN DEL SISTEMA DE MODOS DE JUEGO
// =====================================================================

/**
 * resetGame — Reinicia la simulacion con nueva semilla aleatoria
 *
 * Genera una nueva semilla para el terreno procedural, recrea el mundo,
 * reposiciona la camara, restaura el color del mundo y genera un nuevo
 * grid aleatorio (15% de probabilidad de vida). Limpia el historial de
 * poblacion y la cuenta atras de reboot. Se usa tanto desde el boton
 * REINICIAR como tras la cuenta atras de reboot automatico.
 */
function resetGame() {
    generationCount = 0;
    document.getElementById('genCount').innerText = 0;
    popHistory = []; stopRebootCountdown();
    worldSeed = Math.random() * 100;
    updateWorldShell();
    fitCameraToWorld();
    if (currentCameraMode === 'cinematic') {
        initCinematicCamera();
    }
    if(worldShell) worldShell.material.color.setHex(0x00f2ff);
    for (let i = 0; i < GRID_TOTAL; i++) {
        grid[i] = Math.random() > 0.85 ? 1 : 0;
        visualScales[i] = grid[i] ? 1.0 : 0;
    }
}

/**
 * onWindowResize — Manejador de redimensionado de ventana
 *
 * Actualiza el aspect ratio de la camara, el tamaño del renderer y
 * del compositor de post-procesado, y reposiciona la camara para
 * encuadrar el mundo al nuevo tamaño.
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.resolution.set(window.innerWidth, window.innerHeight);
    fitCameraToWorld();
}