import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isStorageAvailable, readJson, removeKey, writeJson } from './storage'

const KEY = 'prueba'

/**
 * Referencia al almacenamiento real, capturada antes de ningún stub.
 *
 * Hace falta porque uno de los tests sustituye `localStorage` por un getter que
 * lanza; restaurar la propiedad leyendo el identificador `localStorage` volvería
 * a invocar ese getter y romper el propio test de restauración (y todos los
 * posteriores). Guardar el objeto original evita ese efecto.
 */
const ORIGINAL_STORAGE = globalThis.localStorage

/** Restaura el almacenamiento real tras un test que lo haya sustituido. */
function restoreStorage(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: ORIGINAL_STORAGE,
  })
}

describe('readJson', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('devuelve lo guardado cuando el JSON es válido', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 1, b: ['x'] }))

    expect(readJson<{ a: number; b: string[] }>(KEY, null)).toEqual({ a: 1, b: ['x'] })
  })

  it('devuelve el valor por defecto si la clave no existe', () => {
    expect(readJson(KEY, 'por-defecto')).toBe('por-defecto')
  })

  it('devuelve el valor por defecto si el contenido es JSON corrupto', () => {
    // Es el caso de un almacenamiento editado a mano o truncado a media
    // escritura: no debe romper el arranque del juego.
    localStorage.setItem(KEY, '{esto no es json')

    expect(readJson(KEY, 'por-defecto')).toBe('por-defecto')
  })

  it('devuelve el valor por defecto si el contenido es una cadena vacía', () => {
    localStorage.setItem(KEY, '')

    expect(readJson(KEY, 'por-defecto')).toBe('por-defecto')
  })

  it('devuelve el valor por defecto si el JSON es un primitivo o null', () => {
    // `typeof null === 'object'`, así que el caso se comprueba aparte.
    localStorage.setItem(KEY, 'null')
    expect(readJson(KEY, 'por-defecto')).toBe('por-defecto')

    localStorage.setItem(KEY, '42')
    expect(readJson(KEY, 'por-defecto')).toBe('por-defecto')

    localStorage.setItem(KEY, '"texto"')
    expect(readJson(KEY, 'por-defecto')).toBe('por-defecto')
  })

  it('acepta un array como objeto válido', () => {
    localStorage.setItem(KEY, JSON.stringify([1, 2, 3]))

    expect(readJson<number[]>(KEY, [])).toEqual([1, 2, 3])
  })

  it('devuelve el valor por defecto si localStorage no existe en el entorno', () => {
    // Simula renderizado en Node/sin DOM: el juego debe seguir funcionando.
    vi.stubGlobal('localStorage', undefined)

    expect(readJson(KEY, 'por-defecto')).toBe('por-defecto')

    vi.unstubAllGlobals()
  })

  it('devuelve el valor por defecto si localStorage lanza al leer', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError: acceso denegado')
      },
      setItem: () => {},
      removeItem: () => {},
    })

    expect(readJson(KEY, 'por-defecto')).toBe('por-defecto')

    vi.unstubAllGlobals()
  })

  it('devuelve el valor por defecto si acceder a localStorage ya lanza', () => {
    // Navegadores con cookies de terceros bloqueadas lanzan en el acceso.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })

    expect(readJson(KEY, 'por-defecto')).toBe('por-defecto')

    restoreStorage()
  })
})

describe('writeJson', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('guarda y devuelve true', () => {
    expect(writeJson(KEY, { a: 1 })).toBe(true)
    expect(readJson<{ a: number }>(KEY, null)).toEqual({ a: 1 })
  })

  it('devuelve false si no puede serializar (circular)', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular

    // No debe lanzar: el juego sigue en memoria aunque no se pueda guardar.
    expect(writeJson(KEY, circular)).toBe(false)
  })

  it('devuelve false si localStorage lanza al escribir (cuota llena)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    })

    expect(writeJson(KEY, { a: 1 })).toBe(false)

    vi.unstubAllGlobals()
  })

  it('devuelve false si localStorage no existe', () => {
    vi.stubGlobal('localStorage', undefined)

    expect(writeJson(KEY, { a: 1 })).toBe(false)

    vi.unstubAllGlobals()
  })
})

describe('removeKey', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('elimina la clave', () => {
    localStorage.setItem(KEY, 'x')

    expect(removeKey(KEY)).toBe(true)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('devuelve false si localStorage lanza', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error('no permitido')
      },
    })

    expect(removeKey(KEY)).toBe(false)

    vi.unstubAllGlobals()
  })
})

describe('isStorageAvailable', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('detecta que el almacenamiento funciona', () => {
    expect(isStorageAvailable()).toBe(true)
  })

  it('detecta que no se puede escribir aunque el objeto exista', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('solo lectura')
      },
      removeItem: () => {},
    })

    expect(isStorageAvailable()).toBe(false)

    vi.unstubAllGlobals()
  })

  it('no deja la sonda de comprobación en el almacenamiento', () => {
    isStorageAvailable()

    expect(localStorage.length).toBe(0)
  })

  it('devuelve false si no hay almacenamiento', () => {
    vi.stubGlobal('localStorage', undefined)

    expect(isStorageAvailable()).toBe(false)

    vi.unstubAllGlobals()
  })
})
