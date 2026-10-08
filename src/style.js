import { getSetting, setSetting } from "./db.js";

/*
 * ============================================================
 * JadoMovie - Style Engine
 * ============================================================
 *
 * این فایل:
 *
 * 1. Premium Emoji های پیام نمونه را از entities واقعی تلگرام
 *    استخراج می‌کند.
 *
 * 2. هر Premium Emoji را بر اساس متن همان خط تشخیص می‌دهد.
 *
 * 3. برای هر بخش، custom_emoji_id واقعی را ذخیره می‌کند.
 *
 * 4. در زمان ساخت پست، همان ID واقعی را استفاده می‌کند.
 *
 * بخش‌ها:
 *
 * movie
 * film
 * imdb
 * country
 * genre
 * summary
 * subtitle
 * dubbed
 * channel
 *
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
   PREMIUM EMOJI
   ============================================================ */

function customEmoji(id, fallback = "🙂") {
  if (!id) {
    return fallback;
  }

  /*
   * Telegram custom emoji باید دقیقاً یک emoji معمولی
   * را به عنوان محتوای tg-emoji دریافت کند.
   */
  return `<tg-emoji emoji-id="${esc(id)}">${esc(fallback)}</tg-emoji>`;
}


/* ============================================================
   UTF-16 HELPERS
   ============================================================ */

/*
 * Telegram offset برای MessageEntity بر اساس UTF-16 است.
 *
 * بنابراین نباید از text[offset] یا Array.from(text)[offset]
 * برای پیدا کردن کاراکتر استفاده کنیم.
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
   گرفتن متن یک Entity
   ============================================================ */

function entityText(text, entity) {
  const start = entity.offset || 0;
  const end = start + (entity.length || 0);

  return utf16Slice(text, start, end);
}


/* ============================================================
   پیدا کردن خطی که Entity داخل آن قرار دارد
   ============================================================ */

