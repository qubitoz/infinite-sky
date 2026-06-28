# INFINITE SKY — Plan de mejoras y jugabilidad

**Visión:** un juego infantil de exploración espacial. Sin combate, sin perder
cosas, sin presión. El ciclo central es *viajar → descubrir → coleccionar →
presumir* (mundos, criaturas, materiales, vestimentas y — a futuro — naves).

---

## Estado actual (hecho)

- Sistema estelar procedural por seed: 5–7 planetas, 6 biomas, terreno LOD,
  océanos/lava, atmósferas, clima visual, flora instanciada.
- Vuelo + motor de pulso + aterrizaje + modo a pie con jetpack.
- **Autonivelado** de alabeo dentro de atmósferas (A/D mantiene control manual).
- **Fauna determinista por seed** (6 anatomías amistosas, temperamentos),
  escaneo con C, catálogo B "X/Y especies", medallas ★ por planeta completo y
  confeti de celebración. Sonidos: cada especie tiene su propio canto.
- **Avatar en tercera persona** al descender, con guardarropa: materiales
  naturales recolectables por bioma (hojas, flores, ramas, lodo, huesos,
  hielo, obsidiana, esporas, cristales) que desbloquean piezas (sombreros,
  coronas, máscaras, capas). Nunca se gastan: alcanzar el umbral desbloquea
  para siempre.
- **Baliza de la nave**: pilar de luz + marcador fijado al borde de la
  pantalla; imposible perder la nave.
- **Perfiles de jugador**: nombre en la pantalla de título; cada perfil tiene
  su propio progreso (mundos, fauna, inventario, outfit) en el dispositivo.
- **Catálogo global (preparado)**: cliente Supabase listo en `src/online.js`
  (primer descubridor por especie y seed); falta decidir dónde crear el
  proyecto (ver nota de costos en el repo / conversación).

---

> **Estado (2026-06-12):** Fases 2 y 4 (básica) COMPLETADAS — 16 biomas con 4
> mundos de peligro climático, naves ESCARCHA/BRASA/BRUMA/PRISMA obtenibles en
> naufragios, hangar, mercadillos con prendas exclusivas. Además: galaxia de 14
> sistemas con hipersalto, 3 radares, UI bilingüe EN/ES, controles táctiles,
> efectos cinematográficos (pulso, nave rediseñada, clima visual con
> lluvia/nieve/ceniza/pétalos, estelas tintadas, polvo y spray) y PUBLICADO en
> https://qubitoz.github.io/infinite-sky/. Pendientes señalados abajo.

## Fase 2 — Clima y naves especializadas ✓ HECHA

Sistema de **peligros climáticos** por bioma, pensado para niños (nunca daño:
la nave "no quiere" entrar y rebota suavemente, o el visor se congela/empaña
como aviso):

| Bioma | Peligro | Nave que lo resuelve | Estética |
|---|---|---|---|
| Glacial (tormenta) | Ventisca congelante | **Escarcha** | casco blanco, quitanieves |
| Infernal | Calor extremo / ceniza | **Brasa** | escudo térmico naranja |
| Tóxico (lluvia ácida) | Niebla corrosiva | **Bruma** | burbuja sellada verde |
| Anómalo (tormentas raras) | Estática de realidad | **Prisma** | cristalina, iridiscente |

- Cada sistema estelar marca 1–2 planetas como "clima severo" (la ficha del
  planeta lo avisa con un icono).
- **Dónde conseguir naves**: naufragios en la superficie (repararlos buscando
  3 piezas cercanas — mini búsqueda del tesoro), nidos/huevos cósmicos en
  cinturones de asteroides, y más adelante estaciones de intercambio.
- **Hangar**: la nave activa se elige desde un panel (como el guardarropa);
  las naves son coleccionables y persisten por perfil.

## Fase 3 — Recursos y minería suave (SIGUIENTE GRAN FASE)

- Láser recolector de mano (mantener clic): cristales minerales y frutas
  brillantes; alimenta un inventario simple sin límites.
- Depósitos visibles desde el aire (vetas que brillan de noche).
- Los recursos se usan para: pintar la nave (paletas), piezas de vestimenta
  "premium", y reparar naufragios de la Fase 2.

## Fase 4 — Lugares con recursos y vestimenta

- **Estaciones de intercambio** en órbita y **mercadillos** en superficie:
  NPCs amistosos (criaturas grandes con puesto) que cambian materiales por
  vestimentas exclusivas del bioma.
- Sets temáticos completos (cabeza+cara+espalda) con bono visual (estela de
  partículas al correr).
