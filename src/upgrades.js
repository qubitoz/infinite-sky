// Ship upgrades sold at the spaceport UPGRADES kiosk (estelars). Each upgrade
// has levels 0..max; effects are simple multipliers read by the player/main
// loop. Owned forever, per profile (infsky-upgrades-<profile>).
export const UPGRADES = [
  {
    id: 'engine', name: { en: 'ENGINE', es: 'MOTOR' }, color: '#ffd34d', max: 3, prices: [60, 120, 200],
    desc: { en: 'Higher top speed', es: 'Más velocidad' },
  },
  {
    id: 'pulse', name: { en: 'PULSE DRIVE', es: 'MOTOR DE PULSO' }, color: '#b48cff', max: 3, prices: [60, 120, 200],
    desc: { en: 'Charges faster', es: 'Carga más rápido' },
  },
  {
    id: 'scanner', name: { en: 'SCANNER', es: 'ESCÁNER' }, color: '#5ef2d6', max: 3, prices: [50, 100, 180],
    desc: { en: 'Longer scan range', es: 'Mayor alcance' },
  },
  {
    id: 'laser', name: { en: 'MINING LASER', es: 'LÁSER MINERO' }, color: '#ff8a5c', max: 3, prices: [50, 100, 180],
    desc: { en: 'Mines faster', es: 'Mina más rápido' },
  },
  {
    id: 'collector', name: { en: 'COLLECTOR', es: 'RECOLECTOR' }, color: '#9fe87f', max: 3, prices: [40, 80, 150],
    desc: { en: 'Bigger pickup range', es: 'Mayor recolección' },
  },
];

export const DEFAULT_UPGRADES = { engine: 0, pulse: 0, scanner: 0, laser: 0, collector: 0 };

// effect multipliers from a level (0 = stock)
export const fx = {
  engine: (l) => 1 + 0.25 * l,    // top flight speed
  pulse: (l) => 1 + 0.5 * l,      // pulse spool rate
  scanner: (l) => 1 + 0.45 * l,   // creature scan range
  laser: (l) => 1 + 0.6 * l,      // mining speed
  collector: (l) => 1 + 0.7 * l,  // auto-collect radius
};
