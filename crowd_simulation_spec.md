# SUMMER SONIC 2026 Tokyo Crowd Simulation Specification

## 1. Purpose

This document defines a practical specification and implementation approach for turning the existing Makuhari map dataset into a crowd simulation and visualization system for SUMMER SONIC 2026 Tokyo.

The product should not treat Claude Fable 5 or any other LLM as the execution runtime. The runtime should be ordinary Python / JavaScript / GIS tooling. LLMs can be used as design, implementation, review, data-cleaning, scenario-generation, and documentation assistants.

## 2. Source Assets

Base directory:

`/Users/arita/Documents/py/summersonic_makuhari_mapdata`

Existing files:

| File | Role |
| --- | --- |
| `SS26_map_tokyo_1.jpg` | Stylized venue map image. This is the visual base layer for the action map. |
| `summersonic_2026_makuhari_action_map.json` | Primary coordinate dataset. Use `x`,`y` image pixels as the source of truth. |
| `summersonic_2026_makuhari_layers.geojson` | Approximate WGS84 overlay for QGIS, Leaflet, and external GIS workflows. |
| `summersonic_2026_makuhari_nodes.csv` | Node master table for stages, gates, junctions, venues, and station. |
| `sample_movement_events.csv` | Sample actor movement stream. Useful as an animation format prototype. |
| `summersonic_action_map_preview.html` | Standalone map preview. Useful as the first visualization reference. |
| `README.md` | Notes on coordinate accuracy and suggested real behavior schema. |

Important modeling rule:

Use image pixel coordinates as the canonical coordinate system for simulation visualization. The official map is stylized, so lat/lon should be treated only as rough anchors for external GIS and not as the basis for precise movement animation.

## 3. Verified Public Assumptions

As of 2026-07-02:

- SUMMER SONIC 2026 Tokyo is listed for 2026-08-14 to 2026-08-16.
- The Tokyo venue map includes Makuhari Messe and Marine Stadium areas.
- Official Tokyo map information lists MOUNTAIN STAGE, SONIC STAGE, PACIFIC STAGE, Spotify RADAR: Early Noise STAGE, MARINE STAGE, and BEACH STAGE.
- The official venue map page states that a free shuttle bus is scheduled between ZOZO Marine Stadium and Makuhari Messe at approximately 10-minute intervals.

Sources:

- Anthropic announcement: https://www.anthropic.com/news/claude-fable-5-mythos-5
- SUMMER SONIC Tokyo info: https://www.summersonic.com/en/info/tokyo/
- SUMMER SONIC Tokyo map: https://www.summersonic.com/en/info/tokyo/map/

## 4. Product Concept

Build an explainable crowd-wave simulator for SUMMER SONIC Tokyo that estimates where people will gather and which routes will become congested over time.

The first production-worthy version should be a rule-based simulator, not a machine-learning system. The key behavior to capture is not only "which stage is popular", but also the wave pattern after each performance:

1. Audience gathers before a performance.
2. Audience density peaks during the performance.
3. A large share exits shortly after the performance ends.
4. People split toward the next stage, food, drink, restrooms, goods, cloakroom, station, shuttle bus, or rest areas.
5. Routes, gates, and service points temporarily become bottlenecks.

The initial goal is a decision-support and scenario-analysis tool, not a live safety-control system.

## 5. Non-Goals and Safety Boundaries

The system must not perform personal tracking.

Out of scope:

- Face recognition.
- Device fingerprinting.
- MAC address or Bluetooth probe tracking.
- Unconsented precise location history.
- Individual-level behavior scoring.
- Automated operational commands to staff without human review.

Allowed scope:

- Area-level estimated counts.
- Route-level estimated flow.
- 5-minute or 15-minute time buckets.
- Manual observations entered as aggregate counts.
- Public popularity indicators aggregated by artist.
- Scenario comparison and risk flagging.

## 6. MVP Definition

The first complete version should include:

- Read the existing map JSON, node CSV, and a new timetable CSV.
- Normalize stage, gate, service, and route entities.
- Simulate crowd distribution in 5-minute or 15-minute intervals.
- Estimate stage occupancy, route flow, gate pressure, shuttle queue, and service-area demand.
- Output CSV and JSON artifacts.
- Render an interactive dashboard with the venue map image, time slider, heat circles, route load overlays, and top congestion warnings.

Recommended stack:

- Python 3.11+
- pandas
- numpy
- networkx
- pydantic
- plotly
- streamlit
- shapely, optional for polygons
- geopandas, optional for GIS export

## 7. Data Model

### 7.1 Existing Node Model

The existing node CSV already contains:

