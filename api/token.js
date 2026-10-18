/**
 * Endpoint de emisión de credenciales temporales para Gemini Live. Verifica origen, cuotas y pieza
 * solicitada antes de crear un token de uso limitado; la clave privada permanece en el servidor.
 */


import { GoogleGenAI } from '@google/genai';
import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { MARKER_CATALOG } from '../src/catalog.js';
import { getStageMetadata } from '../src/catalogUtils.js';
import { LOCALES, SUPPORTED_LOCALES } from '../src/i18n.js';

const LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';

/**
 * Convierte un valor Origin en una URL de origen comparable; rechaza formatos incompletos o no válidos.
 */
function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  configuredOrigins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
}

const ALLOWED_ORIGINS = configuredOrigins
  .map((origin) => {
    const normalized = normalizeOrigin(origin);
    if (!normalized) {
      console.warn(`ALLOWED_ORIGINS: entrada inválida ignorada ("${origin}"). Recordá incluir https://`);
    }
    return normalized;
  })
  .filter(Boolean);

const IS_DEVELOPMENT = process.env.VERCEL_ENV === 'development';

/**
 * Reconoce orígenes locales únicamente cuando el entorno permite desarrollo.
 */
function isLocalOrigin(url) {
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

/**
 * Comprueba el Origin recibido contra los dominios configurados, sin tratar CORS como autenticación.
 */
function isOriginAllowed(origin) {
  if (!origin) return false;

  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (IS_DEVELOPMENT && isLocalOrigin(url)) return true;

  return ALLOWED_ORIGINS.includes(url.origin);
}


const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const RATE_LIMIT_MAX_TRACKED_IPS = 5000;

const requestTimestampsByIp = new Map();
let lastSweepAt = -Infinity;

/**
 * Retira marcas de solicitudes antiguas para que el límite temporal no crezca indefinidamente.
 */
function sweepExpiredEntries(windowStart) {
  for (const [key, timestamps] of requestTimestampsByIp) {
    if (!timestamps.some((ts) => ts > windowStart)) requestTimestampsByIp.delete(key);
  }
}

/**
 * Cuenta solicitudes recientes por IP y aplica una barrera local complementaria a Redis.
 */
function isRateLimited(ip) {

  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  if (!requestTimestampsByIp.has(ip) && requestTimestampsByIp.size >= RATE_LIMIT_MAX_TRACKED_IPS) {
    if (now - lastSweepAt >= 1000) {
      sweepExpiredEntries(windowStart);
      lastSweepAt = now;
    }
    if (requestTimestampsByIp.size >= RATE_LIMIT_MAX_TRACKED_IPS) return true;
  }

  const existingTimestamps = requestTimestampsByIp.get(ip) ?? [];

  const recentTimestamps = existingTimestamps.filter((ts) => ts > windowStart);

  if (recentTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestTimestampsByIp.set(ip, recentTimestamps);
    return true;
  }

  recentTimestamps.push(now);
  requestTimestampsByIp.set(ip, recentTimestamps);

  return false;
}


const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
const QUOTA_NAMESPACE = process.env.TOKEN_QUOTA_NAMESPACE || 'webar';
const DISTRIBUTED_PER_IP_MAX = RATE_LIMIT_MAX_REQUESTS;
const DISTRIBUTED_GLOBAL_MAX = 60;
const DISTRIBUTED_DAILY_MAX = 400;
const QUOTA_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * La operación Redis es atómica: elimina solicitudes vencidas, comprueba las tres cuotas
 * (por IP, total por minuto y total diario) y reserva una unidad solo si todas lo permiten.
 * Esto impide que dos instancias simultáneas rebasen los límites al procesar peticiones.
 */
const QUOTA_LUA = `
local cutoff = tonumber(ARGV[1]) - tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', tonumber(ARGV[1]) - tonumber(ARGV[6]))
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4]) then return 0 end
if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[7]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[5])
redis.call('ZADD', KEYS[2], ARGV[1], ARGV[5])
redis.call('ZADD', KEYS[3], ARGV[1], ARGV[5])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
redis.call('PEXPIRE', KEYS[2], ARGV[2])
redis.call('PEXPIRE', KEYS[3], ARGV[6])
return 1
`;

/**
 * Reserva cuota atómicamente en Redis para coordinar límites entre distintas instancias del servicio.
 */
async function checkDistributedQuota(ip) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(QUOTA_NAMESPACE)) throw new Error('Namespace de cuota inválido');
  if (!REDIS_URL && !REDIS_TOKEN) {
    if (IS_DEVELOPMENT) return 'local-development-only';
    throw new Error('UPSTASH Redis es obligatorio fuera de vercel dev');
  }
  if (!REDIS_URL.startsWith('https://') || !REDIS_TOKEN) throw new Error('Cuota distribuida sin configuración válida');

  const ipHash = createHash('sha256').update(ip).digest('hex');
  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([
      'EVAL', QUOTA_LUA, '3', `${QUOTA_NAMESPACE}:token:ip:${ipHash}`, `${QUOTA_NAMESPACE}:token:global`,
      `${QUOTA_NAMESPACE}:token:global:24h`,
      String(Date.now()), String(RATE_LIMIT_WINDOW_MS),
      String(DISTRIBUTED_PER_IP_MAX), String(DISTRIBUTED_GLOBAL_MAX), randomUUID(),
      String(QUOTA_DAY_MS), String(DISTRIBUTED_DAILY_MAX)
    ]),
    signal: AbortSignal.timeout(2000)
  });
  if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
  const result = await response.json();
  if (result.result !== 0 && result.result !== 1) throw new Error('Respuesta Redis inesperada');
  return result.result === 1 ? 'allowed' : 'limited';
}

