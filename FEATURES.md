# INFINITE SKY — Ideas para más robusto, jugable e inesperado

Lluvia de ideas (más allá de ecosistemas, plantas, fauna y vestuario) para hacer el juego
más rico, rejugable y sorprendente. Todo bajo las 4 reglas no negociables (nada daña,
nada se pierde, todo se exhibe, un descubrimiento por sesión).

Marcado: 🟢 seguro (no toca seeds compartidas) · 🟡 medio · 🔴 re-rollea el universo / grande.

## 1 — Bucles de descubrimiento (lo que más engancha en un explorador)
- 🟢 **Modo foto** + álbum: capturar criaturas/paisajes, sellos por mundo. Muy "compartible".
- 🟢 **Bitácora / códice**: páginas que se llenan al descubrir especies, biomas, fenómenos,
  puertos. Da sensación de progreso y colección (ya hay catálogo de fauna; ampliarlo).
- 🟢 **Fenómenos raros cronometrados** (sorpresa): auroras, lluvia de meteoros, eclipse de
  soles binarios, doble amanecer, mareas, niebla luminosa. Sembrados por seed+tiempo.
- 🟢 **Secretos sembrados**: cuevas-glow, monolitos con "runas", flores gigantes que se abren,
  círculos de hongos que teletransportan a un mirador. Coleccionables ocultos.
- 🟢 **Coordenadas/postales compartibles**: botón "compartir este lugar" → link `?g=&s=&@lat,lon`.

## 2 — Criaturas más vivas (sobre el instancing ya hecho)
- 🟢 **Amistad con fauna**: acariciar/alimentar (suelta un material), te siguen un rato (mascota).
- 🟢 **Manadas y migración**: grupos que cruzan el horizonte (reusa el InstancedMesh de fauna).
- 🟢 **Comportamientos por hora del día**: nocturnas que brillan, diurnas que duermen.
- 🟡 **Crías**: versiones pequeñas que siguen a las grandes.

## 3 — Travesía y vehículos
- 🟢 **Mejoras de jetpack/planeador** ya empezadas; añadir un **planeador** para descender lento.
- 🟡 **Rover / monopatín gravitatorio** para recorrer superficie rápido.
- 🟢 **Anillos de carreras** opcionales (volar a través de aros por tiempo, cosmético).
- 🟡 **Teletransporte entre puertos** ya visitados (mapa de la galaxia como fast-travel).

## 4 — Base y hogar
- 🟡 **Base modular** sembrable: poner un faro/tienda propia en un mundo favorito (persiste local).
- 🟢 **Nave-hogar personalizable**: pegatinas, pintura, mascota a bordo (sobre el sistema de naves).
- 🟢 **Jardín / terrario**: exhibir plantas y criaturas recolectadas (cumple "todo se exhibe").

## 5 — Puertos espaciales y NPCs amistosos
- 🟢 **Robot anfitrión** en el puerto que da pistas, misiones suaves y saluda (carisma, sin texto pesado).
- 🟢 **Tablón de exploradores**: mensajes/sellos asíncronos de otros jugadores (vía catálogo global Supabase).
- 🟢 **Misiones suaves opcionales**: "fotografía 3 especies voladoras", "visita un mundo nevado".
- 🟡 **Más kioscos funcionales**: actualmente varios son preview; activarlos (mapas, gadgets, naves).

## 6 — Espacio y sorpresa cósmica
- 🟢 **Cometas, lluvias de asteroides minables, derelicts** (naves abandonadas con botín cosmético).
- 🟢 **Estaciones orbitales** pequeñas (variedad de puertos en órbita, no solo superficie).
- 🟢 **Lunas** orbitando planetas (ya hay soles binarios; añadir lunas como mini-mundos).
- 🟡 **Agujeros de gusano** decorativos para saltos largos sorpresa.

## 7 — Robustez del juego (lo "serio")
- 🟢 **Guardado en la nube** (Supabase) del progreso + catálogo global compartido (pendiente: reconectar Qubitoz).
- 🟢 **Pantalla de ajustes** in-game: calidad, idioma, volumen, sensibilidad táctil, daltonismo.
- 🟢 **Onboarding/tutorial** más guiado para niños (ya hay tutorial de primer vuelo).
- 🟢 **Logros** visibles con recompensas cosméticas (ya hay sistema `achv`; exponerlo mejor).
- 🟢 **Rendimiento**: ya cerramos Lotes 1–6 + merges; queda validar en móvil real.

## Top 5 sugerido (impacto/esfuerzo, todo 🟢 seguro)
1. **Modo foto + álbum/bitácora** — engancha y es compartible; bajo riesgo.
2. **Fenómenos raros cronometrados** (auroras/eclipses/lluvia de meteoros) — el "inesperado".
3. **Amistad con fauna** (acariciar/alimentar/mascota) — calidez infantil sobre el instancing.
4. **Volcanes/cascadas/géiseres** como features-on-top (de ECOSYSTEMS.md) — variedad de mundos.
5. **Robot anfitrión + misiones suaves** en el puerto — da dirección sin presión.

> Nota de determinismo: añadir BIOMAS nuevos re-rollea el universo (rompe seeds compartidas
> como ?g=4242). Todo lo marcado 🟢 son features SOBRE los mundos existentes y NO rompen seeds.
> Si algún día queremos más biomas, conviene hacerlo con un "biome pack v2" versionado o
> aceptando el re-roll mientras el juego es joven.
