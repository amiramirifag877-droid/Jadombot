import { getSetting, setSetting } from "./db.js";

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function customEmoji(id, fallback) {
  if (!id) return fallback;

  return `<tg-emoji emoji-id="${esc(id)}">${esc(fallback)}</tg-emoji>`;
}

/**
 * ساخت کپشن نهایی
 * استایل مطابق نمونه ارسالی:
 *
 * 🎞 | فیلم
 * 🎞 | Movie + IMDb
 * 🌎 | محصول
 * 🎭 | ژانر
 *
 * 💬 | خلاصه داستان
 *
 * ✍ | زیرنویس چسبیده
 * ⬇️(برای دانلود اینجا کلیک کنید) ➡️
 *
 * 🎤 | دوبله فارسی
 * ⬇️(برای دانلود اینجا کلیک کنید) ➡️
 *
 * ✈️ @JadoMovie
 *
 * تمام متن‌ها Bold هستند.
 * خلاصه داستان با blockquote واقعی تلگرام نمایش داده می‌شود.
 */
export async function buildCaption(movie) {
  const style = await getSetting("emoji_style", {});

  const e = (name, fallback) =>
    customEmoji(style?.[name]?.id, fallback);

  const lines = [];

  // =========================
  // فیلم
  // =========================

  lines.push(
    `${e("movie", "🎞️")} <b>| فیلم : ${esc(movie.faTitle)} ${esc(movie.year)}</b>`
  );

  // =========================
  // Movie + IMDb
  // =========================

  lines.push(
    `${e("film", "🎞️")} <b>| Movie : ${esc(movie.enTitle)}</b>  ` +
    `${e("imdb", "🌹")} <b>${esc(movie.imdb)}</b>`
  );

  // =========================
  // کشور
  // =========================

  lines.push(
    `${e("country", "🌎")} <b>| محصول : ${esc(movie.country)}</b>`
  );

  // =========================
  // ژانر
  // =========================

  lines.push(
    `${e("genre", "🎭")} <b>| ژانر : ${esc(movie.genre)}</b>`
  );

  lines.push("");

  // =========================
  // خلاصه داستان
  // =========================
  // از blockquote واقعی HTML استفاده شده
  // تا در تلگرام واقعاً به صورت نقل‌قول نمایش داده شود.

  lines.push(
    `<blockquote>` +
    `${e("summary", "💬")} <b>| خلاصه داستان: ${esc(movie.summary)}</b>` +
    `</blockquote>`
  );

  // =========================
  // لینک‌ها
  // =========================

  const subtitleLinks = (movie.links || []).filter(
    item => item.type === "subtitle"
  );

  const dubbedLinks = (movie.links || []).filter(
    item => item.type === "dubbed"
  );

  // -------------------------
  // زیرنویس
  // -------------------------

  if (subtitleLinks.length) {
    lines.push("");

    lines.push(
      `${e("subtitle", "✍️")} <b>زیرنویس چسبیده:</b>`
    );

    for (const item of subtitleLinks) {
      lines.push(
        `⬇️(<b><a href="${esc(item.url)}">برای دانلود اینجا کلیک کنید</a></b>) ➡️`
      );
    }
  }

  // -------------------------
  // دوبله
  // -------------------------

  if (dubbedLinks.length) {
    lines.push("");

    lines.push(
      `${e("dubbed", "🎤")} <b>دوبله فارسی:</b>`
    );

    for (const item of dubbedLinks) {
      lines.push(
        `⬇️(<b><a href="${esc(item.url)}">برای دانلود اینجا کلیک کنید</a></b>) ➡️`
      );
    }
  }

  // =========================
  // کانال
  // =========================

  const channelId = await getSetting("channel_id", null);

  if (channelId) {
    lines.push("");

    lines.push(
      `${e("channel", "✈️")}<b>${esc(channelId)}</b>`
    );
  }

  return lines.join("\n");
}


/**
 * پیدا کردن Premium Emoji های پیام نمونه
 */
export function parseCustomEmojiEntities(text, entities = []) {
  const result = [];

  for (const entity of entities) {
    if (
      entity.type !== "custom_emoji" ||
      !entity.custom_emoji_id
    ) {
      continue;
    }

    /*
     * Telegram offset بر اساس UTF-16 است.
     * برای پیدا کردن fallback، بخش کوچکی از متن را
     * به صورت امن بررسی می‌کنیم.
     */
    const offset = entity.offset || 0;

    let fallback = "🙂";

    try {
      const chars = Array.from(text || "");
      fallback = chars[offset] || "🙂";
    } catch {
      fallback = "🙂";
    }

    result.push({
      id: entity.custom_emoji_id,
      fallback
    });
  }

  return result;
}


