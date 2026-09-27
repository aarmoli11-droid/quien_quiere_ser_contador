<script setup lang="ts">
/**
 * Barra de tiempo de la pregunta.
 *
 * Se apoya en `useTimer`, que calcula el tiempo restante contra el reloj y no
 * contando ticks: así el contador sigue siendo exacto aunque el navegador
 * ralentice los `setInterval` por ir en segundo plano.
 *
 * No decide nada: solo avisa a la pantalla con `expired`, que es quien llama a
 * `game.timeUp()` para revelar la respuesta.
 *
 * El botón de pausa vive aquí y no en la pantalla porque es la barra la que sabe
 * si la cuenta está en marcha: si el botón dependiera de la pantalla, pause y
 * reloj se desincronizarían en cuanto uno de los dos se recreara.
 */
import { computed } from 'vue'

import { useTimer } from '@/composables/useTimer'

/** Segundos totales; se pasa al composable como valor inicial. */
const props = defineProps<{ seconds: number }>()

/** Se emite cuando el tiempo llega a cero, una sola vez por pregunta. */
const emit = defineEmits<{ (e: 'expired'): void }>()

/**
 * `onExpire` llama a `emit` en vez de a la lógica del store para que este
 * componente siga siendo tonto y se pueda probar solo.
 */
const timer = useTimer(() => emit('expired'))

/**
 * Fracción de barra que queda por llenar.
 *
 * `progress` del composable mide lo *transcurrido* (0 al empezar, 1 al
 * agotarse), que es lo contrario de lo que necesita una barra de cuenta atrás:
 * esta tiene que verse llena al principio y vaciarse. Se invierte aquí para no
 * arrastrar ese signo dentro de la plantilla.
 */
const relleno = computed(() => 1 - timer.progress.value)

/** Reinicia la cuenta atrás completa y la deja corriendo. */
function start(): void {
  timer.start(props.seconds)
}

/** Corta la cuenta atrás y vuelve al estado inicial. */
function stop(): void {
  timer.stop()
}

/** Pausa la cuenta atrás, conservando el tiempo que queda. */
function pause(): void {
  timer.pause()
}

/** Reanuda una cuenta pausada desde donde se quedó. */
function resume(): void {
  timer.resume()
}

/**
 * Pausa o reanuda, según el estado.
 *
 * Lo usa el botón de la barra. Se mantiene aparte de `pause` y `resume` porque
 * quien llama desde fuera (la pantalla de partida) sabe en qué estado está y
 * quiere una acción concreta: si se expusiera solo `toggle`, un error de fase
 * pausaría un reloj que ya estaba parado, sin avisar.
 */
function toggle(): void {
  if (timer.isPaused.value) resume()
  else pause()
}

/**
 * Se expone a la pantalla, que es quien marca el ritmo de la partida.
 *
 * Los nombres se corresponden con los del composable: si se renombraran aquí,
 * quien llame desde fuera dejaría de tener la comprobación de tipos que
 * comparten con el resto de métodos.
 */
defineExpose({ start, stop, pause, resume, toggle })
</script>

<template>
  <div class="flex w-full flex-col items-center gap-1.5">
    <div class="flex w-full items-center gap-3">
      <!--
        La barra se escala con `transform` en lugar de cambiar el `width`: así el
        navegador solo recompone la capa gráfica y el contador no da tirones
        junto al número.
      -->
      <div class="relative h-3 flex-1 overflow-hidden rounded-full bg-black/50">
        <div
          class="h-full origin-left rounded-full transition-transform duration-100 ease-linear"
          :class="timer.remaining.value <= 5 ? 'bg-miss' : 'bg-gold'"
          :style="{ transform: `scaleX(${Math.min(1, Math.max(0, relleno))})` }"
        ></div>
      </div>
      <span
        class="w-14 text-right text-2xl font-extrabold tabular-nums"
        :class="timer.remaining.value <= 5 ? 'text-miss' : 'text-white'"
      >
        {{ timer.remaining.value }}s
      </span>
    </div>

    <!--
      El botón solo aparece con la cuenta en marcha o en pausa. Antes de empezar
      la pregunta no hay nada que pausar, y después de revelarla el reloj ya no
      corre: un botón visible pero inactivo confunde más que no tenerlo.
    -->
    <button
      v-if="timer.isRunning.value || timer.isPaused.value"
      type="button"
      class="rounded-md border border-white/30 px-3 py-1 text-xs font-semibold transition hover:border-gold hover:text-gold"
      @click="toggle"
    >
      {{ timer.isPaused.value ? 'Reanudar' : 'Pausar' }}
    </button>
  </div>
</template>