/**
 * Descarta direcciones IP vacías o valores que no sirven como identificador de cuota.
 */
function isUsableIp(value) {
  return typeof value === 'string' && isIP(value.trim()) !== 0;
}

/**
 * Obtiene la IP desde las cabeceras confiables de la plataforma para aplicar el límite correspondiente.
 */
function getClientIp(req) {
  const onVercel = process.env.VERCEL === '1';
  const candidates = onVercel ? [
    req.headers['x-real-ip'],
    typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',').pop()
      : null,
    req.socket?.remoteAddress
  ] : [req.socket?.remoteAddress];

  for (const candidate of candidates) {
    if (isUsableIp(candidate)) return candidate.trim();
  }

  return null;
}


/**
 * Genera instrucciones contextualizadas para el modelo con la pieza y el idioma autorizados.
 */
function buildSystemInstruction(entry, locale = 'es', stage = 'discovery') {
  const lang = SUPPORTED_LOCALES.includes(locale) ? locale : 'es';
  const translation = entry.translations?.[lang] ?? {};

  const objectName = translation.name ?? entry.name;
  const stageInfo = getStageMetadata(entry, stage === 'onsite' ? 'geo' : 'marker');
  const stageTranslation = stageInfo?.translations?.[lang] ?? {};
  const objectDescription = stageTranslation.description ?? stageInfo?.description ?? translation.description ?? entry.description;
  const stageInstruction = stage === 'onsite'
    ? (lang === 'es' ? 'El visitante está explorando el lugar presencialmente; explique su contexto, sin afirmar que su ubicación exacta se ha verificado.' : 'The visitor is exploring the place on site; provide local context without claiming exact position was verified.')
    : (lang === 'es' ? 'El visitante está descubriendo el destino virtualmente; despierte curiosidad por visitarlo sin afirmar que ya está allí.' : 'The visitor is discovering the destination virtually; inspire an in-person visit without saying they are already there.');

  const persona = LOCALES[lang]?.['guide.persona'] ?? LOCALES.es['guide.persona'];
  const curatorSafety = entry.curatorialVerified === true
    ? ''
    : (lang === 'es'
      ? '\nAVISO CURATORIAL: la ficha aún NO está validada. Explica claramente la ausencia de datos y evita afirmar épocas, culturas, materiales, procedencias, nombres o usos no documentados. No presentes hipótesis como hechos; si usas búsqueda externa, diferencia sus resultados de los datos de esta pieza.'
      : '\nCURATORIAL NOTICE: this record is NOT verified. Clearly state what is unknown. Never invent the date, culture, material, origin, name or use of this object. Separate external search results from verified details about this specific item.');

  const context = persona
    .replace(/\{name\}/g, () => objectName)
    .replace(/\{description\}/g, () => objectDescription);
  return `${context}\n${stageInstruction}${curatorSafety}`;
}

/**
 * Valida la solicitud completa, determina el objeto permitido y devuelve la credencial efímera o un
 * error controlado.
 */
export default async function handler(req, res) {

  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const origin = req.headers.origin || '';

  if (!isOriginAllowed(origin)) {
    res.status(403).json({ error: 'Origen no permitido' });
    return;
  }

  const clientIp = getClientIp(req);

  if (!clientIp) {
    console.warn('No se pudo determinar una IP de cliente usable para el rate limit.');
    res.status(400).json({ error: 'Solicitud no válida' });
    return;
  }

  if (isRateLimited(clientIp)) {
    console.warn(`Rate limit alcanzado para IP ${clientIp}.`);
    res.status(429).json({ error: 'Demasiadas solicitudes. Espere un momento y vuelva a intentar.' });
    return;
  }

  let body = req.body;

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }

  if (body !== null && (typeof body !== 'object' || Array.isArray(body))) body = null;

  const { objectId, locale, stage = 'discovery' } = body ?? {};
  if (stage !== 'discovery' && stage !== 'onsite') {
    res.status(400).json({ error: 'Etapa inválida' });
    return;
  }

  if (typeof objectId !== 'string' || !objectId) {
    res.status(400).json({ error: 'Falta objectId' });
    return;
  }

  const entry = MARKER_CATALOG.find((item) => item.id === objectId);

  if (!entry) {
    console.warn(`objectId desconocido solicitado: ${JSON.stringify(objectId).slice(0, 80)}`);
    res.status(400).json({ error: 'objectId desconocido' });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('Falta la variable de entorno GEMINI_API_KEY en el servidor.');
    res.status(500).json({ error: 'Configuración del servidor incompleta' });
    return;
  }

  try {
    const quota = await checkDistributedQuota(clientIp);
    if (quota === 'limited') {
      res.status(429).json({ error: 'Cuota de guía temporalmente agotada. Intente nuevamente.' });
      return;
    }
  } catch (err) {
    console.error('Control de cuota distribuida no disponible:', err?.message ?? err);
    res.status(503).json({ error: 'Guía temporalmente no disponible' });
    return;
  }

  try {

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { apiVersion: 'v1alpha', timeout: 10000 }
    });

    const now = Date.now();

    const expireTime = new Date(now + 10 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(now + 5 * 60 * 1000).toISOString();

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: {
            responseModalities: ['AUDIO'],
            systemInstruction: {
              parts: [{ text: buildSystemInstruction(entry, locale, stage) }]
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: true
              }
            },
            tools: [{ googleSearch: {} }]
          }
        }
      }
    });

    res.status(200).json({
      token: token.name,
      model: LIVE_MODEL,
      expireTime
    });

  } catch (err) {
    console.error('Error generando token efímero:', err);
    res.status(500).json({ error: 'No se pudo generar el token' });
  }
}
