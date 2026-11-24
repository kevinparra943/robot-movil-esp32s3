/* ===========================================================================
 * jarvis_voice.js - Voz de JARVIS (sintesis del navegador, Web Speech API).
 * - Elige una voz en espanol (prefiere es-CO/es-MX/es-US/es-ES).
 * - Trocea el texto por frases: Chrome corta los enunciados largos (~15 s).
 * - Adapta unidades y siglas con Jarvis.toSpeech si esta disponible.
 * Sin dependencia de red para hablar en la mayoria de sistemas (voces locales).
 * Uso: JarvisVoice.speak(texto), JarvisVoice.cancel(), JarvisVoice.supported.
 * Solo navegador (window.JarvisVoice).
 * =========================================================================== */
(function (root) {
  'use strict';
  var synth = root.speechSynthesis;
  var supported = !!(synth && root.SpeechSynthesisUtterance);
  var voice = null;
  var PREF = ['es-co', 'es-mx', 'es-us', 'es-419', 'es-es', 'es'];

  function pickVoice() {
    if (!supported) return null;
    var voices = synth.getVoices() || [];
    var es = voices.filter(function (v) { return /^es([-_]|$)/i.test(v.lang || ''); });
    if (!es.length) return null;
    for (var i = 0; i < PREF.length; i++) {
      for (var j = 0; j < es.length; j++) {
        if ((es[j].lang || '').toLowerCase().replace('_', '-') === PREF[i]) return es[j];
      }
    }
    return es[0];
  }

  if (supported) {
    voice = pickVoice();
    if ('onvoiceschanged' in synth) {
      synth.addEventListener('voiceschanged', function () { voice = pickVoice(); });
    }
  }

  // Frases de como mucho ~200 caracteres.
  function chunks(text) {
    var parts = String(text).match(/[^.!?;]+[.!?;]*/g) || [String(text)];
    var out = [], cur = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      if ((cur + ' ' + p).length > 200 && cur) { out.push(cur); cur = p; }
      else cur = cur ? cur + ' ' + p : p;
    }
    if (cur) out.push(cur);
    return out;
  }

  function cancel() {
    if (supported) synth.cancel();
  }

  function speak(text, opts) {
    if (!supported || !text) return false;
    opts = opts || {};
    var J = root.Jarvis;
    var clean = J && J.toSpeech ? J.toSpeech(text) : String(text);
    synth.cancel();
    var list = chunks(clean);
    for (var i = 0; i < list.length; i++) {
      var u = new root.SpeechSynthesisUtterance(list[i]);
      u.lang = voice ? voice.lang : 'es-ES';
      if (voice) u.voice = voice;
      u.rate = opts.rate || 1.05;
      u.pitch = opts.pitch || 0.9;
      if (i === list.length - 1 && typeof opts.onend === 'function') u.onend = opts.onend;
      synth.speak(u);
    }
    // Chrome a veces deja la cola en pausa tras cancel(): se reanuda.
    if (synth.paused) synth.resume();
    return true;
  }

  root.JarvisVoice = {
    supported: supported,
    speak: speak,
    cancel: cancel,
    speaking: function () { return supported && synth.speaking; }
  };
})(typeof self !== 'undefined' ? self : this);
