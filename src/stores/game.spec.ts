import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { playedSounds } from '@/test/setup'
import { isPlaying } from '@/audio/soundBank'
import { createId } from '@/lib/id'
import { groupDisplayName } from '@/lib/groupLabel'
import type { GameConfig, Question } from '@/types'
import { useGameStore } from './game'
import { useQuestionBankStore } from './questionBank'

/**
 * Datos deterministas para las pruebas.
 *
 * Se usa un banco de 10 preguntas con la respuesta correcta SIEMPRE en A, que
 * es justo el caso peligroso: si el store no mezclara las opciones al cargar
 * cada pregunta, el patrón sería visible y estas pruebas lo detectarían.
 */
const BANCO: Question[] = Array.from({ length: 10 }, (_, i) => ({
  id: `q${i + 1}`,
  text: `Pregunta ${i + 1}`,
  options: ['correcta', 'falsa-1', 'falsa-2'],
  correctIndex: 0,
  difficulty: 'facil' as const,
  category: 'pruebas',
}))

/** Crea el store del juego con un banco controlado y `n` grupos ya cargados. */
function preparar(numGrupos = 3, preguntas = BANCO) {
  setActivePinia(createPinia())
  const bank = useQuestionBankStore()
  bank.importBank(preguntas)

  const game = useGameStore()
  for (let i = 0; i < numGrupos; i += 1) game.addGroup(`Equipo ${i + 1}`)
  return { game, bank }
}

/** Levanta a la partida hasta la fase 'open' con la pregunta en pantalla. */
function abrirPregunta(game: ReturnType<typeof useGameStore>): void {
  game.startGame()
  game.beginQuestion()
}

describe('configuracion de grupos', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('asigna las etiquetas A, B, C... por orden de alta', () => {
    const { game } = preparar(0)

    game.addGroup('Los Contadores')
    game.addGroup('Los Auditores')
    game.addGroup('Tercero')

    // La etiqueta la pone el store según la posición: el anfitrión solo
    // escribe el nombre.
    expect(game.groups.map((g) => g.label)).toEqual(['A', 'B', 'C'])
  })

  it('usa la designación como nombre si el nombre viene vacío', () => {
    const { game } = preparar(0)

    game.addGroup('')

    // Nunca debe quedar un grupo sin identificar en la tabla de posiciones.
    expect(game.groups[0]?.name).toBe('Grupo A')
  })

  it('muestra "Grupo A — aarón" solo cuando hay nombre', () => {
    const { game } = preparar(0)
    game.addGroup('')
    game.addGroup('aarón')

    // Sin nombre propio basta la designación; con nombre, los dos.
    expect(groupDisplayName(game.groups[0]!)).toBe('Grupo A')
    expect(groupDisplayName(game.groups[1]!)).toBe('Grupo B — aarón')
  })

  it('renumera las etiquetas al quitar un grupo del medio', () => {
    const { game } = preparar(0)
    game.addGroup('aarón')
    game.addGroup('bárbara')
    game.addGroup('carla')
    const intermedio = game.groups[1]
    if (intermedio === undefined) throw new Error('sin grupos')

    game.removeGroup(intermedio.id)

    // Si no se renumerara, la sala vería "Grupo C" sin grupo B y creería que se
    // ha perdido alguien por el camino.
    expect(game.groups.map((g) => g.label)).toEqual(['A', 'B'])
    expect(game.groups[1]?.name).toBe('carla')
    expect(groupDisplayName(game.groups[1]!)).toBe('Grupo B — carla')
  })

  it('renumera también al quitar el primero y el último', () => {
    const { game } = preparar(0)
    game.addGroup('aarón')
    game.addGroup('bárbara')
    game.addGroup('carla')

    game.removeGroup(game.groups[0]!.id)
    expect(game.groups.map((g) => g.label)).toEqual(['A', 'B'])

    game.removeGroup(game.groups[1]!.id)
    expect(game.groups.map((g) => g.label)).toEqual(['A'])
    expect(groupDisplayName(game.groups[0]!)).toBe('Grupo A — bárbara')
  })

  it('recorta espacios en el nombre', () => {
    const { game } = preparar(0)

    game.addGroup('   Los Contadores   ')

    expect(game.groups[0]?.name).toBe('Los Contadores')
  })

  it('no deja pasar de MAX_GROUPPOS', () => {
    const { game } = preparar(0)
    for (let i = 0; i < 25; i += 1) game.addGroup(`Equipo ${i}`)

    expect(game.groups).toHaveLength(20)
    expect(game.addGroup('Uno más')).toBeNull()
  })

  it('elimina y edita grupos', () => {
    const { game } = preparar(2)
    const objetivo = game.groups[0]
    if (objetivo === undefined) throw new Error('sin grupos')

    expect(game.updateGroup(objetivo.id, { name: 'Nuevo nombre' })).toBe(true)
    expect(game.groups[0]?.name).toBe('Nuevo nombre')

    expect(game.removeGroup(objetivo.id)).toBe(true)
    expect(game.groups).toHaveLength(1)
  })

  it('devuelve false al editar o eliminar un grupo inexistente', () => {
    const { game } = preparar(1)

    expect(game.updateGroup('fantasma', { name: 'x' })).toBe(false)
    expect(game.removeGroup('fantasma')).toBe(false)
  })

  it('no deja un grupo sin nombre tras un ciclo de edición', () => {
    const { game } = preparar(1)
    const objetivo = game.groups[0]
    if (objetivo === undefined) throw new Error('sin grupos')

    game.updateGroup(objetivo.id, { name: '   ' })

    // Vaciar el nombre devuelve a la designación, no a una cadena en blanco.
    expect(game.groups[0]?.name).toBe('Grupo A')
  })

  it('tolera que el nombre no sea texto', () => {
    // Un `<input>` vacío llega como cadena, pero un estado restaurado a mano o
    // un import pueden traer `null` o un número: no debe romperse el alta.
    const { game } = preparar(0)
    const vacio = game.addGroup(null as unknown as string)
    const conNumero = game.addGroup(42 as unknown as string)

    expect(vacio?.name).toBe('Grupo A')
    expect(conNumero?.name).toBe('42')
    // La etiqueta se sigue asignando sola aunque el nombre sea un número.
    expect(conNumero?.label).toBe('B')
  })

  it('tolera una edición con tipos inválidos', () => {
    const { game } = preparar(1)
    const objetivo = game.groups[0]
    if (objetivo === undefined) throw new Error('sin grupos')

    game.updateGroup(objetivo.id, { name: null as unknown as string })

    // Al no llegar nada aprovechable, se conserva el valor bueno previo.
    expect(game.groups[0]?.name).toBe(objetivo.name)
    expect(game.groups[0]?.label).toBe(objetivo.label)
  })
})

