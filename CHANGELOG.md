# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-07-29

First public open-source release.

### Added

- **Safety indicator overview** — dashboard of safety performance indicators grouped into reactive/system tabs, each with a 12-month line chart, red/green thresholds, and status-colored current value; full-text indicator search; nested sub-indicators.
- **Indicator detail** — step chart with per-month year-over-year sub-graphs, historical min/max band, configurable history depth (3–5 years) and look-ahead window; Month/Float/Fixed value modes (ratio-of-sums averaging); chart-aligned transposed data table with the indicator's formula variables; per-month comments (create/edit/delete) shown on the chart.
- **Related indicators & STPA analysis** — reactive/system indicator cross-links; STPA control-structure diagram with the indicator's interactions highlighted by status; assumptions with system-level requirements and loss scenarios.
- **Time-spatial inspection viewer** — Leaflet map (per-type coloring, heatmap mode, box selection), day chart, filterable data table, time presets and custom ranges; deep-linkable from an indicator ("Show on map").
- **Deployment** — Docker image (nginx) with runtime configuration via `API_URL`/`BASENAME` environment variables; images published to GHCR by CI.
