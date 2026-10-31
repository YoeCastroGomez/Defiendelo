// Utilidades comunes a la API y a los módulos: errores con estado HTTP, saneamiento de texto,
// comparación de secretos en tiempo constante y límite de peticiones por IP.
import { timingSafeEqual } from 'node:crypto';
import { incrementar } from './almacen.js';

export function errorHttp(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

export const limpio = (v, max) => String(v || '').trim().slice(0, max);

// Compara dos secretos sin filtrar por el tiempo de respuesta cuántos caracteres coinciden.
export function igualSeguro(esperadoRaw, recibidoRaw) {
  if (typeof esperadoRaw !== 'string' || typeof recibidoRaw !== 'string') return false;
  const esperado = Buffer.from(esperadoRaw, 'utf8');
  const recibido = Buffer.from(recibidoRaw.trim(), 'utf8');
  if (!esperado.length || esperado.length !== recibido.length) return false;
  return timingSafeEqual(esperado, recibido);
}

// Lee una cabecera que puede llegar repetida (Node la entrega como arreglo).
export function cabecera(req, nombre) {
  const h = req.headers?.[nombre];
  return Array.isArray(h) ? String(h[0] || '') : String(h || '');
}

// IP del cliente para los límites. `x-forwarded-for` la escribe quien envía la petición, así que solo se
// usa detrás de un proxy de confianza: en Vercel (que reescribe x-real-ip y x-forwarded-for) o si se
// activa CONFIAR_PROXY=1. En local se usa la dirección de la conexión, que no se puede falsificar.
export function ipDe(req) {
  if (process.env.VERCEL || process.env.CONFIAR_PROXY === '1') {
    const ip = cabecera(req, 'x-real-ip').trim() || cabecera(req, 'x-forwarded-for').split(',')[0].trim();
    if (ip) return ip;
  }
  return req.socket?.remoteAddress || 'local';
}

// Límites por minuto. Un aula entera suele salir a internet por una sola IP, así que el límite por IP
// alcanza para unas 60 personas a la vez; el límite global protege el presupuesto de IA y el almacén.
// Se ajustan sin tocar código con LIMITE_<NOMBRE>_IP y LIMITE_<NOMBRE>_GLOBAL (p. ej. LIMITE_DOCUMENTOS_GLOBAL).
export const LIMITES = {
  carlos: { ip: 240, global: 2000 },
  intentos: { ip: 120, global: 600 },
  documentos: { ip: 90, global: 300 },
  archivos: { ip: 90, global: 300 },
  tareas: { ip: 10, global: 100 },
};

function limiteDe(nombre, tipo) {
  const env = Number(process.env[`LIMITE_${nombre.toUpperCase()}_${tipo.toUpperCase()}`]);
  return Number.isFinite(env) && env > 0 ? env : LIMITES[nombre][tipo];
}

// Si el contador falla, se deja pasar: es mejor no limitar que cortar una defensa en curso.
export async function superaLimite(req, nombre) {
  try {
    if (await incrementar(`limite:${nombre}:ip:${ipDe(req)}`, 60) > limiteDe(nombre, 'ip')) return true;
    return await incrementar(`limite:${nombre}:global`, 60) > limiteDe(nombre, 'global');
  } catch (e) {
    console.error(`[api/${nombre}]`, e.message);
    return false;
  }
}

// JSON inválido en el cuerpo es un error del cliente (400), no del servidor.
export function cuerpo(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try {
    return JSON.parse(req.body);
  } catch {
    throw errorHttp('JSON inválido', 400);
  }
}
