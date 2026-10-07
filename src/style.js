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

  return `<tg-emoji emoji-id="${esc(id)}">${fallback}</tg-emoji>`;
}

function downloadLine(url) {
  return `⬇️(<a href="${esc(url)}">برای دانلود اینجا کلیک کنید</a>) ➡️`;
}

export async function buildCaption(movie) {
  const style = await getSetting("emoji_style", {});

  const e = (name, fallback) =>
    customEmoji(style?.[name]?.id, fallback);

  const lines = [];

  // فیلم فارسی
  lines.push(
    `${e("movie", "🎞️")} | <b>فیلم : ${esc(movie.faTitle)} ${esc(movie.year)}</b>`
  );

  // Movie + IMDb
  lines.push(
    `${e("film", "🎞️")} | <b>Movie : ${esc(movie.enTitle)}</b>  ${e("imdb", "🌹")} <b>${esc(movie.imdb)}</b>`
  );

  // محصول
  lines.push(
    `${e("country", "🌎")} | <b>محصول : ${esc(movie.country)}</b>`
  );

  // ژانر
  lines.push(
    `${e("genre", "🎭")} | <b>ژانر : ${esc(movie.genre)}</b>`
  );

  lines.push("");

  /*
   * خلاصه داستان
   * دقیقاً به صورت Quote
   */
  lines.push(
    `> ${e("summary", "💬")} | <b>خلاصه داستان:${esc(movie.summary)}</b>`
  );

  /*
   * لینک‌ها
   */

  const links = Array.isArray(movie.links)
    ? movie.links
    : [];

  const subtitleLinks = links.filter(
    item => item?.type === "subtitle"
  );

  const dubbedLinks = links.filter(
    item => item?.type === "dubbed"
  );

  /*
   * زیرنویس
   */

  if (subtitleLinks.length) {
    lines.push("");
    lines.push(`✍<b>زیرنویس چسبیده:</b>`);

    for (const item of subtitleLinks) {
      lines.push(downloadLine(item.url));
    }
  }

  /*
   * دوبله
   */

  if (dubbedLinks.length) {
    lines.push("");
    lines.push(`🎤<b>دوبله فارسی:</b>`);

    for (const item of dubbedLinks) {
      lines.push(downloadLine(item.url));
    }
  }

  /*
   * کانال
   */

  const channelId = await getSetting(
    "channel_id",
    null
  );

  if (channelId) {
    lines.push("");
    lines.push(`✈️${esc(channelId)}`);
  }

  return lines.join("\n");
}

/*
|--------------------------------------------------------------------------
| Premium Emoji
|--------------------------------------------------------------------------
*/

export function parseCustomEmojiEntities(
  text,
  entities = []
) {
  const result = [];

  for (const entity of entities) {
    if (
      entity.type !== "custom_emoji" ||
      !entity.custom_emoji_id
    ) {
      continue;
    }

    const chars = Array.from(text || "");
    const char = chars[entity.offset] || "🙂";

    result.push({
      id: entity.custom_emoji_id,
      fallback: char
    });
  }

  return result;
}

export async function saveEmojiSample(ctx) {
  const message = ctx.message;

  if (!message?.text && !message?.caption) {
    return [];
  }

  const text =
    message.text ||
    message.caption ||
    "";

  const entities =
    message.entities ||
    message.caption_entities ||
    [];

  const emojis = parseCustomEmojiEntities(
    text,
    entities
  );

  if (!emojis.length) {
    return [];
  }

  const names = [
    "movie",
    "film",
    "imdb",
    "country",
    "genre",
    "summary",
    "download",
    "channel"
  ];

  const style = {};

  emojis
    .slice(0, names.length)
    .forEach((item, i) => {
      style[names[i]] = item;
    });

  await setSetting(
    "emoji_style",
    style
  );

  return emojis;
}