/**
 * تشخیص اینکه هر Premium Emoji مربوط به کدام قسمت نمونه است.
 *
 * این قسمت مهم است چون نمونه شامل ۹ ایموجی است:
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
 */
export async function saveEmojiSample(ctx) {
  const message = ctx.message;

  if (!message?.text && !message?.caption) {
    return [];
  }

  const text = message.text || message.caption || "";

  const entities =
    message.entities ||
    message.caption_entities ||
    [];

  const customEntities = entities.filter(
    entity =>
      entity.type === "custom_emoji" &&
      entity.custom_emoji_id
  );

  if (!customEntities.length) {
    return [];
  }

  const style = {};

  /*
   * برای هر Premium Emoji متن اطراف آن را پیدا می‌کنیم.
   * این باعث می‌شود ایموجی‌های زیرنویس، دوبله و کانال
   * جداگانه ذخیره شوند.
   */
  for (let i = 0; i < customEntities.length; i++) {
    const entity = customEntities[i];

    const offset = entity.offset || 0;

    /*
     * محدوده‌ای از متن اطراف ایموجی
     * برای تشخیص بخش مربوطه
     */
    const start = Math.max(0, offset - 80);
    const end = Math.min(text.length, offset + 150);

    const surroundingText = text.slice(start, end);

    let name = null;

    // -------------------------
    // زیرنویس
    // -------------------------

    if (
      surroundingText.includes("زیرنویس") ||
      surroundingText.includes("چسبیده")
    ) {
      name = "subtitle";
    }

    // -------------------------
    // دوبله
    // -------------------------

    else if (
      surroundingText.includes("دوبله")
    ) {
      name = "dubbed";
    }

    // -------------------------
    // خلاصه داستان
    // -------------------------

    else if (
      surroundingText.includes("خلاصه داستان")
    ) {
      name = "summary";
    }

    // -------------------------
    // ژانر
    // -------------------------

    else if (
      surroundingText.includes("ژانر")
    ) {
      name = "genre";
    }

    // -------------------------
    // محصول / کشور
    // -------------------------

    else if (
      surroundingText.includes("محصول")
    ) {
      name = "country";
    }

    // -------------------------
    // Movie
    // -------------------------

    else if (
      surroundingText.includes("Movie")
    ) {
      /*
       * در خط Movie معمولاً دو Premium Emoji داریم:
       * اولی = film
       * دومی = imdb
       */
      const movieEntities = customEntities.filter((item) => {
        const itemOffset = item.offset || 0;

        const lineStart = text.lastIndexOf(
          "\n",
          itemOffset
        ) + 1;

        const lineEndIndex = text.indexOf(
          "\n",
          itemOffset
        );

        const lineEnd =
          lineEndIndex === -1
            ? text.length
            : lineEndIndex;

        const line = text.slice(lineStart, lineEnd);

        return line.includes("Movie");
      });

      const index = movieEntities.indexOf(entity);

      name = index === 0 ? "film" : "imdb";
    }

    // -------------------------
    // کانال
    // -------------------------

    else if (
      surroundingText.includes("@JadoMovie") ||
      surroundingText.includes("JadoMovie")
    ) {
      name = "channel";
    }

    /*
     * اگر تشخیص متنی جواب نداد، بر اساس ترتیب نمونه
     * fallback می‌کنیم.
     */
    if (!name) {
      const fallbackNames = [
        "movie",
        "film",
        "imdb",
        "country",
        "genre",
        "summary",
        "subtitle",
        "dubbed",
        "channel"
      ];

      name = fallbackNames[i] || null;
    }

    if (name && !style[name]) {
      style[name] = {
        id: entity.custom_emoji_id,
        fallback: Array.from(text)[offset] || "🙂"
      };
    }
  }

  /*
   * اگر بعضی بخش‌ها با تشخیص متنی پیدا نشده باشند،
   * ترتیب Premium Emoji های نمونه را هم بررسی می‌کنیم.
   */
  const fallbackNames = [
    "movie",
    "film",
    "imdb",
    "country",
    "genre",
    "summary",
    "subtitle",
    "dubbed",
    "channel"
  ];

  customEntities.forEach((entity, index) => {
    const name = fallbackNames[index];

    if (name && !style[name]) {
      style[name] = {
        id: entity.custom_emoji_id,
        fallback: Array.from(text)[entity.offset || 0] || "🙂"
      };
    }
  });

  await setSetting("emoji_style", style);

  return customEntities.map((entity, index) => ({
    id: entity.custom_emoji_id,
    fallback:
      Array.from(text)[entity.offset || 0] || "🙂"
  }));
}
