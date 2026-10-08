import { getSetting, setSetting } from "./db.js";

/* =========================================================
   JadoMovie - Premium Emoji Style Engine
   ========================================================= */

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* ---------------------------------------------------------
   Telegram custom emoji
   --------------------------------------------------------- */

function customEmoji(id, fallback = "🙂") {
  if (!id) return fallback;

  return `<tg-emoji emoji-id="${esc(id)}">${esc(fallback)}</tg-emoji>`;
}

/* ---------------------------------------------------------
   Telegram entity offsets use UTF-16
   --------------------------------------------------------- */

function utf16Length(text = "") {
  return Buffer.byteLength(String(text), "utf16le") / 2;
}

function utf16Slice(text = "", start = 0, end = Infinity) {
  const value = String(text);
  const buffer = Buffer.from(value, "utf16le");

  const startByte = Math.max(0, start) * 2;

  const endUnit =
    end === Infinity
      ? buffer.length / 2
      : Math.max(start, end);

  const endByte = endUnit * 2;

  return buffer
    .subarray(startByte, endByte)
    .toString("utf16le");
}

/* ---------------------------------------------------------
   Get exact text represented by an entity
   --------------------------------------------------------- */

function getEntityText(text, entity) {
  const start = entity.offset || 0;
  const end = start + (entity.length || 0);

  return utf16Slice(text, start, end);
}

/* ---------------------------------------------------------
   Get line information for an entity
   --------------------------------------------------------- */

function getLineInfo(text, entity) {
  const offset = entity.offset || 0;

  const before = utf16Slice(text, 0, offset);

  const lastNewLine = before.lastIndexOf("\n");

  const lineStart =
    lastNewLine === -1
      ? 0
      : lastNewLine + 1;

  const after = utf16Slice(text, offset);

  const nextNewLine = after.indexOf("\n");

  const lineEnd =
    nextNewLine === -1
      ? utf16Length(text)
      : offset + nextNewLine;

  const line = utf16Slice(
    text,
    lineStart,
    lineEnd
  );

  return {
    line,
    lineStart,
    lineEnd
  };
}

/* ---------------------------------------------------------
   Normalize text for detection
   --------------------------------------------------------- */

