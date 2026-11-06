/**
 * Server-side dictionary: every move is checked against it. Loads wordcheck.js + words.bin (a Bloom-filter word list built from AyaSpell,
 * see README-wordlist.txt) the first time a move is made, so cold starts of every other route are unaffected.
 * wordcheck.js is a classic-script/UMD file (the browser loads the same file), so it is evaluated here as a CommonJS module.
 */
import { readFileSync } from 'node:fs';
import { HttpError } from './service.js';

let checker = null;

function load() {
  if (checker) return checker;
  try {
    const src = readFileSync(new URL('./wordcheck.js', import.meta.url), 'utf8');
    const mod = { exports: {} };
    new Function('module', 'exports', src)(mod, mod.exports);
    checker = mod.exports.load(readFileSync(new URL('./words.bin', import.meta.url)));
  } catch (e) {
    console.error('word list could not be loaded:', e && e.message);
    throw new HttpError(500, 'wordlist_unavailable');
  }
  return checker;
}

/** true when `word` is accepted by the word list (exact word, or ال + word). */
export const isValidWord = (word) => load().isValid(word);
