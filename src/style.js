import { getSetting, setSetting } from "./db.js";

/*
 * ============================================================
 * JadoMovie - Premium Emoji Style Engine
 * ============================================================
 *
 * Premium Emoji mapping:
 *
 * movie         = 🎞️
 * film          = 🎞️
 * imdb          = 🌹
 * country       = 🌎
 * genre         = 🎭
 * summary       = 💬
 * subtitle      = ✍️
 * downloadDown  = ⬇️
 * downloadNext  = ➡️
 * dubbed        = 🎤
 * channel       = ✈️
 *
 * IMPORTANT:
 * Only Telegram custom_emoji entities are saved.
 * Normal Unicode emojis are NOT saved as Premium Emoji.
 * ============================================================
 */


/* ============================================================
   HTML ESCAPE
   ============================================================ */

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}


/* ============================================================
   CREATE TELEGRAM PREMIUM EMOJI
   ============================================================ */

function customEmoji(id, fallback = "🙂") {
  if (!id) {
    return fallback;
  }

  return `<tg-emoji emoji-id="${esc(id)}">${esc(fallback)}</tg-emoji>`;
}


/* ============================================================
   UTF-16 HELPERS
   ============================================================ */

/*
 * Telegram MessageEntity offset/length
 * بر اساس UTF-16 است.
 */

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


/* ============================================================
   ENTITY TEXT
   ============================================================ */

function getEntityText(text, entity) {
  const start = entity.offset || 0;
  const end = start + (entity.length || 0);

  return utf16Slice(text, start, end);
}


/* ============================================================
   FIND LINE OF ENTITY
   ============================================================ */

