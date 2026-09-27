<script setup lang="ts">
/**
 * Pantalla de partida.
 *
 * Es la que coordina las tres piezas que no se conocen entre sí: el store de
 * partida (estado y reglas), el temporizador (cuenta atrás) y los componentes de
 * presentación. Toda la lógica vive en el store; aquí solo se traducen los
 * clics a acciones y se sincroniza el reloj con la fase.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import GroupPanel from '@/components/GroupPanel.vue'
import QuestionBoard from '@/components/QuestionBoard.vue'
import TimerBar from '@/components/TimerBar.vue'
import { play, stop } from '@/audio/soundBank'
import { playOptionReveal } from '@/audio/sfx'
import { useGameStore } from '@/stores/game'

/**
 * Silencio entre el "tum tum tum" y la aparición de la respuesta.
 *
 * Es un tempo de televisión, no un temporizador: si se revela en el mismo
 * instante en que suena el golpe de efecto, el efecto no se oye. Se deja margen
 * para que el último "tum" se apague y el espectador mire a la pantalla.
 */
const MS_SUSPENSE = 1500

const game = useGameStore()

/** Handle del temporizador, controlado desde la plantilla. */
const temporizador = ref<InstanceType<typeof TimerBar> | null>(null)

/**
 * `true` mientras suena el efecto de suspenso.
 *
 * Evita que dos clics seguidos revelen dos veces y desactiva el botón para que
 * el anfitrión vea que la respuesta está en camino.
 */
const revelando = ref(false)

/** Temporizador de la revelación, para poder cancelarlo al desmontar. */
let esperaRevelacion: ReturnType<typeof setTimeout> | null = null

/** Número de la ronda dentro de la partida, para la cabecera. */
const contador = computed(() => {
  const total = game.effectiveQuestionCount
  return total > 0 ? `${game.questionNumber} / ${total}` : String(game.questionNumber)
})

/** Texto del botón de la fase `intro`, que es donde arranca el reloj. */
const textoIntro = computed(() => (game.isTiebreak ? 'Desempate: empezar' : 'Empezar la pregunta'))

/**
 * Arranca el reloj si la pregunta ya está abierta al montar.
 *
 * Sin esto, recargar la página o remontar la pantalla con la fase `open`
 * dejaría la pregunta sin cuenta atrás: el vigilante de abajo solo reacciona a
 * cambios de fase y aquí no va a haber ninguno.
 */
onMounted(() => {
  if (game.phase === 'open') temporizador.value?.start()
})

/**
 * Sincroniza el reloj con la fase.
 *
 * El temporizador solo corre con la fase `open`: se para al revelar, al terminar
 * y al volver atrás. Sin esto, el reloj seguiría corriendo con la respuesta ya
 * en pantalla.
 *
 * Solo se ocupa de los cambios de fase, que es cuando la referencia al
 * componente ya está asignada con seguridad.
 */
watch(
  () => game.phase,
  (fase, anterior) => {
    if (fase === 'open' && anterior !== 'open') temporizador.value?.start()
    else if (fase !== 'open') temporizador.value?.stop()
  },
)

// Si la pantalla se desmonta con el reloj corriendo, se corta: evita que suene
// la alarma de tiempo en una partida que ya no existe. También se cancela la
// revelación pendiente: si el anfitrión vuelve atrás mientras suena el
// suspense, la respuesta no debe aparecer en la pantalla siguiente.
onBeforeUnmount(() => {
  temporizador.value?.stop()
  if (esperaRevelacion !== null) {
    clearTimeout(esperaRevelacion)
    esperaRevelacion = null
  }
})

/** Abre la pregunta: arranca la música de tensión y la cuenta atrás. */
function empezarPregunta(): void {
  game.beginQuestion()
}

/**
 * Registra la opción que el grupo seleccionado ha elegido.
 *
 * Suena el blip de la opción: es la confirmación de que el clic se ha
 * registrado, algo imprescindible cuando el clic viene de alguien al fondo de la
 * sala y el anfitrión no puede ver qué ha pasado.
 */
function elegirOpcion(indice: number): void {
  if (!game.registerAnswer(indice)) return
  playOptionReveal(indice)
}

/**
 * Revela la respuesta.
 *
 * También sirve para saltar el reloj: si el anfitrión prefiere no esperar, la
 * acción es la misma que dispara el temporizador.
 *
 * Antes de mostrar la respuesta suena el "tum tum tum". Es un efecto de
 * suspense: la tensión del grupo termina en el clic, no en la respuesta, y sin
 * ese silencio la opción correcta aparecería sin dramatismo. Mientras suena, el
 * reloj queda en pausa para que alargar el efecto no consuma tiempo del grupo.
 *
 * Al agotarse el tiempo no hay suspense: la tensión ya ha acabado, y lo que
 * corresponde es la respuesta y su sonido. Por eso esa vía es `alAgotarse`.
 */
function revelar(): void {
  if (revelando.value) return

  revelando.value = true
  temporizador.value?.pause()
  // Se corta la música de tensión al decidir el anfitrión, no al revelar: si
  // siguiera sonando, competiría con el efecto de suspenso.
  stop('tension', true)
  play('suspense')

  esperaRevelacion = setTimeout(() => {
    esperaRevelacion = null
    revelando.value = false
    game.reveal()
  }, MS_SUSPENSE)
}

