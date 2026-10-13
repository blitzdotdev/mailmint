// Worst-case inputs at the size caps must stay fast: the email() handler shares a CPU budget.
import assert from "node:assert/strict";
import { test } from "node:test";
import { extract } from "../src/extract/index.ts";
import { parseHtml } from "../src/extract/html.ts";

const CAP = 600_000;
const fill = (unit) => unit.repeat(Math.ceil(CAP / unit.length)).slice(0, CAP);

const cases = {
  "unclosed tags": { html: fill("<a ") },
  "unclosed quoted attrs": { html: fill('<a href="') },
  "font-family soup": { html: '<b style="' + fill("font-family:") + '">x</b>' },
  "unclosed comments": { html: fill("<!--") },
  "unclosed style": { html: fill("<style>") },
  "unclosed head": { html: fill("<head>") },
  "deep nesting": { html: fill("<div><b>") },
  "bare-url parens": { text: "https://a.example/" + ")".repeat(CAP) },
  "many urls": { text: fill("https://a.example/x ") },
  "many digits": { text: fill("code 123456 ") },
  "lt soup": { html: fill("<") },
};

for (const [name, input] of Object.entries(cases)) {
  test(`fast on ${name}`, () => {
    const started = performance.now();
    extract({ subject: "", text: input.text ?? null, html: input.html ?? null });
    if (input.html) parseHtml(input.html);
    const ms = performance.now() - started;
    assert.ok(ms < 1500, `${name}: ${ms.toFixed(0)}ms`);
  });
}

test("unclosed <head> keeps the body text; unclosed <style> hides the rest", () => {
  assert.match(parseHtml("<head><title>t</title><p>Your code is 123456</p>").text, /123456/);
  assert.doesNotMatch(parseHtml("<p>a</p><style>.x{color:red} 999999").text, /999999/);
  assert.doesNotMatch(parseHtml("<p>a</p><!-- hidden 777777").text, /777777/);
});
