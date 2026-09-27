/**
 * Etiquetas y nombres visibles de los grupos.
 *
 * Vivir aquí y no dentro de un componente o del store evita que la
 * configuración, el panel de grupos y la clasificación compongan el texto de
 * forma distinta. Es texto de presentación pura: no toca el store.
 */
import type { Group } from '@/types'

const LETRA_INICIAL = 'A'.charCodeAt(0)
/**
 * Letra de etiqueta según la posición: A, B, C…
 *
 * Se deriva siempre de la posición del grupo en la lista y nunca la elige el
 * anfitrión. Con `MAX_GROUPS` en 20 el máximo es la T, así que 20 letras no
 * llegan a pasar del abecedario. Si algún día subiera el máximo por encima de
 * 26, esta función habría que ampliar a AA, AB… (ver `etiquetaPorPosicion` en el
 * store, que la usa para asignar).
 */
export function labelForIndex(index: number): string {
  return String.fromCharCode(LETRA_INICIAL + index)
}

/**
 * Nombre de un grupo tal como se muestra en pantalla.
 *
 * "Grupo A" a secas cuando el anfitrión no escribió nombre (el store rellena el
 * nombre con la designación) y "Grupo A — aarón" cuando sí. El guion separador se
 * decide en un único sitio para que no aparezcan las dos formas mezcladas en
 * distintas pantallas de la misma partida.
 */
export function groupDisplayName(group: Pick<Group, 'label' | 'name'>): string {
  const designacion = `Grupo ${group.label}`
  return group.name === designacion ? designacion : `${designacion} — ${group.name}`
}
