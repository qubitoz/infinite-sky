// Star system generation. Biomes come from a data pack (BIOME_DATA) with
// dual-language labels, climate hazards, prop kits and fauna recipes; the
// pack is normalized into BIOMES below. Terrain amplitudes are fractions of
// planet radius.
import { mulberry32 } from './noise.js';
import { planetName, systemName } from './names.js';

// 16-biome pack — generated and adversarially verified (workflow biome-pack-16).
const BIOME_DATA = [
  {"key": "lush", "labelEn": "LUSH WORLD", "labelEs": "MUNDO FRONDOSO", "atmo": "#aee3f5", "sky": "#7ec8f0", "strength": 1, "sea": {"level": 0.0062, "deep": "#1565a8", "shallow": "#3fc2c8", "lava": false}, "cloudDensity": 0.45, "cloudColor": "#ffffff", "terrain": {"contFreq": 1.6, "contAmp": 0.011, "mtnFreq": 4.2, "mtnAmp": 0.018, "warp": 0.45, "detFreq": 17, "detAmp": 0.0022, "terrace": 0, "fold": false}, "ramp": [["#e9d9a3", 0.0], ["#86d161", 0.1], ["#52b54e", 0.32], ["#3c9347", 0.55], ["#6f8b5a", 0.75], ["#9aa78a", 0.9]], "rock": "#8a8f7a", "snow": "#ffffff", "snowLine": 0.8, "weatherEn": ["GENTLE BREEZE", "WARM SUNSHINE", "LIGHT RAIN"], "weatherEs": ["BRISA SUAVE", "SOL CALIENTITO", "LLUVIA LIGERA"], "floraEn": "ABUNDANT", "floraEs": "ABUNDANTE", "faunaEn": "FRIENDLY", "faunaEs": "AMIGABLE", "faunaCount": 5, "faunaArchetypes": ["walker", "hopper", "flyer", "longneck", "blob"], "gravity": [9, 10.5], "temp": [12, 28], "kit": "forest", "kitColors": {"a": "#4caf50", "b": "#8d6e4a", "c": "#f06292"}, "hazard": null, "materials": ["leaf", "flower", "mud"], "starter": true},
  {"key": "desert", "labelEn": "DESERT WORLD", "labelEs": "MUNDO DESÉRTICO", "atmo": "#f5cf9a", "sky": "#e89a6a", "strength": 1.05, "sea": null, "cloudDensity": 0.1, "cloudColor": "#f7e3c8", "terrain": {"contFreq": 1.4, "contAmp": 0.012, "mtnFreq": 3.8, "mtnAmp": 0.02, "warp": 0.35, "detFreq": 15, "detAmp": 0.0019, "terrace": 0.65, "fold": false}, "ramp": [["#e8b06a", 0.0], ["#dd9952", 0.2], ["#c87f41", 0.42], ["#a8602f", 0.65], ["#8a4a26", 0.85]], "rock": "#b06a3a", "snow": null, "snowLine": null, "weatherEn": ["DRY HEAT", "DUST SWIRLS", "SAND HAZE"], "weatherEs": ["CALOR SECO", "REMOLINOS DE POLVO", "BRUMA DE ARENA"], "floraEn": "SPARSE", "floraEs": "ESCASA", "faunaEn": "RARE", "faunaEs": "RARA", "faunaCount": 2, "faunaArchetypes": ["crawler", "hopper"], "gravity": [8.5, 11], "temp": [18, 52], "kit": "cacti", "kitColors": {"a": "#5aa653", "b": "#3c7a3e", "c": "#f4c95d"}, "hazard": null, "materials": ["bone", "branch"], "starter": false},
  {"key": "frozen", "labelEn": "FROZEN WORLD", "labelEs": "MUNDO CONGELADO", "atmo": "#d6ecf8", "sky": "#a8d8f0", "strength": 0.95, "sea": {"level": 0.0055, "deep": "#2a6ea8", "shallow": "#7fd0e8", "lava": false}, "cloudDensity": 0.35, "cloudColor": "#e8f4fb", "terrain": {"contFreq": 1.5, "contAmp": 0.011, "mtnFreq": 4.6, "mtnAmp": 0.022, "warp": 0.4, "detFreq": 18, "detAmp": 0.0024, "terrace": 0.2, "fold": false}, "ramp": [["#a9d9e8", 0.0], ["#c4e7f0", 0.18], ["#ddf1f6", 0.4], ["#f0f9fb", 0.65], ["#ffffff", 0.88]], "rock": "#6e8ba0", "snow": "#ffffff", "snowLine": 0.55, "weatherEn": ["SNOW FLURRIES", "CRISP AIR", "ICE SPARKLE"], "weatherEs": ["COPOS DE NIEVE", "AIRE FRESQUITO", "DESTELLOS DE HIELO"], "floraEn": "FROSTED", "floraEs": "ESCARCHADA", "faunaEn": "FLUFFY", "faunaEs": "PELUDITA", "faunaCount": 2, "faunaArchetypes": ["walker", "hopper"], "gravity": [8, 10], "temp": [-40, -5], "kit": "frost", "kitColors": {"a": "#bfe6f5", "b": "#88b8d8", "c": "#e8f8ff"}, "hazard": null, "materials": ["ice", "bone"], "starter": false},
  {"key": "volcanic", "labelEn": "VOLCANO WORLD", "labelEs": "MUNDO VOLCÁNICO", "atmo": "#f09a60", "sky": "#d86840", "strength": 1.2, "sea": {"level": 0.005, "deep": "#b03208", "shallow": "#ff9526", "lava": true}, "cloudDensity": 0.5, "cloudColor": "#b59488", "terrain": {"contFreq": 1.7, "contAmp": 0.012, "mtnFreq": 5.2, "mtnAmp": 0.026, "warp": 0.6, "detFreq": 20, "detAmp": 0.0028, "terrace": 0.15, "fold": false}, "ramp": [["#8a4030", 0.0], ["#6a3a30", 0.15], ["#54382f", 0.38], ["#473a35", 0.62], ["#5c4c42", 0.85]], "rock": "#4a3a36", "snow": null, "snowLine": null, "weatherEn": ["ASH PUFFS", "HEAT SHIMMER", "EMBER SPARKS", "RUMBLING GROUND"], "weatherEs": ["NUBES DE CENIZA", "ONDAS DE CALOR", "CHISPAS BRILLANTES", "SUELO RETUMBANTE"], "floraEn": "NONE", "floraEs": "NINGUNA", "faunaEn": "NONE", "faunaEs": "NINGUNA", "faunaCount": 0, "faunaArchetypes": [], "gravity": [10, 13], "temp": [60, 110], "kit": "spikes", "kitColors": {"a": "#3c3034", "b": "#6e3428", "c": "#ff8c3a"}, "hazard": "heat", "materials": ["obsidian", "mud"], "starter": false},
  {"key": "toxic", "labelEn": "TOXIC WORLD", "labelEs": "MUNDO TÓXICO", "atmo": "#cfe08a", "sky": "#94c84e", "strength": 1.1, "sea": {"level": 0.0058, "deep": "#4a6e2a", "shallow": "#86b03c", "lava": false}, "cloudDensity": 0.55, "cloudColor": "#d6e3a0", "terrain": {"contFreq": 1.8, "contAmp": 0.01, "mtnFreq": 4.4, "mtnAmp": 0.017, "warp": 0.7, "detFreq": 19, "detAmp": 0.0025, "terrace": 0, "fold": false}, "ramp": [["#7a9a3c", 0.0], ["#699040", 0.15], ["#5e7e4e", 0.38], ["#6e5a88", 0.6], ["#8a6aa8", 0.85]], "rock": "#6a5a80", "snow": null, "snowLine": null, "weatherEn": ["SPORE DRIFT", "GREEN MIST", "GLOWING DRIZZLE"], "weatherEs": ["LLUVIA DE ESPORAS", "NIEBLA VERDE", "LLOVIZNA LUMINOSA"], "floraEn": "FUNGAL", "floraEs": "FÚNGICA", "faunaEn": "PECULIAR", "faunaEs": "PECULIAR", "faunaCount": 3, "faunaArchetypes": ["blob", "crawler", "hopper"], "gravity": [7.5, 10], "temp": [8, 30], "kit": "shroom", "kitColors": {"a": "#9a5ec8", "b": "#d8cfa8", "c": "#d4f25a"}, "hazard": null, "materials": ["spore", "mud"], "starter": false},
  {"key": "exotic", "labelEn": "EXOTIC WORLD", "labelEs": "MUNDO EXÓTICO", "atmo": "#f0a0d8", "sky": "#d86ab8", "strength": 1.25, "sea": null, "cloudDensity": 0.15, "cloudColor": "#f4c8e8", "terrain": {"contFreq": 2.1, "contAmp": 0.013, "mtnFreq": 5.4, "mtnAmp": 0.024, "warp": 0.8, "detFreq": 22, "detAmp": 0.003, "terrace": 0.4, "fold": true}, "ramp": [["#36b8a8", 0.0], ["#55ccba", 0.18], ["#9fb4cf", 0.4], ["#c47ed0", 0.6], ["#e06cc4", 0.78], ["#f490de", 0.9]], "rock": "#7a6a9a", "snow": null, "snowLine": null, "weatherEn": ["FLOATING MOTES", "PRISM HAZE", "SILENT SHIMMER"], "weatherEs": ["MOTAS FLOTANTES", "BRUMA DE PRISMA", "DESTELLO SILENCIOSO"], "floraEn": "CRYSTALLINE", "floraEs": "CRISTALINA", "faunaEn": "NONE", "faunaEs": "NINGUNA", "faunaCount": 0, "faunaArchetypes": [], "gravity": [6, 8], "temp": [-10, 25], "kit": "crystal", "kitColors": {"a": "#e860c0", "b": "#2fc4b4", "c": "#f8e8ff"}, "hazard": null, "materials": ["crystal", "obsidian"], "starter": false},
  {"key": "ocean", "labelEn": "OCEAN WORLD", "labelEs": "MUNDO OCEÁNICO", "atmo": "#98e0ec", "sky": "#48c0d8", "strength": 0.9, "sea": {"level": 0.009, "deep": "#0d5a9e", "shallow": "#35c8d0", "lava": false}, "cloudDensity": 0.4, "cloudColor": "#ffffff", "terrain": {"contFreq": 1.2, "contAmp": 0.008, "mtnFreq": 3.4, "mtnAmp": 0.013, "warp": 0.3, "detFreq": 14, "detAmp": 0.0017, "terrace": 0, "fold": false}, "ramp": [["#f8e0cc", 0.0], ["#f4cdab", 0.1], ["#8adcc4", 0.25], ["#4cc0ae", 0.5], ["#379a92", 0.75], ["#62a496", 0.9]], "rock": "#9a8f72", "snow": null, "snowLine": null, "weatherEn": ["SEA BREEZE", "SUNNY SKIES", "PASSING SHOWERS", "ROLLING WAVES"], "weatherEs": ["BRISA MARINA", "CIELOS SOLEADOS", "CHUBASCOS PASAJEROS", "OLAS SUAVES"], "floraEn": "TROPICAL", "floraEs": "TROPICAL", "faunaEn": "PLAYFUL", "faunaEs": "JUGUETONA", "faunaCount": 4, "faunaArchetypes": ["flyer", "hopper", "blob", "walker"], "gravity": [8.5, 10.5], "temp": [18, 32], "kit": "forest", "kitColors": {"a": "#3cb86a", "b": "#a8784a", "c": "#ffd166"}, "hazard": null, "materials": ["leaf", "flower", "mud"], "starter": true},
  {"key": "candy", "labelEn": "CANDY WORLD", "labelEs": "MUNDO DE CARAMELO", "atmo": "#ffd2e8", "sky": "#f8a8d0", "strength": 0.85, "sea": {"level": 0.0055, "deep": "#c8508e", "shallow": "#ff9ed0", "lava": false}, "cloudDensity": 0.5, "cloudColor": "#fff0f8", "terrain": {"contFreq": 1.3, "contAmp": 0.009, "mtnFreq": 3.6, "mtnAmp": 0.014, "warp": 0.25, "detFreq": 13, "detAmp": 0.0016, "terrace": 0.3, "fold": false}, "ramp": [["#ffe3ee", 0.0], ["#ffc2dd", 0.15], ["#c8a2e8", 0.35], ["#9ed0f5", 0.55], ["#aaeccf", 0.75], ["#fff6c8", 0.9]], "rock": "#b8869e", "snow": "#fff8fc", "snowLine": 0.75, "weatherEn": ["SPRINKLE SHOWERS", "COTTON CLOUDS", "SWEET BREEZE"], "weatherEs": ["LLUVIA DE CHISPITAS", "NUBES DE ALGODÓN", "BRISA DULCE"], "floraEn": "SUGARY", "floraEs": "AZUCARADA", "faunaEn": "BOUNCY", "faunaEs": "SALTARINA", "faunaCount": 4, "faunaArchetypes": ["hopper", "blob", "flyer", "walker"], "gravity": [6.5, 8.5], "temp": [15, 26], "kit": "candy", "kitColors": {"a": "#ff85b8", "b": "#f8f0e8", "c": "#7adcf0"}, "hazard": null, "materials": ["flower", "branch"], "starter": true},
  {"key": "savanna", "labelEn": "SAVANNA WORLD", "labelEs": "MUNDO DE SABANA", "atmo": "#fbe0a8", "sky": "#f4c468", "strength": 0.95, "sea": {"level": 0.0042, "deep": "#3f6e62", "shallow": "#7ab890", "lava": false}, "cloudDensity": 0.25, "cloudColor": "#fdf2dc", "terrain": {"contFreq": 1.3, "contAmp": 0.009, "mtnFreq": 3.5, "mtnAmp": 0.014, "warp": 0.3, "detFreq": 14, "detAmp": 0.0016, "terrace": 0.1, "fold": false}, "ramp": [["#9ab05c", 0.0], ["#c2b052", 0.12], ["#d9b44e", 0.3], ["#c89a44", 0.55], ["#a87e3c", 0.78], ["#8a6a3a", 0.9]], "rock": "#9a7a4e", "snow": null, "snowLine": null, "weatherEn": ["GOLDEN SUN", "WARM WINDS", "DISTANT THUNDER"], "weatherEs": ["SOL DORADO", "VIENTOS CÁLIDOS", "TRUENOS LEJANOS"], "floraEn": "GOLDEN GRASSES", "floraEs": "PASTOS DORADOS", "faunaEn": "GENTLE GIANTS", "faunaEs": "GIGANTES AMABLES", "faunaCount": 5, "faunaArchetypes": ["longneck", "walker", "hopper", "flyer"], "gravity": [9, 11], "temp": [20, 38], "kit": "forest", "kitColors": {"a": "#7a9e3e", "b": "#8a6a42", "c": "#e8c85a"}, "hazard": null, "materials": ["branch", "bone", "mud"], "starter": true},
  {"key": "fungal", "labelEn": "FUNGAL WORLD", "labelEs": "MUNDO DE HONGOS", "atmo": "#b2a2e2", "sky": "#8a7ad0", "strength": 1.05, "sea": {"level": 0.005, "deep": "#28486e", "shallow": "#4a88a0", "lava": false}, "cloudDensity": 0.45, "cloudColor": "#c2b2dc", "terrain": {"contFreq": 1.6, "contAmp": 0.01, "mtnFreq": 4, "mtnAmp": 0.016, "warp": 0.55, "detFreq": 16, "detAmp": 0.0021, "terrace": 0, "fold": false}, "ramp": [["#6a5468", 0.0], ["#7a5e72", 0.15], ["#8c6a80", 0.38], ["#9a7898", 0.6], ["#b292b8", 0.85]], "rock": "#6e6080", "snow": null, "snowLine": null, "weatherEn": ["SPORE GLOW", "MISTY HOLLOWS", "SOFT DRIZZLE"], "weatherEs": ["BRILLO DE ESPORAS", "VALLES BRUMOSOS", "LLOVIZNA TRANQUILA"], "floraEn": "TOWERING", "floraEs": "GIGANTESCA", "faunaEn": "GLOWING", "faunaEs": "LUMINOSA", "faunaCount": 3, "faunaArchetypes": ["crawler", "blob", "hopper"], "gravity": [7, 9.5], "temp": [5, 18], "kit": "shroom", "kitColors": {"a": "#ff9a4a", "b": "#e8d8b8", "c": "#6ae8d8"}, "hazard": null, "materials": ["spore", "mud"], "starter": false},
  {"key": "geode", "labelEn": "CRYSTAL WORLD", "labelEs": "MUNDO DE CRISTAL", "atmo": "#aac0f0", "sky": "#7090e0", "strength": 1.15, "sea": {"level": 0.0045, "deep": "#2f4aa8", "shallow": "#6a9ae8", "lava": false}, "cloudDensity": 0.2, "cloudColor": "#dce8fa", "terrain": {"contFreq": 1.9, "contAmp": 0.011, "mtnFreq": 5, "mtnAmp": 0.022, "warp": 0.5, "detFreq": 21, "detAmp": 0.0027, "terrace": 0.5, "fold": false}, "ramp": [["#9aa8d8", 0.0], ["#aab8e2", 0.2], ["#c0c8ec", 0.45], ["#d8d8f4", 0.7], ["#eeeafc", 0.9]], "rock": "#8088b0", "snow": "#f4f2ff", "snowLine": 0.78, "weatherEn": ["CRYSTAL CHIMES", "SPARKLING AIR", "LIGHT PRISMS"], "weatherEs": ["CAMPANITAS DE CRISTAL", "AIRE BRILLANTE", "PRISMAS DE LUZ"], "floraEn": "GEM BLOOMS", "floraEs": "FLORES DE GEMA", "faunaEn": "SHY", "faunaEs": "TÍMIDA", "faunaCount": 2, "faunaArchetypes": ["crawler", "walker"], "gravity": [10, 12], "temp": [-15, 10], "kit": "crystal", "kitColors": {"a": "#6ab8f0", "b": "#4a5ab0", "c": "#e8f4ff"}, "hazard": null, "materials": ["crystal", "ice"], "starter": false},
  {"key": "blizzard", "labelEn": "BLIZZARD WORLD", "labelEs": "MUNDO DE VENTISCA", "atmo": "#a8b2d2", "sky": "#7e8cb8", "strength": 1.3, "sea": null, "cloudDensity": 0.7, "cloudColor": "#ccd6e8", "terrain": {"contFreq": 1.5, "contAmp": 0.012, "mtnFreq": 4.8, "mtnAmp": 0.024, "warp": 0.45, "detFreq": 19, "detAmp": 0.0026, "terrace": 0, "fold": false}, "ramp": [["#9098ac", 0.0], ["#a2aabc", 0.2], ["#b8becc", 0.45], ["#d2d6e0", 0.7], ["#eaecf2", 0.9]], "rock": "#7a86aa", "snow": "#ffffff", "snowLine": 0.5, "weatherEn": ["SWIRLING SNOW", "HOWLING WIND", "WHITEOUT GUSTS", "FROST SPARKLES"], "weatherEs": ["NIEVE EN REMOLINOS", "VIENTO AULLADOR", "RÁFAGAS BLANCAS", "DESTELLOS DE ESCARCHA"], "floraEn": "HIDDEN", "floraEs": "ESCONDIDA", "faunaEn": "NONE", "faunaEs": "NINGUNA", "faunaCount": 0, "faunaArchetypes": [], "gravity": [9, 11.5], "temp": [-70, -30], "kit": "frost", "kitColors": {"a": "#c4d2f0", "b": "#8294c4", "c": "#eef4ff"}, "hazard": "cold", "materials": ["ice", "crystal"], "starter": false},
  {"key": "acid", "labelEn": "FIZZY WORLD", "labelEs": "MUNDO BURBUJEANTE", "atmo": "#f0ea96", "sky": "#e0d44a", "strength": 1.1, "sea": {"level": 0.006, "deep": "#5a9a18", "shallow": "#aade2c", "lava": false}, "cloudDensity": 0.5, "cloudColor": "#e9edb0", "terrain": {"contFreq": 1.4, "contAmp": 0.008, "mtnFreq": 3.6, "mtnAmp": 0.013, "warp": 0.6, "detFreq": 17, "detAmp": 0.002, "terrace": 0, "fold": false}, "ramp": [["#aca83e", 0.0], ["#9c9838", 0.18], ["#888036", 0.4], ["#746e46", 0.65], ["#929066", 0.85]], "rock": "#6a6a58", "snow": null, "snowLine": null, "weatherEn": ["FIZZY RAIN", "BUBBLING POOLS", "LIME FOG"], "weatherEs": ["LLUVIA EFERVESCENTE", "CHARCOS BURBUJEANTES", "NIEBLA VERDE LIMA"], "floraEn": "RUBBERY", "floraEs": "GOMOSA", "faunaEn": "NONE", "faunaEs": "NINGUNA", "faunaCount": 0, "faunaArchetypes": [], "gravity": [8, 10], "temp": [10, 35], "kit": "swamp", "kitColors": {"a": "#8aa83e", "b": "#5c6e34", "c": "#d8f04a"}, "hazard": "acid", "materials": ["mud", "spore", "branch"], "starter": false},
  {"key": "tempest", "labelEn": "TEMPEST WORLD", "labelEs": "MUNDO DE TORMENTAS", "atmo": "#8a96bc", "sky": "#6878a8", "strength": 1.3, "sea": {"level": 0.0065, "deep": "#1e3a66", "shallow": "#46719e", "lava": false}, "cloudDensity": 0.7, "cloudColor": "#9aa4c0", "terrain": {"contFreq": 1.8, "contAmp": 0.013, "mtnFreq": 5, "mtnAmp": 0.024, "warp": 0.65, "detFreq": 20, "detAmp": 0.0027, "terrace": 0, "fold": false}, "ramp": [["#5a7a64", 0.0], ["#56716a", 0.18], ["#566478", 0.42], ["#5e6286", 0.68], ["#787ca0", 0.88]], "rock": "#5e6480", "snow": null, "snowLine": null, "weatherEn": ["LIGHTNING SHOW", "ROARING GUSTS", "SIDEWAYS RAIN", "THUNDER DRUMS"], "weatherEs": ["ESPECTÁCULO DE RAYOS", "RÁFAGAS RUGIENTES", "LLUVIA DE COSTADO", "TAMBORES DE TRUENO"], "floraEn": "WINDSWEPT", "floraEs": "PEINADA POR EL VIENTO", "faunaEn": "NONE", "faunaEs": "NINGUNA", "faunaCount": 0, "faunaArchetypes": [], "gravity": [10, 13], "temp": [5, 22], "kit": "rocks", "kitColors": {"a": "#6a7290", "b": "#4e5670", "c": "#ffe066"}, "hazard": "storm", "materials": ["branch", "mud"], "starter": false},
  {"key": "meadow", "labelEn": "MEADOW WORLD", "labelEs": "MUNDO DE PRADERAS", "atmo": "#d0e0fa", "sky": "#a8b4f0", "strength": 0.8, "sea": {"level": 0.0048, "deep": "#3a6ab8", "shallow": "#7ab8e0", "lava": false}, "cloudDensity": 0.35, "cloudColor": "#ffffff", "terrain": {"contFreq": 1.2, "contAmp": 0.009, "mtnFreq": 3.3, "mtnAmp": 0.012, "warp": 0.2, "detFreq": 13, "detAmp": 0.0015, "terrace": 0, "fold": false}, "ramp": [["#a2d87e", 0.0], ["#a4c47e", 0.18], ["#b49ad8", 0.4], ["#c0a8e0", 0.6], ["#9aae8c", 0.8], ["#b4c2aa", 0.9]], "rock": "#98a08a", "snow": null, "snowLine": null, "weatherEn": ["FLOWER PETALS", "SOFT SUNSHINE", "BUTTERFLY WINDS"], "weatherEs": ["PÉTALOS DE FLORES", "SOL SUAVECITO", "VIENTOS DE MARIPOSAS"], "floraEn": "FRAGRANT", "floraEs": "PERFUMADA", "faunaEn": "GENTLE", "faunaEs": "TIERNA", "faunaCount": 4, "faunaArchetypes": ["hopper", "flyer", "walker", "longneck"], "gravity": [8, 9.5], "temp": [10, 24], "kit": "forest", "kitColors": {"a": "#b48ae0", "b": "#7a9a5a", "c": "#f8d8ff"}, "hazard": null, "materials": ["flower", "leaf"], "starter": true},
  {"key": "crimson", "labelEn": "CRIMSON WORLD", "labelEs": "MUNDO CARMESÍ", "atmo": "#fcd8b8", "sky": "#f8b088", "strength": 0.95, "sea": {"level": 0.005, "deep": "#7a2a4a", "shallow": "#d86a80", "lava": false}, "cloudDensity": 0.3, "cloudColor": "#fde8da", "terrain": {"contFreq": 1.6, "contAmp": 0.011, "mtnFreq": 4.4, "mtnAmp": 0.019, "warp": 0.5, "detFreq": 17, "detAmp": 0.0022, "terrace": 0, "fold": false}, "ramp": [["#e07a72", 0.0], ["#cc5f5c", 0.15], ["#b34f52", 0.4], ["#94464e", 0.65], ["#7e4a58", 0.88]], "rock": "#8a4a4e", "snow": "#ffe8ee", "snowLine": 0.82, "weatherEn": ["FALLING LEAVES", "ROSY MIST", "WARM DRIZZLE"], "weatherEs": ["HOJAS QUE CAEN", "NIEBLA ROSADA", "LLOVIZNA TIBIA"], "floraEn": "SCARLET", "floraEs": "ESCARLATA", "faunaEn": "CURIOUS", "faunaEs": "CURIOSA", "faunaCount": 3, "faunaArchetypes": ["walker", "flyer", "crawler"], "gravity": [9, 10.5], "temp": [8, 22], "kit": "forest", "kitColors": {"a": "#e8485a", "b": "#6a4a3a", "c": "#ffb0a0"}, "hazard": null, "materials": ["leaf", "branch"], "starter": false},
];

