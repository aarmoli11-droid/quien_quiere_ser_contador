# Quién Quiere Ser Contador

Juego web de preguntas de contabilidad y finanzas para grupos, con puntos
acumulables, cuenta atrás por pregunta, desempate y los audios del programa.

Pensado para presentarse en una sala con proyector: el anfitrión registra los
grupos, va marcando lo que responde cada uno y la pantalla muestra la
clasificación en directo.

## Requisitos

- Node.js `^20.19.0` o `>=22.12.0`
- npm

## Puesta en marcha

```bash
npm install
npm run dev      # servidor de desarrollo
npm test         # suite de tests
npm run build    # comprueba tipos y genera dist/
npm run preview  # sirve dist/ para revisar el build
npm run typecheck
```

## Reglas del juego

- Entre 2 y 20 grupos, con nombre de hasta 40 caracteres y una etiqueta corta
  (8) que es la que se ve en el panel lateral.
- Cada pregunta tiene entre 2 y 4 opciones; el banco por defecto trae 3.
- Escalera de puntos por acierto: 100, 200, 300… (configurable el primer valor y
  el incremento).
- Cuenta atrás de 30 segundos por pregunta, configurable y **pausable** desde la
  propia barra.
- La respuesta se revela con el efecto de suspense del programa; si se agota el
  tiempo, se revela directamente y suena la alerta.
- Los grupos que no responden antes de la revelación se quedan con 0 en esa
  ronda.
- **No hay ayudas**: ni 50/50, ni público, ni amigo, ni lifeline del anfitrión.
- Si hay empate, se juega un desempate con las preguntas que no se hayan usado.
  Los grupos eliminados se quedan con su puntuación y solo compiten los que
  encabezan la tabla.
- Las opciones se barajan al cargar cada pregunta, así que la posición de la
  respuesta correcta cambia en cada partida.

## Datos y persistencia

El banco de preguntas y los ajustes se guardan en `localStorage`, en el
navegador y solo en ese equipo: no hay servidor ni cuentas. Todo el acceso a
almacenamiento pasa por `src/lib/storage.ts`, que nunca lanza. Si el
almacenamiento está lleno, bloqueado o corrupto, la partida sigue siendo jugable
y la interfaz avisa de lo ocurrido.

Para trabajar con preguntas propias hay dos caminos:

- El **panel del banco de preguntas**, desde la configuración: altas, edición,
  borrado, filtro, importación y exportación en JSON, y vuelta a las preguntas
  de ejemplo.
- Editar `src/data/questions.seed.json`.

El importador es deliberadamente tolerante: descarta las entradas que no sean
preguntas jugables en lugar de rechazar el archivo entero, e informa de cuántas
ha descartado. Si el archivo no llega a ser un JSON válido, lo dice en vez de
informar de "0 importadas".

## Audio

Los efectos del programa son MP3 locales en `public/audio/`, así que el juego
funciona sin conexión. El *blip* de cada opción y la alerta de tiempo agotado no
estaban en el soundboard original y se sintetizan con la Web Audio API.

La procedencia y la licencia de los archivos están en
[`public/audio/ATRIBUCION.md`](public/audio/ATRIBUCION.md).

El audio se desbloquea con el clic de "Iniciar partida", que es el gesto que los
navegadores aceptan como permiso del usuario. Si el audio falla o está
silenciado, la partida continúa igualmente.

## Escenario

El decorado está hecho con CSS (degradados y anillos) en lugar de con el PNG
original, que era de 1280x720 y se veía borroso en un proyector 1080p. Así el
fondo escala a cualquier resolución sin cargar un recurso pesado.

## Estructura

```
src/
├── audio/            catálogo de sonidos, soundbank y efectos sintetizados
├── components/
│   ├── admin/        panel de gestión del banco de preguntas
│   ├── GameScreen    arena: reloj, tablero, grupos y botonera del anfitrión
│   ├── GroupPanel    grupos, selección y marcador
│   ├── QuestionBoard opciones barajadas y su revelado
│   ├── ResultsScreen clasificación y desempate
│   ├── SetupScreen   configuración de la partida
│   ├── StageBackdrop decorado del escenario
│   └── TimerBar      barra de cuenta atrás
├── composables/      useTimer
├── data/             preguntas de ejemplo
├── lib/              scoring, shuffle, storage y validación de preguntas
├── stores/           partida y banco de preguntas (Pinia)
└── types.ts          tipos y límites compartidos
```

## Decisiones que conviene conocer antes de tocar el código

- **La fase es la única fuente de verdad.** `App.vue` elige pantalla a partir de
  `game.phase`; no hay un estado de pantalla paralelo que pueda contradecir a la
  partida.
- **El reloj se calcula contra `Date.now()`, no contando ticks.** Un portátil
  conectado a un proyector ralentiza los `setInterval` en segundo plano, y
  contar ticks haría que el tiempo no fuera el anunciado.
- **El tablero solo recibe datos validados.** `sanitizeQuestion` normaliza
  cualquier entrada —incluido `localStorage` manipulado o un JSON subido— y
  `correctIndex` se recalcula sobre la lista de opciones supervivientes. Si el
  índice apuntaba a una opción descartada, la pregunta se rechaza entera en
  lugar de adivinar la respuesta.
- **La protección frente a XSS la da el renderizado.** Los componentes
  interpolan con `{{ }}` y el proyecto no usa `v-html` con contenido editable.
  Por eso los validadores no "limpian" el HTML: hacerlo corrompería preguntas
  legítimas de contabilidad sin aportar protección real.

## Tests

```bash
npm test
```

La suite cubre la lógica (puntos, empates, barajado, almacenamiento, validación,
banco, audio y temporizador) y los componentes con `@vue/test-utils`: pantalla
de partida, tablero, barra de tiempo, panel de grupos, resultados, panel del
banco, enrutado de `App` y punto de entrada.

## Licencia

MIT. Ver [LICENSE](LICENSE).
