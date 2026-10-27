import { iso6393 } from "iso-639-3";

export type LanguageCode = string;

export const LANGUAGE_OPTIONS = iso6393.map((language) => ({
  code: language.iso6391 ?? language.iso6393,
  name: language.name,
}));

const languageCodeSet = new Set(
  iso6393.flatMap((language) => [
    language.iso6393,
    ...(language.iso6391 ? [language.iso6391] : []),
  ]),
);

const rtlLanguageCodes = new Set([
  "ar",
  "arb",
  "arz",
  "ckb",
  "dv",
  "fa",
  "he",
  "ks",
  "ps",
  "sd",
  "ug",
  "ur",
  "yi",
]);

export function isLanguageCode(value: string | null): value is LanguageCode {
  return value !== null && languageCodeSet.has(value);
}

export function isRtlLanguage(value: string): boolean {
  return rtlLanguageCodes.has(value);
}