export const BIOMES = {};
export function loadBiomePack(data) {
  for (const k of Object.keys(BIOMES)) delete BIOMES[k];
  for (const b of data) {
    BIOMES[b.key] = {
      key: b.key,
      label: { en: b.labelEn, es: b.labelEs },
      atmo: b.atmo,
      sky: b.sky,
      strength: b.strength,
      sea: b.sea,
      cloud: { density: b.cloudDensity, color: b.cloudColor },
      terrain: { ...b.terrain, terrace: b.terrain.terrace || 0, fold: !!b.terrain.fold },
      ramp: b.ramp,
      rock: b.rock,
      snow: b.snow,
      snowLine: b.snowLine,
      weather: b.weatherEn.map((en, i) => ({ en, es: (b.weatherEs && b.weatherEs[i]) || en })),
      flora: { en: b.floraEn, es: b.floraEs },
      fauna: { en: b.faunaEn, es: b.faunaEs },
      faunaCount: b.faunaCount,
      faunaArchetypes: b.faunaArchetypes || [],
      gravity: b.gravity,
      temp: b.temp,
      kit: b.kit,
      kitColors: b.kitColors,
      hazard: b.hazard || null,
      materials: b.materials || [],
      starter: !!b.starter,
    };
  }
}
loadBiomePack(BIOME_DATA);