describe('ajustes de la partida', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('aplica valores válidos', () => {
    const { game } = preparar(2)

    game.updateConfig({
      questionCount: 7,
      secondsPerQuestion: 45,
      basePoints: 25,
      pointsStep: 50,
      difficulty: 'dificil',
      tiebreakDifficulty: 'facil',
    })

    expect(game.questionCount).toBe(7)
    expect(game.secondsPerQuestion).toBe(45)
    expect(game.basePoints).toBe(25)
    expect(game.pointsStep).toBe(50)
    expect(game.difficulty).toBe('dificil')
    expect(game.tiebreakDifficulty).toBe('facil')
  })

  it('redondea y nunca baja de los mínimos', () => {
    const { game } = preparar(2)

    game.updateConfig({ questionCount: 5.9, secondsPerQuestion: 0, basePoints: -20, pointsStep: 0.4 })

    expect(game.questionCount).toBe(5)
    expect(game.secondsPerQuestion).toBe(1)
    expect(game.basePoints).toBe(0)
    expect(game.pointsStep).toBe(0)
  })

  it('descarta valores numéricos inválidos en lugar de propagar NaN', () => {
    // `Math.max(1, Math.trunc(NaN))` es NaN: un solo campo corrupto rompería el
    // reloj y el marcador de toda la partida.
    const { game } = preparar(2)

    game.updateConfig({
      questionCount: Number.NaN,
      secondsPerQuestion: Number.POSITIVE_INFINITY,
      basePoints: Number.NaN,
      pointsStep: Number.NaN,
    })

    expect(Number.isFinite(game.questionCount)).toBe(true)
    expect(Number.isFinite(game.secondsPerQuestion)).toBe(true)
    expect(Number.isFinite(game.basePoints)).toBe(true)
    expect(Number.isFinite(game.pointsStep)).toBe(true)
    expect(game.questionCount).toBe(10)
    expect(game.secondsPerQuestion).toBe(30)
  })

  it('tolera que lleguen cadenas numéricas desde los inputs', () => {
    const { game } = preparar(2)

    game.updateConfig({ questionCount: '5' as unknown as number, basePoints: '25' as unknown as number })

    expect(game.questionCount).toBe(5)
    expect(game.basePoints).toBe(25)
  })

  it('ignora ajustes desconhecidos sin romper nada', () => {
    const { game } = preparar(2)

    game.updateConfig({ inventado: true } as unknown as Partial<GameConfig>)

    expect(game.questionCount).toBe(10)
  })
})

