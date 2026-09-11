# BACKROOMS — El vestíbulo / El ala de servicio

Juego de terror y exploración en primera persona para navegador. El objetivo en los dos niveles es encontrar la salida y escapar. No hay objetos que recoger, acertijos que resolver ni batería que administrar. Los escenarios, las texturas y el ambiente se generan de forma procedural; el grito «Entitiiii!!» usa una pequeña voz incluida con efectos de ópera y eco.

## Ejecutar

Necesitas Node.js 22.12 o posterior.

```sh
npm install
npm run dev
```

Abre la dirección local que indique Vite (normalmente http://127.0.0.1:5173) y pulsa **ENTRAR**. Funciona con teclado y ratón o con los controles táctiles de móviles y tabletas, en un navegador con WebGL 2. En escritorio, si el navegador no permite capturar el puntero, mantén pulsado el botón izquierdo y arrastra para mirar.

## Controles

| Acción | Control |
| --- | --- |
| Caminar | WASD o flechas |
| Mirar | Ratón |
| Correr | Shift |
| Abrir la salida | E, cerca de la puerta y mirando hacia ella |
| Encender / apagar la linterna | F |
| Gritar «Entitiiii!!» (nivel 1) | G o el botón del HUD |
| Pausar y liberar ratón | Esc |

El menú permite ajustar la sensibilidad. Los botones superiores controlan el sonido y la pantalla completa. La linterna no se agota; la resistencia se recupera al dejar de correr. Al pausar o cambiar de pestaña se detienen el movimiento, el cronómetro y la entidad.

### Móviles y tabletas

El juego detecta la entrada táctil y muestra controles adaptados. Arrastra el joystick izquierdo para caminar y desliza el pulgar por la parte derecha del escenario para mirar; puedes hacer ambas cosas a la vez. **CORRER** activa o desactiva la carrera, **LINTERNA** enciende o apaga la luz y **ABRIR** se habilita al acercarte a la salida y mirarla. En el nivel 1, toca **Entitiiii!!** para llamar a la entidad. El botón **Ⅱ** superior pausa la partida.

Se puede jugar en vertical y en horizontal, sin bloquear la orientación. La interfaz respeta las zonas seguras de la pantalla y los menús se desplazan cuando no caben; en horizontal tendrás una vista más amplia del pasillo. El diálogo «Cómo jugar» muestra las instrucciones correspondientes al dispositivo y permite ajustar la sensibilidad al mirar.

## Los dos niveles

**Nivel 0 — El vestíbulo.** Recorre las habitaciones y los pasillos amarillentos hasta encontrar la puerta de salida. Puedes abrirla desde el principio. Al escapar, continúa al siguiente nivel desde la pantalla de finalización.

**Nivel 1 — El ala de servicio.** Accede desde el selector del menú o en `/?level=1`. Una presencia recorre los pasillos industriales y reacciona a la luz y al ruido. Caminar resulta más discreto que correr; interrumpir su línea de visión ayuda a perderla. Los refugios de luz tenue permiten ocultarte si apagas la linterna y permaneces quieto. La iluminación principal se apaga periódicamente durante doce segundos. Encuentra la salida y pulsa **E** para escapar.

Los mapas son fijos y todas sus zonas están conectadas. No hay límite de tiempo ni guardado persistente: reiniciar o recargar empieza una partida nueva.

En el nivel 1 puedes llamar a la entidad con un «Entitiiii!!» burlón y operístico. Cada grito tiene un 60 % de probabilidad de atraerla, con una respuesta retardada, al lugar desde el que llamaste. Recorre los pasillos hasta allí: no aparece por teletransporte. Cerca de ella el ruido también puede delatarte, y gritar rompe el sigilo de un refugio. Hay ocho segundos entre llamadas; la pausa congela la espera y corta la voz.

## Verificación y distribución

```sh
npm test          # Conectividad, salida, colisiones y comportamiento de la entidad
npm run test:e2e  # Pruebas del navegador y capturas en test-results/
npm run build    # Genera dist/
npm run preview  # Prueba la versión de producción
```

Las pruebas de navegador usan Google Chrome si está instalado en la ruta estándar de macOS; en otros sistemas, instala Chromium de Playwright con `npx playwright install chromium`.

`dist/` se puede alojar en un servidor estático. El juego funciona sin servicios externos ni cuentas: Three.js genera el escenario y Web Audio sintetiza el ambiente y procesa la voz incluida. La procedencia del clip está en `public/audio/README.md`.

## Desplegar en Railway

Despliegue actual: [jugar a Backrooms](https://backrooms-production-6c24.up.railway.app/) · [nivel 1](https://backrooms-production-6c24.up.railway.app/?level=1) · [panel de Railway](https://railway.com/project/4ea7b57c-082e-475c-b42b-8d947d189ac2).

El proyecto y el servicio `backrooms` son independientes de `bot-bin`. El despliegue se hace desde los archivos locales; no está conectado al despliegue automático de GitHub. Para volver a publicar los cambios en este servicio:

```sh
npx @railway/cli up --project 4ea7b57c-082e-475c-b42b-8d947d189ac2 --service 81539e5d-288e-4383-aa85-0519d5e2dfb3 --environment 787c8e47-d304-49bb-8e34-2308b952b5c0
```

El `Dockerfile` compila con Node.js 22 y `npm ci`; la imagen final usa Nginx Alpine y solo sirve `dist/`. No hace falta ejecutar Vite en producción, instalar una base de datos ni copiar credenciales de otros proyectos al juego. `.dockerignore` limita los archivos que entran en la imagen.

Vincula esta carpeta al servicio **backrooms** de Railway y ejecuta `railway up`. Mantén vacío el comando de inicio personalizado para conservar el arranque de Nginx. El servidor escucha en `0.0.0.0:$PORT` (8080 por defecto); configura el dominio público para ese puerto y la comprobación de salud en `/`, con 60 segundos de espera. La configuración de construcción Dockerfile, salud y reinicio (`ON_FAILURE`, 3 reintentos) se guarda directamente en el servicio, sin depender del formato obsoleto `railway.json`.

Para probar la misma imagen localmente, con Docker instalado:

```sh
docker build -t backrooms .
docker run --rm -p 8080:8080 -e PORT=8080 backrooms
```

Abre `http://localhost:8080/` o `http://localhost:8080/?level=1`. El HTML se revalida en cada visita, los archivos con hash de Vite se conservan en caché y el audio MP3 se entrega como `audio/mpeg`. Las credenciales de Railway se utilizan únicamente fuera de la aplicación para desplegar; nunca deben añadirse a `public/`, al código ni a variables `VITE_*`.

Prueba del despliegue público (ambos niveles, llamada a la entidad, audio y ausencia del modo de desarrollo):

```sh
BACKROOMS_PRODUCTION_URL=https://backrooms-production-6c24.up.railway.app npm run test:e2e -- tests/browser/production.spec.js
```
