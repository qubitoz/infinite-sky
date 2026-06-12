# INFINITE SKY

A No Man's Sky–inspired procedural space exploration game that runs entirely in
the browser. One galaxy seed generates 14 star systems reachable by hyperjump,
each with 5–8 planets across **16 biomes** (lush, ocean, candy, savanna, fungal,
geode, meadow, crimson, plus four climate-hazard worlds…) — quadtree-LOD
terrain, oceans and lava seas, atmospheres, clouds, rings, asteroid belts,
biome flora and friendly fauna, all procedural with zero assets. Full EN/ES
bilingual UI (X or the title button switches live).

## Run

```bash
cd infinite-sky
python3 serve.py 8000        # dev server (caching disabled)
# or: python3 -m http.server 8000
# open http://localhost:8000
```

(Any static file server works. Internet access is needed once for the three.js
CDN and fonts.)

Try a specific universe with `?seed=12345`, or lower the quality on weaker
machines with `?q=low`.

## Play

| Input | Action |
|---|---|
| Mouse | Steer ship / look around |
| W / S | Throttle up / down (move on foot) |
| A / D | Roll (strafe on foot) |
| Shift | Boost / run |
| J or Tab (hold) | Pulse drive — interplanetary travel |
| Space | Vertical thrust / jump / hold for jetpack |
| L | Land / take off |
| F | Exit / board ship |
| C | Scan — registers nearby creatures |
| B | Species catalog |
| E | Collect materials / ship parts (on foot) |
| O | Outfit / wardrobe |
| M | Radar: planet → system → deep space |
| ←/→ + Enter | Pick a star system on the deep radar and hyperjump |
| G | Ship hangar |
| T | Trade at a trading post |
| X | Switch language EN/ES |
| H | Flight manual |
| N | Jump to a brand-new galaxy |

**Radars (M):** the planet radar sweeps for creatures (hollow = species not yet
scanned), materials, ship-wreck parts and trading posts; the system radar maps
every planet and your heading; the deep-space radar charts the 14 systems of
the galaxy — select one and press Enter to hyperjump.

**Touch controls:** on phones/tablets (or with `?touch=1`) the game switches to
a virtual joystick (move / steer), a drag-pad on the right side of the screen
for looking and piloting, context-sensitive buttons (throttle, boost, pulse,
jetpack, collect, scan…), tap-to-pick panel rows, and on-screen arrows + GO on
the deep-space radar for hyperjumps. No keyboard needed.

**Climate ships:** four worlds per galaxy are gated by weather (heat, cold,
acid, storm). Find crashed ships on safe planets, recover their 3 scattered
parts (E) and the repaired ship joins your hangar (G) — each one shields one
hazard. Friendly trading posts (T) swap materials for exclusive outfit pieces.

Pick an explorer name on the title screen — every profile keeps its own
discoveries, materials and outfit. On foot you play in third person as a
little explorer; gather natural materials (leaves, mud, bones, crystals…) to
unlock hats, crowns, masks and capes. A light beacon and an edge-pinned marker
always point back to your ship. Inside an atmosphere the ship auto-levels its
roll when you release A/D. See [PLAN.md](PLAN.md) for the gameplay roadmap
(climate-specialized ships, mining, trading posts).

Fly close to a planet to discover it (progress is saved per seed), drop through
the atmosphere, land on solid ground, then step out and explore on foot.
Worlds with fauna are home to friendly creatures — point at them and press C
to register the species. The catalog (B) shows every species the universe
holds, discovered and undiscovered, planet by planet.

## How it works

- **Terrain** — each planet is a cube-sphere quadtree. Chunks split toward the
  camera down to ~1.5 u resolution, built from seeded simplex fBm + ridged
  multifractal noise with domain warping (terracing on desert worlds, folded
  "bubble" terrain on anomalous ones). Skirts hide LOD seams; a displaced
  impostor sphere sits 0.8% below the true surface as a permanent horizon
  filler. The same JS height function drives physics, so collisions always
  match the visuals.
- **Texturing** — vertex-colored biome ramps (height + slope + jitter) over a
  tileable procedural detail map and normal map; snow lines, beaches, and
  underwater tinting per biome.
- **Atmosphere** — additive rim-scattering shell plus distance fog, sky color,
  and starlight that all blend with altitude and sun angle (real day/night).
- **Water/lava** — animated normal-perturbed shader with fresnel, sun specular
  glints, and an emissive lava variant.
- **Flora** — instanced, vertex-colored prop templates (trees, crystals,
  cacti, mushrooms, monoliths…) scattered on stable tiles via the height
  field, with slope/water rejection.
- **Fauna** — species are generated deterministically from each planet's seed
  (same seed → same creatures for every player; discovery progress is saved
  per player in localStorage). Six kid-friendly body plans (walker, hopper,
  blob, flyer, longneck, crawler) assembled from shared primitives with big
  eyes and bright colors, animated procedurally (leg swing, hops, wing flaps),
  with simple temperaments — shy, curious, playful, calm. Never hostile.
- **Scale** — a logarithmic depth buffer keeps everything z-stable from 0.3 u
  grass to a 4,000,000 u far plane.
- **Audio** — fully procedural WebAudio: engine, wind, ambient pad, UI cues.
