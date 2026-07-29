import * as L from "leaflet";
import type { HeatLayer, HeatLatLngTuple, HeatMapOptions } from "leaflet";

export type HeatFactory = (latlngs: HeatLatLngTuple[], options: HeatMapOptions) => HeatLayer;

let pending: Promise<HeatFactory> | null = null;

/**
 * Lazily load the legacy `leaflet.heat` plugin.
 *
 * leaflet.heat is a global-`L` plugin: its bundle reads/writes a free `L`
 * variable (resolving to `globalThis.L`). Leaflet's ESM build doesn't set a
 * global, so we install a mutable copy of the Leaflet namespace on `globalThis`
 * *before* importing the plugin, then read the `heatLayer` factory back off that
 * same object. Dynamic import guarantees the assignment runs first.
 */
export function loadHeatLayer(): Promise<HeatFactory> {
  if (!pending) {
    const globalL = Object.assign({}, L) as typeof L & { heatLayer?: HeatFactory };
    (globalThis as { L?: unknown }).L = globalL;
    pending = import("leaflet.heat").then(() => {
      if (typeof globalL.heatLayer !== "function") {
        throw new Error("leaflet.heat did not register L.heatLayer");
      }
      return globalL.heatLayer;
    });
  }
  return pending;
}
