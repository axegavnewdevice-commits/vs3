/* Arabic Scrabble word check. Works as a classic <script> (global WordCheck) and as a Node module (see wordlist.js).
 * Data: words.bin = a Bloom filter built from the AyaSpell Arabic dictionary (spelling reduced to the game's tile letters).
 * A word the list knows is always accepted; a word it does not know is accepted with a probability of about 0.01% (Bloom false-accept).
 * Accepted: the listed forms (base words, plurals, feminine, dual, verb conjugations, tanween, nisba) and ال + a listed word.
 * NOT accepted: the prefixes و ف ب ك ل س and attached pronouns (كتابهم، كتبته ...). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WordCheck = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DIAC = /[ً-ْٰـٕٔ]/g;
  function normalize(w) {
    w = String(w == null ? '' : w);
    if (w.normalize) w = w.normalize('NFKC');
    return w.replace(DIAC, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').trim();   // أ إ آ ٱ -> ا ,  ى -> ي ,  no diacritics / tatweel
  }
  function hash(s, seed) {
    var x = seed >>> 0;
    for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
    x ^= x >>> 15; x = Math.imul(x, 2246822507) >>> 0; x ^= x >>> 13; x = Math.imul(x, 3266489909) >>> 0; x ^= x >>> 16;
    return x >>> 0;
  }
  function load(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 16 || bytes[0] !== 0x41 || bytes[1] !== 0x57 || bytes[2] !== 0x4C || bytes[3] !== 0x31) throw new Error('words.bin: bad file');
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var m = dv.getUint32(4, true), k = bytes[8], n = dv.getUint32(12, true);
    function has(word) {                                           // exact word, already normalised
      var h1 = hash(word, 2166136261), h2 = (hash(word, 0x9747b28c) | 1) >>> 0;
      for (var i = 0; i < k; i++) {
        var idx = ((h1 + Math.imul(i, h2)) >>> 0) % m;
        if (!((bytes[16 + (idx >> 3)] >> (idx & 7)) & 1)) return false;
      }
      return true;
    }
    // Exact match, or ال + a listed word (المدرسة، الكتاب، الوحي، الكلام). ال alone is allowed because it is part of the same word.
    // Other prefixes (و ف ب ك ل س) and attached pronouns are NOT accepted. The word after ال must be 3+ letters (or one of a few real 2-letter nouns).
    // Real two-letter nouns that may follow ال (الأب، اليد، الدم، الفم ...). Hand-picked: the list also holds many 2-letter fragments.
    var NOUN2 = ' اب ام اخ يد دم فم فن حب بن اس رب حج حد حر حس حص خط ذم رد سم سن شر ضد طب عم عد غد فخ جد جن حل حي دب دن ذر زن سد سر شك صد عز غم مد نص هم ';
    function isValid(raw) {
      var w = normalize(raw);
      if (w.length < 2) return false;
      if (has(w)) return true;
      if (w.indexOf('ال') === 0) {
        if (w.length >= 5 && has(w.slice(2))) return true;
        if (w.length === 4 && NOUN2.indexOf(' ' + w.slice(2) + ' ') >= 0 && has(w.slice(2))) return true;
      }
      return false;
    }
    /** words: array of strings. Returns the list of words that are NOT valid (empty array = all fine). */
    function invalidWords(words) { return (words || []).filter(function (x) { return !isValid(x); }); }
    return { isValid: isValid, invalidWords: invalidWords, has: has, count: n, bits: m, hashes: k };
  }
  return { load: load, normalize: normalize };
});
