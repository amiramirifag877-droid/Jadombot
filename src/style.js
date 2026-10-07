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

export async function buildCaption(movie) {
  const style = await getSetting("emoji_style", {});
  const e = (name, fallback) => customEmoji(style?.[name]?.id, fallback);

  const lines = [];

  lines.push(
    `${e("movie", "🎬")} <b>فیلم : ${esc(movie.faTitle)} ${esc(movie.year)}</b>`
  );

  lines.push(
    `${e("film", "🎞️")} | <b>Movie : ${esc(movie.enTitle)}</b>  ${e("imdb", "⭐")} <b>${esc(movie.imdb)}</b>`
  );

  lines.push(
    `${e("country", "🌐")} | <b>محصول : ${esc(movie.country)}</b>`
  );

  lines.push(
    `${e("genre", "🎭")} | <b>ژانر : ${esc(movie.genre)}</b>`
  );

  lines.push("");

  lines.push(
    `${e("summary", "💬")} <b>خلاصه داستان:</b>\n<blockquote>${esc(movie.summary)}</blockquote>`
  );

  if (movie.links?.length) {
    lines.push("");
    for (const item of movie.links) {
      const label = item.type === "dubbed"
        ? "دوبله فارسی"
        : item.type === "subtitle"
          ? "زیرنویس فارسی"
          : "دوبله فارسی + زیرنویس فارسی";
      lines.push(
        `${e("download", "📥")} <b>${label}:</b> <a href="${esc(item.url)}">برای دانلود اینجا کلیک کنید</a>`
      );
    }
  }

  const channelId = await getSetting("channel_id", null);
  if (channelId) {
    lines.push("");
    lines.push(`${e("channel", "📣")} <b>${esc(channelId)}</b>`);
  }

  return lines.join("\n");
}

export function parseCustomEmojiEntities(text, entities = []) {
  const result = [];
  for (const entity of entities) {
    if (entity.type !== "custom_emoji" || !entity.custom_emoji_id) continue;
    const offset = entity.offset;
    const char = Array.from(text || "")[offset] || "🙂";
    result.push({ id: entity.custom_emoji_id, fallback: char });
  }
  return result;
}

export async function saveEmojiSample(ctx) {
  const message = ctx.message;
  if (!message?.text && !message?.caption) return [];
  const text = message.text || message.caption || "";
  const entities = message.entities || message.caption_entities || [];
  const emojis = parseCustomEmojiEntities(text, entities);
  if (!emojis.length) return [];

  const names = ["movie","film","imdb","country","genre","summary","download","channel"];
  const style = {};
  emojis.slice(0, names.length).forEach((item, i) => {
    style[names[i]] = item;
  });
  await import("./db.js").then(({ setSetting }) => setSetting("emoji_style", style));
  return emojis;
}
