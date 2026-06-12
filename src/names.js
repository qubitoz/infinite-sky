// Procedural name generation for systems and planets — NMS-flavored.

const SYL_A = ['ka', 'ze', 'vor', 'nu', 'ta', 'rei', 'os', 'an', 'ek', 'ul', 'ish',
  'om', 'ra', 'qi', 'xe', 'lo', 'mi', 'dra', 've', 'su', 'hel', 'or', 'ny', 'ax',
  'ba', 'cel', 'du', 'fen', 'gha', 'ir', 'jor', 'kyl', 'mer', 'ond', 'pra', 'thu'];
const SUFFIX = ['Prime', 'Major', 'Minor', 'Alpha', 'Beta', 'Tau', 'Sigma', 'Omega', 'Reach', 'Expanse'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function core(rand) {
  const n = 2 + ((rand() * 2.4) | 0);
  let s = '';
  for (let i = 0; i < n; i++) s += SYL_A[(rand() * SYL_A.length) | 0];
  s = s[0].toUpperCase() + s.slice(1);
  if (s.length > 9) s = s.slice(0, 9);
  return s;
}

export function planetName(rand) {
  const base = core(rand);
  const r = rand();
  if (r < 0.3) return `${base} ${SUFFIX[(rand() * SUFFIX.length) | 0]}`;
  if (r < 0.55) return `${base}-${ROMAN[(rand() * ROMAN.length) | 0]}`;
  if (r < 0.68) return `${base} ${String.fromCharCode(65 + ((rand() * 26) | 0))}${(rand() * 90 + 10) | 0}`;
  return base;
}

export function systemName(rand) {
  return `${core(rand).toUpperCase()} ${SUFFIX[(rand() * SUFFIX.length) | 0].toUpperCase()}`;
}

// cute, bouncy creature names for the fauna catalog
const FA = ['mo', 'pi', 'ta', 'ru', 'ki', 'lo', 'be', 'wi', 'zu', 'na', 'po', 'fu', 'me', 'do', 'ya', 'chi'];
const FB = ['bble', 'rrip', 'nko', 'ppo', 'lly', 'zzle', 'mph', 'ddle', 'nny', 'wog', 'puff', 'boo'];
export function creatureName(rand) {
  const a = FA[(rand() * FA.length) | 0];
  const b = rand() < 0.5 ? FA[(rand() * FA.length) | 0] : '';
  const s = a + b + FB[(rand() * FB.length) | 0];
  return s[0].toUpperCase() + s.slice(1);
}
