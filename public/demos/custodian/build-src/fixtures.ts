/**
 * Demo glue, not repo code: a FetchLike that the repo's source clients (CpscSource,
 * NhtsaVehicleSource, NhtsaChildSeatSource, OpenFdaSource) are constructed with. It answers
 * their real request URLs from the recorded responses in packages/server/test/fixtures, which
 * this page fetches from its own origin. Nothing goes to saferproducts.gov, nhtsa.gov or fda.gov.
 *
 * Where a feed's answer depends on a server-side search the recording cannot reproduce, the
 * rule below says what stands in for it. A request with no recording gets a 404 whose body says
 * so, and the source code handles that the way it handles a real 404.
 */

export interface RequestLogEntry {
  at: number;
  url: string;
  status: number;
  served: string;
}

type Json = unknown;

const FIXTURE_DIR = './fixtures/';
const cache = new Map<string, Promise<Json>>();

function load(name: string): Promise<Json> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(`${FIXTURE_DIR}${name}`).then((r) => {
      if (!r.ok) throw new Error(`could not load fixture ${name} (${r.status})`);
      return r.json();
    });
    cache.set(name, p);
  }
  return p;
}

export const FIXTURES = [
  'cpsc-car-seat.json',
  'cpsc-joolz-pair.json',
  'cpsc-recent.json',
  'nhtsa-childseats-page.json',
  'nhtsa-odyssey-2019.json',
  'openfda-device-thermometer.json',
  'openfda-drug-acetaminophen.json',
  'openfda-food-romaine.json',
];

export function preloadFixtures(): Promise<Json[]> {
  return Promise.all(FIXTURES.map(load));
}

/** The offset of the one recorded child-seat catalogue page (its meta.pagination.offset). */
export const RECORDED_CHILDSEAT_OFFSET = 1200;

/** openFDA recordings: which endpoint and which product words each one was recorded for. */
const FDA_RECORDINGS: Array<{ endpoint: string; words: string[]; file: string }> = [
  { endpoint: 'food', words: ['romaine'], file: 'openfda-food-romaine.json' },
  { endpoint: 'drug', words: ['acetaminophen', 'tylenol'], file: 'openfda-drug-acetaminophen.json' },
  { endpoint: 'device', words: ['thermometer', 'thermoscan'], file: 'openfda-device-thermometer.json' },
];

interface CpscRow {
  RecallNumber: string;
  Title: string;
  Products?: Array<{ Name?: string; Model?: string; Description?: string }>;
}

async function allCpscRows(): Promise<CpscRow[]> {
  const files = ['cpsc-car-seat.json', 'cpsc-joolz-pair.json', 'cpsc-recent.json'];
  const seen = new Map<string, CpscRow>();
  for (const f of files) for (const r of (await load(f)) as CpscRow[]) seen.set(r.RecallNumber, r);
  return [...seen.values()];
}

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function createFixtureFetch(onRequest: (e: RequestLogEntry) => void): typeof fetch {
  const done = (url: string, status: number, served: string, res: Response) => {
    onRequest({ at: performance.now(), url, status, served });
    return res;
  };
  const notRecorded = (url: string) =>
    done(
      url,
      404,
      'no recording for this request',
      json({ error: 'no recorded response for this request in the browser demo' }, 404),
    );

  const fixtureFetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url);

    // CPSC recall feed: https://www.saferproducts.gov/RestWebServices/Recall?format=json&...
    if (u.hostname === 'www.saferproducts.gov' && u.pathname === '/RestWebServices/Recall') {
      if (u.searchParams.has('RecallDateStart')) {
        const rows = await load('cpsc-recent.json');
        return done(url, 200, 'cpsc-recent.json (recorded feed page)', json(rows));
      }
      const q = u.searchParams.get('ProductName');
      if (q !== null) {
        // CPSC runs this search on its server. Stand-in: every word of the query must appear in a
        // recorded record's title or product names/models (the three recorded CPSC files).
        const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
        const rows = (await allCpscRows()).filter((r) => {
          const hay = [r.Title, ...(r.Products ?? []).flatMap((p) => [p.Name, p.Model])]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return words.length > 0 && words.every((w) => hay.includes(w));
        });
        return done(
          url,
          200,
          `search over recorded CPSC records: ${rows.length} hit${rows.length === 1 ? '' : 's'}`,
          json(rows),
        );
      }
    }

    // NHTSA vehicle campaigns: https://api.nhtsa.gov/recalls/recallsByVehicle?make=&model=&modelYear=
    if (u.hostname === 'api.nhtsa.gov' && u.pathname === '/recalls/recallsByVehicle') {
      const make = (u.searchParams.get('make') ?? '').toLowerCase();
      const model = (u.searchParams.get('model') ?? '').toLowerCase();
      const year = u.searchParams.get('modelYear');
      if (make === 'honda' && model === 'odyssey' && year === '2019') {
        return done(url, 200, 'nhtsa-odyssey-2019.json', json(await load('nhtsa-odyssey-2019.json')));
      }
      return notRecorded(url);
    }

    // NHTSA child-seat catalogue: https://api.nhtsa.gov/childSeats?issueType=r&max=100&offset=N
    if (u.hostname === 'api.nhtsa.gov' && u.pathname === '/childSeats') {
      if (u.searchParams.get('offset') === String(RECORDED_CHILDSEAT_OFFSET)) {
        return done(
          url,
          200,
          'nhtsa-childseats-page.json (recorded page)',
          json(await load('nhtsa-childseats-page.json')),
        );
      }
      return notRecorded(url);
    }

    // openFDA enforcement reports: https://api.fda.gov/{food,drug,device}/enforcement.json?search=...
    if (u.hostname === 'api.fda.gov') {
      const endpoint = u.pathname.split('/')[1] ?? '';
      const search = decodeURIComponent(u.search).toLowerCase();
      const rec = FDA_RECORDINGS.find(
        (r) => r.endpoint === endpoint && r.words.some((w) => search.includes(`"${w}"`)),
      );
      if (rec) return done(url, 200, `${rec.file} (recorded search)`, json(await load(rec.file)));
      // openFDA itself answers 404 when nothing matches; OpenFdaSource reads that as "no recalls".
      return notRecorded(url);
    }

    return notRecorded(url);
  };
  return fixtureFetch as typeof fetch;
}