function getLineInfo(text, entity) {
  const start = entity.offset || 0;

  const before = utf16Slice(text, 0, start);

  const lineStartCharIndex = before.lastIndexOf("\n");

  const lineStart =
    lineStartCharIndex === -1
      ? 0
      : lineStartCharIndex + 1;

  const after = utf16Slice(
    text,
    start
  );

  const newlineIndex = after.indexOf("\n");

  const lineEnd =
    newlineIndex === -1
      ? utf16Length(text)
      : start + newlineIndex;

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
   نرمال‌سازی متن برای تحلیل
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
   تشخیص بخش Premium Emoji
   ============================================================ */

function detectStyleName(line) {
  const normalized = normalizeText(line);

  /*
   * ترتیب این شرط‌ها مهم است.
   */

  // ----------------------------
  // Movie
  // ----------------------------

  if (
    normalized.includes("movie")
  ) {
    return "film";
  }


  // ----------------------------
  // IMDb
  // ----------------------------

  /*
   * خط Movie معمولاً شامل دو Premium Emoji است:
   *
   * 🎞 | Movie : Runner   🌹 6.6
   *
   * برای تشخیص IMDb از وجود امتیاز استفاده می‌کنیم.
   */

  if (
    /\b\d(?:[.,]\d)?\b/.test(normalized) &&
    (
      normalized.includes("movie") ||
      normalized.includes("imdb")
    )
  ) {
    return "imdb";
  }


  // ----------------------------
  // محصول
  // ----------------------------

  if (
    normalized.includes("محصول")
  ) {
    return "country";
  }


  // ----------------------------
  // ژانر
  // ----------------------------

  if (
    normalized.includes("ژانر")
  ) {
    return "genre";
  }


  // ----------------------------
  // خلاصه داستان
  // ----------------------------

  if (
    normalized.includes("خلاصه داستان")
  ) {
    return "summary";
  }


  // ----------------------------
  // زیرنویس
  // ----------------------------

  if (
    normalized.includes("زیرنویس") ||
    normalized.includes("چسبیده")
  ) {
    return "subtitle";
  }


  // ----------------------------
  // دوبله
  // ----------------------------

  if (
    normalized.includes("دوبله")
  ) {
    return "dubbed";
  }


  // ----------------------------
  // کانال
  // ----------------------------

  if (
    normalized.includes("@jadomovie") ||
    normalized.includes("jadomovie")
  ) {
    return "channel";
  }


  // ----------------------------
  // فیلم
  // ----------------------------

  if (
    normalized.includes("فیلم")
  ) {
    return "movie";
  }


  return null;
}


/* ============================================================
   تشخیص دقیق Premium Emoji های پیام نمونه
   ============================================================ */

export function parseCustomEmojiEntities(
  text,
  entities = []
) {
  if (!text) {
    return [];
  }

  const result = [];

  /*
   * فقط custom_emoji واقعی را قبول می‌کنیم.
   *
   * Emoji معمولی بدون custom_emoji_id اینجا وارد نمی‌شود.
   */
  const customEntities = entities.filter(
    entity =>
      entity &&
      entity.type === "custom_emoji" &&
      entity.custom_emoji_id
  );


  for (const entity of customEntities) {
    const { line } = getLineInfo(text, entity);

    const rawEmoji = entityText(text, entity);

    /*
     * برای custom emoji باید دقیقاً همان کاراکتر جایگزین
     * داخل entity باشد.
     */
    result.push({
      id: String(entity.custom_emoji_id),
      fallback: rawEmoji || "🙂",
      offset: entity.offset || 0,
      length: entity.length || 0,
      line,
      name: null
    });
  }


  /*
   * ----------------------------------------------------------
   * Movie line
   * ----------------------------------------------------------
   *
   * مثال:
   *
   * 🎞 | فیلم : دونده 2026
   *
   * 🎞| Movie : Runner  🌹 6.6
   *
   * در خط Movie ممکن است دو custom emoji داشته باشیم.
   *
   * اول = film
   * دوم = imdb
   */

  const movieLineItems = result
    .filter(item =>
      normalizeText(item.line).includes("movie")
    )
    .sort((a, b) => a.offset - b.offset);


  if (movieLineItems.length > 0) {
    movieLineItems.forEach((item, index) => {
      if (index === 0) {
        item.name = "film";
      } else if (index === 1) {
        item.name = "imdb";
      }
    });
  }


  /*
   * ----------------------------------------------------------
   * بقیه خطوط
   * ----------------------------------------------------------
   */

  for (const item of result) {
    if (item.name) {
      continue;
    }

    const detected = detectStyleName(item.line);

    if (detected) {
      item.name = detected;
    }
  }


  /*
   * ----------------------------------------------------------
   * خط اول فیلم
   * ----------------------------------------------------------
   *
   * اگر هنوز movie پیدا نشده، خطی که «فیلم» دارد را بررسی می‌کنیم.
   */

  const movieItem = result.find(
    item =>
      !item.name &&
      normalizeText(item.line).includes("فیلم")
  );

  if (movieItem) {
    movieItem.name = "movie";
  }


  return result;
}


/* ============================================================
   SAVE STYLE SAMPLE
   ============================================================ */

export async function saveEmojiSample(ctx) {
  const message = ctx.message;

  if (!message) {
    return [];
  }


  /*
   * پیام متنی یا کپشن عکس
   */

  const text =
    message.text ||
    message.caption ||
    "";


  if (!text) {
    return [];
  }


  /*
   * entities واقعی تلگرام
   */

  const entities =
    message.entities ||
    message.caption_entities ||
    [];


  /*
   * فقط Premium Emoji
   */

  const parsed = parseCustomEmojiEntities(
    text,
    entities
  );


  if (!parsed.length) {
    return [];
  }


  /*
   * mapping نهایی
   */

  const style = {};


  /*
   * فقط مواردی که واقعاً custom_emoji_id دارند ذخیره می‌شوند.
   *
   * بنابراین اگر مثلاً ⬇️ یا ➡️ معمولی باشند،
   * وارد Premium Emoji ها نمی‌شوند.
   */

  for (const item of parsed) {
    if (!item.name) {
      continue;
    }

    /*
     * اگر یک بخش چند بار پیدا شد،
     * اولین مورد معتبر را نگه می‌داریم.
     */

    if (!style[item.name]) {
      style[item.name] = {
        id: item.id,
        fallback: item.fallback
      };
    }
  }


  /*
   * ذخیره در دیتابیس
   */

  await setSetting(
    "emoji_style",
    style
  );


  /*
   * لاگ برای Render
   *
   * این لاگ خیلی مهم است.
   * بعد از ارسال پیام نمونه در Render می‌توانی ببینی
   * کدام ID برای کدام بخش ذخیره شده.
   */

  console.log(
    "========== JadoMovie Emoji Style =========="
  );

  for (const [name, value] of Object.entries(style)) {
    console.log(
      `${name} => ${value.id} => ${value.fallback}`
    );
  }

  console.log(
    "==========================================="
  );


  return parsed;
}


/* ============================================================
   GET PREMIUM EMOJI
   ============================================================ */

function getStyleEmoji(style, name, fallback) {
  const item = style?.[name];

  if (
    item &&
    item.id
  ) {
    return customEmoji(
      item.id,
      item.fallback || fallback
    );
  }

  /*
   * اگر Premium Emoji برای این قسمت ذخیره نشده باشد،
   * ایموجی معمولی استفاده می‌شود.
   */
  return fallback;
}


/* ============================================================
   BUILD CAPTION
   ============================================================ */

export async function buildCaption(movie) {
  const style =
    await getSetting(
      "emoji_style",
      {}
    );


  /*
   * Premium Emoji ها
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
     فیلم
     ========================================================== */

  lines.push(
    `${movieEmoji} <b>| فیلم : ${esc(movie.faTitle)} ${esc(movie.year)}</b>`
  );


  /* ==========================================================
     Movie + IMDb
     ========================================================== */

  lines.push(
    `${filmEmoji}<b>| Movie : ${esc(movie.enTitle)}</b>  ` +
    `${imdbEmoji} <b>${esc(movie.imdb)}</b>`
  );


  /* ==========================================================
     محصول
     ========================================================== */

  lines.push(
    `${countryEmoji}<b>| محصول : ${esc(movie.country)}</b>`
  );


  /* ==========================================================
     ژانر
     ========================================================== */

  lines.push(
    `${genreEmoji}<b>| ژانر : ${esc(movie.genre)}</b>`
  );


  lines.push("");


  /* ==========================================================
     خلاصه داستان
     ========================================================== */

  /*
   * blockquote واقعی Telegram
   */

  lines.push(
    `<blockquote>` +
      `${summaryEmoji} <b>| خلاصه داستان:${esc(movie.summary)}</b>` +
    `</blockquote>`
  );


  /*
   * لینک‌های دانلود
   */

  const subtitleLinks =
    (movie.links || []).filter(
      item =>
        item.type === "subtitle"
    );


  const dubbedLinks =
    (movie.links || []).filter(
      item =>
        item.type === "dubbed"
    );


  /* ==========================================================
     زیرنویس
     ========================================================== */

  if (subtitleLinks.length) {
    lines.push("");

    lines.push(
      `${subtitleEmoji}<b>زیرنویس چسبیده:</b>`
    );


    for (const item of subtitleLinks) {
      lines.push(
        `⬇️(<b><a href="${esc(item.url)}">برای دانلود اینجا کلیک کنید</a></b>) ➡️`
      );
    }
  }


  /* ==========================================================
     دوبله
     ========================================================== */

  if (dubbedLinks.length) {
    lines.push("");

    lines.push(
      `${dubbedEmoji}<b>دوبله فارسی:</b>`
    );


    for (const item of dubbedLinks) {
      lines.push(
        `⬇️(<b><a href="${esc(item.url)}">برای دانلود اینجا کلیک کنید</a></b>) ➡️`
      );
    }
  }


  /* ==========================================================
     کانال
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


  return lines.join("\n");
}
