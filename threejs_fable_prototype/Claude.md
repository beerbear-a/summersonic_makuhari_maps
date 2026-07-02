# SUMMER SONIC 2026 Tokyo 2.5D Crowd Visualization Prompt

## Role

You are Claude Fable 5 acting as a design and implementation assistant. You are not the runtime environment.

The actual runtime should be a browser-based HTML / JavaScript / Three.js prototype using the existing local data files.

## Goal

Build a 2.5D / 3D-style crowd visualization prototype for SUMMER SONIC 2026 Tokyo using Three.js.

The prototype should show the venue map as a floor plane, place stages and gates in 3D space, visualize congestion as vertical bars, draw routes as glowing lines, animate sample audience particles, and provide time controls.

## Existing Project Directory

```text
/Users/arita/Documents/py/summersonic_makuhari_mapdata
```

## Existing Assets

```text
SS26_map_tokyo_1.jpg
summersonic_2026_makuhari_action_map.json
summersonic_2026_makuhari_nodes.csv
sample_movement_events.csv
summersonic_action_map_preview.html
crowd_simulation_spec.md
```

## Important Data Rules

- Use `summersonic_2026_makuhari_action_map.json` as the primary spatial source.
- Use `x`,`y` image pixel coordinates as the source of truth.
- Do not use `lat`,`lon` for Three.js placement.
- `lat`,`lon` are rough GIS anchors only.
- Use `meta.image_width_px` and `meta.image_height_px` from the JSON.
- The map image is stylized, so the visualization should be treated as an operational planning view, not a survey-accurate GIS twin.

## Desired Output File

Create this file:

```text
threejs_crowd_preview.html
```

Place it in:

```text
/Users/arita/Documents/py/summersonic_makuhari_mapdata
```

## Implementation Constraints

- Make the first version a single static HTML file.
- Use Three.js from a CDN.
- Use OrbitControls from a CDN.
- Do not require npm, Vite, Webpack, or a build step.
- Use `fetch()` to load the local JSON, CSV, and JPG files.
- Use a small custom CSV parser in JavaScript.
- Assume the file will be served with a local HTTP server, not opened directly via `file://`.
- Keep the code readable and modular inside the single HTML file.

## Run Command

```bash
cd /Users/arita/Documents/py/summersonic_makuhari_mapdata
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/threejs_crowd_preview.html
```

## Coordinate Conversion

The source map uses image coordinates:

- origin: top-left
- x: horizontal pixel
- y: vertical pixel

Convert to Three.js coordinates:

```javascript
const SCALE = 0.05;

function mapToWorld(x, y, imageWidth, imageHeight) {
  return {
    x: (x - imageWidth / 2) * SCALE,
    y: 0,
    z: (y - imageHeight / 2) * SCALE
  };
}
```

Use the Three.js Y axis for height.

## Required Features

### 1. Map Floor

- Load `SS26_map_tokyo_1.jpg`.
- Use it as a texture on a horizontal plane.
- Plane size should match the image aspect ratio.
- Place the map center at world origin.
- Use a dark scene background.
- Add ambient light and directional light.

### 2. Nodes

Load `points` from `summersonic_2026_makuhari_action_map.json`.

Render:

- `stage`: stronger marker plus congestion bar.
- `gate`: smaller marker.
- `station`: distinct marker.
- `junction` / `venue`: subtle marker.

Labels should be visible for important nodes:

- MARINE STAGE
- BEACH STAGE
- MOUNTAIN STAGE
- SONIC STAGE
- PACIFIC STAGE
- Spotify Stage
- Makuhari Messe gates
- JR Kaihin-Makuhari Station

Use sprites or CSS2D labels. Labels must remain readable from the default camera view.

### 3. Congestion Bars

For every stage node, draw a vertical cylinder or rectangular bar.

Use capacity from `crowd_capacity_hint`.

If `crowd_prediction.csv` does not exist, generate synthetic crowd ratios in JavaScript.

Suggested prototype formula:

```javascript
function syntheticCrowdRatio(stageId, tNormalized) {
  const base = {
    marine_stage: 0.75,
    mountain_stage: 0.65,
    sonic_stage: 0.55,
    pacific_stage: 0.45,
    spotify_stage: 0.40,
    beach_stage: 0.35
  }[stageId] ?? 0.25;

  const wave = 0.25 * Math.sin(tNormalized * Math.PI * 2 + stageId.length);
  return Math.max(0.05, Math.min(1.15, base + wave));
}
```

Bar height:

```javascript
height = Math.max(1, crowdRatio * 40);
```

Color:

```text
0.00 - 0.40: green/cyan
0.40 - 0.70: yellow
0.70 - 0.90: orange
0.90+: red
```

Tooltip or selected detail should show:

- node name
- node type
- capacity
- estimated people
- crowd ratio

### 4. Routes

Load `routes` from `summersonic_2026_makuhari_action_map.json`.

Render `coords` as 3D polylines slightly above the map floor.

Route display:

- glowing or emissive-looking line
- load ratio color from blue/green to yellow/orange/red
- higher load routes should look more prominent

If route load data does not exist, generate synthetic route load by time and route ID.

### 5. Particles

Load `sample_movement_events.csv`.

For each `actor_id`:

- Render a small sphere.
- At each selected time, place it at the latest row at or before the current timestamp.
- If time permits, interpolate between adjacent rows.

Particle requirements:

- Cyan or white emissive-looking material.
- Slightly above the map floor.
- Update when the time slider changes.
- Update during play mode.

### 6. UI

Add an overlay control panel.

Required controls:

- Play / Pause button.
- Time slider.
- Current timestamp display.
- Toggle stages.
- Toggle routes.
- Toggle particles.
- Toggle labels.
- Reset camera button.

Add a detail panel for selected or hovered objects:

- node name
- type
- capacity
- crowd ratio
- estimated people

### 7. Camera

Use OrbitControls.

Default camera:

- angled from above
- map mostly visible
- enough perspective to see bars

Add a reset camera function.

### 8. Visual Style

The prototype should feel like a serious festival operations dashboard, not a toy demo.

Style direction:

- dark background
- map as illuminated floor
- congestion bars with clear colors
- glowing route lines
- readable labels
- compact control panel
- no marketing hero page
- no decorative gradients or unrelated ornaments

## Error Handling

The page should show a clear on-screen error if any file cannot be loaded:

- JSON missing
- CSV missing
- image missing
- CORS / local file issue

If `sample_movement_events.csv` cannot be loaded, keep the map, nodes, routes, and bars working.

## Extension Points

Structure the JavaScript so these can be swapped later:

- Replace synthetic stage ratios with `output/crowd_prediction.csv`.
- Replace synthetic route loads with `output/route_prediction.csv`.
- Replace sample particles with aggregate movement batches.
- Add real scenario selection.
- Add snapshot export.

## Final Answer Format

Return:

1. Full contents of `threejs_crowd_preview.html`.
2. Exact run command.
3. Expected URL.
4. Notes on replacing synthetic data with real simulation outputs.
5. Any limitations or assumptions.

