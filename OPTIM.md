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

## Lote 3 — Bajar el fill-rate del planeta (riesgo medio) — el frame más pesado ✅ HECHO (2026-06-28)

> Aplicado y verificado (perf-verifier APROBADO). Cambio puramente de fragment shader del
> agua (`shaders.js`) + flag de calidad en `planet.js`; **no toca `height3`/`sampleAt`** →
> determinismo de 8 muestras byte-idéntico al baseline. Verificado en preview: HQ se ve
> igual que antes (vuelo bajo nocturno); LQ soleado compone bien agua + piso marino +
> bajíos + nubes + atmósfera, sin agua negra ni z-fighting; consola sin errores/warnings.
> El verificador confirmó que NO hay contenido sumergido que `depthWrite:true` pueda
> oclultar (criaturas se descartan sobre agua, recursos/sitios son "land only").

Vuelo bajo sobre mundo lush = atmósfera (Additive) + nubes (DoubleSide) + agua (shader
con **3× snoise/fragmento**), todas `depthWrite:false` → sin rechazo early-Z.

- **3.1 ✅ — Uniform de calidad en el agua** (`shaders.js`): en LQ/touch, **1 octava** de
  snoise en vez de 3, y **early-out** (`if(fade>0.02)`) que salta el ruido de normal en
  agua lejana (donde `dn *= fade` ya era ≈0) en ambas calidades.
- **3.2 ✅ — Agua a `depthWrite:true`** (alpha 0.82–1.0, casi opaca): rechaza el piso
  marino y los shells de nube/atmósfera detrás, gran ahorro de overdraw en sobrevuelos.
- **3.3 ✅ — Specular abaratado**: en LQ se elimina por completo el `pow(...,110.0)`
  (`spec = 0.0`); en HQ se conserva.
- **3.4 ✅ — Nubes `FrontSide`**: ya cubierto en el Lote 1.

---

## Lote 4 — Carga diferida y memoria de planetas (riesgo medio) ✅ PARCIAL (2026-06-28)

> Aplicado solo **4.2** (verificado, perf-verifier APROBADO). **4.1 diferido a propósito**:
> medido en runtime, el far plane de la cámara es 4,000,000 y los 7 planetas del sistema
> caen DENTRO de él desde el spawn, con tamaño angular de 0.3°–5.7° (hasta 10× la luna).
> Es decir, los mundos lejanos se ven como discos en el cielo vía `farMesh`; diferirlo los
> haría desaparecer = regresión visual del "ves otros mundos en el cielo". 4.1 requiere un
> rediseño de LOD a distancia (billboard/sprite barato para el disco lejano + teardown),
> no un tweak in-place seguro. Se deja como feature futura, no como lote de optimización.

- **4.1 ⏸️ DIFERIDO** — Diferir `buildShells()`/`buildFarMesh()` hasta que el planeta sea
  el más cercano. NO seguro tal cual: los planetas lejanos son visibles desde el spawn
  (far plane 4M, ≤5.7°). Necesita billboard-LOD, ver nota arriba.
- **4.2 ✅ — Textura de nubes 512×256 en LQ/touch** (antes 1024×512), con
  `generateMipmaps:false` + `LinearFilter`. `makeCloudTexture` gana un 4º arg `lowQ`;
  `tileableNoise` consume `rand()` por nº de celdas (no por W/H) → cero divergencia de
  PRNG: misma forma de nube y mismo consumo de semilla. 4× menos píxeles a rellenar en
  frío y ~4× menos VRAM de nubes en móvil. HQ intacto (1024×512 con mipmaps).

---

## Lote 5 — Resolución adaptativa (riesgo medio) — degradar con gracia ✅ PARCIAL (2026-06-28)

> Solo **5.1** aplicado (verificado, perf-verifier APROBADO; lógica probada con harness
> aislado 11/11). Diseño vía workflow (3 propuestas → juez sintetizó base "single-EMA" +
> injertos del diseño robusto). **5.2 diferido a propósito**: quitar `logarithmicDepthBuffer`
> con near=0.3/far=4e6 (ratio 1.33e7) da z-fighting catastrófico, sobre todo en el despegue
> (terreno cercano + planetas lejanos en el mismo frame); capturar el early-Z exigiría
> near/far dinámico o depth flotante invertido (un subsistema, no un tweak LQ). logDepth
> queda en TRUE en ambas rutas. Solo renderer/cámara — `height3`/`sampleAt` intactos.

