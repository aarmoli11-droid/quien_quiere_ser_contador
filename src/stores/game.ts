import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { play, startTension, stop } from '@/audio/soundBank'
import { playAnswerRegistered, playTimeUp } from '@/audio/sfx'
import { DEFAULT_SECONDS_PER_QUESTION } from '@/composables/useTimer'
import { createId } from '@/lib/id'
import { isPlayableQuestion, pickRandomQuestions, removeUsedQuestions, shuffleQuestion } from '@/lib/shuffle'
import {
  applyRoundPoints,
  findLeaders,
  hasTie,
  pointsForQuestion,
  rankGroups,
  tiebreakContenders,
} from '@/lib/scoring'
import type { Difficulty, GameConfig, GamePhase, Group, GroupAnswer, Question, ShuffledQuestion } from '@/types'
import { useQuestionBankStore } from './questionBank'

/**
 * Máximo de grupos que admite la pantalla de configuración.
 *
 * No es un límite técnico sino de presentación: por encima de esto, la columna
 * lateral deja de caber en un proyector y el anfitrión tendría difficulties
 * para leer los nombres desde la sala.
 */
export const MAX_GROUPS = 20

/** Valores por defecto de la partida, antes de que el anfitrión los cambie. */
const DEFAULT_CONFIG: Omit<GameConfig, 'groups'> = {
  difficulty: 'facil',
  questionCount: 10,
  secondsPerQuestion: DEFAULT_SECONDS_PER_QUESTION,
  basePoints: 100,
  pointsStep: 100,
  tiebreakDifficulty: 'dificil',
}

/**
 * Convierte un valor a entero dentro de un rango mínimo.
 *
 * Existe porque `Math.max(1, Math.trunc(Number.NaN))` devuelve `NaN`: un campo
 * de configuración vacío o corrupto dejaría el reloj o el puntaje en `NaN` y
 * toda la pantalla se dibujaría rota. Cualquier valor no numérico o no finito
 * cae al valor actual, que siempre es válido.
 */
function toSafeInt(value: unknown, current: number, min: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return current
  return Math.max(min, Math.trunc(n))
}

/**
 * Normaliza un texto de entrada y devuelve `undefined` si no es utilizable.
 *
 * Tolera que llegue un número o un `null` desde un `<input>` o desde un estado
 * restaurado a mano. El `undefined` permite distinguir "no llegó nada" de "llegó
 * vacío": lo primero conserva lo que ya había, lo segundo es un borrado
 * deliberado del anfitrión.
 */
function toSafeText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

/** Una ronda ya resuelta, que se conserva para poder mostrarla al revelar. */
export interface RoundRecord {
  question: ShuffledQuestion
  answers: GroupAnswer[]
  pointsPerGroup: number
  isTiebreak: boolean
  /** `true` si algún grupo se quedó sin responder por agotarse el tiempo. */
  someoneTimedOut: boolean
}

/**
 * Estado completo de la partida.
 *
 * Es una máquina de estados explícita y estrictamente creciente:
 * `setup → intro → open → reveal → (intro | results)`. Cada acción comprueba la
 * fase en la que se llama, de modo que un doble clic rápido en "siguiente" o
 * en un grupo no puede saltarse la revelación ni repartir dos veces los puntos
 * de la misma pregunta.
 */
