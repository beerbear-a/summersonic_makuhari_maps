# SUMMER SONIC 2026 Makuhari action-map dataset

## Files
- `summersonic_2026_makuhari_action_map.json`: Official map image coordinate dataset. Use `x`,`y` for precise placement on the uploaded festival map image.
- `summersonic_2026_makuhari_layers.geojson`: Approximate WGS84 GeoJSON for QGIS/Leaflet/kepler.gl overlay.
- `summersonic_2026_makuhari_nodes.csv`: Node master table.
- `sample_movement_events.csv`: Sample event stream for moving audience dots.
- `summersonic_action_map_preview.html`: Standalone preview using the uploaded JPG as the base layer.
- `SS26_map_tokyo_1.jpg`: Source image copy.

## Important note
The Summer Sonic map is stylized, so it cannot be perfectly georeferenced to the real Makuhari street grid with only a rectangular overlay. Treat the pixel coordinate system as the source of truth for animation. Treat lat/lon as rough anchors for external GIS overlays.

## Suggested schema for real behavior data
`timestamp, actor_id, route_id, x, y, lat, lon, state, speed_mps, dwell_sec, destination_id`

## Next step for production
For higher accuracy, capture 6-10 control points from GIS/OSM or survey data and calculate an affine/projective transformation. For indoor Messe hall movement, keep a separate floor-plan coordinate system per hall.
