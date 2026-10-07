import { getSetting } from "./db.js";

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

  // عنوان فارسی
  lines.push(
    `${e("movie", "🎞️")} | <b>فیلم : ${esc(movie.faTitle)} ${esc(movie.year)}</b>`
  );

  // عنوان انگلیسی + IMDb
  lines.push(
    `${e("film", "🎞️")} | <b>Movie : ${esc(movie.enTitle)}</b>  ${e("imdb", "🌹")} <b>${esc(movie.imdb)}</b>`
  );

  // کشور
  lines.push(
    `${e("country", "🌎")} | <b>محصول : ${esc(movie.country)}</b>`
  );

  // ژانر
  lines.push(
    `${e("genre", "🎭")} | <b>ژانر : ${esc(movie.genre)}</b>`
  );

  lines.push("");

  // خلاصه داستان
  lines.push(
    `> ${e("summary", "💬")} | <b>خلاصه داستان: ${esc(movie.summary)}</b>`
  );

  /*
   * لینک‌ها
   *
   * subtitle = فقط زیرنویس
   * dubbed   = فقط دوبله
   * both     = اگر نسخه‌های جداگانه وارد شوند،
   *             هر کدام در بخش خودش قرار می‌گیرد.
   */

  const links = Array.isArray(movie.links) ? movie.links : [];

  const subtitleLinks = links.filter(
    x => x.type === "subtitle"
  );

  const dubbedLinks = links.filter(
    x => x.type === "dubbed"
  );

  if (subtitleLinks.length) {
    lines.push("");
    lines.push(`✍<b>زیرنویس چسبیده:</b>`);

    for (const item of subtitleLinks) {
      lines.push(downloadLine(item.url));
    }
  }

  if (dubbedLinks.length) {
    lines.push("");
    lines.push(`🎤<b>دوبله فارسی:</b>`);

    for (const item of dubbedLinks) {
      lines.push(downloadLine(item.url));
    }
  }

  const channelId = await getSetting("channel_id", null);

  if (channelId) {
    lines.push("");
    lines.push(`✈️${esc(channelId)}`);
  }

  return lines.join("\n");
}

export function parseCustomEmojiEntities(text, entities = []) {
  const result = [];

  for (const entity of entities) {
    if (
      entity.type !== "custom_emoji" ||
      !entity.custom_emoji_id
    ) {
      continue;
    }

    const offset = entity.offset;
    const chars = Array.from(text || "");
    const char = chars[offset] || "🙂";

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

  const text = message.text || message.caption || "";

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

  emojis.slice(0, names.length).forEach((item, i) => {
    style[names[i]] = item;
  });

  await import("./db.js").then(
    ({ setSetting }) =>
      setSetting("emoji_style", style)
  );

  return emojis;
}