export const useGameStore = defineStore('game', () => {
  // ---------------------------------------------------------------- estado
  const phase = ref<GamePhase>('setup')
  const groups = ref<Group[]>([])
  const difficulty = ref<Difficulty>(DEFAULT_CONFIG.difficulty)
  const questionCount = ref(DEFAULT_CONFIG.questionCount)
  const secondsPerQuestion = ref(DEFAULT_CONFIG.secondsPerQuestion)
  const basePoints = ref(DEFAULT_CONFIG.basePoints)
  const pointsStep = ref(DEFAULT_CONFIG.pointsStep)
  const tiebreakDifficulty = ref<Difficulty>(DEFAULT_CONFIG.tiebreakDifficulty)

  /** Preguntas ya barajadas, aún no usadas, en orden de aparición. */
  const queue = ref<Question[]>([])
  /** Ids de las preguntas ya jugadas, para no repetirlas en un desempate. */
  const usedIds = ref<string[]>([])

  const current = ref<ShuffledQuestion | null>(null)
  /** Número de pregunta dentro de la partida, contando también los desempates. */
  const questionNumber = ref(0)
  const roundAnswers = ref<GroupAnswer[]>([])
  const history = ref<RoundRecord[]>([])

  /** Grupo que el anfitrión tiene seleccionado ahora mismo para responder. */
  const selectedGroupId = ref<string | null>(null)
  /** `true` si la ronda en curso es un desempate. */
  const isTiebreak = ref(false)
  /** Grupos que compiten en el desempate actual. */
  const tiebreakGroupIds = ref<string[]>([])
  /** Aviso que bloquea la partida (p. ej. no quedan preguntas). */
  const blockingMessage = ref<string | null>(null)

  // ------------------------------------------------------------- derivados
  /** `true` si la ronda actual es un desempate. */
  const contenders = computed<Group[]>(() => {
    if (!isTiebreak.value) return groups.value
    return tiebreakContenders(groups.value, tiebreakGroupIds.value)
  })

  /** `true` si todos los grupos en juego ya registraron su respuesta. */
  const allContendersAnswered = computed<boolean>(
    () => contenders.value.length > 0 && contenders.value.every((g) => g.currentAnswer !== null),
  )

  /** Puntos que vale la pregunta en curso, ya escalada. */
  const currentPoints = computed<number>(() =>
    pointsForQuestion(questionNumber.value, basePoints.value, pointsStep.value),
  )

  /** Tabla de posiciones ordenada, con el puesto ya calculado. */
  const ranking = computed(() => rankGroups(groups.value))

  /** Grupos empatados en el primer puesto. */
  const leaders = computed<Group[]>(() => findLeaders(groups.value))

  /** `true` si la partida ha terminado en empate y toca desempatar. */
  const needsTiebreak = computed<boolean>(() => phase.value === 'results' && hasTie(groups.value))

  /** Preguntas del banco que aún no se han usado, para un posible desempate. */
  const unusedQuestions = computed<Question[]>(() => {
    const bank = useQuestionBankStore()
    return removeUsedQuestions(bank.playable, usedIds.value)
  })

  /**
   * `true` si la partida se puede empezar.
   *
   * Exige al menos un grupo, al menos una pregunta en el banco y al menos dos
   * grupos en juego: con un único grupo no hay competencia y el juego no tiene
   * sentido, así que se avisa en lugar de dejar empezar una partida vacía.
   */
  const canStart = computed<boolean>(
    () => groups.value.length >= 2 && unusedQuestions.value.length > 0,
  )

  /** Explicación de por qué no se puede empezar, o `null` si sí se puede. */
  const startBlockedReason = computed<string | null>(() => {
    if (groups.value.length === 0) return 'Añade al menos un grupo para empezar.'
    if (groups.value.length === 1) return 'Hacen falta al menos dos grupos para competir.'
    if (unusedQuestions.value.length === 0) return 'No quedan preguntas en el banco. Añade más antes de empezar.'
    return null
  })

  /**
   * Número de preguntas con las que se cuenta realmente la partida.
   *
   * Se fija al empezar en lugar de calcularse en vivo: si se derivara de las
   * preguntas sin usar, bajaría en cuanto se consumiera la primera y la
   * pantalla mostraría un número cada vez más pequeño que el real.
   */
  const effectiveQuestionCount = ref(0)

  // ------------------------------------------------------- gestión de grupos
  /**
   * Añade un grupo.
   *
   * El nombre se recorta y, si viene vacío, se usa la etiqueta como nombre para
   * que la tabla de posiciones nunca muestre una fila sin identificar.
   */
  function addGroup(name: string, label?: string): Group | null {
    if (groups.value.length >= MAX_GROUPS) return null

    // La etiqueta por defecto usa la letra de la posición: A, B, C...
    const etiquetaPorDefecto = `Grupo ${String.fromCharCode(65 + groups.value.length)}`
    const etiqueta = toSafeText(label) || etiquetaPorDefecto
    // Si no hay nombre se usa la etiqueta, para que la tabla de posiciones nunca
    // muestre una fila sin identificar.
    const nombre = toSafeText(name) || etiqueta

    const nuevo: Group = {
      id: createId('g'),
      name: nombre,
      label: etiqueta,
      score: 0,
      currentAnswer: null,
    }
    groups.value = [...groups.value, nuevo]
    return nuevo
  }

  /** Actualiza el nombre o la etiqueta de un grupo. `false` si no existe. */
  function updateGroup(id: string, changes: { name?: string; label?: string }): boolean {
    const existe = groups.value.some((g) => g.id === id)
    if (!existe) return false
    const actual = groups.value.find((g) => g.id === id)
    if (actual === undefined) return false

    const etiqueta = toSafeText(changes.label) || actual.label
    const nombrePropuesto = toSafeText(changes.name)
    // Un nombre no utilizable (null, un objeto) se ignora y se conserva el que
    // ya había: es preferible no tocarlo antes que sustituirlo por la etiqueta.
    // Un nombre vacío sí es un borrado deliberado y cae en la etiqueta.
    const nombre = nombrePropuesto === undefined ? actual.name : nombrePropuesto || etiqueta

    groups.value = groups.value.map((g) => (g.id === id ? { ...g, name: nombre, label: etiqueta } : g))
    return true
  }

  /** Elimina un grupo. `false` si no existía. */
  function removeGroup(id: string): boolean {
    const antes = groups.value.length
    groups.value = groups.value.filter((g) => g.id !== id)
    if (groups.value.length === antes) return false

    // Si el grupo eliminado estaba seleccionado, se cierra el selector para no
    // dejar la pantalla en un estado imposible de seguir.
    if (selectedGroupId.value === id) selectedGroupId.value = null
    return true
  }

  /** Cambia los ajustes de la partida desde la pantalla de configuración. */
  function updateConfig(changes: Partial<Omit<GameConfig, 'groups'>>): void {
    if (changes.difficulty !== undefined) difficulty.value = changes.difficulty
    if (changes.tiebreakDifficulty !== undefined) tiebreakDifficulty.value = changes.tiebreakDifficulty
    if (changes.questionCount !== undefined) {
      questionCount.value = toSafeInt(changes.questionCount, questionCount.value, 1)
    }
    if (changes.secondsPerQuestion !== undefined) {
      secondsPerQuestion.value = toSafeInt(changes.secondsPerQuestion, secondsPerQuestion.value, 1)
    }
    if (changes.basePoints !== undefined) {
      basePoints.value = toSafeInt(changes.basePoints, basePoints.value, 0)
    }
    if (changes.pointsStep !== undefined) {
      pointsStep.value = toSafeInt(changes.pointsStep, pointsStep.value, 0)
    }
  }

  // ------------------------------------------------------------ ciclo de partida
  /**
   * Baraja y prepara la siguiente pregunta sin abrirla todavía.
   *
   * Separar `intro` de `open` permite que el anfitrión lea la pregunta en voz
   * alta antes de que empiece la música de tensión y el reloj.
   */
  function loadNextQuestion(): boolean {
    if (queue.value.length === 0) {
      current.value = null
      return false
    }

    const siguiente = queue.value.shift()
    if (siguiente === undefined) {
      current.value = null
      return false
    }

    usedIds.value = [...usedIds.value, siguiente.id]
    // La mezcla ocurre aquí y no antes: es el punto donde la pregunta entra en
    // juego y donde debe quedar fijada, aunque el anfitrión pause el reloj.
    current.value = shuffleQuestion(siguiente)
    questionNumber.value += 1
    roundAnswers.value = []
    selectedGroupId.value = null
    blockingMessage.value = null
    // Cada grupo vuelve a estar sin responder. Sin este reset, la respuesta de
    // la pregunta anterior se arrastraría a la siguiente: el grupo aparecería
    // como que ya contestó, no se le podría registrar la nueva, y además
    // puntuaría dos veces por el mismo clic.
    groups.value = groups.value.map((g) => ({ ...g, currentAnswer: null }))
    phase.value = 'intro'
    return true
  }

  /**
   * Arranca la partida.
   *
   * Devuelve `false` y no cambia nada si no se puede empezar, para que un doble
   * clic en "Iniciar juego" no rompa el estado.
   */
  function startGame(): boolean {
    if (!canStart.value) return false

    const bank = useQuestionBankStore()
    const disponibles = bank.playable.filter(isPlayableQuestion)

    // En modo "dificil" entran todas las preguntas; en modo "facil" solo las
    // fáciles. Si el filtro dejara el banco vacío, se cae a todo el banco para
    // que el anfitrión pueda jugar igualmente.
    const porDificultad = disponibles.filter((q) => q.difficulty === difficulty.value)
    const candidatas = porDificultad.length > 0 ? porDificultad : disponibles

    groups.value = groups.value.map((g) => ({ ...g, score: 0, currentAnswer: null }))
    usedIds.value = []
    history.value = []
    questionNumber.value = 0
    isTiebreak.value = false
    tiebreakGroupIds.value = []
    // Se fija aquí el número de preguntas de la partida: nunca puede superar lo
    // que queda jugable tras aplicar el filtro de dificultad, así que la
    // pantalla de configuración puede pedir más de la cuenta sin romper nada.
    effectiveQuestionCount.value = Math.min(
      Math.max(1, Math.trunc(questionCount.value)),
      candidatas.length,
    )
    queue.value = pickRandomQuestions(candidatas, effectiveQuestionCount.value)

    return loadNextQuestion()
  }

  /**
   * Abre la pregunta: arranca el reloj y la música de tensión.
   *
   * No hace nada si ya está abierta, de modo que pulsar dos veces no reinicia
   * los 30 segundos.
   */
  function beginQuestion(): void {
    if (phase.value !== 'intro') return
    phase.value = 'open'
    startTension()
  }

  /** Elige el grupo que va a registrar su respuesta. */
  function selectGroup(id: string): boolean {
    if (phase.value !== 'open') return false
    if (!contenders.value.some((g) => g.id === id)) return false
    // Un grupo que ya respondió queda bloqueado: su respuesta es definitiva.
    if (groups.value.find((g) => g.id === id)?.currentAnswer !== null) return false

    selectedGroupId.value = id
    return true
  }

  /** Cierra el selector de grupo sin registrar nada. */
  function clearSelection(): void {
    selectedGroupId.value = null
  }

  /**
   * Registra la respuesta del grupo seleccionado.
   *
   * Es el clic del anfitrión sobre la opción que eligió ese grupo. Si el
   * índice está fuera de rango o no hay grupo seleccionado, no hace nada: es
   * preferible ignorar un clic equivocado que puntuar a un grupo por una
   * opción que no existe en pantalla.
   */
  function registerAnswer(optionIndex: number): boolean {
    if (phase.value !== 'open') return false

    const id = selectedGroupId.value
    if (id === null) return false

    const pregunta = current.value
    if (pregunta === null) return false
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= pregunta.options.length) {
      return false
    }

    const yaRespondio = groups.value.find((g) => g.id === id)?.currentAnswer !== null
    if (yaRespondio) return false

    groups.value = groups.value.map((g) =>
      g.id === id ? { ...g, currentAnswer: optionIndex } : g,
    )
    selectedGroupId.value = null
    playAnswerRegistered()
    return true
  }

  /**
   * Revela la respuesta y reparte los puntos.
   *
   * Los grupos que no llegaron a responder se quedan con 0 en esta ronda, que
   * es lo que exige el enunciado cuando se agota el tiempo.
   */
  function reveal(): boolean {
    if (phase.value !== 'open' && phase.value !== 'intro') return false

    const pregunta = current.value
    if (pregunta === null) return false

    // La música de tensión se corta aquí, no en la pantalla de revelación: si
    // siguiera sonando, competiría con el sonido de la respuesta.
    stop('tension', true)

    const enJuego = contenders.value
    const puntos = currentPoints.value

    const respuestas: GroupAnswer[] = enJuego.map((grupo) => {
      const respondio = grupo.currentAnswer !== null
      const acierto = respondio && grupo.currentAnswer === pregunta.correctIndex
      return {
        groupId: grupo.id,
        optionIndex: grupo.currentAnswer,
        correct: acierto,
        pointsAwarded: acierto ? puntos : 0,
      }
    })

    // Los grupos que no compiten en esta ronda (por ejemplo, los que quedaron
    // fuera de un desempate) tampoco deben acumular puntos ni perderlos.
    //
    // El orden original de `groups` se conserva porque es el orden en que el
    // anfitrión registró los equipos y es el que se ve en el panel lateral
    // durante toda la partida: reordenarlos sería desconcertante.
    const gruposQueJuegan = new Set(respuestas.map((r) => r.groupId))
    const bonificados = applyRoundPoints(
      groups.value.filter((g) => gruposQueJuegan.has(g.id)),
      respuestas,
    )
    const sinCambios = groups.value.filter((g) => !gruposQueJuegan.has(g.id))
    const porId = new Map([...bonificados, ...sinCambios].map((g) => [g.id, g]))
    groups.value = groups.value.map((g) => porId.get(g.id) ?? g)

    roundAnswers.value = respuestas
    history.value = [
      ...history.value,
      {
        question: pregunta,
        answers: respuestas,
        pointsPerGroup: puntos,
        isTiebreak: isTiebreak.value,
        someoneTimedOut: enJuego.some((g) => g.currentAnswer === null),
      },
    ]

    phase.value = 'reveal'
    // Si nadie acertó (o nadie respondió), suena el fallo; si alguno acertó,
    // el de acierto, que es el momento culminante del programa.
    if (respuestas.some((r) => r.correct)) play('correct')
    else play('wrong')

    return true
  }

  /**
   * Avanza a la pregunta siguiente, o termina la partida.
   *
   * En un desempate no hay cola: al revelar, se vuelve directamente a la tabla
   * de resultados para comprobar si el empate se ha resuelto.
   */
  function nextQuestion(): 'question' | 'results' | 'blocked' {
    if (phase.value !== 'reveal') return 'blocked'

    if (isTiebreak.value) {
      // Un desempate es siempre de una sola pregunta.
      finishGame()
      return 'results'
    }

    if (queue.value.length > 0) {
      loadNextQuestion()
      return 'question'
    }

    finishGame()
    return 'results'
  }

  /** Cierra la partida y muestra la tabla de posiciones. */
  function finishGame(): void {
    phase.value = 'results'
    selectedGroupId.value = null
    play('suspense')
  }

  /**
   * Se llama cuando se agota el tiempo de la pregunta.
   *
   * Suena la alerta y se revela de inmediato. Los grupos que noRespondieron
   * puntúan 0, tal y como marcan las reglas.
   */
  function timeUp(): boolean {
    if (phase.value !== 'open') return false
    playTimeUp()
    return reveal()
  }

  /**
   * Inicia una ronda de desempate entre los grupos empatados.
   *
   * Devuelve `false` si no hay empate o si no queda ninguna pregunta libre. Al
   * agotarse el banco se muestra un aviso en lugar de reutilizar una pregunta ya
   * respondida: repetirla no resolvería nada y confundaría a los grupos.
   *
   * El desempate se puede encadenar (si la ronda de desempate vuelve a terminar
   * en empate, se sortea otra), así que aquí solo se exige estar en la tabla de
   * resultados: el resto de fases ya quedan excluidas por la fase activa.
   */
  function startTiebreak(): boolean {
    if (phase.value !== 'results' || !hasTie(groups.value)) return false

    const bank = useQuestionBankStore()
    const disponibles = bank.playable.filter(isPlayableQuestion)
    const candidatas = disponibles.filter((q) => q.difficulty === tiebreakDifficulty.value)
    const libres = removeUsedQuestions(candidatas, usedIds.value)

    if (libres.length === 0) {
      // Se reintenta con cualquier dificultad antes de rendirse: puede que no
      // queden preguntas difíciles, pero sí fáciles.
      const libresCualquiera = removeUsedQuestions(disponibles, usedIds.value)
      if (libresCualquiera.length === 0) {
        blockingMessage.value =
          'No quedan preguntas sin usar para desempatar. Añade más preguntas al banco o decidid un ganador empatado.'
        return false
      }
      queue.value = pickRandomQuestions(libresCualquiera, 1)
    } else {
      queue.value = pickRandomQuestions(libres, 1)
    }

    isTiebreak.value = true
    tiebreakGroupIds.value = findLeaders(groups.value).map((g) => g.id)
    return loadNextQuestion()
  }

  /** Vuelve a la pantalla de configuración reiniciando la partida. */
  function backToSetup(): void {
    stop('tension', true)
    stop('correct', true)
    stop('wrong', true)
    stop('suspense', true)
    phase.value = 'setup'
    groups.value = groups.value.map((g) => ({ ...g, score: 0, currentAnswer: null }))
    current.value = null
    queue.value = []
    usedIds.value = []
    history.value = []
    questionNumber.value = 0
    roundAnswers.value = []
    selectedGroupId.value = null
    isTiebreak.value = false
    tiebreakGroupIds.value = []
    blockingMessage.value = null
  }

  return {
    // estado
    phase,
    groups,
    difficulty,
    questionCount,
    secondsPerQuestion,
    basePoints,
    pointsStep,
    tiebreakDifficulty,
    current,
    questionNumber,
    roundAnswers,
    history,
    selectedGroupId,
    isTiebreak,
    tiebreakGroupIds,
    blockingMessage,
    // derivados
    contenders,
    allContendersAnswered,
    currentPoints,
    ranking,
    leaders,
    needsTiebreak,
    unusedQuestions,
    canStart,
    startBlockedReason,
    effectiveQuestionCount,
    // acciones
    addGroup,
    updateGroup,
    removeGroup,
    updateConfig,
    startGame,
    beginQuestion,
    selectGroup,
    clearSelection,
    registerAnswer,
    reveal,
    nextQuestion,
    finishGame,
    timeUp,
    startTiebreak,
    backToSetup,
  }
})
