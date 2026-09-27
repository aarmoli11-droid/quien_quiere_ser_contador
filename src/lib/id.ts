/**
 * Generación de identificadores.
 *
 * Va en su propio módulo porque tanto los grupos como las preguntas necesitan
 * uno, y porque necesita funcionar igual en el navegador y en los tests de
 * Node, donde no existe `crypto.randomUUID` de la misma forma.
 */

/**
 * Crea un identificador único con un prefijo legible.
 *
 * Se combinan marca de tiempo y aleatoriedad. La marca de tiempo sola no
 * basta: dos grupos creados en el mismo milisegundo (o dos preguntas tras
 * pulsar rápido "añadir") colisionarían, y el id es la clave con la que se
 * distingue un grupo de otro en la tabla y se evita repetir preguntas en un
 * desempate.
 */
export function createId(prefix: string): string {
  const tiempo = Date.now().toString(36)
  const aleatorio = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${tiempo}-${aleatorio}`
}
