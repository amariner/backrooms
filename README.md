# BACKROOMS — El vestíbulo

Juego de exploración en primera persona para navegador. Apareces en un edificio de oficinas vacío y tienes que recuperar tres fusibles para activar la puerta de salida. El nivel incluye pasillos conectados, señales, luz fluorescente, linterna y sonido procedural.

## Ejecutar

Necesitas Node.js 22.12 o posterior.

```sh
npm install
npm run dev
```

Abre la dirección local que indique Vite (normalmente http://127.0.0.1:5173) y pulsa **ENTRAR**. Está pensado para ordenador con teclado y ratón, en un navegador con WebGL 2. Si el navegador no permite capturar el puntero, mantén pulsado el botón izquierdo y arrastra para mirar.

## Controles

| Acción | Control |
| --- | --- |
| Caminar | WASD o flechas |
| Mirar | Ratón |
| Correr | Shift (consume resistencia, que se recupera al caminar) |
| Recoger fusible / abrir salida | E, cerca del objeto y mirando hacia él |
| Linterna | F |
| Orientación temporal al objetivo más cercano | H |
| Pausar y liberar ratón | Esc |

Las instrucciones del menú permiten ajustar la sensibilidad. Los botones superiores controlan el sonido y la pantalla completa. Al pausar o cambiar de pestaña se detienen el movimiento y el cronómetro. Reiniciar empieza una partida nueva.

## Objetivo

Recoge los fusibles de **Archivo (A)**, **Mantenimiento (B)** y **Oficinas (C)**. Vuelve a la puerta del extremo norte y pulsa **E**. La pista de **H** muestra durante 18 segundos una ruta transitable hacia el siguiente fusible o la salida.

## Verificación y distribución

```sh
npm test          # Conectividad, rutas y colisiones del mapa
npm run test:e2e  # Pruebas del navegador y capturas en test-results/
npm run build    # Genera dist/
npm run preview  # Prueba la versión de producción
```

Las pruebas de navegador usan Google Chrome si está instalado en la ruta estándar de macOS; en otros sistemas, instala Chromium de Playwright con `npx playwright install chromium`.

`dist/` se puede alojar en un servidor estático. El juego funciona sin servicios externos, cuentas, imágenes descargadas ni archivos de audio: Three.js genera el escenario y Web Audio sintetiza el sonido. El mapa es fijo y todas sus zonas están conectadas. No incluye enemigos ni guardado de partida.
