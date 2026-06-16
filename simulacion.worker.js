// =====================================================================
// TRONWAY — Web Worker de la simulacion
// =====================================================================
// Ejecuta el calculo de la siguiente generacion fuera del hilo principal
// para no bloquear el render en grids grandes. Recibe el grid actual y el
// anterior como Int8Array (transferibles) y devuelve el siguiente estado,
// tambien como Int8Array transferible.
// =====================================================================

import { calcular_siguiente_generacion } from './simulacion.js';

self.onmessage = function(e) {
    var d = e.data;
    var v_res = calcular_siguiente_generacion(d.grid, d.prevGrid, d.filas, d.columnas, d.regla);

    // Empaquetar los grids como Int8Array para transferirlos sin copia
    var v_next = Int8Array.from(v_res.v_next_grid);
    var v_pattern = Int8Array.from(v_res.v_pattern_map);

    self.postMessage({
        nextGrid: v_next,
        patternMap: v_pattern,
        nacidas: v_res.v_celulas_nacidas,
        vivas: v_res.v_total_vivas,
        estables: v_res.v_total_estables
    }, [v_next.buffer, v_pattern.buffer]);
};