/** Cuando se agota el tiempo, el store revela y suena la alarma. */
function alAgotarse(): void {
  game.timeUp()
}

/** Avanza a la siguiente pregunta o termina la partida. */
function siguiente(): void {
  game.nextQuestion()
}

/**
 * Abandona la partida y vuelve a la configuración.
 *
 * Se pide confirmación porque se pierde el progreso: un clic cerca del botón de
 * revelar, en una pantalla compartida, dejaría la partida a medias sin que
 * nadie se entere hasta que pase el rato.
 *
 * Solo se abandona la partida, nunca el banco: `backToSetup` deja las
 * preguntas y los ajustes intactos, así que se puede volver a empezar con el
 * mismo mazo sin volver a escribir nada.
 */
function salir(): void {
  if (!window.confirm('¿Salir de la partida? Se perderá el progreso.')) return
  game.backToSetup()
}
</script>

<template>
  <section class="relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col gap-4 px-6 py-6">
    <!--
      Cabecera fija de la partida: contador de ronda, título del programa, valor
      en juego y salida. El título no estaba y, en mitad de una partida larga,
      la pantalla perdía la identidad del programa; ahora es lo único que no
      cambia nunca mientras se juega.
    -->
    <header class="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <div class="order-2 flex items-center gap-2 sm:order-1">
        <span class="rounded-full bg-white/10 px-3 py-1 text-sm font-bold tabular-nums">Pregunta {{ contador }}</span>
        <span
          v-if="game.isTiebreak"
          class="rounded-full bg-amber-bright px-3 py-1 text-sm font-extrabold text-ink"
        >
          Desempate
        </span>
        <button
          type="button"
          class="ml-auto rounded-lg border border-white/25 px-3 py-1 text-xs font-semibold text-white/80 transition hover:border-miss hover:text-white sm:ml-0"
          @click="salir"
        >
          Salir de la partida
        </button>
      </div>

      <h1
        class="order-1 text-center text-sm font-bold tracking-[0.35em] whitespace-nowrap text-gold/90 uppercase sm:order-none"
      >
        Quién quiere ser contador
      </h1>

      <div class="order-3 flex items-center justify-end gap-3 text-right">
        <span
          v-if="game.current?.category"
          class="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70"
        >
          {{ game.current.category }}
        </span>
        <span class="text-xl font-extrabold text-gold tabular-nums">
          {{ game.currentPoints }} pts
        </span>
      </div>
    </header>

    <div class="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1fr_20rem]">
      <!-- Columna principal: reloj, enunciado y opciones. -->
      <div class="flex min-h-0 flex-col gap-4">
        <TimerBar
          ref="temporizador"
          :seconds="game.secondsPerQuestion"
          @expired="alAgotarse"
        />

        <p
          v-if="game.current"
          class="max-h-[30vh] overflow-y-auto text-center text-2xl leading-snug font-bold text-balance sm:text-3xl"
        >
          {{ game.current.text }}
        </p>

        <QuestionBoard
          v-if="game.current"
          :question="game.current"
          :revealed="game.phase === 'reveal' || game.phase === 'results'"
          @pick="elegirOpcion"
        />

        <!--
          Botonera del anfitrión. En `intro` ofrece empezar; con la pregunta
          abierta, revelar; y con la respuesta ya en pantalla, avanzar.

          Durante el suspense el botón queda deshabilitado y anuncia que está en
          curso: si siguiera siendo pulsable, un clic de más revelaría la
          respuesta por el store y saltaría el efecto.
        -->
        <div class="mt-auto flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            v-if="game.phase === 'intro'"
            type="button"
            class="rounded-xl bg-gold px-8 py-3 text-lg font-extrabold text-ink transition hover:bg-amber-bright"
            @click="empezarPregunta"
          >
            {{ textoIntro }}
          </button>

          <button
            v-else-if="game.phase === 'open'"
            type="button"
            class="rounded-xl bg-amber-bright px-8 py-3 text-lg font-extrabold text-ink transition hover:brightness-110 disabled:opacity-60"
            :disabled="revelando"
            :aria-busy="revelando"
            @click="revelar"
          >
            {{ revelando ? 'Un momento…' : 'Revelar respuesta' }}
          </button>

          <button
            v-else-if="game.phase === 'reveal'"
            type="button"
            class="rounded-xl bg-gold px-8 py-3 text-lg font-extrabold text-ink transition hover:bg-amber-bright"
            @click="siguiente"
          >
            {{ game.isTiebreak ? 'Ver resultado' : 'Siguiente pregunta' }}
          </button>
        </div>
      </div>

      <!-- Panel de grupos. -->
      <GroupPanel
        class="scroll-area min-h-0 overflow-y-auto"
        :groups="game.contenders"
        :selected-id="game.selectedGroupId"
        :answers="game.roundAnswers"
        :correct-index="game.current?.correctIndex ?? -1"
        :revealed="game.phase === 'reveal'"
        :selectable="game.phase === 'open'"
        @select="game.selectGroup"
      />
    </div>

    <!-- Avisos de estado: empate irresoluble, etc. -->
    <p v-if="game.blockingMessage" class="text-center text-sm text-amber-bright" role="alert">
      {{ game.blockingMessage }}
    </p>
  </section>
</template>
