// src/types/d3-tile.d.ts
declare module "d3-tile" {
  import { ZoomTransform } from "d3-zoom";

  export type TileCoord = [x: number, y: number, z: number];

  export interface TileSet extends Array<TileCoord> {
    scale: number;
    translate: [number, number];
  }

  export interface TileGenerator {
    (): TileSet;                              
    (transform: ZoomTransform): TileSet;      

    size(size: [number, number]): TileGenerator;
    extent(extent: [[number, number], [number, number]]): TileGenerator;
    tileSize(size: number): TileGenerator;
    clampX(clamp: boolean): TileGenerator;
    clampY(clamp: boolean): TileGenerator;
    zoomDelta(delta: number): TileGenerator;

    // for chain API
    scale(scale: number): TileGenerator;
    translate(xy: [number, number]): TileGenerator;
  }

  export function tile(): TileGenerator;      
}
