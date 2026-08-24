import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const PATH = 'lucky-lukes-xi/club-state.json';

const EMPTY = {
  version: 0,
  members: [],
  applications: [],
  sessions: [],
  polls: [],
  notices: [],
  history: [],
  lineup: { starters: [], bench: [], slots: {}, autoSig: '' },
  adminAttendance: {},
  updatedAt: 0
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

async function readState() {
  try {
    const result = await get(PATH, { access: 'private' });
    if (!result || result.statusCode !== 200) {
      return { state: structuredClone(EMPTY), etag: null };
    }

    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);

    return {
      state: {
        ...structuredClone(EMPTY),
        ...parsed,
        lineup: { ...EMPTY.lineup, ...(parsed.lineup || {}) },
        adminAttendance: parsed.adminAttendance || {}
      },
      etag: result.blob.etag || null
    };
  } catch (error) {
    const msg = String(error?.message || error);
    if (/not.?found|does not exist|404/i.test(msg)) {
      return { state: structuredClone(EMPTY), etag: null };
    }
    throw error;
  }
}

async function writeState(next, etag) {
  const options = {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 0
  };

  if (etag) options.ifMatch = etag;

  await put(PATH, JSON.stringify(next), options);
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      const { state } = await readState();
      return res.status(200).json(state);
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body || {});

      const { state: current, etag } = await readState();

      if (Number(body.baseVersion) !== Number(current.version)) {
        return res.status(409).json({
          error: 'conflict',
          version: current.version
        });
      }

      const incoming = body.state || {};
      const next = {
        ...current,
        ...incoming,
        lineup: { ...current.lineup, ...(incoming.lineup || {}) },
        adminAttendance: incoming.adminAttendance || current.adminAttendance || {},
        version: Number(current.version || 0) + 1,
        updatedAt: Date.now()
      };

      try {
        await writeState(next, etag);
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) {
          return res.status(409).json({ error: 'conflict' });
        }
        throw error;
      }

      return res.status(200).json(next);
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) {
    console.error(error);
    return res.status(503).json({
      error: 'online_storage_unavailable',
      message: String(error?.message || error)
    });
  }
}