- **5.1 ✅ — pixelRatio adaptativo** (`main.js`): controlador `arTick()` hoisted (cero
  asignación por-frame) tras `renderer.render`. EMA del frame-time real (α=0.1); escalera
  `PR_CAP→1.0` en pasos 0.25 (`PR_CAP = min(devicePixelRatio, QUAL.pr)`). **Baja** si EMA
  >20.5ms sostenido 0.5s; **sube** si EMA < `min(17, floor·1.05)` sostenido 3s — el umbral
  de subida se ata al **piso de frame-time observado** (resuelve la ambigüedad del cap de
  vsync). Cooldown 1.5s + supresión por-peldaño 12s del rung del que se bajó (anti-thrash).
  **Inerte bajo `step()`** (`FIXED_DT != null`). HUD/radar son DOM/canvas-2D → solo el
  render 3D se suaviza; la UI legible queda nítida. El handler de `resize` reasume el rung.
  Arranque idéntico a hoy (`arPrIdx=0` = cap). Chip `?fps=1` muestra el rung (`· x1.5`).
- **5.2 ⏸️ DIFERIDO** — Reconsiderar `logarithmicDepthBuffer` en LQ. NO seguro: z-fighting
  catastrófico a near0.3/far4e6 en el despegue. Necesita near/far dinámico o reversed-Z
  float, gated tras playtest (on-foot orilla + ascenso). Ver nota arriba. Feature futura.

---

## Lote 6 — Draw calls de fauna (caro) ✅ HECHO (2026-06-28)

> Aplicado (kid-design-reviewer + perf-verifier). Solo renderer/render — terreno intacto,
> 8-muestras byte-idénticas HQ+LQ. Los individuos ya eran `Math.random` (no seed-compartido),
> así que instanciarlos no tiene riesgo de determinismo. Antes: cada criatura = `THREE.Group`
> clonado de ~13 mallas con animación por-parte en CPU → ~13×N draw calls.

- **6.1 ✅ — Sin clones + tuning móvil** (`creatures.js`): el instancing (6.2) ELIMINA los
  Groups por criatura, así que ya no hay `clone()` ni GC de spawn (mejor que un pool). En
  móvil/LQ: `popCap` ya era 8, y ahora `despawnR = popCap<=8 ? 220 : 280` (menos criaturas
  en pantalla).
- **6.2 ✅ — Instancing por especie** (`creatures.js`, `props.js`): cada especie se fusiona
  en UNA geometría con vertex-colors (`getImpostor` reusa `merged`/`paint` de props) → UN
  `InstancedMesh` por especie = **1 draw call** (antes ~13×N). La matriz por-instancia
  conserva movimiento de cuerpo entero (desplazamiento, salto, flotación, huida/acercar/
  círculo, orientación, respiro ±2%, squash de blob, flash de escaneo); se pierde la
  animación de PARTES (patas/alas/orejas). Verificado: 9 vivos/3 especies = 3 draws (antes
  ~117). Escaneo/descubrimiento/catálogo intactos (operan sobre objetos de criatura).
- **6.3 ✅ PARCIAL — Props** (`planet.js`): `radius = lowQ ? 135 : 190` (menos tiles en
  móvil); grass a 0.5 densidad en LQ (el `rand()` del count se consume igual → mismo PRNG
  por-tile, solo menos instancias); `buildTile` repartido con cap por llamada (`lowQ?3:6`,
  más cercanos primero) → sin hitch de aterrizaje. **⏸️ Diferido**: merge de mismo-template
  entre tiles vecinos (colapsaría ~213 draws de props HQ a ~3–4, pero requiere gestionar un
  buffer de instancias combinado a través de tiles — su propia tarea, ver Post-Lote 6).

---

## 📌 Post-Lote 6 — pendientes acordados con el usuario (recordar al cerrar el plan)

- **Billboard-LOD de planetas lejanos** (rescata el ahorro del 4.1 diferido). El far plane
  es 4M y los 7 planetas se ven como discos desde el spawn (0.3°–5.7°), por eso `farMesh`
  no se puede diferir sin borrar mundos del cielo. Plan: a distancia extrema sustituir el
  `farMesh` (sphere de N×N verts con vértices desplazados por `height3` low) por un **sprite
  billboard barato** (un disco con color/atmo del bioma), y solo construir `farMesh`/shells
  reales cuando el planeta cruza un umbral de cercanía. Quita el stall de arranque en frío
  (construir 6–11 esferas + texturas de nube de golpe) y baja VRAM de mundos no visitados,
  SIN regresión visual. Opción intermedia más simple del verificador: diferir solo
  `buildShells` (no `farMesh`) con cuidado del substream de PRNG (reservar/precalcular el
  consumo de `this.rand` para que el orden determinista se preserve al diferirse).
  **Acordado 2026-06-28: ejecutar DESPUÉS del Lote 6.**

- **Merge de props mismo-template entre tiles vecinos** (resto del 6.3). Hoy cada tile ×
  cada template = un `InstancedMesh` → ~213 draws de props en HQ (más que la fauna ya
  instanciada). Combinar las instancias del mismo template de todos los tiles en rango en
  UN solo `InstancedMesh` por template bajaría props a ~3–4 draws. Requiere gestionar un
  buffer combinado que se reconstruye al entrar/salir tiles (o `BatchedMesh`, ya en el
  bundle). Es el mayor draw-call restante; va como tarea propia tras el billboard-LOD.

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
