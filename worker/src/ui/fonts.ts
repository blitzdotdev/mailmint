// Self-hosted fonts (SIL OFL 1.1, see ./fonts/LICENSE.txt). Geist is the dashboard face (as in
// cf-mailroom); Inter + Newsreader Italic set the landing page (as on agentsocket.dev).
import geist from "./fonts/geist.woff2";
import inter from "./fonts/inter.woff2";
import newsreaderItalic from "./fonts/newsreader-italic.woff2";

export const FONTS: Record<string, ArrayBuffer> = {
  "geist.woff2": geist,
  "inter.woff2": inter,
  "newsreader-italic.woff2": newsreaderItalic,
};