- Pequeña base/campamento decorable como meta de largo plazo.

## Fase 6 — Puertos espaciales (EN CURSO)

Estructuras modernas en un planeta seguro por sistema, sin criaturas: solo
**kioscos de pantalla automática**. Le dan propósito económico a explorar/minar.

**Decisiones bloqueadas (2026-06-12):**
- "Armas" = **Opción B** (acción suave sin daño: disparar a asteroides/blancos
  por premios, burbujas que rebotan sin lastimar) + **gadgets**.
- **Flora explotable** por materiales usando gadgets.
- Moneda universal = **estelars (★)**.

**Economía:** se ganan estelars vendiendo materiales/gemas en el kiosco de
CAMBIO y como bono por descubrir (especie +15, mundo +25, fauna de planeta +50,
sistema +100). Se gastan en los kioscos. Nunca se pierden por error.

**Los 6 kioscos:** CAMBIO (vender), ASTILLERO (naves), MEJORAS (partes de nave),
CARTAS ESTELARES (revelar en radar), VESTUARIO (prendas), GADGETS (Opción B).

- **Fase A ✓ HECHA** — estructura del puerto (plataforma, cúpula, baliza, 6
  kioscos), moneda estelars en el HUD, kiosco de CAMBIO funcional, bonos por
  descubrir, radar auto al aterrizar, ⊕ en radar de sistema, marcadores guía.
  Los otros 5 kioscos muestran "PRÓXIMAMENTE".
- **Fase B ✓ HECHA** — ASTILLERO (compra las 4 naves climáticas con ★, equipa
  al comprar/tocar) + VESTUARIO (4 prendas premium + Conjunto Explorador, con ★).
- **Fase C ✓ HECHA** — MEJORAS: niveles 0-3 de MOTOR (velocidad), MOTOR DE PULSO
  (carga), ESCÁNER (alcance), LÁSER MINERO (velocidad), RECOLECTOR (radio), con ★.
- **Fase D ✓ HECHA** — CARTAS ESTELARES (Carta del Sistema revela planetas,
  Carta de Prospector marca naufragios/ruinas en el radar) + GADGETS:
  COSECHADORA (flora→materiales, mantén E), CAÑÓN DE BENGALAS (revienta geodas
  cósmicas en el espacio por gemas — acción Opción B), VARITA DE BURBUJAS
  (burbujas que alegran criaturas). **Los 6 kioscos del puerto funcionan.**
- **Fase E ✓ HECHA** — pulido: tema visual por puerto (paleta determinista),
  FX de llegada (toast de bienvenida + anillo + chime + música ambiente del
  puerto), y **10 LOGROS** (tecla K) con toast al desbloquear y persistencia.

**FASE 6 (PUERTOS ESPACIALES) COMPLETA.** Ver `OPTIM.md` para el plan de
optimización pendiente (los hallazgos de rendimiento, a aplicar con cuidado).

## Fase 5 — Social

- Catálogo global con "1er descubridor" (cliente ya listo; activar DB).
- Tablero de exploradores por seed: % de fauna, mundos visitados.
- Regalos entre perfiles del mismo dispositivo (un niño le deja un material
  sorpresa a su hermano).

## Mejoras técnicas continuas

- ~~Toggle de idioma ES/EN~~ ✓ HECHO (tecla X / botón, en vivo).
- ~~Controles táctiles~~ ✓ HECHO · gamepad pendiente.
- ~~Clima activo visual~~ ✓ HECHO (lluvia, ácido, nieve, ceniza, pétalos,
  polvo, niebla — según el `weather` de cada planeta).
- **Tutorial de 60 segundos para niños** (prioridad #1 para portales):
  misiones guiadas la primera vez — "despega → entra a la atmósfera →
  aterriza → escanea tu primera criatura → recoge 3 hojas" con flechas y
  recompensa (prenda de regalo).
- **Empaquetar three.js localmente** (sin CDN) — requisito de Poki/
  CrazyGames y mejora la primera carga.
- Guardado en la nube por perfil (Supabase, pendiente cuenta Qubitoz).
- Modo foto (ocultar HUD + cámara libre) — a los niños les encanta.
- Criaturas marinas para los mundos océano (nuevo arquetipo "nadador").

## Notas de diseño (no negociables)

1. Nada puede dañar al jugador ni a las criaturas.
2. Nunca se pierde progreso ni objetos.
3. Todo lo coleccionable se exhibe (catálogo, guardarropa, hangar).
4. Una sesión de 10 minutos siempre produce al menos un descubrimiento.
