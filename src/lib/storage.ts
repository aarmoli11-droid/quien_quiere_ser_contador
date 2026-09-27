/**
 * Acceso defensivo a `localStorage`.
 *
 * Va en su propio módulo, y no dentro del store, por dos motivos: se puede
 * probar sin montar Pinia y el resto de la aplicación hereda la misma
 * protección. `localStorage` puede lanzar de formas poco evidentes: en modo
 * privado de algunos navegadores, si la cuota está llena, si el dato guardado
 * está corrupto o si el propio objeto no existe (por ejemplo al renderizar en
 * Node o en un entorno de test). Ninguna de esas situaciones debe impedir
 * arrancar el juego, así que todas devuelven un valor por defecto en lugar de
 * propagar la excepción.
 */

/** Devuelve `localStorage` o `null` si el entorno no lo ofrece. */
function getStore(): Storage | null {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null
    return localStorage
  } catch {
    // Algunos navegadores lanzan al incluso *acceder* a `localStorage` con las
    // cookies de terceros bloqueadas, no solo al escribir.
    return null
  }
}

/**
 * Lee y deserializa una clave.
 *
 * Devuelve `fallback` si no hay nada guardado, si el JSON está corrupto o si
 * el almacenamiento no es accesible. Nunca lanza.
 */
export function readJson<T>(key: string, fallback: T): T {
  const store = getStore()
  if (store === null) return fallback

  let raw: string | null
  try {
    raw = store.getItem(key)
  } catch {
    return fallback
  }
  if (raw === null || raw === '') return fallback

  try {
    const parsed: unknown = JSON.parse(raw)
    // Un `null` o un primitivo se considera contenido corrupto: se descarta
    // para que el llamante reciba siempre la forma que espera.
    if (parsed === null || typeof parsed !== 'object') return fallback
    return parsed as T
  } catch {
    // JSON inválido (truncado, editado a mano, etc.): se descarta en silencio y
    // se regenera desde la semilla en lugar de romper el arranque.
    return fallback
  }
}

/**
 * Serializa y guarda un valor.
 *
 * Devuelve `true` si se guardó y `false` si no se pudo (cuota llena, modo
 * privado, cuota de serialización). El llamante puede avisar al usuario, pero
 * el juego sigue funcionando en memoria.
 */
export function writeJson(key: string, value: unknown): boolean {
  const store = getStore()
  if (store === null) return false

  try {
    store.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** Elimina una clave. Devuelve `true` si se borró. */
export function removeKey(key: string): boolean {
  const store = getStore()
  if (store === null) return false

  try {
    store.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** `true` si el almacenamiento está disponible y utilizable. */
export function isStorageAvailable(): boolean {
  const store = getStore()
  if (store === null) return false

  // Se hace una escritura y lectura de prueba: que el objeto exista no
  // garantiza que permita escribir (cuota agotada o modo sin escritura).
  const probe = '__qqsc_probe__'
  try {
    store.setItem(probe, '1')
    store.removeItem(probe)
    return true
  } catch {
    return false
  }
}
