/* voice.js — speech-to-text using the browser Web Speech API.
 * Only TEXT leaves the device; the backend sends that text to OpenAI to parse.
 * Gracefully reports when unsupported (user can always type). */
(function () {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  BK.voice = {
    supported: !!SR,
    _rec: null,
    listening: false,

    /** start(onResult, onEnd, onError) — onResult(transcript, isFinal) */
    start: function (onResult, onEnd, onError) {
      if (!SR) { onError && onError('unsupported'); return; }
      var rec = new SR();
      rec.lang = 'en-IN';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      var finalText = '';
      rec.onresult = function (e) {
        var interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t; else interim += t;
        }
        onResult && onResult((finalText + interim).trim(), !!finalText);
      };
      rec.onerror = function (e) { BK.voice.listening = false; onError && onError(e.error || 'error'); };
      rec.onend = function () { BK.voice.listening = false; onEnd && onEnd(finalText.trim()); };
      BK.voice._rec = rec; BK.voice.listening = true;
      try { rec.start(); } catch (e) { BK.voice.listening = false; onError && onError('start-failed'); }
    },
    stop: function () { try { BK.voice._rec && BK.voice._rec.stop(); } catch (e) {} }
  };
})();
