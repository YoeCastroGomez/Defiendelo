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

export const ipDe = (req) => cabecera(req, 'x-forwarded-for').split(',')[0].trim() || req.socket?.remoteAddress || 'local';

// Si el contador falla, se deja pasar: es mejor no limitar que cortar una defensa en curso.
export async function superaLimite(req, nombre, maxPorMinuto) {
  try {
    return await incrementar(`limite:${nombre}:${ipDe(req)}`, 60) > maxPorMinuto;
  } catch (e) {
    console.error(`[api/${nombre}]`, e.message);
    return false;
  }
}

export const cuerpo = (req) => (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {});
