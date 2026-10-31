// Archivos originales en Supabase Storage (bucket privado). Único acceso a Supabase.
// El navegador sube y descarga directo con enlaces firmados: el archivo nunca pasa por el servidor.
const url = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const clave = () => process.env.SUPABASE_SERVICE_KEY;
const bucket = () => process.env.SUPABASE_BUCKET;

const RUTA = { enunciado: /^enunciados\/[0-9a-f]{32}\.(pdf|docx)$/, resolucion: /^resoluciones\/[0-9a-f]{32}\.(pdf|docx)$/ };
const SEGUNDOS_DESCARGA = 300;

export const archivosConfigurado = () => !!(url() && clave() && bucket());

async function storage(ruta, cuerpo) {
  const r = await fetch(`${url()}/storage/v1/${ruta}`, {
    method: 'POST',
    headers: { apikey: clave(), authorization: `Bearer ${clave()}`, 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Almacén de archivos respondió ${r.status}`);
  return r.json();
}

export async function crearEnlaceSubida(ruta) {
  const d = await storage(`object/upload/sign/${bucket()}/${ruta}`, {});
  return `${url()}/storage/v1${d.url}`;
}

export async function crearEnlaceDescarga(ruta, nombre) {
  const d = await storage(`object/sign/${bucket()}/${ruta}`, { expiresIn: SEGUNDOS_DESCARGA });
  return `${url()}/storage/v1${d.signedURL}&download=${encodeURIComponent(nombre)}`;
}

// Referencia a un archivo enviada por el cliente: solo se acepta una ruta generada por nosotros.
export function limpiarArchivo(raw, tipo) {
  const ruta = String(raw?.ruta || '');
  if (!RUTA[tipo]?.test(ruta)) return null;
  const extension = ruta.slice(ruta.lastIndexOf('.'));
  const base = String(raw?.nombre || '').replace(/[\\/:*?"<>|\r\n]/g, ' ').trim().slice(0, 100);
  return { ruta, nombre: (base || 'documento').replace(/\.(pdf|docx)$/i, '') + extension };
}
