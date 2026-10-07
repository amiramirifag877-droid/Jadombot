import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Telegraf, Markup } from "telegraf";
import {
  isAdmin, addAdmin, removeAdmin, listAdmins,
  getSetting, setSetting, getSession, setSession, clearSession
} from "./db.js";
import { makePoster, cleanupDir } from "./image.js";
import { buildCaption, saveEmojiSample } from "./style.js";

const bot = new Telegraf(process.env.BOT_TOKEN);

const steps = [
  ["poster", "پوستر فیلم را ارسال کن."],
  ["faTitle", "۱/۱۰ — اسم فیلم به فارسی را بفرست."],
  ["year", "۲/۱۰ — سال ساخت را بفرست."],
  ["enTitle", "۳/۱۰ — اسم انگلیسی فیلم را بفرست."],
  ["imdb", "۴/۱۰ — امتیاز IMDb را بفرست. مثال: 6.6"],
  ["country", "۵/۱۰ — محصول کشور را بفرست."],
  ["genre", "۶/۱۰ — ژانر را بفرست."],
  ["summary", "۷/۱۰ — خلاصه داستان را بفرست."],
  ["linkMode", "۸/۱۰ — نوع لینک‌ها را انتخاب کن."],
  ["links", "۹/۱۰ — لینک دانلود را بفرست. برای چند لینک، هر لینک را در یک خط قرار بده."]
];

function adminOnly(handler) {
  return async (ctx, next) => {
    if (!(await isAdmin(ctx.from.id))) {
      await ctx.reply("شما ادمین نیستید برای دسترسی با مدیریت در ارتباط باشید");
      return;
    }
    return handler(ctx, next);
  };
}

async function sendStep(ctx, step) {
  const [, prompt] = steps[step];
  if (step === 8) {
    return ctx.reply("۸/۱۰ — نوع لینک‌ها را انتخاب کن:", Markup.inlineKeyboard([
      [Markup.button.callback("🎙️ دوبله", "link:dubbed")],
      [Markup.button.callback("📝 زیرنویس", "link:subtitle")],
      [Markup.button.callback("🎙️ + 📝 هر دو", "link:both")]
    ]));
  }
  await ctx.reply(prompt);
}

bot.start(async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) {
    return ctx.reply("شما ادمین نیستید برای دسترسی با مدیریت در ارتباط باشید");
  }
  await ctx.reply(
    "سلام 👋\nبه JadoMovie Bot خوش آمدی.\n\n" +
    "/setup — تنظیمات اولیه\n" +
    "/new — ساخت محتوای جدید\n" +
    "/admin — مدیریت ادمین‌ها و مقصد انتشار\n" +
    "/help — راهنما"
  );
});

bot.command("help", adminOnly(async (ctx) => {
  await ctx.reply(
    "دستورات:\n" +
    "/setup تنظیم لوگو، آیدی کانال و نمونه استایل\n" +
    "/new شروع محتوای ۱۰ مرحله‌ای\n" +
    "/cancel لغو ساخت محتوا\n" +
    "/admin مدیریت ادمین‌ها\n" +
    "/settarget تنظیم گروه/کانال فعلی به عنوان مقصد انتشار"
  );
}));

bot.command("setup", adminOnly(async (ctx) => {
  await setSession(ctx.from.id, 100, {});
  await ctx.reply(
    "تنظیم اولیه شروع شد.\n" +
    "۱) لوگو را به صورت عکس/فایل بفرست.\n" +
    "۲) بعد از آن آیدی کانال را بفرست، مثال: @JadoMovie\n" +
    "۳) در آخر یک پیام نمونه که Premium Emoji دارد برای ربات بفرست."
  );
}));

bot.command("admin", adminOnly(async (ctx) => {
  const admins = await listAdmins();
  const target = await getSetting("target_chat_id", null);
  const channel = await getSetting("channel_id", null);
  await ctx.reply(
    `مدیریت ربات\n\nادمین‌ها: ${admins.map(x => x.user_id).join(", ")}\n` +
    `کانال: ${channel || "تنظیم نشده"}\n` +
    `مقصد انتشار: ${target || "تنظیم نشده"}\n\n` +
    "برای افزودن: /addadmin USER_ID\nبرای حذف: /deladmin USER_ID\n" +
    "برای تنظیم مقصد، ربات را به گروه/کانال اضافه کن و همان‌جا /settarget بزن."
  );
}));

bot.command("addadmin", adminOnly(async (ctx) => {
  const id = ctx.message.text.split(/\s+/)[1];
  if (!id || !/^\d+$/.test(id)) return ctx.reply("فرمت: /addadmin 123456789");
  await addAdmin(id);
  await ctx.reply("ادمین اضافه شد.");
}));

bot.command("deladmin", adminOnly(async (ctx) => {
  const id = ctx.message.text.split(/\s+/)[1];
  if (!id || !/^\d+$/.test(id)) return ctx.reply("فرمت: /deladmin 123456789");
  const ok = await removeAdmin(id);
  await ctx.reply(ok ? "ادمین حذف شد." : "امکان حذف این ادمین وجود ندارد.");
}));

bot.command("settarget", adminOnly(async (ctx) => {
  await setSetting("target_chat_id", String(ctx.chat.id));
  await ctx.reply(`این چت به عنوان مقصد انتشار ذخیره شد:\n${ctx.chat.id}`);
}));