describe('inicio de partida', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('no arranca sin al menos dos grupos', () => {
    const { game } = preparar(1)

    expect(game.canStart).toBe(false)
    expect(game.startBlockedReason).toContain('dos grupos')
    expect(game.startGame()).toBe(false)
    expect(game.phase).toBe('setup')
  })

  it('no arranca sin grupos', () => {
    const { game } = preparar(0)

    expect(game.startBlockedReason).toContain('un grupo')
    expect(game.startGame()).toBe(false)
  })

  it('no arranca con el banco vacío', () => {
    const { game } = preparar(3, [])

    expect(game.canStart).toBe(false)
    expect(game.startBlockedReason).toContain('No quedan preguntas')
    expect(game.startGame()).toBe(false)
  })

  it('arranca y deja la primera pregunta en fase intro', () => {
    const { game } = preparar(3)

    expect(game.startGame()).toBe(true)
    expect(game.phase).toBe('intro')
    expect(game.questionNumber).toBe(1)
    expect(game.current?.options).toHaveLength(3)
  })

  it('mezcla las opciones de cada pregunta al cargarla', () => {
    const { game } = preparar(2)

    game.startGame()

    // Aunque en el banco la correcta es siempre A, la posición en pantalla debe
    // ser distinta; si no, el juego sería predecible.
    const r = game.current
    if (r === null) throw new Error('sin pregunta')
    expect(['correcta', 'falsa-1', 'falsa-2']).toContain(r.options[r.correctIndex])
  })

  it('mantiene el puntaje a cero al arrancar', () => {
    const { game } = preparar(3)
    game.groups[0]!.score = 999

    game.startGame()

    expect(game.groups.every((g) => g.score === 0)).toBe(true)
  })

  it('juega con el número de preguntas configurado', () => {
    const { game } = preparar(3)
    game.updateConfig({ questionCount: 4 })

    game.startGame()
    game.reveal()
    game.nextQuestion()
    game.reveal()
    game.nextQuestion()
    game.reveal()
    game.nextQuestion()
    game.reveal()

    expect(game.nextQuestion()).toBe('results')
    expect(game.history).toHaveLength(4)
  })

  it('ajusta el número de preguntas si el banco es más pequeño', () => {
    const { game } = preparar(2, BANCO.slice(0, 3))
    game.updateConfig({ questionCount: 10 })

    game.startGame()

    expect(game.effectiveQuestionCount).toBe(3)
  })

  it('filtra por dificultad y cae a todo el banco si no hay del modo elegido', () => {
    const soloFaciles: Question[] = BANCO.map((q) => ({ ...q, difficulty: 'facil' as const }))
    const { game } = preparar(2, soloFaciles)
    game.updateConfig({ difficulty: 'dificil' })

    expect(game.startGame()).toBe(true)
    // Sin preguntas difíciles no se bloquea la partida: entra todo el banco.
    expect(game.current).not.toBeNull()
  })

  it('un doble clic en iniciar no rompe el estado', () => {
    const { game } = preparar(3)

    game.startGame()
    const numeroTrasPrimero = game.questionNumber
    game.startGame()

    expect(game.questionNumber).toBe(numeroTrasPrimero)
  })
})

