# Entity call

`entitiiii.mp3` is a synthetic Spanish utterance created for this game with
the open-source eSpeak-NG formant synthesizer (`es` voice), saying “¡Entití!”.
Its last vowel is extended; `src/entity-call-voice.js` adds the mock-operatic
pitch gesture, vibrato and corridor echoes during playback.

It is bundled so playback does not depend on browser speech voices, an account,
an external service, or a network request to a third-party API.

Source generation: `@echogarden/espeak-ng-emscripten` 0.3.5, run locally in a
temporary directory, with voice `es`, rate 145, pitch 45, pitch range 12. The
input text is the game's original one-word call, not a recording or imitation
of a person. No Apple system voice recording is included.

Processing: retain the first 0.362 seconds, stretch the final vowel
(0.35–0.55 s) with FFmpeg `atempo` stages 0.5, 0.5, 0.5, 0.7, crossfade into it
for 12 ms, fade its final 280 ms, high-pass at 90 Hz, limit at 0.85, and encode
mono MP3 at 22,050 Hz / 96 kbps.

The synthesizer is a build-time tool only; its code and voice data are not
bundled in the game. eSpeak-NG is GPL-3.0; GPL output coverage depends on the
content of the output, not simply the program used to create it. Here the
asset contains the synthesized original call, not synthesizer source code.
See [eSpeak license](https://espeak.sourceforge.net/license.html) and
[GNU GPL FAQ on program output](https://www.gnu.org/licenses/gpl-faq.html#GPLOutput).
