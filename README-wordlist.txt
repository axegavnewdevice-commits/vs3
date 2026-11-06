words.bin    - Bloom-filter word list, 533,860 Arabic word forms (1.3 MB). Used to refuse moves with unknown words (server: wordlist.js, local game: wordcheck.js).
wordcheck.js - WordCheck.load(arrayBuffer).isValid('المدرسة')
Accepts: listed words (base, plurals, feminine, dual, verb conjugations, tanween, nisba) AND ال + a listed word.
Rejects: other prefixes (و ف ب ك ل س) and the dictionary's attached-pronoun groups (كتابهم، كتبته ...).
Known leftovers: forms ending in ي or نا that are also real grammar (ذهبنا, معلمي) and a few entries that already
contain a pronoun (ولدي, بيتنا).
Measured: 0 of 533,860 words missed; ال + real word 100% accepted; ~0.011% of random nonsense accepted.

Source: AyaSpell Arabic Hunspell dictionary by Taha Zerrouki and Mohamed Kebdani,
tri-licensed GPL 2.0 / LGPL 2.1 / MPL 1.1 (see AYASPELL-COPYING.txt, AYASPELL-AUTHORS.txt). https://github.com/linuxscout/ayaspell
words.bin is derived from it. Keep this credit with the file. Not legal advice.