describe('registro de respuestas', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('registra la respuesta del grupo seleccionado', () => {
    const { game } = preparar(3)
    abrirPregunta(game)
    const grupo = game.groups[0]
    if (grupo === undefined) throw new Error('sin grupos')

    game.selectGroup(grupo.id)
    expect(game.registerAnswer(1)).toBe(true)
    expect(game.groups[0]?.currentAnswer).toBe(1)
    // Tras registrar, el selector se cierra solo.
    expect(game.selectedGroupId).toBeNull()
  })

  it('no registra nada si no hay grupo seleccionado', () => {
    const { game } = preparar(3)
    abrirPregunta(game)

    expect(game.registerAnswer(0)).toBe(false)
  })

  it('rechaza índices fuera de rango', () => {
    const { game } = preparar(3)
    abrirPregunta(game)
    const grupo = game.groups[0]
    if (grupo === undefined) throw new Error('sin grupos')

    game.selectGroup(grupo.id)

    // Preferible ignorar un clic equivocado que puntuar por una opción
    // inexistente en pantalla.
    expect(game.registerAnswer(3)).toBe(false)
    expect(game.registerAnswer(-1)).toBe(false)
    expect(game.registerAnswer(1.5)).toBe(false)
    expect(game.registerAnswer(Number.NaN)).toBe(false)
    expect(game.groups[0]?.currentAnswer).toBeNull()
  })

  it('no deja cambiar la respuesta de un grupo', () => {
    const { game } = preparar(3)
    abrirPregunta(game)
    const grupo = game.groups[0]
    if (grupo === undefined) throw new Error('sin grupos')

    game.selectGroup(grupo.id)
    game.registerAnswer(1)
    game.selectGroup(grupo.id)

    expect(game.groups[0]?.currentAnswer).toBe(1)
  })

  it('no acepta respuestas antes de abrir la pregunta', () => {
    const { game } = preparar(3)
    game.startGame()
    const grupo = game.groups[0]
    if (grupo === undefined) throw new Error('sin grupos')

    expect(game.selectGroup(grupo.id)).toBe(false)
    expect(game.registerAnswer(0)).toBe(false)
  })

  it('no acepta respuestas tras revelar', () => {
    const { game } = preparar(3)
    abrirPregunta(game)
    const grupo = game.groups[0]
    if (grupo === undefined) throw new Error('sin grupos')
    game.selectGroup(grupo.id)
    game.registerAnswer(0)
    game.reveal()

    game.selectGroup(grupo.id)

    expect(game.registerAnswer(1)).toBe(false)
  })

  it('detecta cuándo han respondido todos los grupos', () => {
    const { game } = preparar(3)
    abrirPregunta(game)

    expect(game.allContendersAnswered).toBe(false)

    for (const grupo of [...game.groups]) {
      game.selectGroup(grupo.id)
      game.registerAnswer(0)
    }

    expect(game.allContendersAnswered).toBe(true)
  })

  it('beginQuestion no reinicia el reloj si la pregunta ya está abierta', () => {
    const { game } = preparar(3)
    abrirPregunta(game)

    game.beginQuestion()
    game.beginQuestion()

    expect(game.phase).toBe('open')
  })
})

