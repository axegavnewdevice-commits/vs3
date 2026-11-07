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
    // Standalone two-letter words: the dictionary holds hundreds of 2-letter fragments that are not words (e.g. بؤ، تذ، شص), so a 2-letter move is accepted
    // only if it is on this hand-checked list of real Arabic words AND the dictionary knows it (this list can only remove words, never add one).
    // اب ام ان اخ are deliberately NOT on the list: the game has no أ tile and plain ا is not أ (owner's rule).
    var WORD2 = ' ات اذ ار اس اف اه او اي بت بث بح بخ بر بط بع بق بك بل بن به بي تب تل تم ته تو ثب ثج ثر ثق ثم جئ جب جد جذ جر جز جس جص جف جل جم جن جو حب حت حث حج حد حر حز حس حش حص حض حط حظ حق حك حل حم حن حي خب خد خذ خر خز خس خص خض خط خف خل خن دب در دس دع دف دق دك دل دم دن ذا ذب ذر ذق ذل ذم ذو ذي رب رث رج رخ رد رز رس رش رص رض رف رق رم رن ري زج زد زر زف زق زل زم زن زي سب ست سح سد سر سك سل سم سن شب شج شح شد شذ شر شط شف شق شك شل شم صب صح صد صر صغ صف صك صل صم صن صه ضب ضج ضخ ضد ضر ضع ضل ضم ضن طب طر طف طل طم طن طي ظل ظن عج عد عز عس عش عض عظ عف عق عم عن عي غب غث غد غر غش غص غض غط غل غم غن غي فئ فت فج فخ فذ فر فش فص فض فظ فك فل فم فن في قئ قح قد قر قس قش قص قط قف قل قم كب كد كر كف كل كم كن كي لا لب لذ لص لط لف لك لم لن له لو لي ما مت مج مخ مد مذ مر مس مص مط مع مل من مه نث ند نر نص نط نق نل نم ها هب هد هر هز هش هل هم هن هو هي ود ول يا يد يم ';
    // BLOCKLIST: words the owner declared invalid (game spelling, any length). Refused always. A blocked word of 3+ letters is also refused with ال in front.
    var BLOCKED = ' ال اخو اخت اخوان اكل اسلام احسان افضل احسن انا انت انتم انتما انتن الم طسم كهيعص يس طه امة اليس ام اب ان اخ الاب الام الاخ الان الارض الاخير الاخري الاخرة الاخيرة دؤب اخير اخري اخرة اخيرة ابو امي اصل اباء امهات ابوان امان اختان اخوات اخوة ابي الي اخي اختي اذن اذني اذان انف انفي الف اليف اذنان انفان امر امران امور امراء اخوي اخوك اخوكم اخوكن اخونا اخوه اخوهم اخوهن اخوها اخوهما اختك اختكم اختكن اختها اخته اختهن اختهم اختهما اخذ ااب ااد ااس ااف اال اان ابا ابت ابث ابح ابخ ابد ابر ابز ابس ابش ابض ابط ابع ابل ابه ابئ ابؤ اتا اتب اتت اتح اتد اتر اتض اتف اتم اتن اته اتو اتي اثا اثب اثث اثج اثد اثر اثغ اثف اثق اثل اثم اثن اثو اجا اجب اجة اجت اجث اجج اجح اجد اجذ اجس اجش اجص اجع اجف اجل اجم اجن اجه اجو اجي اجئ احا احب احت احث احج احح احد احذ احر احز احس احش احص احض احط احظ احف احق احك احل احم احن اخا اخب اخد اخر اخز اخس اخص اخض اخط اخف اخل اخم اخن ادا ادب ادت ادث ادج ادح ادد ادر ادس ادش ادص ادف ادق ادك ادل ادم اده ادو ادي اذا اذب اذت اذح اذد اذر اذع اذف اذق اذك اذل اذم اذه اذو اذي ارا ارب ارت ارث ارج ارح ارخ ارد ارذ ارر ارز ارس ارش ارص ارض ارط ارع ارغ ارف ارك ارن اره اري ارئ ازا ازب ازة ازج ازح ازخ ازد ازر ازع ازغ ازف ازق ازك ازل ازم ازن ازه ازو ازي اسا اسب اسة اسج اسح اسخ اسد اسر اسس اسط اسغ اسف اسك اسل اسن اسه اسو اسي اسئ اسؤ اشا اشب اشت اشج اشح اشخ اشد اشذ اشر اشص اشط اشظ اشع اشق اشك اشل اشم اشن اشه اشي اشؤ اصب اصت اصح اصخ اصد اصر اصص اصع اصغ اصف اصك اصم اصن اصو اضا اضب اضت اضج اضح اضخ اضد اضر اضض اضع اضغ اضف اضق اضل اضم اضن اضه اضو اضي اضئ اضؤ اطا اطب اطح اطد اطر اطس اطش اطع اطغ اطف اطق اطل اطم اطن اطه اظب اظر اظف اظل اظم اظن اعب اعت اعث اعج اعد اعذ اعر اعز اعس اعش اعص اعض اعط اعظ اعق اعك اعل اعم اعن اعي اغب اغث اغذ اغر اغس اغش اغص اغض اغط اغظ اغف اغق اغل اغم اغن اغو افا افة افت افج افح افخ افذ افر افز افس افش افص افض افظ افف افق افك افل افن افه افو افي افئ اقا اقب اقت اقث اقح اقد اقذ اقر اقز اقس اقش اقص اقط اقظ اقع اقق اقل اقم اقن اقو اقي اقئ اكب اكت اكث اكح اكد اكر اكز اكس اكش اكظ اكف اكم اكن الا الب الة الت الث الج الح الخ الد الذ الز الص الط الظ الع الغ الك الن اله الو اما امت امث امج امد امز امس امص امض امط امع امق امك امل امم امن امه امو امؤ انب انة انث انح انخ اند انر انز انس انش انص انض انط انع انغ انق انك انل انم انن اني انئ انؤ اها اهب اهة اهت اهث اهج اهذ اهر اهز اهس اهش اهص اهض اهط اهف اهل اهم اهن اهي اهئ اوا اوب اوت اوج اوح اوخ اود اوذ اور اوز اوس اوش اوص اوط اوع اوف اوق اول اون اوه اوو اوي اوء ايا اية ايد اير ايس ايك ايل ايم اين ايه ايي ائب ائج ائد ائذ ائر ائس ائض ائف ائل ائم ائن ائو ائي اؤب اؤت اؤح اؤد اؤر اؤس اؤض اؤف اؤل اؤم اؤن اؤو ';
    // ALLOWLIST: words the owner declared valid even if the dictionary does not know them (game spelling, any length). A blocked word is never allowed. An allowed word of 3+ letters is also accepted with ال in front.
    var ALLOWED = ' طئ سقاف ';
    function isValid(raw) {
      // TILE RULES (hamza has two tiles): the connecting tile (ئـ) can never end a word, and the plain tile (ئ) can only end a word (never be followed by another letter).
      var rawText = String(raw == null ? '' : raw);
      if (/ئـ\s*$/.test(rawText)) return false;
      if (/ئ[^ـ\s]/.test(rawText)) return false;
      var w = normalize(raw);
      if (w.length < 2) return false;
      if (BLOCKED.indexOf(' ' + w + ' ') >= 0) return false;
      if (w.length > 4 && w.charAt(0) === 'ا' && w.charAt(1) === 'ل' && BLOCKED.indexOf(' ' + w.slice(2) + ' ') >= 0) return false;
      if (ALLOWED.indexOf(' ' + w + ' ') >= 0) return true;
      if (w.length > 4 && w.charAt(0) === 'ا' && w.charAt(1) === 'ل' && ALLOWED.indexOf(' ' + w.slice(2) + ' ') >= 0) return true;
      if (w.length === 2) return WORD2.indexOf(' ' + w + ' ') >= 0 && has(w);
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
