import type { GrammarPack } from "./types.js";
import { UNIT_DATA as presentSimpleS } from "./units/present-simple-s.js";
import { UNIT_DATA as articlesAAn } from "./units/articles-a-an.js";
import { UNIT_DATA as articlesThe } from "./units/articles-the.js";
import { UNIT_DATA as doDoesDid } from "./units/do-does-did.js";
import { UNIT_DATA as pastSimple } from "./units/past-simple.js";
import { UNIT_DATA as goWentGone } from "./units/go-went-gone.js";
import { UNIT_DATA as prepositionsTime } from "./units/prepositions-time.js";
import { UNIT_DATA as comparatives } from "./units/comparatives.js";
import { UNIT_DATA as muchMany } from "./units/much-many.js";
import { UNIT_DATA as modalsBasic } from "./units/modals-basic.js";
import { UNIT_DATA as presentPerfectBasic } from "./units/present-perfect-basic.js";

const ALL = [
  presentSimpleS,
  articlesAAn,
  articlesThe,
  doDoesDid,
  pastSimple,
  goWentGone,
  prepositionsTime,
  comparatives,
  muchMany,
  modalsBasic,
  presentPerfectBasic,
];

export const GRAMMAR_PACK: GrammarPack = {
  units: ALL.map((d) => d.unit),
  items: ALL.flatMap((d) => d.items),
};