function normalizeText(text = "") {
  return String(text)
    .replaceAll("\u200c", " ")
    .replaceAll("\u200f", "")
    .replaceAll("\u202a", "")
    .replaceAll("\u202b", "")
    .replaceAll("\u202c", "")
    .replaceAll("\u2066", "")
    .replaceAll("\u2067", "")
    .replaceAll("\u2068", "")
    .replaceAll("\u2069", "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* =========================================================
   ROLE DETECTION
   ========================================================= */

function detectRoleFromLine(line) {
  const normalized = normalizeText(line);

  /*
   * مهم:
   * Channel قبل از film/movie بررسی می‌شود
   * تا @JadoMovie همیشه channel تشخیص داده شود.
   */

  if (
    normalized.includes("@jadomovie") ||
    normalized.includes("jadomovie")
  ) {
    return "channel";
  }

  if (normalized.includes("movie")) {
    return "film";
  }

  if (normalized.includes("محصول")) {
    return "country";
  }

  if (normalized.includes("ژانر")) {
    return "genre";
  }

  if (normalized.includes("خلاصه داستان")) {
    return "summary";
  }

  if (
    normalized.includes("زیرنویس") ||
    normalized.includes("چسبیده")
  ) {
    return "subtitle";
  }

  if (normalized.includes("دوبله")) {
    return "dubbed";
  }

  if (normalized.includes("فیلم")) {
    return "movie";
  }

  return null;
}

/* =========================================================
   CHANNEL DETECTION
   ---------------------------------------------------------
   این قسمت عمداً جدا نوشته شده تا ✈️ حتی اگر line parsing
   مشکل داشته باشد، از روی موقعیت @JadoMovie پیدا شود.
   ========================================================= */

function findChannelEntity(result, text) {
  const normalizedText = String(text || "");

  /*
   * پیدا کردن @JadoMovie با UTF-16
   */
  const lowerText = normalizedText.toLowerCase();

  const channelIndex = lowerText.indexOf("@jadomovie");

  if (channelIndex !== -1) {
    /*
     * تمام entityهایی که قبل از @JadoMovie قرار دارند.
     */
    const candidates = result
      .filter(item => {
        const itemEnd =
          item.offset + item.length;

        return (
          item.offset < channelIndex &&
          itemEnd <= channelIndex
        );
      })
      .filter(item => {
        const normalizedLine =
          normalizeText(item.line);

        return (
          normalizedLine.includes("jadomovie") ||
          normalizedLine.includes("@")
        );
      })
      .sort((a, b) => {
        const distanceA =
          channelIndex -
          (a.offset + a.length);

        const distanceB =
          channelIndex -
          (b.offset + b.length);

        return distanceA - distanceB;
      });

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  /*
   * fallback:
   * اگر @JadoMovie مستقیماً پیدا نشد،
   * هر entity روی خطی که JadoMovie دارد.
   */

  const fallback = result
    .filter(item => {
      const normalizedLine =
        normalizeText(item.line);

      return (
        normalizedLine.includes("jadomovie") ||
        normalizedLine.includes("@jado")
      );
    })
    .sort((a, b) => a.offset - b.offset);

  if (fallback.length > 0) {
    /*
     * معمولاً اولین Premium Emoji در این خط همان ✈️ است.
     */
    return fallback[0];
  }

  return null;
}

/* =========================================================
   PARSE CUSTOM EMOJI ENTITIES
   ========================================================= */

export function parseCustomEmojiEntities(
  text,
  entities = []
) {
  if (!text) return [];

  /*
   * فقط Premium / Custom Emoji
   */
  const customEntities = entities
    .filter(
      entity =>
        entity &&
        entity.type === "custom_emoji" &&
        entity.custom_emoji_id
    )
    .sort(
      (a, b) =>
        (a.offset || 0) -
        (b.offset || 0)
    );

  const result = [];

  for (const entity of customEntities) {
    const lineInfo =
      getLineInfo(text, entity);

    const fallback =
      getEntityText(text, entity) || "🙂";

    result.push({
      id: String(entity.custom_emoji_id),

      fallback,

      offset: entity.offset || 0,

      length: entity.length || 0,

      line: lineInfo.line,

      lineStart: lineInfo.lineStart,

      lineEnd: lineInfo.lineEnd,

      name: null
    });
  }

  /* =======================================================
     MOVIE LINE
     -------------------------------------------------------
     نمونه:
     🎞 | Movie : Runner 🌹 6.6

     اولی = film
     دومی = imdb
     ======================================================= */

  const movieLine = result
    .filter(item =>
      normalizeText(item.line)
        .includes("movie")
    )
    .sort(
      (a, b) =>
        a.offset - b.offset
    );

  if (movieLine.length >= 1) {
    movieLine[0].name = "film";
  }

  if (movieLine.length >= 2) {
    movieLine[1].name = "imdb";
  }

  /* =======================================================
     CHANNEL
     -------------------------------------------------------
     اول از همه به صورت دقیق پیدا می‌کنیم.
     ======================================================= */

  const channelEntity =
    findChannelEntity(result, text);

  if (
    channelEntity &&
    !channelEntity.name
  ) {
    channelEntity.name = "channel";
  }

  /* =======================================================
     OTHER ROLES
     ======================================================= */

  for (const item of result) {
    if (item.name) continue;

    const role =
      detectRoleFromLine(item.line);

    if (role) {
      item.name = role;
    }
  }

  /* =======================================================
     MOVIE FALLBACK
     ======================================================= */

  for (const item of result) {
    if (item.name) continue;

    const normalized =
      normalizeText(item.line);

    if (normalized.includes("فیلم")) {
      item.name = "movie";
      break;
    }
  }

  /* =======================================================
     DOWNLOAD EMOJIS
     -------------------------------------------------------
     خط:
     ⬇️(برای دانلود اینجا کلیک کنید) ➡️
     
     اولی = downloadDown
     دومی = downloadNext
     ======================================================= */

  const downloadLines = result
    .filter(item =>
      normalizeText(item.line)
        .includes("برای دانلود")
    )
    .sort(
      (a, b) =>
        a.offset - b.offset
    );

  for (const item of downloadLines) {
    const sameLine = result
      .filter(other =>
        other.line === item.line
      )
      .sort(
        (a, b) =>
          a.offset - b.offset
      );

    if (
      sameLine.length >= 1 &&
      !sameLine[0].name
    ) {
      sameLine[0].name =
        "downloadDown";
    }

    if (
      sameLine.length >= 2 &&
      !sameLine[1].name
    ) {
      sameLine[1].name =
        "downloadNext";
    }
  }

  /* =======================================================
     FINAL CHANNEL FALLBACK
     ======================================================= */

  for (const item of result) {
    if (item.name) continue;

    const normalized =
      normalizeText(item.line);

    if (
      normalized.includes("@jadomovie") ||
      normalized.includes("jadomovie")
    ) {
      item.name = "channel";
      break;
    }
  }

  return result;
}

/* =========================================================
   SAVE PREMIUM EMOJI SAMPLE
   ========================================================= */

export async function saveEmojiSample(ctx) {
  const message = ctx?.message;

  if (!message) {
    return [];
  }

  /*
   * پیام معمولی یا caption
   */
  const text =
    message.text ||
    message.caption ||
    "";

  if (!text) {
    return [];
  }

  /*
   * Telegram ممکن است entity را در یکی از این دو قرار دهد.
   */
  const entities =
    message.entities ||
    message.caption_entities ||
    [];

  const parsed =
    parseCustomEmojiEntities(
      text,
      entities
    );

  if (!parsed.length) {
    console.log(
      "JadoMovie: No custom emoji entities found."
    );

    return [];
  }

  const style = {};

  /*
   * فقط اولین emoji هر role ذخیره شود.
   */
  for (const item of parsed) {
    if (
      !item.name ||
      !item.id
    ) {
      continue;
    }

    if (!style[item.name]) {
      style[item.name] = {
        id: item.id,
        fallback:
          item.fallback
      };
    }
  }

  /* =======================================================
     LOG
     ======================================================= */

  console.log("");
  console.log(
    "============================================"
  );
  console.log(
    "JadoMovie Premium Emoji Analysis"
  );
  console.log(
    "============================================"
  );

  const names = [
    "movie",
    "film",
    "imdb",
    "country",
    "genre",
    "summary",
    "subtitle",
    "downloadDown",
    "downloadNext",
    "dubbed",
    "channel"
  ];

  for (const name of names) {
    if (style[name]) {
      console.log(
        `${name}: PREMIUM -> ${style[name].id} -> ${style[name].fallback}`
      );
    } else {
      console.log(
        `${name}: NOT FOUND`
      );
    }
  }

  console.log(
    "============================================"
  );

  /*
   * ذخیره در PostgreSQL
   */
  await setSetting(
    "emoji_style",
    style
  );

  return parsed;
}

/* =========================================================
   GET SAVED STYLE EMOJI
   ========================================================= */

function getStyleEmoji(
  style,
  name,
  fallback
) {
  const item =
    style?.[name];

  if (
    item &&
    item.id
  ) {
    return customEmoji(
      item.id,
      item.fallback ||
        fallback
    );
  }

  return fallback;
}

/* =========================================================
   BUILD FINAL MOVIE CAPTION
   ========================================================= */

export async function buildCaption(movie) {
  const style =
    await getSetting(
      "emoji_style",
      {}
    );

  /* -------------------------------------------------------
     Premium Emoji
     ------------------------------------------------------- */

  const movieEmoji =
    getStyleEmoji(
      style,
      "movie",
      "🎞️"
    );

  const filmEmoji =
    getStyleEmoji(
      style,
      "film",
      "🎞️"
    );

  const imdbEmoji =
    getStyleEmoji(
      style,
      "imdb",
      "🌹"
    );

  const countryEmoji =
    getStyleEmoji(
      style,
      "country",
      "🌎"
    );

  const genreEmoji =
    getStyleEmoji(
      style,
      "genre",
      "🎭"
    );

  const summaryEmoji =
    getStyleEmoji(
      style,
      "summary",
      "💬"
    );

  const subtitleEmoji =
    getStyleEmoji(
      style,
      "subtitle",
      "✍️"
    );

  const downloadDownEmoji =
    getStyleEmoji(
      style,
      "downloadDown",
      "⬇️"
    );

  const downloadNextEmoji =
    getStyleEmoji(
      style,
      "downloadNext",
      "➡️"
    );

  const dubbedEmoji =
    getStyleEmoji(
      style,
      "dubbed",
      "🎤"
    );

  const channelEmoji =
    getStyleEmoji(
      style,
      "channel",
      "✈️"
    );

  const lines = [];

  /* =======================================================
     MOVIE
     ======================================================= */

  lines.push(
    `${movieEmoji} <b>| فیلم : ${esc(
      movie.faTitle
    )} ${esc(movie.year)}</b>`
  );

  /* =======================================================
     MOVIE ENGLISH + IMDb
     ======================================================= */

  lines.push(
    `${filmEmoji}<b>| Movie : ${esc(
      movie.enTitle
    )}</b>  ${imdbEmoji} <b>${esc(
      movie.imdb
    )}</b>`
  );

  /* =======================================================
     COUNTRY
     ======================================================= */

  lines.push(
    `${countryEmoji}<b>| محصول : ${esc(
      movie.country
    )}</b>`
  );

  /* =======================================================
     GENRE
     ======================================================= */

  lines.push(
    `${genreEmoji}<b>| ژانر : ${esc(
      movie.genre
    )}</b>`
  );

  lines.push("");

  /* =======================================================
     SUMMARY
     ======================================================= */

  lines.push(
    `<blockquote>${summaryEmoji} <b>| خلاصه داستان:${esc(
      movie.summary
    )}</b></blockquote>`
  );

  /* =======================================================
     LINKS
     ======================================================= */

  const links =
    Array.isArray(movie.links)
      ? movie.links
      : [];

  const subtitleLinks =
    links.filter(
      item =>
        item.type === "subtitle"
    );

  const dubbedLinks =
    links.filter(
      item =>
        item.type === "dubbed"
    );

  /* =======================================================
     SUBTITLE
     ======================================================= */

  if (subtitleLinks.length) {
    lines.push("");

    lines.push(
      `${subtitleEmoji}<b>زیرنویس چسبیده:</b>`
    );

    for (const item of subtitleLinks) {
      lines.push(
        `${downloadDownEmoji}(<b><a href="${esc(
          item.url
        )}">برای دانلود اینجا کلیک کنید</a></b>) ${downloadNextEmoji}`
      );
    }
  }

  /* =======================================================
     DUBBED
     ======================================================= */

  if (dubbedLinks.length) {
    lines.push("");

    lines.push(
      `${dubbedEmoji}<b>دوبله فارسی:</b>`
    );

    for (const item of dubbedLinks) {
      lines.push(
        `${downloadDownEmoji}(<b><a href="${esc(
          item.url
        )}">برای دانلود اینجا کلیک کنید</a></b>) ${downloadNextEmoji}`
      );
    }
  }

  /* =======================================================
     CHANNEL
     ======================================================= */

  const channelId =
    await getSetting(
      "channel_id",
      null
    );

  if (channelId) {
    lines.push("");

    lines.push(
      `${channelEmoji}<b>${esc(
        channelId
      )}</b>`
    );
  }

  /* =======================================================
     FINAL CAPTION
     ======================================================= */

  return lines.join("\n");
}