```csv
id,name,type,x,y,lat,lon,crowd_capacity_hint
```

The current useful nodes include:

| id | type | x | y | capacity hint |
| --- | --- | ---: | ---: | ---: |
| `marine_stage` | stage | 804 | 520 | 30000 |
| `beach_stage` | stage | 248 | 219 | 7000 |
| `pacific_stage` | stage | 206 | 1225 | 6000 |
| `spotify_stage` | stage | 340 | 1222 | 6000 |
| `sonic_stage` | stage | 732 | 1210 | 9000 |
| `mountain_stage` | stage | 1085 | 1195 | 12000 |
| `messe_gate_central` | gate | 570 | 1460 | 9000 |
| `messe_gate_east` | gate | 1010 | 1456 | 9000 |
| `entrance_main` | gate | 795 | 813 | 9000 |
| `station_kaihin_makuhari` | station | 705 | 2095 | 20000 |

Official capacity notes should override local hints where confirmed. For example, the official map page lists MOUNTAIN at approximately 20,000, MARINE at approximately 35,000, and BEACH at approximately 4,000. The local hints should therefore be treated as initial defaults, not final truth.

### 7.2 New `timetable.csv`

```csv
event_date,stage_id,artist_id,artist_name,start_time,end_time,slot_type
2026-08-15,mountain_stage,artist_x,Artist X,12:00,12:45,live
2026-08-15,sonic_stage,artist_y,Artist Y,12:30,13:15,live
```

Rules:

- `stage_id` must match a node ID.
- Time should be local Japan time.
- `slot_type` supports `live`, `opening`, `break`, `headliner`, `special`, `closed`.

### 7.3 New `artist_popularity.csv`

```csv
artist_id,artist_name,base_popularity,domestic_affinity,genre,headliner_flag,sns_score,spotify_score,manual_boost
artist_x,Artist X,82,0.7,pop,false,75,88,1.0
```

`base_popularity` should be a 0-100 score. For the rule-based version, this can be manually curated.

### 7.4 New `facilities.csv`

```csv
facility_id,name,type,node_id,capacity_hint,service_rate_per_min,open_time,close_time
food_messe,Food Area Messe,food,messe_connector,3000,120,10:00,22:00
cloak_messe,Cloakroom Messe,cloakroom,hall9,1500,60,09:00,23:00
```

Facility types:

- `food`
- `bar`
- `toilet`
- `goods`
- `cloakroom`
- `first_aid`
- `information`
- `lounge`
- `shuttle_stop`

### 7.5 New `route_edges.csv`

Convert route polylines into network edges:

```csv
edge_id,from_node,to_node,route_id,route_type,walk_minutes,capacity_per_min,bottleneck_score,bidirectional
edge_messe_marine,messe_gate_central,entrance_main,route_messe_to_marine,intervenue_walk,15,900,0.8,true
edge_messe_hall9,messe_connector,hall9,route_messe_to_halls9_11,internal_corridor,4,1200,0.4,true
```

`capacity_per_min` and `bottleneck_score` can start as estimates and later be calibrated.

### 7.6 New `scenario_config.yaml`

```yaml
simulation:
  start: "2026-08-15T09:00:00+09:00"
  end: "2026-08-15T23:30:00+09:00"
  step_minutes: 5
  initial_arrivals: 25000
  total_daily_attendance: 90000

behavior:
  pre_show_arrival_peak_min: 20
  post_show_exit_half_life_min: 8
  max_stage_fill_ratio: 1.05
  rest_demand_base: 0.05
  food_demand_lunch: 0.14
  food_demand_dinner: 0.18
  goods_demand_morning: 0.10

shuttle:
  headway_minutes: 10
  capacity_per_departure: 500
```

### 7.7 Optional `observations.csv`

For real-time correction:

```csv
timestamp,area_id,metric,value,confidence,source
2026-08-15T14:15:00+09:00,mountain_stage,occupancy,16500,0.7,manual_count
2026-08-15T14:15:00+09:00,route_messe_to_marine,flow_per_min,420,0.5,staff_report
```

## 8. Simulation Model

### 8.1 State Variables

At each time step `t`, maintain:

- `occupancy[area_id, t]`
- `route_load[edge_id, t]`
- `route_queue[edge_id, t]`
- `service_queue[facility_id, t]`
- `shuttle_queue[direction, t]`
- `warnings[t]`

### 8.2 Core Conservation Equation

```text
occupancy(area, t + 1)
= occupancy(area, t)
+ inflow(area, t)
- outflow(area, t)
```

Apply capacity constraints after movement:

```text
effective_occupancy = min(raw_occupancy, hard_capacity * overflow_margin)
overflow = max(0, raw_occupancy - effective_occupancy)
```

Overflow should be redirected to nearby gates, corridors, waiting zones, or queues.

### 8.3 Performance Attractiveness

For each active or upcoming performance:

```text
attractiveness =
  artist_popularity
  * stage_scale_factor
  * time_proximity_factor
  * headliner_factor
  * genre_affinity_factor
  * conflict_adjustment
  * weather_adjustment
```

Initial practical formula:

```text
stage_demand = total_available_audience
             * softmax(attractiveness / temperature)
             * stage_capacity_limit
```

Use temperature to control how strongly audiences concentrate around the most popular acts.

### 8.4 Arrival and Dwell Curves

Before a show:

- 30-45 minutes before: gradual inflow.
- 10-20 minutes before: main inflow peak.
- During show: high retention.
- 0-15 minutes after show: major outflow.
- 15-30 minutes after show: residual outflow.

Suggested functions:

- Pre-show inflow: logistic curve.
- During-show retention: high constant retention.
- Post-show outflow: exponential decay.

### 8.5 Destination Choice

After a person leaves an area, split demand across:

- Next chosen stage.
- Food or bar.
- Toilet.
- Goods.
- Cloakroom.
- Rest or lounge.
- Shuttle bus.
- Station exit.

Use a multinomial logit model:

```text
P(destination)
= exp(utility(destination)) / sum(exp(utility(all_destinations)))
```

Utility:

```text
utility =
  next_artist_pull
  - travel_time_penalty
  - congestion_penalty
  + service_need
  + time_of_day_bias
  + user_scenario_bias
```

This is still rule-based and explainable.

### 8.6 Route Assignment

Use `networkx` to build a graph from `route_edges.csv`.

For each origin-destination pair:

1. Calculate shortest path by generalized cost.
2. Generalized cost combines walk time, bottleneck score, current congestion, and shuttle waiting time.
3. Assign flow to the chosen path.
4. Cap each edge by `capacity_per_min * step_minutes`.
5. Excess becomes a route queue.

Generalized cost:

```text
cost =
  walk_minutes
  * (1 + bottleneck_score)
  * (1 + current_load_ratio * congestion_sensitivity)
```

### 8.7 Shuttle Bus Model

Model the ZOZO Marine Stadium to Makuhari Messe shuttle as a scheduled batch service:

```text
departures every 10 minutes
served = min(queue, capacity_per_departure)
remaining_queue = queue - served
```

The shuttle should compete with walking between `entrance_main` and `messe_gate_central`.

Key outputs:

- Queue length by direction.
- Estimated waiting time.
- Load ratio per departure.
- Whether walking becomes faster than waiting.

### 8.8 Facility Demand

Facility demand should be generated from audience state:

```text
facility_demand =
  occupancy_total
  * base_need_rate
  * time_of_day_multiplier
  * post_show_multiplier
  * weather_multiplier
```

Examples:

- Food demand peaks around lunch and dinner.
- Toilet demand increases after long sets and after drink-heavy time periods.
- Goods demand is stronger near opening and before headline slots.
- Cloakroom demand peaks at arrival and exit.

### 8.9 Congestion Levels

For areas:

```python
ratio = people / capacity
```

| Ratio | Level | Label |
| ---: | --- | --- |
| `< 0.40` | 0 | Low |
| `0.40 - 0.70` | 1 | Moderate |
| `0.70 - 0.90` | 2 | Crowded |
| `0.90 - 1.00` | 3 | Severe |
| `>= 1.00` | 4 | Over capacity |

For routes:

```python
ratio = flow_per_min / capacity_per_min
```

Use the same level definitions, but include queue length in warnings.

## 9. Output Artifacts

### 9.1 `output/crowd_prediction.csv`

```csv
timestamp,area_id,people,capacity,load_ratio,crowd_level,inflow,outflow
```

### 9.2 `output/route_prediction.csv`

```csv
timestamp,edge_id,from_node,to_node,flow,queue,capacity,load_ratio,crowd_level
```

### 9.3 `output/service_prediction.csv`

```csv
timestamp,facility_id,demand,served,queue,wait_minutes,crowd_level
```

### 9.4 `output/movement_events.csv`

Aggregate movement animation format:

```csv
timestamp,batch_id,route_id,origin_id,destination_id,count,x,y,state
```

Do not generate one row per real person in production. Use synthetic batches or particles representing groups.

### 9.5 `output/warnings.json`