const STAR_CLASSES = [
  { color: '#fff3d2', glow: '#ffd9a0', core: '#fffbe8' }, // G
  { color: '#ffce8f', glow: '#ff9d5c', core: '#fff1d0' }, // K
  { color: '#dfeaff', glow: '#9fc2ff', core: '#ffffff' }, // F
];

// kid-friendly sentinel moods
const SENTINELS = [
  { en: 'SLEEPY', es: 'DORMILONES' },
  { en: 'SHY', es: 'TÍMIDOS' },
  { en: 'OBSERVANT', es: 'OBSERVADORES' },
  { en: 'CURIOUS', es: 'CURIOSOS' },
  { en: 'PLAYFUL', es: 'JUGUETONES' },
];

// shared deterministic header so the galaxy chart can preview names/stars
// without building whole systems
export function systemHeader(seed) {
  const rand = mulberry32(seed);
  const star = STAR_CLASSES[(rand() * STAR_CLASSES.length) | 0];
  const name = systemName(rand);
  return { rand, star, name };
}

export function makeSystem(seed) {
  const { rand, star, name } = systemHeader(seed);

  const keys = Object.keys(BIOMES);
  const starters = keys.filter((k) => BIOMES[k].starter);
  const pool = [...keys];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const count = 5 + ((rand() * 3.4) | 0); // 5-8 planets
  const order = [starters[(rand() * starters.length) | 0]];
  let hazards = 0;
  for (const k of pool) {
    if (order.length >= count) break;
    if (order.includes(k)) continue;
    if (BIOMES[k].hazard && hazards >= 2) continue;
    if (BIOMES[k].hazard) hazards++;
    order.push(k);
  }

  const planets = [];
  let orbit = 26000 + rand() * 8000;
  for (let i = 0; i < order.length; i++) {
    const biome = BIOMES[order[i]];
    const ang = rand() * Math.PI * 2;
    const radius = 1300 + rand() * 1300;
    const y = (rand() - 0.5) * orbit * 0.16;
    planets.push({
      id: i,
      seed: (seed ^ (i * 0x9e3779b9)) >>> 0,
      name: planetName(rand).toUpperCase(),
      biome,
      radius,
      position: [Math.cos(ang) * orbit, y, Math.sin(ang) * orbit],
      hasRings: rand() < 0.32,
      ringTint: rand() < 0.5 ? '#cfc4ae' : '#aebfd2',
      cloudSpin: (rand() * 0.5 + 0.5) * (rand() < 0.5 ? -1 : 1) * 0.004,
      stats: {
        weather: biome.weather[(rand() * biome.weather.length) | 0],
        gravity: +(biome.gravity[0] + rand() * (biome.gravity[1] - biome.gravity[0])).toFixed(1),
        temp: Math.round(biome.temp[0] + rand() * (biome.temp[1] - biome.temp[0])),
        sentinels: SENTINELS[(rand() * SENTINELS.length) | 0],
      },
    });
    orbit *= 1.45 + rand() * 0.35;
  }

  const beltIdx = Math.min(2, planets.length - 2);
  const r1 = Math.hypot(planets[beltIdx].position[0], planets[beltIdx].position[2]);
  const r2 = Math.hypot(planets[beltIdx + 1].position[0], planets[beltIdx + 1].position[2]);

  return {
    seed, name, star, planets,
    belt: { radius: (r1 + r2) / 2, width: (r2 - r1) * 0.16, height: (r1 + r2) * 0.012 },
    sunRadius: 7000,
  };
}
