# INFINITE SKY — Plan de ecosistemas y rasgos de mundo (ideas)

Plan aparte (no es optimización). Ideas para enriquecer la variedad de planetas:
volcanes, cascadas, montañas nevadas y otros "inventos" de ecosistema. Todo debe
respetar las 4 reglas no negociables (nada daña, nada se pierde, todo se exhibe, un
descubrimiento por sesión) — los rasgos peligrosos son **decorativos/espectáculo**, no
amenazas.

Contexto técnico (lo que ya existe y donde encajaría cada idea):
- **Biomas**: `src/biomes.js` (terreno: contAmp/mtnAmp/detAmp, ramp de color, mar, nubes,
  kit de props, clima). La forma del terreno la define `height3()` en `planet.js` (SAGRADA:
  no cambiar la ruta completa — cualquier rasgo nuevo va por encima, no alterando la altura
  de seeds existentes).
- **Props**: `src/props.js` — plantillas instanciadas por bioma (árboles, rocas, cristales,
  césped...). Acabamos de fusionarlas a 1 draw call por template (merge cross-tile).
- **Clima visual**: `src/weather.js` (lluvia/nieve/polvo dentro de la atmósfera).
- **Agua**: shader en `src/shaders.js` (mar/lava por bioma).

---

## A — Rasgos puntuales (props/feature especiales por planeta) — bajo riesgo

Se colocan como "props especiales" o estructuras sembradas por seed, sin tocar `height3`.

- **Volcanes** 🌋: cono grande (prop especial de gran escala) con cráter; penacho de humo
  (sprites additive lentos) + glow de lava en la boca. En biomas `spikes`/`rocks`/lava.
  Decorativo: el jugador puede acercarse sin daño; quizá suelta un material coleccionable
  raro ("obsidiana", "cristal ígneo") al minar cerca. Spawnea 1–3 por planeta volcánico.
- **Cascadas** 💧: en mundos con mar/altura, detectar un borde de gran pendiente cerca del
  nivel del mar y colocar una "cinta" de agua (plano con shader de agua desplazándose hacia
  abajo + sprites de espuma additive en la base). Sembrado por seed donde slope alto + sobre
  el mar. Encaja en biomas `forest`/`shroom`/`swamp`.
- **Montañas nevadas** ❄️: ya hay `snowLine`/`snowC` en el bioma (la cima se pinta de nieve).
  Ampliar: picos más altos (subir `mtnAmp` en un bioma "alpino" nuevo) con nieve marcada +
  partículas de ventisca (weather) + props de pino/hielo. **Ojo**: subir mtnAmp cambia
  `height3` → debe ser un BIOMA NUEVO (seeds nuevas), no tocar biomas existentes.
- **Géiseres**: chorros de vapor intermitentes (sprite + sonido suave) en biomas `frost`/
  `swamp`. Pura animación.
- **Anillos de hongos bioluminiscentes / lagunas brillantes**: parches de césped/agua
  emisivos en `shroom`/`swamp` de noche.

## B — Biomas/ecosistemas nuevos (mundos enteros) — riesgo medio

Cada bioma nuevo = entrada en `biomes.js` con su terreno/ramp/props/clima. Como define
seeds nuevas, no rompe las compartidas.

- **Mundo alpino nevado**: `contAmp`/`mtnAmp` altos, snowLine baja, props pino/cristal de
  hielo, clima ventisca, mar congelado (lava=false, tinte hielo).
- **Mundo volcánico activo**: ramp oscuro + ríos de lava (mar `lava:true` ya existe),
  volcanes (rasgo A), props de roca ígnea, clima ceniza.
- **Mundo archipiélago / oceánico con islas y cascadas**: muchas islas pequeñas, cascadas
  (rasgo A), props tropicales.
- **Mundo cañón / mesetas**: terreno de terrazas marcadas (ya hay `terrace` en el ruido),
  arcos de roca, polvo.
- **Mundo cristalino flotante / hongos gigantes**: estética alienígena, props enormes,
  emisivos, sin agua.
- **Mundo geotérmico**: géiseres, lagunas turquesa, vapor.

## C — "Inventos" de ecosistema (sistémicos) — riesgo medio/alto, a futuro

- **Ciclo día/noche** con luna(s): ya hay soles binarios; añadir rotación del planeta +
  flora que brilla de noche.
- **Mareas** en mundos oceánicos (nivel del mar oscila lentamente).
- **Migración de fauna**: manadas que cruzan el horizonte (reusar el instancing de fauna).
- **Clima dinámico por región**: tormentas localizadas visibles desde órbita.
- **Cuevas / entradas subterráneas** (gran feature; requiere terreno no-esférico局部).

---

## Orden sugerido cuando se retome
1. **Rasgo A barato y vistoso primero**: volcanes (humo+glow) y cascadas — alto impacto
   visual, sin tocar `height3`, reusan props/sprites/shader existentes.
2. **2–3 biomas nuevos** (alpino nevado, volcánico activo, archipiélago) — variedad de
   mundos, seeds nuevas.
3. **Inventos sistémicos** (día/noche, mareas) al final.

> Regla de oro repetida: ningún rasgo nuevo puede alterar la salida de la RUTA COMPLETA de
> `height3()` para seeds existentes. Biomas nuevos = OK (seeds nuevas). Rasgos por encima
> del terreno (props/sprites/shaders) = OK siempre.