```json
[
  {
    "timestamp": "2026-08-15T18:05:00+09:00",
    "target_type": "route",
    "target_id": "edge_messe_marine",
    "severity": "high",
    "message": "Post-show movement from Makuhari Messe to Marine is expected to exceed route capacity.",
    "recommended_action": "Promote shuttle use or delay outbound guidance by 10 minutes."
  }
]
```

## 10. Dashboard Specification

Recommended first dashboard: Streamlit + Plotly.

Main views:

1. Map view
   - Use `SS26_map_tokyo_1.jpg` as the background.
   - Draw stage and facility circles using image coordinates.
   - Circle size = estimated people.
   - Circle color = crowd level.
   - Draw route polylines from `action_map.json`.
   - Route width/color = flow and load ratio.

2. Timeline view
   - Time slider.
   - Play/pause.
   - Day selector.
   - Scenario selector.

3. Congestion ranking
   - Top crowded stages.
   - Top route bottlenecks.
   - Longest service queues.
   - Shuttle waiting time.

4. Stage detail
   - Current artist.
   - Next artist.
   - Estimated occupancy.
   - Capacity ratio.
   - Arrival and exit curve.

5. Scenario controls
   - Total attendance.
   - Weather multiplier.
   - Popularity boost for selected artists.
   - Shuttle capacity.
   - Gate throughput.
   - Food/toilet demand multipliers.

6. Export
   - Download CSV.
   - Download warnings JSON.
   - Export static PNG of selected time.

## 11. Proposed Repository Structure

```text
summersonic_makuhari_mapdata/
├── SS26_map_tokyo_1.jpg
├── README.md
├── crowd_simulation_spec.md
├── data/
│   ├── raw/
│   │   ├── summersonic_2026_makuhari_action_map.json
│   │   ├── summersonic_2026_makuhari_layers.geojson
│   │   └── summersonic_2026_makuhari_nodes.csv
│   ├── input/
│   │   ├── timetable.csv
│   │   ├── artist_popularity.csv
│   │   ├── facilities.csv
│   │   ├── route_edges.csv
│   │   └── scenario_config.yaml
│   └── observations/
│       └── observations.csv
├── output/
│   ├── crowd_prediction.csv
│   ├── route_prediction.csv
│   ├── service_prediction.csv
│   ├── movement_events.csv
│   └── warnings.json
├── src/
│   ├── summersonic_sim/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   ├── schemas.py
│   │   ├── load_data.py
│   │   ├── normalize_map.py
│   │   ├── demand.py
│   │   ├── route_model.py
│   │   ├── shuttle.py
│   │   ├── facilities.py
│   │   ├── simulate.py
│   │   ├── calibration.py
│   │   └── export.py
│   └── dashboard/
│       ├── app.py
│       └── map_render.py
├── tests/
│   ├── test_load_data.py
│   ├── test_route_model.py
│   ├── test_simulation_conservation.py
│   └── test_shuttle.py
└── pyproject.toml
```

## 12. Command-Line Interface

```bash
python -m summersonic_sim.normalize \
  --map summersonic_2026_makuhari_action_map.json \
  --nodes summersonic_2026_makuhari_nodes.csv \
  --out data/input/route_edges.csv

python -m summersonic_sim.simulate \
  --config data/input/scenario_config.yaml \
  --out output/

streamlit run src/dashboard/app.py
```

## 13. Implementation Phases

### Phase 0: Dataset Normalization

Deliverables:

- Move or reference existing assets under a stable data layout.
- Generate initial `route_edges.csv` from `action_map.json`.
- Add manually editable `facilities.csv`.
- Add sample `timetable.csv` and `artist_popularity.csv`.

Acceptance criteria:

- All stage IDs in timetable resolve to known nodes.
- All route edges resolve to known nodes or explicit route coordinates.
- The existing HTML preview still opens correctly.

### Phase 1: Rule-Based Simulator

Deliverables:

- Load timetable, popularity, capacities, routes, and scenario config.
- Calculate stage occupancy over time.
- Generate post-show exits and next-destination splits.
- Route flows through the network.
- Model route queues when flow exceeds capacity.
- Export crowd, route, service, and warning outputs.

Acceptance criteria:

- Total simulated audience is conserved except explicit arrivals/exits.
- No negative occupancy.
- Capacity warnings are generated when ratios cross thresholds.
- A single-day simulation completes in under 10 seconds on a laptop.

### Phase 2: Dashboard

Deliverables:

- Streamlit dashboard using the map image as a background.
- Time slider and play mode.
- Stage occupancy circles.
- Route congestion overlay.
- Congestion ranking panel.
- Scenario selector.

Acceptance criteria:

- Users can identify the worst 5 congestion points for any time bucket.
- Changing total attendance or an artist boost visibly changes the prediction.
- Map labels remain readable at desktop browser sizes.

### Phase 3: Calibration and Scenario Tuning

Deliverables:

- Calibration script for manual observations.
- Parameter report showing which assumptions drive congestion.
- Backtesting harness using synthetic or historical festival-like data.

Acceptance criteria:

- Manual observation at time `t` corrects nearby future estimates gradually rather than causing abrupt jumps.
- Scenario comparison can show baseline vs rainy day vs headliner surge.

### Phase 4: Real-Time Correction

Deliverables:

- Manual observation input form.
- Optional import from official app notices or staff count sheets.
- Live warning refresh.

Acceptance criteria:

- No personal data is required.
- Real-time correction works from aggregate observations only.
- The system clearly labels predictions as estimates.

### Phase 5: Predictive Model Layer

Only after the rule-based simulator is useful, add ML.

Candidate features:

- Artist popularity.
- Stage capacity.
- Time of day.
- Day number.
- Weather.
- Genre.
- SNS volume.
- Spotify or other streaming popularity.
- Prior observed occupancy.
- Conflict with other stages.

Candidate models:

- Gradient boosting for stage occupancy.
- Bayesian updating for real-time correction.
- Time-series residual model on top of the rule-based baseline.

The ML layer should predict residual corrections, not replace the explainable simulator.

## 14. Claude Fable 5 Usage Pattern

Use Claude Fable 5 as an engineering copilot, not as the runtime.

Good uses:

- Generate schema drafts.
- Review simulation equations.
- Produce unit tests from acceptance criteria.
- Convert official timetable pages into structured CSV after human review.
- Suggest edge cases.
- Refactor dashboard code.
- Explain anomalous simulation outputs.
- Generate scenario narratives for planning meetings.

Avoid:

- Making Fable 5 responsible for live crowd decisions.
- Sending sensitive operational data without policy review.
- Sending any personal tracking data.
- Treating LLM output as authoritative without validation.

Recommended prompt pattern:

```text
We are building a rule-based crowd simulation for a music festival.
Runtime is Python. Do not assume the LLM is the runtime.

Given:
- action_map.json with image pixel coordinates
- nodes.csv with stage/gate capacity hints
- timetable.csv
- artist_popularity.csv
- route_edges.csv

Task:
Design or modify one bounded component only.
Preserve conservation of people.
Return code, tests, and assumptions.
```

## 15. Key Risks

| Risk | Mitigation |
| --- | --- |
| Stylized map does not match real walking distances | Use image coordinates for visualization; calibrate route walk times manually. |
| Capacity hints may differ from official values | Maintain `capacity_source` and override with verified official numbers. |
| Timetable changes | Keep timetable as external CSV and validate on load. |
| Popularity scores are subjective | Add manual override and scenario comparison. |
| False confidence | Display uncertainty bands and label results as estimates. |
| Privacy scope creep | Aggregate-only design and explicit no-personal-tracking policy. |
| Route capacity unknown | Start with rough assumptions, then tune with field observations. |

## 16. Testing Strategy

Unit tests:

- Schema validation.
- Time bucket generation.
- Stage demand curves.
- Conservation of total audience.
- Route capacity and queue behavior.
- Shuttle departure batching.
- Facility queue calculations.

Integration tests:

- One complete simulation day.
- High-attendance stress scenario.
- Headliner conflict scenario.
- Marine-to-Messe surge scenario.
- Station exit surge scenario.

Visual QA:

- Verify all node circles appear on the map.
- Verify route lines align with the existing preview.
- Verify no label or metric overlaps make the map unreadable.
- Verify crowd colors change consistently with thresholds.

## 17. Recommended First Build Order

1. Add `data/input/timetable.csv` with a small synthetic schedule.
2. Add `data/input/artist_popularity.csv`.
3. Generate `data/input/route_edges.csv` from existing routes plus manually estimated walk times.
4. Implement `load_data.py` and `schemas.py`.
5. Implement stage demand and occupancy only.
6. Add route assignment.
7. Add shuttle queue.
8. Add facilities.
9. Build the dashboard.
10. Add observations and calibration.

## 18. Definition of Done for Prototype

The prototype is complete when:

- A user can run one command to generate predictions.
- A user can run one command to open the dashboard.
- The dashboard shows stage crowd levels and route bottlenecks over time.
- The simulator produces warnings for obvious surge cases.
- All assumptions are editable in CSV/YAML.
- The model uses aggregate estimates only.
- The output is explainable enough that a planner can understand why an area became crowded.
