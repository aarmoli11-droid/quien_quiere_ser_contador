import { describe, expect, it } from 'vitest'

import { MAX_GROUPS } from '@/stores/game'
import { groupDisplayName, labelForIndex } from './groupLabel'

describe('labelForIndex', () => {
  it('devuelve las letras del abecedario en orden', () => {
    expect(labelForIndex(0)).toBe('A')
    expect(labelForIndex(1)).toBe('B')
    expect(labelForIndex(2)).toBe('C')
  })

  it('cubre todo el rango de grupos de la partida sin salirse del abecedario', () => {
    // El store numera hasta el último grupo. Si algún día el máximo subiera de
    // 26 este test avisa: habría que decidir el formato AA, AB… antes de que un
    // anfitrión con 27 grupos viera un carácter raro como etiqueta.
    const ultima = labelForIndex(MAX_GROUPS - 1)
    expect(ultima).toBe('T')
    expect(ultima.charCodeAt(0)).toBeLessThanOrEqual('Z'.charCodeAt(0))
  })
})

describe('groupDisplayName', () => {
  it('solo muestra la designación cuando el nombre es la designación', () => {
    // Así se evita el absurdo "Grupo A — Grupo A" en los grupos sin nombre.
    expect(groupDisplayName({ label: 'A', name: 'Grupo A' })).toBe('Grupo A')
  })

  it('añade el guion separador cuando hay nombre propio', () => {
    expect(groupDisplayName({ label: 'B', name: 'aarón' })).toBe('Grupo B — aarón')
  })

  it('no duplica la designación aunque el nombre la contenga', () => {
    // Un grupo escrito a mano como "Grupo X" es un nombre, no la designación, así
    // que las dos partes se muestran: el anfitrión lo escribió así.
    expect(groupDisplayName({ label: 'C', name: 'Grupo X' })).toBe('Grupo C — Grupo X')
  })
})