function getLineInfo(text, entity) {
  const offset = entity.offset || 0;

  const before = utf16Slice(
    text,
    0,
    offset
  );

  const lastNewLine = before.lastIndexOf("\n");

  const lineStart =
    lastNewLine === -1
      ? 0
      : lastNewLine + 1;

  const after = utf16Slice(
    text,
    offset
  );

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


/* ============================================================
   NORMALIZE TEXT
   ============================================================ */

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


/* ============================================================
   DETECT EMOJI ROLE
   ============================================================ */

function detectRoleFromLine(line) {
  const normalized = normalizeText(line);

  /* -------------------------
     Movie
     ------------------------- */

  if (normalized.includes("movie")) {
    return "film";
  }


  /* -------------------------
     Country
     ------------------------- */

  if (normalized.includes("محصول")) {
    return "country";
  }


  /* -------------------------
     Genre
     ------------------------- */

  if (normalized.includes("ژانر")) {
    return "genre";
  }


  /* -------------------------
     Summary
     ------------------------- */

  if (normalized.includes("خلاصه داستان")) {
    return "summary";
  }


  /* -------------------------
     Subtitle
     ------------------------- */

  if (
    normalized.includes("زیرنویس") ||
    normalized.includes("چسبیده")
  ) {
    return "subtitle";
  }


  /* -------------------------
     Dubbed
     ------------------------- */

  if (normalized.includes("دوبله")) {
    return "dubbed";
  }


  /* -------------------------
     Channel
     ------------------------- */

  if (
    normalized.includes("@jadomovie") ||
    normalized.includes("jadomovie")
  ) {
    return "channel";
  }


  /* -------------------------
     Movie / Film
     ------------------------- */

  if (normalized.includes("فیلم")) {
    return "movie";
  }


  return null;
}


/* ============================================================
   PARSE PREMIUM EMOJIS
   ============================================================ */

export function parseCustomEmojiEntities(
  text,
  entities = []
) {
  if (!text) {
    return [];
  }


  /*
   * فقط Premium Emoji واقعی.
   *
   * اگر entity نوع custom_emoji نباشد
   * اصلاً وارد سیستم نمی‌شود.
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
      getLineInfo(
        text,
        entity
      );


    const fallback =
      getEntityText(
        text,
        entity
      ) || "🙂";


    result.push({
      id: String(
        entity.custom_emoji_id
      ),

      fallback,

      offset:
        entity.offset || 0,

      length:
        entity.length || 0,

      line:
        lineInfo.line,

      name: null
    });
  }


  /*
   * ==========================================================
   * STEP 1
   * Movie line
   *
   * مثال:
   *
   * 🎞 | Movie : Runner  🌹 6.6
   *
   * اولین Premium Emoji = film
   * دومین Premium Emoji = imdb
   * ==========================================================
   */

  const movieLine = result
    .filter(item =>
      normalizeText(
        item.line
      ).includes("movie")
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


  /*
   * ==========================================================
   * STEP 2
   * Detect normal sections
   * ==========================================================
   */

  for (const item of result) {
    if (item.name) {
      continue;
    }

    const role =
      detectRoleFromLine(
        item.line
      );

    if (role) {
      item.name = role;
    }
  }


  /*
   * ==========================================================
   * STEP 3
   * Movie title line
   *
   * 🎞 | فیلم : دونده 2026
   * ==========================================================
   */

  for (const item of result) {
    if (item.name) {
      continue;
    }

    const normalized =
      normalizeText(
        item.line
      );

    if (
      normalized.includes("فیلم")
    ) {
      item.name = "movie";
      break;
    }
  }


  /*
   * ==========================================================
   * STEP 4
   * Download arrows
   *
   * این دو ایموجی معمولاً در خط دانلود هستند:
   *
   * ⬇️(برای دانلود اینجا کلیک کنید) ➡️
   *
   * اگر Premium باشند، Telegram آن‌ها را
   * به عنوان custom_emoji entity می‌فرستد.
   * ==========================================================
   */

  const downloadLines = result
    .filter(item =>
      normalizeText(
        item.line
      ).includes(
        "برای دانلود"
      )
    )
    .sort(
      (a, b) =>
        a.offset - b.offset
    );


  for (const item of downloadLines) {
    /*
     * اولین Premium Emoji خط دانلود = ⬇️
     * دومین Premium Emoji = ➡️
     */

    const sameLine = result
      .filter(other => {
        return (
          other.line === item.line
        );
      })
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


  /*
   * ==========================================================
   * STEP 5
   * Detect channel emoji
   * ==========================================================
   */

  for (const item of result) {
    if (item.name) {
      continue;
    }

    const normalized =
      normalizeText(
        item.line
      );

    if (
      normalized.includes(
        "@jadomovie"
      ) ||
      normalized.includes(
        "jadomovie"
      )
    ) {
      item.name =
        "channel";
    }
  }


  return result;
}


/* ============================================================
   SAVE PREMIUM EMOJI SAMPLE
   ============================================================ */

export async function saveEmojiSample(ctx) {
  const message =
    ctx?.message;


  if (!message) {
    return [];
  }


  /*
   * متن پیام
   */

  const text =
    message.text ||
    message.caption ||
    "";


  if (!text) {
    return [];
  }


  /*
   * Telegram entities
   */

  const entities =
    message.entities ||
    message.caption_entities ||
    [];


  /*
   * استخراج Premium Emoji واقعی
   */

  const parsed =
    parseCustomEmojiEntities(
      text,
      entities
    );


  if (!parsed.length) {
    return [];
  }


  /*
   * Mapping نهایی
   */

  const style = {};


  /*
   * فقط Premium Emoji هایی که role
   * مشخص دارند ذخیره می‌شوند.
   */

  for (const item of parsed) {
    if (
      !item.name ||
      !item.id
    ) {
      continue;
    }


    /*
     * اگر یک role دوبار وجود داشته باشد،
     * اولین مورد معتبر نگه داشته می‌شود.
     */

    if (!style[item.name]) {
      style[item.name] = {
        id: item.id,
        fallback:
          item.fallback
      };
    }
  }


  /*
   * ==========================================================
   * LOG
   *
   * این بخش برای Render بسیار مهم است.
   * ==========================================================
   */

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
   * ذخیره در Database
   */

  await setSetting(
    "emoji_style",
    style
  );


  return parsed;
}


/* ============================================================
   GET SAVED PREMIUM EMOJI
   ============================================================ */

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


  /*
   * اگر Premium برای این بخش پیدا نشده،
   * fallback معمولی استفاده می‌شود.
   */

  return fallback;
}


/* ============================================================
   BUILD FINAL POST
   ============================================================ */

export async function buildCaption(movie) {
  const style =
    await getSetting(
      "emoji_style",
      {}
    );


  /*
   * Premium Emoji
   */

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


  /* ==========================================================
     FILM
     ========================================================== */

  lines.push(
    `${movieEmoji} <b>| فیلم : ${esc(movie.faTitle)} ${esc(movie.year)}</b>`
  );


  /* ==========================================================
     MOVIE + IMDb
     ========================================================== */

  lines.push(
    `${filmEmoji}<b>| Movie : ${esc(movie.enTitle)}</b>  ` +
    `${imdbEmoji} <b>${esc(movie.imdb)}</b>`
  );


  /* ==========================================================
     COUNTRY
     ========================================================== */

  lines.push(
    `${countryEmoji}<b>| محصول : ${esc(movie.country)}</b>`
  );


  /* ==========================================================
     GENRE
     ========================================================== */

  lines.push(
    `${genreEmoji}<b>| ژانر : ${esc(movie.genre)}</b>`
  );


  lines.push("");


  /* ==========================================================
     SUMMARY
     ========================================================== */

  /*
   * خلاصه داستان به صورت Quote واقعی Telegram
   */

  lines.push(
    `<blockquote>` +
      `${summaryEmoji} <b>| خلاصه داستان:${esc(movie.summary)}</b>` +
    `</blockquote>`
  );


  /*
   * ==========================================================
     DOWNLOAD LINKS
     ==========================================================
   */

  const links =
    Array.isArray(movie.links)
      ? movie.links
      : [];


  const subtitleLinks =
    links.filter(
      item =>
        item.type ===
        "subtitle"
    );


  const dubbedLinks =
    links.filter(
      item =>
        item.type ===
        "dubbed"
    );


  /* ==========================================================
     SUBTITLE
     ========================================================== */

  if (
    subtitleLinks.length
  ) {
    lines.push("");

    lines.push(
      `${subtitleEmoji}<b>زیرنویس چسبیده:</b>`
    );


    for (
      const item of subtitleLinks
    ) {
      lines.push(
        `${downloadDownEmoji}` +
        `(<b><a href="${esc(item.url)}">` +
        `برای دانلود اینجا کلیک کنید` +
        `</a></b>)` +
        ` ${downloadNextEmoji}`
      );
    }
  }


  /* ==========================================================
     DUBBED
     ========================================================== */

  if (
    dubbedLinks.length
  ) {
    lines.push("");

    lines.push(
      `${dubbedEmoji}<b>دوبله فارسی:</b>`
    );


    for (
      const item of dubbedLinks
    ) {
      lines.push(
        `${downloadDownEmoji}` +
        `(<b><a href="${esc(item.url)}">` +
        `برای دانلود اینجا کلیک کنید` +
        `</a></b>)` +
        ` ${downloadNextEmoji}`
      );
    }
  }


  /* ==========================================================
     CHANNEL
     ========================================================== */

  const channelId =
    await getSetting(
      "channel_id",
      null
    );


  if (channelId) {
    lines.push("");

    lines.push(
      `${channelEmoji}<b>${esc(channelId)}</b>`
    );
  }


  /*
   * تمام خطوط
   */

  return lines.join("\n");
}