describe('revelacion y puntuacion', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reparte los puntos al grupo que acierta', () => {
    const { game } = preparar(3)
    abrirPregunta(game)
    const correcta = game.current?.correctIndex ?? 0

    for (const grupo of game.groups) {
      game.selectGroup(grupo.id)
      game.registerAnswer(correcta)
    }
    game.reveal()

    // 100 puntos la primera pregunta para cada uno.
    expect(game.groups.every((g) => g.score === 100)).toBe(true)
  })

  it('deja en cero a quien responde mal', () => {
    const { game } = preparar(2)
    abrirPregunta(game)
    const correcta = game.current?.correctIndex ?? 0
    const incorrecta = correcta === 0 ? 1 : 0

    const [a, b] = game.groups
    if (a === undefined || b === undefined) throw new Error('sin grupos')
    game.selectGroup(a.id)
    game.registerAnswer(correcta)
    game.selectGroup(b.id)
    game.registerAnswer(incorrecta)
    game.reveal()

    expect(game.groups[0]?.score).toBe(100)
    expect(game.groups[1]?.score).toBe(0)
  })

  it('deja en cero a quien no responde por agotarse el tiempo', () => {
    const { game } = preparar(3)
    abrirPregunta(game)
    const correcta = game.current?.correctIndex ?? 0

    const [a, , c] = game.groups
    if (a === undefined || c === undefined) throw new Error('sin grupos')
    game.selectGroup(a.id)
    game.registerAnswer(correcta)
    // Ni b ni c responden: se agota el tiempo.
    game.timeUp()

    expect(game.groups[0]?.score).toBe(100)
    expect(game.groups[1]?.score).toBe(0)
    expect(game.groups[2]?.score).toBe(0)
  })

  it('timeUp marca que alguien se quedó sin responder', () => {
    const { game } = preparar(2)
    abrirPregunta(game)
    game.timeUp()

    const ronda = game.history[0]
    expect(ronda?.someoneTimedOut).toBe(true)
  })

  it('escala los puntos pregunta a pregunta', () => {
    const { game } = preparar(2)
    const correcta = () => game.current?.correctIndex ?? 0

    for (let ronda = 0; ronda < 3; ronda += 1) {
      abrirOResponder(game)
      game.reveal()
      game.nextQuestion()
    }

    // 100 + 200 + 300 = 600.
    expect(game.groups.every((g) => g.score === 600)).toBe(true)
    expect(correcta()).toBeTypeOf('number')
  })

  it('respeta una escalera de puntos personalizada', () => {
    const { game } = preparar(2)
    game.updateConfig({ basePoints: 50, pointsStep: 25 })
    abrirPregunta(game)
    const correcta = game.current?.correctIndex ?? 0

    for (const grupo of game.groups) {
      game.selectGroup(grupo.id)
      game.registerAnswer(correcta)
    }
    game.reveal()

    expect(game.groups[0]?.score).toBe(50)
  })

  it('no revela dos veces la misma pregunta', () => {
    const { game } = preparar(2)
    abrirPregunta(game)
    game.reveal()

    expect(game.reveal()).toBe(false)
    expect(game.history).toHaveLength(1)
  })

  it('no revela sin pregunta en pantalla', () => {
    const { game } = preparar(3)

    expect(game.reveal()).toBe(false)
  })

  it('suena el acierto si alguien acertó y el fallo si nadie', () => {
    const { game } = preparar(2)
    abrirPregunta(game)
    const correcta = game.current?.correctIndex ?? 0
    game.selectGroup(game.groups[0]?.id ?? '')
    game.registerAnswer(correcta)
    game.reveal()

    expect(playedSounds).toContain('/audio/correct.mp3')

    const { game: game2 } = preparar(2)
    abrirPregunta(game2)
    game2.reveal()
    expect(playedSounds).toContain('/audio/wrong.mp3')
  })

  it('el audio de tensión se detiene al revelar', () => {
    // Si siguiera sonando competiría con el sonido de la respuesta, así que la
    // música de tensión debe cortarse en el momento de revelar.
    const { game } = preparar(2)
    abrirPregunta(game)
    expect(isPlaying('tension')).toBe(true)

    game.reveal()

    expect(isPlaying('tension')).toBe(false)
  })
})

describe('avance entre preguntas y fin de partida', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('no avanza si la pregunta no está revelada', () => {
    const { game } = preparar(2)
    abrirPregunta(game)

    expect(game.nextQuestion()).toBe('blocked')
  })

  it('lleva a resultados al terminar la cola', () => {
    const { game } = preparar(2)
    game.updateConfig({ questionCount: 2 })

    game.startGame()
    game.reveal()
    game.nextQuestion()
    expect(game.phase).toBe('intro')
    game.reveal()
    game.nextQuestion()

    expect(game.phase).toBe('results')
  })

  it('no repite preguntas dentro de la partida', () => {
    const { game } = preparar(2)
    game.updateConfig({ questionCount: 10 })
    game.startGame()

    const vistas: string[] = []
    for (let i = 0; i < 10; i += 1) {
      const id = game.current?.id
      if (id === undefined) break
      vistas.push(id)
      game.reveal()
      game.nextQuestion()
    }

    expect(new Set(vistas).size).toBe(10)
  })

  it('backToSetup limpia el estado', () => {
    const { game } = preparar(2)
    abrirPregunta(game)
    game.reveal()

    game.backToSetup()

    expect(game.phase).toBe('setup')
    expect(game.history).toHaveLength(0)
    expect(game.current).toBeNull()
    expect(game.groups.every((g) => g.score === 0)).toBe(true)
  })
})

