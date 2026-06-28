# INFINITE SKY — Plan de optimización de rendimiento

Basado en la auditoría de rendimiento (5 analistas paralelos, solo lectura, código
verificado). Objetivo: **móvil de gama baja + sesiones largas**. Los dos escenarios
críticos son **vuelo bajo sobre planeta con atmósfera/mar** (limitado por fill-rate
del GPU) y **caminata entre fauna** (limitado por CPU/GC en núcleos ARM débiles).

**Cómo ejecutar:** por lotes, de menor a mayor riesgo. Medir con `?fps=1` en un
dispositivo real **antes y después de cada lote**. No mezclar lotes en un mismo commit.

> ⚠️ **Regla de oro — no romper las seeds:** la función de altura
> (`height3`/`sampleAt`) define el mundo. La ruta "low" (4/3 octavas) ya se usa para
> el impostor, así que es visualmente coherente, pero **la altura del pie del jugador
> debe seguir usando la ruta completa**. Cambiar la ruta completa alteraría el terreno
> de todas las seeds ya compartidas. (Este archivo y `universe.js` están protegidos por
> el hook `protect-files.sh`.)

---

## Lote 1 — Quick wins (cero/bajo riesgo, alto ROI) ✅ HECHO (2026-06-28)

> Aplicado e independientemente verificado (perf-verifier APROBADO): determinismo de
> `height3` byte a byte idéntico, sin asignaciones nuevas por frame, `disposeTree` no
> toca el glow compartido ni la geometría singleton de Sprite. Se omitió 1.9 a propósito
> (la métrica `distancia−R` con R por planeta haría que `distanceToSquared` elija mal).

Mecánicos, sin cambiar jugabilidad ni el aspecto. Atacan fugas de memoria y trabajo
desperdiciado por frame.

| # | Arreglo | Archivos | Ganancia |
|---|---------|----------|----------|
| 1.1 | `this.nodeH.clear()` en `teardown()` (una línea) | `planet.js:~549` | Mata la única fuga de memoria clara de sesión larga (Map crece sin tope) |
| 1.2 | `dispose()` de geometría+material al hacer teardown (recorrer el grupo) | `sites.js`, `spaceport.js`, `mining.js`, `gadgets.js`, `ship.js` (buildInto) | Elimina fuga de buffers GPU por cada vuelo de ida/vuelta y por cada toque de pintura/equipar nave |
| 1.3 | Textura glow como **singleton** compartido (`getGlow()`), no `makeGlowTexture()` ×8 | `textures.js` + consumidores | Menos VRAM, permite batching de sprites |
| 1.4 | `EngineTrail`/`WeatherSystem`/`WarpField`: saltar el loop + `needsUpdate` cuando no hay partículas vivas | `effects.js:~272`, `weather.js`, `effects.js` warp | Evita re-subir ~5.7KB de buffers/frame estando parado/aterrizado |
| 1.5 | Nubes a `FrontSide` cuando la cámara está fuera del shell (`distC>R*1.05`, ya se calcula) | `planet.js:~236` | Reduce a la mitad el overdraw de nubes (caso común) |
| 1.6 | Bounding sphere correcta + frustum culling en cinturón de asteroides y sprites de nebulosa | `effects.js` | No envía sus draw calls cuando están detrás de la cámara |
| 1.7 | Reusar array de eventos en `gadgetMgr.update()` (no `[]` nuevo/frame) | `gadgets.js:~52` | Cero asignación en el caso común sin disparos |
| 1.8 | Scratch `Vector3` en bucles de spawn (`_probe.copy(anchor)` en vez de `anchor.clone()`) | `mining.js:~64`, `gear.js:~384`, `sites.js` | Menos basura en spawns |
| 1.9 | `distanceToSquared` en el scan de planeta más cercano | `main.js:~452` | ~12 sqrt/frame menos (marginal) |

---

## Lote 2 — Bajar el GC al caminar entre fauna (riesgo medio) ✅ HECHO (2026-06-28)

> Aplicado y verificado (perf-verifier APROBADO). On-foot 0.584→0.452 ms (~23%),
> determinismo de `height3` idéntico (planet.js ni se tocó). **Desviación de criterio en
> 2.1**: en vez de la ruta `low` para criaturas (que las haría flotar/hundirse hasta ~4u
> por la octava de detalle ausente), se **amortizó** la frecuencia de muestreo usando la
> ruta COMPLETA (cache `gUp`/`gFloorR`, re-muestreo cada ~0.13s con jitter) — mismo ahorro
> de CPU, sin riesgo visual. Criaturas de tierra con gap ≤0.47u (no flotan).

El escenario on-foot está limitado por asignaciones por frame + ruido.

- **2.1 — Ruta "low" en `sampleAt`** (`planet.js`, `creatures.js:~301`). La consulta de
  altura usa siempre octavas completas (~19 evals simplex) y se llama 4–12+ veces/frame
  (jugador, cámara, marcadores, **una por criatura**). Añadir `sampleAt(pos, low=true)`
  con 4/3 octavas para colisión/grounding de criaturas y marcadores; reservar la ruta
  completa solo para el pie del jugador. *Mayor palanca de CPU del juego.*
