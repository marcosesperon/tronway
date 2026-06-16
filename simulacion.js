// =====================================================================
// TRONWAY — Nucleo puro del automata celular
// =====================================================================
// Modulo sin dependencias (no toca DOM ni estado global). Se importa
// tanto desde main.js (hilo principal, como fallback) como desde
// simulacion.worker.js (Web Worker). Al estar aislado, tambien es
// testeable sin navegador.
// =====================================================================

/**
 * calcular_siguiente_generacion — Calcula la siguiente generacion del automata
 *
 * A partir del grid actual y el anterior aplica las reglas B/S con topologia
 * toroidal (los bordes se conectan entre si).
 *
 * @param {number[]|Int8Array} v_grid      — estado actual de cada celula (0/1)
 * @param {number[]|Int8Array} v_prev_grid — estado de la generacion anterior (0/1)
 * @param {number} v_filas                 — numero de filas del grid
 * @param {number} v_columnas              — numero de columnas del grid
 * @param {{birth:number[], survival:number[]}} v_regla — regla B/S a aplicar
 * @returns {{v_next_grid:number[], v_pattern_map:number[],
 *            v_celulas_nacidas:number[], v_total_vivas:number,
 *            v_total_estables:number}}
 */
export function calcular_siguiente_generacion(v_grid, v_prev_grid, v_filas, v_columnas, v_regla) {
    const v_total = v_filas * v_columnas;
    const v_next_grid = new Array(v_total);
    const v_pattern_map = new Array(v_total);
    const v_celulas_nacidas = [];   // indices de celulas que nacen (para el destello neon)
    let v_total_vivas = 0, v_total_estables = 0;

    for (let i = 0; i < v_total; i++) {
        const x = Math.floor(i / v_columnas);  // fila
        const z = i % v_columnas;              // columna
        let v_vecinos = 0;
        for (let ix = -1; ix <= 1; ix++) {
            for (let iz = -1; iz <= 1; iz++) {
                if (ix === 0 && iz === 0) continue;
                const nx = (x + ix + v_filas) % v_filas;
                const nz = (z + iz + v_columnas) % v_columnas;
                v_vecinos += v_grid[nx * v_columnas + nz];
            }
        }
        const v_viva = v_grid[i] === 1;
        if (v_viva) {
            v_next_grid[i] = v_regla.survival.includes(v_vecinos) ? 1 : 0;
        } else {
            v_next_grid[i] = v_regla.birth.includes(v_vecinos) ? 1 : 0;
        }
        // Celula estable: viva e identica en 3 generaciones consecutivas
        if (v_next_grid[i] === 1 && v_next_grid[i] === v_grid[i] && v_grid[i] === v_prev_grid[i]) {
            v_pattern_map[i] = 1; v_total_estables++;
        } else { v_pattern_map[i] = 0; }
        // Celula que nace: estaba muerta y ahora vive
        if (v_next_grid[i] === 1 && v_grid[i] === 0) {
            v_celulas_nacidas.push(i);
        }
        if (v_next_grid[i] === 1) v_total_vivas++;
    }

    return { v_next_grid, v_pattern_map, v_celulas_nacidas, v_total_vivas, v_total_estables };
}