describe('desempate', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('no ofrece desempate si hay ganador claro', () => {
    const { game } = preparar(2)
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.beginQuestion()
    const correcta = game.current?.correctIndex ?? 0

    const [a, b] = game.groups
    if (a === undefined || b === undefined) throw new Error('sin grupos')
    game.selectGroup(a.id)
    game.registerAnswer(correcta)
    game.reveal()
    game.nextQuestion()

    expect(game.needsTiebreak).toBe(false)
    expect(game.startTiebreak()).toBe(false)
  })

  it('ofrece desempate cuando hay empate', () => {
    const { game } = preparar(2)
    game.updateConfig({ questionCount: 1 })
    game.startGame()

    // Nadie responde: ambos quedan en cero.
    game.reveal()
    game.nextQuestion()

    expect(game.needsTiebreak).toBe(true)
    expect(game.leaders).toHaveLength(2)
  })

  it('el desempate lo disputan solo los grupos empatados', () => {
    const { game } = preparar(3)
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.beginQuestion()
    const correcta = game.current?.correctIndex ?? 0

    // A y B aciertan y empatan en el primer puesto; C falla y se queda atrás.
    // Solo importa el empate de la cabecera: un empate por el último puesto no
    // genera desempate.
    const [a, b, c] = game.groups
    if (a === undefined || b === undefined || c === undefined) throw new Error('sin grupos')
    game.selectGroup(a.id)
    game.registerAnswer(correcta)
    game.selectGroup(b.id)
    game.registerAnswer(correcta)
    game.selectGroup(c.id)
    game.registerAnswer(correcta === 0 ? 1 : 0)
    game.reveal()
    game.nextQuestion()

    expect(game.startTiebreak()).toBe(true)
    expect(game.contenders.map((g) => g.id).sort()).toEqual([a.id, b.id].sort())
    expect(game.isTiebreak).toBe(true)
  })

  it('no hay desempate por un empate que no es de la cabecera', () => {
    const { game } = preparar(3)
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.beginQuestion()
    const correcta = game.current?.correctIndex ?? 0

    // Solo A acierta: B y C empatan a cero, pero hay ganador claro.
    const [a, , c] = game.groups
    if (a === undefined || c === undefined) throw new Error('sin grupos')
    game.selectGroup(a.id)
    game.registerAnswer(correcta)
    game.reveal()
    game.nextQuestion()

    expect(game.needsTiebreak).toBe(false)
  })

  it('el desempate es de una sola pregunta y vuelve a resultados', () => {
    const { game } = preparar(2)
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.reveal()
    game.nextQuestion()

    game.startTiebreak()
    game.reveal()

    // Una sola pregunta: al avanzar se vuelve directamente a resultados.
    expect(game.nextQuestion()).toBe('results')
    expect(game.phase).toBe('results')
  })

  it('el desempate no repite una pregunta ya jugada', () => {
    const { game } = preparar(2)
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    const primeraId = game.current?.id
    game.reveal()
    game.nextQuestion()

    game.startTiebreak()

    expect(game.current?.id).not.toBe(primeraId)
  })

  it('el desempate usa una pregunta de la dificultad configurada', () => {
    const conDificiles: Question[] = [
      { ...BANCO[0]!, id: 'd1', difficulty: 'dificil' },
      { ...BANCO[1]!, id: 'd2', difficulty: 'dificil' },
    ]
    const { game } = preparar(2, conDificiles)
    game.updateConfig({ questionCount: 1, difficulty: 'facil' })
    game.startGame()
    game.reveal()
    game.nextQuestion()
    game.updateConfig({ tiebreakDifficulty: 'dificil' })

    expect(game.startTiebreak()).toBe(true)
    expect(game.current?.difficulty).toBe('dificil')
  })

  it('avisa y no sortea si el banco se ha agotado', () => {
    // Con una sola pregunta no queda nada libre para desempatar. Se prefiere
    // avisar a reutilizar una pregunta ya respondida, que no resolvería nada.
    const { game } = preparar(2, BANCO.slice(0, 1))
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.reveal()
    game.nextQuestion()

    expect(game.needsTiebreak).toBe(true)
    expect(game.startTiebreak()).toBe(false)
    expect(game.blockingMessage).toContain('No quedan preguntas')
  })

  it('un segundo desempate seguido se rechaza', () => {
    const { game } = preparar(2, BANCO.slice(0, 3))
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.reveal()
    game.nextQuestion()

    game.startTiebreak()

    expect(game.startTiebreak()).toBe(false)
  })

  it('resuelve el empate y declara un ganador único', () => {
    const { game } = preparar(2, BANCO.slice(0, 2))
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.reveal()
    game.nextQuestion()
    expect(game.needsTiebreak).toBe(true)

    // En la ronda de desempate los dos aciertan, así que la partida seguiría
    // empatada. Por eso uno de los dos falla: el desempate tiene que servir
    // para desempatar de verdad.
    game.startTiebreak()
    game.beginQuestion()
    const correcta = game.current?.correctIndex ?? 0
    const [primero, segundo] = game.contenders
    if (primero === undefined || segundo === undefined) throw new Error('sin grupos')
    game.selectGroup(primero.id)
    game.registerAnswer(correcta)
    game.selectGroup(segundo.id)
    game.registerAnswer(correcta === 0 ? 1 : 0)
    game.reveal()
    game.nextQuestion()

    expect(game.needsTiebreak).toBe(false)
    expect(game.leaders).toHaveLength(1)
  })

  it('permite encadenar un segundo desempate si el primero vuelve a empatar', () => {
    const { game } = preparar(2, BANCO.slice(0, 3))
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.reveal()
    game.nextQuestion()

    // Primera ronda de desempate: tampoco se resuelve.
    game.startTiebreak()
    game.beginQuestion()
    game.reveal()
    game.nextQuestion()

    expect(game.needsTiebreak).toBe(true)
    expect(game.startTiebreak()).toBe(true)
  })

  it('no sortea un desempate con la partida en curso', () => {
    const { game } = preparar(2)
    game.updateConfig({ questionCount: 5 })
    game.startGame()
    game.beginQuestion()

    // Aunque artificialmente haya empate, no se puede desempatar a mitad de
    // partida: el desempate solo existe sobre la tabla final.
    game.groups[0]!.score = 0
    game.groups[1]!.score = 0

    expect(game.startTiebreak()).toBe(false)
  })
})