- **2.2 — Amortizar criaturas lejanas/fuera de pantalla**: re-muestrear su altura cada
  N frames en vez de cada frame (`creatures.js behave`).
- **2.3 — Pool de marcadores** (`main.js:~892`): hoy se crea `markers=[]` con un objeto
  literal por marcador (10–25), closure `shortLabel` nueva y `{...st,alt}` cada frame.
  Pool persistente con campos in-place + contador activo; izar `shortLabel` a módulo;
  precomputar la etiqueta corta de cada bioma una vez; pasar `alt` como argumento.
- **2.4 — `nearestList()` top-k in-place** (`creatures.js:~389`): hoy
  `.map().filter().sort().slice().map()` (5 arrays + sort) llamado 3×/frame. Selección
  top-k con buffer fijo reusable (k≤6), o computar una vez/frame y compartir.
- **2.5 — Throttle del radar a ~15–20 Hz** (`radar.js`): hoy repinta un canvas 580×580
  cada frame. Acumular `dt` y repintar por intervalo; o backing store a 1× en LQ.

---

## Lote 3 — Bajar el fill-rate del planeta (riesgo medio) — el frame más pesado

Vuelo bajo sobre mundo lush = atmósfera (Additive) + nubes (DoubleSide) + agua (shader
con **3× snoise/fragmento**), todas `depthWrite:false` → sin rechazo early-Z.

- **3.1 — Uniform de calidad en el agua** (`shaders.js:~142`): en LQ/touch, 1 octava de
  snoise en vez de 3 y early-out cuando `fade` es bajo.
- **3.2 — Agua a `depthWrite:true`** (es casi opaca, alpha 0.82–1.0): rechaza el terreno
  detrás, gran ahorro de overdraw.
- **3.3 — Abaratar el specular** `pow(...,110.0)` del agua.
- **3.4 — Nubes `FrontSide`** (ya en 1.5).

---

## Lote 4 — Carga diferida y memoria de planetas (riesgo medio)

- **4.1 — Diferir `buildShells()`/`buildFarMesh()`** hasta que el planeta sea el más
  cercano (espejar el patrón LOD que ya existe) en vez de construir los 6–11 al cargar.
  Quita el stall de arranque en frío y baja VRAM/RAM de planetas nunca visitados.
- **4.2 — Textura de nubes 512×256 en LQ/touch** (hoy 1024×512 = 524k iteraciones JS y
  ~16–20 MB residentes), con `generateMipmaps:false` + filtro lineal.

---

## Lote 5 — Resolución adaptativa (riesgo medio) — degradar con gracia

- **5.1 — pixelRatio adaptativo** (`main.js:~47`): muestrear frame-time (la infra `?fps`
  ya existe) y bajar 1.5→1.25→1.0 al exceder presupuesto, subir al estar cómodo. Es la
  válvula de seguridad que hoy falta cuando un GPU débil no sostiene la atmósfera lush.
- **5.2 — Reconsiderar `logarithmicDepthBuffer`** en la ruta LQ (añade coste por fragmento
  en todos los shaders). Evaluar si se puede vivir sin él en móvil con near/far ajustados.

---

## Lote 6 — Draw calls de fauna (caro, a futuro)

Cada criatura es un `THREE.Group` clonado de ~13 meshes separados (no instanciado). Con
`pop=8` en móvil → 100+ draw calls solo de fauna, y las GPU tiled son muy sensibles.

- **6.1 — Barato ya:** pool de Groups por especie (reusar despawneadas en vez de
  `clone()` fresco); bajar `pop`/radio de despawn (280) en `QUAL` móvil.
- **6.2 — A medio plazo:** merge de cada especie en una `BufferGeometry` (animación a
  shader, o solo las más cercanas) o impostor para las lejanas.
- **6.3 — Props:** reducir radio/conteo de tiles en móvil, cull del césped a radio más
  corto, repartir `buildTile` entre frames, merge de mismo-template entre tiles vecinos.

---

## No tocar (parece lento pero está bien)

- Starfield/galaxy band con `frustumCulled=false` — intencional (sky-dome), correcto.
- No-dispose de materiales/texturas a **nivel planeta**: es coste fijo de arranque
  acotado y reseteado por el reload del hyperjump, **no una fuga creciente**. La ganancia
  real está en el Lote 4 (construir shells diferido), no en disponerlos.
- `protoCache`/cola de build con jobs huérfanos — acotados y se drenan solos.
- Geometría del agua 96×64 / sol con 2× snoise — el coste real es el fragment shader,
  no los vértices; el conteo de segmentos es ruido.

---

## Orden recomendado

**Lote 1 → 2 → 3** dan la mayor parte de la ganancia con el menor riesgo. Lotes 4–5
después. El Lote 6 (fauna) solo si el profiler en un móvil real lo confirma como cuello
de botella tras 1–3. Verificar cada lote con `?fps=1` en dispositivo objetivo.

*Nota: la búsqueda de skills (`/find-skills`) no arrojó una skill de optimización
three.js de calidad suficiente (mejor candidato ~1.5K installs pero genérico); este plan
se basa en la auditoría propia del código.*
