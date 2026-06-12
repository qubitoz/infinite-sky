// Optional global discovery board (Supabase REST). When ONLINE.url is empty
// every call is a silent no-op, so the game works fully offline.
//
// Expected table (RLS: anon may select + insert):
//   create table public.discoveries (
//     id bigint generated always as identity primary key,
//     seed bigint not null,
//     species_id text not null,
//     species_name text not null,
//     planet_name text not null,
//     player text not null,
//     created_at timestamptz default now(),
//     unique (seed, species_id)
//   );
export const ONLINE = {
  url: '',  // e.g. 'https://xyzcompany.supabase.co'
  key: '',  // publishable / anon key
};

function headers() {
  return {
    apikey: ONLINE.key,
    Authorization: `Bearer ${ONLINE.key}`,
    'Content-Type': 'application/json',
  };
}

// first insert wins (unique seed+species_id); duplicates are ignored
export async function reportDiscovery(row) {
  if (!ONLINE.url) return;
  try {
    await fetch(`${ONLINE.url}/rest/v1/discoveries?on_conflict=seed,species_id`, {
      method: 'POST',
      headers: { ...headers(), Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify(row),
    });
  } catch { /* offline — ignore */ }
}

// species_id -> player name of the first discoverer, for this seed
export async function fetchFirstBy(seed) {
  if (!ONLINE.url) return new Map();
  try {
    const r = await fetch(
      `${ONLINE.url}/rest/v1/discoveries?seed=eq.${seed}&select=species_id,player`,
      { headers: headers() },
    );
    const rows = await r.json();
    return new Map(rows.map((x) => [x.species_id, x.player]));
  } catch {
    return new Map();
  }
}