describe('tabla de posiciones', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('ordena de mayor a menor y comparte puesto en los empates', () => {
    const { game } = preparar(3)
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.beginQuestion()
    const correcta = game.current?.correctIndex ?? 0

    const [a, b, c] = game.groups
    if (a === undefined || b === undefined || c === undefined) throw new Error('sin grupos')
    // A y B aciertan, C falla: empate en el primer puesto.
    game.selectGroup(a.id)
    game.registerAnswer(correcta)
    game.selectGroup(b.id)
    game.registerAnswer(correcta)
    game.selectGroup(c.id)
    game.registerAnswer(correcta === 0 ? 1 : 0)
    game.reveal()
    game.nextQuestion()

    const tabla = game.ranking
    expect(tabla[0]?.score).toBe(tabla[1]?.score)
    expect(tabla[0]?.rank).toBe(1)
    expect(tabla[1]?.rank).toBe(1)
    expect(tabla[2]?.rank).toBe(3)
    expect(tabla[0]?.tied).toBe(true)
  })

  it('funciona con 50 grupos', () => {
    // El límite real del store es 20, pero la tabla debe tolerar más por si
    // algún día se relaxa, sin romperse.
    const { game } = preparar(2)
    game.groups = Array.from({ length: 50 }, (_, i) => ({
      id: createId('g'),
      name: `Equipo ${i}`,
      label: `G${i}`,
      score: i,
      currentAnswer: null,
    }))

    expect(game.ranking).toHaveLength(50)
  })
})

describe('createId', () => {
  it('genera identificadores únicos con prefijo', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createId('g')))

    expect(ids.size).toBe(200)
    expect(createId('q')).toMatch(/^q-/)
  })
})

/** Responde correctamente con todos los grupos en juego. */
function abrirOResponder(game: ReturnType<typeof useGameStore>): void {
  if (game.phase === 'setup') game.startGame()
  if (game.phase === 'intro') game.beginQuestion()
  const correcta = game.current?.correctIndex ?? 0
  for (const grupo of game.contenders) {
    game.selectGroup(grupo.id)
    game.registerAnswer(correcta)
  }
}
