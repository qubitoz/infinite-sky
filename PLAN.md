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

## Fase 2 — Clima y naves especializadas

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

## Fase 3 — Recursos y minería suave

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

## Fase 5 — Social

- Catálogo global con "1er descubridor" (cliente ya listo; activar DB).
- Tablero de exploradores por seed: % de fauna, mundos visitados.
- Regalos entre perfiles del mismo dispositivo (un niño le deja un material
  sorpresa a su hermano).

## Mejoras técnicas continuas

- Toggle de idioma ES/EN de toda la UI (prioridad alta para público infantil).
- Controles táctiles / gamepad.
- Clima activo visual (lluvia, nieve, ceniza como partículas) usando el campo
  `weather` que ya existe por planeta.
- Guardado en la nube por perfil (Supabase auth anónima) cuando exista la DB.
- Modo foto (ocultar HUD + cámara libre) — a los niños les encanta.

## Notas de diseño (no negociables)

1. Nada puede dañar al jugador ni a las criaturas.
2. Nunca se pierde progreso ni objetos.
3. Todo lo coleccionable se exhibe (catálogo, guardarropa, hangar).
4. Una sesión de 10 minutos siempre produce al menos un descubrimiento.
