# Atribución de audio

Los archivos de esta carpeta proceden del soundboard público:

**WhoWantsToBeAMillionaire-Soundboard** — https://github.com/Liozon/WhoWantsToBeAMillionaire-Soundboard
Licencia del repositorio: MIT (Copyright (c) 2022 Julien Muggli).
Los propios archivos de audio son grabaciones del programa de televisión
"Who Wants to Be a Millionaire?" y pertenecen a sus titulares de derechos.

| Archivo local     | Archivo original     | Duración | Evento del juego                    |
|-------------------|----------------------|----------|------------------------------------|
| `intro.mp3`       | `lets play.mp3`      | 10,6 s   | música de entrada de la partida    |
| `tension.mp3`     | `100-1000 music.mp3` | 165,2 s  | tensión en bucle al contestar      |
| `suspense.mp3`    | `final answer.mp3`   | 30,6 s   | "tum tum tum" antes de revelar    |
| `correct.mp3`     | `correct answer.mp3` | 7,4 s    | respuesta correcta                 |
| `wrong.mp3`       | `wrong answer.mp3`   | 5,8 s    | respuesta incorrecta / tiempo agotado |

Total: 3,40 MB.

## Nota sobre derechos de autor

El código del soundboard es MIT, pero **las grabaciones de audio son material
del programa de televisión y no son obra de su autor**. El MIT del repositorio
no las cubre.

Este uso es local, de aula o de feria, sin distribución pública. Si el proyecto
se publicara en internet o se emitiera, estos archivos serían el elemento a
sustituir: el resto del juego funciona sin ellos (basta con pulsar el botón de
silencio) y los dos sonidos que el soundboard no traía —el blip de cada opción
y la alerta de tiempo— ya son originales, sintetizados con la Web Audio API en
`src/audio/sfx.ts`.

## Nota técnica

- `tension.mp3` dura 165 s, mucho más que los 30 s de una pregunta, así que en
  la práctica no llega a repetirse. Aun así se activa el bucle por si el
  anfitrión pausa y reanuda muchas veces.
- El cambio de volumen al parar la música se hace con un desvanecido de 400 ms
  en `src/audio/soundBank.ts`: cortarla en seco se oye como un chasquido.
