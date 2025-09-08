import type { QuestionRow } from "./question.service.js";

export interface RefLink {
  title: string;
  url: string;
}

export function inferReference(q: QuestionRow): RefLink | null {
  const hay: string = `${q.text}\n${q.code_snippet ?? ""}`.toLowerCase();

  const map: Array<[RegExp, RefLink]> = [
    // Objects & props
    [/object\.create/, mdn("Object/create")],
    [/defineproperty|property descriptor/, mdn("Object/defineProperty")],
    [/freeze/, mdn("Object/freeze")],
    [/seal/, mdn("Object/seal")],
    [/preventextensions/, mdn("Object/preventExtensions")],
    [/assign/, mdn("Object/assign")],
    [/hasownproperty|own property/, mdn("Object/hasOwnProperty")],
    [/\bfor\.\.\.in\b/, mdn("Statements/for...in")],
    [/json\.stringify/, mdn("JSON/stringify")],
    // Classes
    [/\bclass\b.*extends|\bsuper\(/, mdn("Classes")],
    [/#\w+/, mdn("Classes/Private_class_fields")],
    [/\bstatic\b.*\bblock\b/, mdn("Classes/static_initialization_blocks")],
    // Built-ins (Array, Map/Set, Promise, String, Number)
    [/\barray\.prototype\.map|\b\.map\(/, mdn("Array/map")],
    [/\bflat\(/, mdn("Array/flat")],
    [/\bat\(/, mdn("Array/at")],
    [/\bmap\b(?!\()/, mdn("Map")],
    [/\bset\b(?!\()/, mdn("Set")],
    [/weakmap/, mdn("WeakMap")],
    [/promise\.allsettled/, mdn("Promise/allSettled")],
    [/promise\.any/, mdn("Promise/any")],
    [/promise\.all(?!settled)/, mdn("Promise/all")],
    [/promise\.race/, mdn("Promise/race")],
    [/string\.prototype\.slice|substring|substr/, mdn("String")],
    [/number\.isnan|\bisnan\(/, mdn("Number/isNaN")],
    [/reflect\./, mdn("Reflect")],
    [/json\.parse/, mdn("JSON/parse")],
    // Advanced functions
    [/closure|scope|iife/, mdn("Closures")],
    [/generator|function\*/, mdn("Generators")],
    [/async\/await|await\b/, mdn("Statements/async_function")],
    [/bind\(/, mdn("Function/bind")],
    [
      /throttle|debounce/,
      {
        title: "Debounce vs Throttle (MDN guide)",
        url: "https://developer.mozilla.org/en-US/docs/Glossary/Throttling",
      },
    ],
  ];

  for (const [re, link] of map) {
    if (re.test(hay)) return link;
  }
  return null;
}

function mdn(path: string): RefLink {
  const title = `MDN — ${
    path.replace(/_/g, " ").split("/").pop() ?? "Reference"
  }`;
  return {
    title,
    url: `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/${path}`,
  };
}