bot.command("cancel", adminOnly(async (ctx) => {
  await clearSession(ctx.from.id);
  await ctx.reply("فرآیند لغو شد.");
}));

bot.command("new", adminOnly(async (ctx) => {
  await setSession(ctx.from.id, 0, {});
  await ctx.reply("ساخت محتوای جدید شروع شد.");
  await sendStep(ctx, 0);
}));

bot.on(["photo", "document"], adminOnly(async (ctx) => {
  const session = await getSession(ctx.from.id);

  if (session?.step === 100) {
    const fileId = ctx.message.photo
      ? ctx.message.photo.at(-1).file_id
      : (ctx.message.document?.mime_type?.startsWith("image/") ? ctx.message.document.file_id : null);

    if (!fileId) return ctx.reply("لطفاً لوگو را به صورت تصویر ارسال کن.");

    const file = await ctx.telegram.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(url);
    const buf = Buffer.from(await response.arrayBuffer());
    const p = path.join(os.tmpdir(), `logo-${ctx.from.id}-${Date.now()}.png`);
    await fs.writeFile(p, buf);
    await setSetting("logo_base64", buf.toString("base64"));
    await fs.rm(p, { force: true }).catch(() => {});
    await setSession(ctx.from.id, 101, {});
    return ctx.reply("لوگو ذخیره شد.\nحالا آیدی کانال را بفرست، مثال: @JadoMovie");
  }

  if (!session) return;
  if (session.step !== 0) return;

  const fileId = ctx.message.photo
    ? ctx.message.photo.at(-1).file_id
    : (ctx.message.document?.mime_type?.startsWith("image/") ? ctx.message.document.file_id : null);

  if (!fileId) return ctx.reply("فایل باید تصویر باشد.");

  const file = await ctx.telegram.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
  const response = await fetch(url);
  const buf = Buffer.from(await response.arrayBuffer());
  const p = path.join(os.tmpdir(), `poster-${ctx.from.id}-${Date.now()}`);
  await fs.writeFile(p, buf);

  await setSession(ctx.from.id, 1, { posterPath: p });
  await sendStep(ctx, 1);
}));

bot.on("text", adminOnly(async (ctx) => {
  const session = await getSession(ctx.from.id);
  if (!session) return;

  if (session.step === 101) {
    await setSetting("channel_id", ctx.message.text.trim());
    await setSession(ctx.from.id, 102, {});
    return ctx.reply("آیدی کانال ذخیره شد.\nحالا پیام نمونه دارای Premium Emoji را برای ربات بفرست.");
  }

  if (session.step === 102) {
    const emojis = await saveEmojiSample(ctx);
    if (!emojis.length) return ctx.reply("در این پیام Premium Emoji پیدا نشد. پیام را مستقیم برای ربات بفرست تا entityهای custom_emoji قابل خواندن باشند.");
    await clearSession(ctx.from.id);
    return ctx.reply(`استایل ذخیره شد. ${emojis.length} ایموجی سفارشی پیدا شد.\nحالا با /new محتوای جدید بساز.`);
  }

  if (session.step < 1 || session.step > 9) return;

  const data = { ...session.data };
  const key = steps[session.step][0];

  if (key === "linkMode") return;

  if (key === "links") {
    const urls = ctx.message.text.split(/\n+/).map(x => x.trim()).filter(Boolean);
    if (!urls.length) return ctx.reply("حداقل یک لینک بفرست.");

    const mode = data.linkMode;
    data.links = urls.map(url => ({ type: mode, url }));
    await setSession(ctx.from.id, 10, data);
    return await finalize(ctx, data);
  }

  data[key] = ctx.message.text.trim();
  const next = session.step + 1;
  await setSession(ctx.from.id, next, data);
  await sendStep(ctx, next);
}));

bot.action(/^link:(dubbed|subtitle|both)$/, adminOnly(async (ctx) => {
  await ctx.answerCbQuery();
  const session = await getSession(ctx.from.id);
  if (!session || session.step !== 8) return;
  const mode = ctx.match[1];
  await setSession(ctx.from.id, 9, { ...session.data, linkMode: mode });
  await ctx.editMessageText(
    `نوع لینک: ${mode === "dubbed" ? "دوبله" : mode === "subtitle" ? "زیرنویس" : "دوبله + زیرنویس"}\n` +
    "۹/۱۰ — لینک دانلود را بفرست. هر لینک در یک خط."
  );
}));

async function finalize(ctx, data) {
  await ctx.reply("در حال ساخت تصویر و متن نهایی…");
  let out;
  try {
    const logoBase64 = await getSetting("logo_base64", null);
    const logo = logoBase64 ? Buffer.from(logoBase64, "base64") : null;
    out = await makePoster(data.posterPath, logo);

    const caption = await buildCaption(data);
    const target = await getSetting("target_chat_id", null);

    const chatId = target || ctx.chat.id;
    await ctx.telegram.sendPhoto(chatId, { source: out }, {
      caption,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });

    await ctx.reply("محتوا با موفقیت ساخته و ارسال شد. ✅");
  } catch (err) {
    console.error(err);
    await ctx.reply("خطا در ساخت/ارسال محتوا. لاگ Render را بررسی کن.");
  } finally {
    await clearSession(ctx.from.id);
    await cleanupDir(out);
    if (data.posterPath) await fs.rm(data.posterPath, { force: true }).catch(() => {});
  }
}

export default bot;
