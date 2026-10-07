import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Telegraf, Markup } from "telegraf";

import {
  isAdmin,
  addAdmin,
  removeAdmin,
  listAdmins,
  getSetting,
  setSetting,
  getSession,
  setSession,
  clearSession
} from "./db.js";

import { makePoster, cleanupDir } from "./image.js";
import { buildCaption, saveEmojiSample } from "./style.js";

const bot = new Telegraf(process.env.BOT_TOKEN);

/*
|--------------------------------------------------------------------------
| مراحل ساخت محتوا
|--------------------------------------------------------------------------
*/

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
  ["links", "۹/۱۰ — لینک دانلود را وارد کن."]
];

/*
|--------------------------------------------------------------------------
| بررسی ادمین
|--------------------------------------------------------------------------
*/

function adminOnly(handler) {
  return async (ctx, next) => {
    if (!(await isAdmin(ctx.from.id))) {
      await ctx.reply(
        "شما ادمین نیستید برای دسترسی با مدیریت در ارتباط باشید"
      );
      return;
    }

    return handler(ctx, next);
  };
}

/*
|--------------------------------------------------------------------------
| ارسال مرحله
|--------------------------------------------------------------------------
*/

async function sendStep(ctx, step) {
  if (step === 8) {
    return ctx.reply(
      "۸/۱۰ — نوع لینک‌ها را انتخاب کن:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🎤 دوبله",
            "link:dubbed"
          )
        ],
        [
          Markup.button.callback(
            "📝 زیرنویس",
            "link:subtitle"
          )
        ],
        [
          Markup.button.callback(
            "🎤 + 📝 هر دو",
            "link:both"
          )
        ]
      ])
    );
  }

  const [, prompt] = steps[step];
  await ctx.reply(prompt);
}

/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

bot.start(
  async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) {
      return ctx.reply(
        "شما ادمین نیستید برای دسترسی با مدیریت در ارتباط باشید"
      );
    }

    await ctx.reply(
      "سلام 👋\n" +
      "به JadoMovie Bot خوش آمدی.\n\n" +
      "/setup — تنظیمات اولیه\n" +
      "/new — ساخت محتوای جدید\n" +
      "/admin — مدیریت ادمین‌ها و مقصد انتشار\n" +
      "/help — راهنما"
    );
  }
);

/*
|--------------------------------------------------------------------------
| HELP
|--------------------------------------------------------------------------
*/

bot.command(
  "help",
  adminOnly(async (ctx) => {
    await ctx.reply(
      "دستورات:\n\n" +
      "/setup تنظیم لوگو، آیدی کانال و نمونه استایل\n" +
      "/new شروع ساخت محتوای جدید\n" +
      "/cancel لغو ساخت محتوا\n" +
      "/admin مدیریت ادمین‌ها\n" +
      "/settarget تنظیم گروه/کانال فعلی به عنوان مقصد انتشار"
    );
  })
);

/*
|--------------------------------------------------------------------------
| SETUP
|--------------------------------------------------------------------------
*/

bot.command(
  "setup",
  adminOnly(async (ctx) => {
    await setSession(ctx.from.id, 100, {});

    await ctx.reply(
      "تنظیم اولیه شروع شد.\n\n" +
      "۱) لوگو را به صورت عکس/فایل بفرست.\n" +
      "۲) بعد از آن آیدی کانال را بفرست، مثال: @JadoMovie\n" +
      "۳) در آخر یک پیام نمونه که Premium Emoji دارد برای ربات بفرست."
    );
  })
);

/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

bot.command(
  "admin",
  adminOnly(async (ctx) => {
    const admins = await listAdmins();
    const target = await getSetting(
      "target_chat_id",
      null
    );
    const channel = await getSetting(
      "channel_id",
      null
    );

    await ctx.reply(
      `مدیریت ربات\n\n` +
      `ادمین‌ها: ${admins
        .map((x) => x.user_id)
        .join(", ")}\n` +
      `کانال: ${channel || "تنظیم نشده"}\n` +
      `مقصد انتشار: ${target || "تنظیم نشده"}\n\n` +
      "برای افزودن:\n" +
      "/addadmin USER_ID\n\n" +
      "برای حذف:\n" +
      "/deladmin USER_ID\n\n" +
      "برای تنظیم مقصد، ربات را به گروه/کانال اضافه کن و همان‌جا /settarget بزن."
    );
  })
);

/*
|--------------------------------------------------------------------------
| ADD ADMIN
|--------------------------------------------------------------------------
*/

bot.command(
  "addadmin",
  adminOnly(async (ctx) => {
    const id = ctx.message.text.split(/\s+/)[1];

    if (!id || !/^\d+$/.test(id)) {
      return ctx.reply(
        "فرمت صحیح:\n/addadmin 123456789"
      );
    }

    await addAdmin(id);

    await ctx.reply("ادمین اضافه شد. ✅");
  })
);

/*
|--------------------------------------------------------------------------
| DELETE ADMIN
|--------------------------------------------------------------------------
*/

bot.command(
  "deladmin",
  adminOnly(async (ctx) => {
    const id = ctx.message.text.split(/\s+/)[1];

    if (!id || !/^\d+$/.test(id)) {
      return ctx.reply(
        "فرمت صحیح:\n/deladmin 123456789"
      );
    }

    const ok = await removeAdmin(id);

    await ctx.reply(
      ok
        ? "ادمین حذف شد. ✅"
        : "امکان حذف این ادمین وجود ندارد."
    );
  })
);

/*
|--------------------------------------------------------------------------
| SET TARGET
|--------------------------------------------------------------------------
*/

bot.command(
  "settarget",
  adminOnly(async (ctx) => {
    await setSetting(
      "target_chat_id",
      String(ctx.chat.id)
    );

    await ctx.reply(
      `این چت به عنوان مقصد انتشار ذخیره شد:\n${ctx.chat.id}`
    );
  })
);

/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

bot.command(
  "cancel",
  adminOnly(async (ctx) => {
    await clearSession(ctx.from.id);

    await ctx.reply(
      "فرآیند لغو شد."
    );
  })
);

/*
|--------------------------------------------------------------------------
| NEW
|--------------------------------------------------------------------------
*/

bot.command(
  "new",
  adminOnly(async (ctx) => {
    await setSession(
      ctx.from.id,
      0,
      {}
    );

    await ctx.reply(
      "ساخت محتوای جدید شروع شد. 🎬"
    );

    await sendStep(ctx, 0);
  })
);

/*
|--------------------------------------------------------------------------
| دریافت عکس / پوستر / لوگو
|--------------------------------------------------------------------------
*/

bot.on(
  ["photo", "document"],
  adminOnly(async (ctx) => {
    const session = await getSession(
      ctx.from.id
    );

    /*
    |--------------------------------------------------------------------------
    | دریافت لوگو در SETUP
    |--------------------------------------------------------------------------
    */

    if (session?.step === 100) {
      const fileId = ctx.message.photo
        ? ctx.message.photo.at(-1).file_id
        : (
            ctx.message.document?.mime_type?.startsWith(
              "image/"
            )
              ? ctx.message.document.file_id
              : null
          );

      if (!fileId) {
        return ctx.reply(
          "لطفاً لوگو را به صورت تصویر ارسال کن."
        );
      }

      const file =
        await ctx.telegram.getFile(fileId);

      const url =
        `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

      const response =
        await fetch(url);

      const buf =
        Buffer.from(
          await response.arrayBuffer()
        );

      await setSetting(
        "logo_base64",
        buf.toString("base64")
      );

      await setSession(
        ctx.from.id,
        101,
        {}
      );

      return ctx.reply(
        "لوگو ذخیره شد. ✅\n\n" +
        "حالا آیدی کانال را بفرست، مثال:\n" +
        "@JadoMovie"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | پوستر فیلم
    |--------------------------------------------------------------------------
    */

    if (!session) return;

    if (session.step !== 0) return;

    const fileId = ctx.message.photo
      ? ctx.message.photo.at(-1).file_id
      : (
          ctx.message.document?.mime_type?.startsWith(
            "image/"
          )
            ? ctx.message.document.file_id
            : null
        );

    if (!fileId) {
      return ctx.reply(
        "فایل باید تصویر باشد."
      );
    }

    const file =
      await ctx.telegram.getFile(fileId);

    const url =
      `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

    const response =
      await fetch(url);

    const buf =
      Buffer.from(
        await response.arrayBuffer()
      );

    const posterPath =
      path.join(
        os.tmpdir(),
        `poster-${ctx.from.id}-${Date.now()}`
      );

    await fs.writeFile(
      posterPath,
      buf
    );

    await setSession(
      ctx.from.id,
      1,
      {
        posterPath
      }
    );

    await sendStep(
      ctx,
      1
    );
  })
);

/*
|--------------------------------------------------------------------------
| متن‌های مراحل
|--------------------------------------------------------------------------
*/

bot.on(
  "text",
  adminOnly(async (ctx) => {
    const session =
      await getSession(ctx.from.id);

    if (!session) return;

    /*
    |--------------------------------------------------------------------------
    | آیدی کانال
    |--------------------------------------------------------------------------
    */

    if (session.step === 101) {
      await setSetting(
        "channel_id",
        ctx.message.text.trim()
      );

      await setSession(
        ctx.from.id,
        102,
        {}
      );

      return ctx.reply(
        "آیدی کانال ذخیره شد. ✅\n\n" +
        "حالا پیام نمونه دارای Premium Emoji را برای ربات بفرست."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | نمونه استایل
    |--------------------------------------------------------------------------
    */

    if (session.step === 102) {
      const emojis =
        await saveEmojiSample(ctx);

      if (!emojis.length) {
        return ctx.reply(
          "در این پیام Premium Emoji پیدا نشد.\n\n" +
          "پیام را مستقیم برای ربات بفرست تا entityهای custom_emoji قابل خواندن باشند."
        );
      }

      await clearSession(
        ctx.from.id
      );

      return ctx.reply(
        `استایل ذخیره شد. ${emojis.length} ایموجی سفارشی پیدا شد. ✅\n\n` +
        "حالا با /new محتوای جدید بساز."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | مراحل اطلاعات فیلم
    |--------------------------------------------------------------------------
    */

    if (
      session.step < 1 ||
      session.step > 9
    ) {
      return;
    }

    const data = {
      ...session.data
    };

    const key =
      steps[session.step][0];

    /*
    |--------------------------------------------------------------------------
    | انتخاب نوع لینک
    |--------------------------------------------------------------------------
    */

    if (key === "linkMode") {
      return;
    }

    /*
    |--------------------------------------------------------------------------
    | لینک‌ها
    |--------------------------------------------------------------------------
    */

    if (key === "links") {
      const urls =
        ctx.message.text
          .split(/\n+/)
          .map((x) => x.trim())
          .filter(Boolean);

      if (!urls.length) {
        return ctx.reply(
          "حداقل یک لینک بفرست."
        );
      }

      /*
      |--------------------------------------------------------------------------
      | فقط دوبله
      |--------------------------------------------------------------------------
      */

      if (data.linkMode === "dubbed") {
        data.links = urls.map(
          (url) => ({
            type: "dubbed",
            url
          })
        );

        await setSession(
          ctx.from.id,
          10,
          data
        );

        return finalize(
          ctx,
          data
        );
      }

      /*
      |--------------------------------------------------------------------------
      | فقط زیرنویس
      |--------------------------------------------------------------------------
      */

      if (data.linkMode === "subtitle") {
        data.links = urls.map(
          (url) => ({
            type: "subtitle",
            url
          })
        );

        await setSession(
          ctx.from.id,
          10,
          data
        );

        return finalize(
          ctx,
          data
        );
      }

      /*
      |--------------------------------------------------------------------------
      | حالت هر دو
      |--------------------------------------------------------------------------
      |
      | در این حالت لینک اول = زیرنویس
      | لینک دوم = دوبله
      |
      | اما برای جلوگیری از اشتباه، در حالت both
      | اصلاً از این قسمت عبور نمی‌کنیم؛
      | دکمه انتخاب both در پایین، مرحله جداگانه
      | برای دریافت دو لینک ایجاد می‌کند.
      |--------------------------------------------------------------------------
      */

      if (data.linkMode === "both") {
        return ctx.reply(
          "در حالت «هر دو»، لینک‌ها باید جداگانه وارد شوند.\n\n" +
          "ابتدا لینک زیرنویس را بفرست."
        );
      }

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | ذخیره اطلاعات معمولی فیلم
    |--------------------------------------------------------------------------
    */

    data[key] =
      ctx.message.text.trim();

    const next =
      session.step + 1;

    await setSession(
      ctx.from.id,
      next,
      data
    );

    await sendStep(
      ctx,
      next
    );
  })
);

/*
|--------------------------------------------------------------------------
| انتخاب دوبله / زیرنویس / هر دو
|--------------------------------------------------------------------------
*/

bot.action(
  /^link:(dubbed|subtitle|both)$/,
  adminOnly(async (ctx) => {
    await ctx.answerCbQuery();

    const session =
      await getSession(ctx.from.id);

    if (
      !session ||
      session.step !== 8
    ) {
      return;
    }

    const mode =
      ctx.match[1];

    /*
    |--------------------------------------------------------------------------
    | فقط دوبله
    |--------------------------------------------------------------------------
    */

    if (mode === "dubbed") {
      await setSession(
        ctx.from.id,
        9,
        {
          ...session.data,
          linkMode: "dubbed"
        }
      );

      return ctx.editMessageText(
        "نوع لینک: 🎤 دوبله\n\n" +
        "۹/۱۰ — لینک دوبله فارسی را بفرست."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | فقط زیرنویس
    |--------------------------------------------------------------------------
    */

    if (mode === "subtitle") {
      await setSession(
        ctx.from.id,
        9,
        {
          ...session.data,
          linkMode: "subtitle"
        }
      );

      return ctx.editMessageText(
        "نوع لینک: 📝 زیرنویس\n\n" +
        "۹/۱۰ — لینک زیرنویس چسبیده را بفرست."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | هر دو
    |--------------------------------------------------------------------------
    */

    if (mode === "both") {
      await setSession(
        ctx.from.id,
        9,
        {
          ...session.data,
          linkMode: "both",
          linkStage: "subtitle",
          links: []
        }
      );

      return ctx.editMessageText(
        "نوع لینک: 🎤 + 📝 هر دو\n\n" +
        "۹/۱۰ — ابتدا لینک زیرنویس چسبیده را بفرست."
      );
    }
  })
);

/*
|--------------------------------------------------------------------------
| دریافت لینک‌ها در حالت هر دو
|--------------------------------------------------------------------------
*/

bot.on(
  "text",
  adminOnly(async (ctx, next) => {
    const session =
      await getSession(ctx.from.id);

    if (!session) {
      return next();
    }

    /*
    |--------------------------------------------------------------------------
    | فقط زمانی اجرا شود که در مرحله لینک باشیم
    |--------------------------------------------------------------------------
    */

    if (
      session.step !== 9 ||
      session.data?.linkMode !== "both"
    ) {
      return next();
    }

    const url =
      ctx.message.text.trim();

    if (!url) {
      return ctx.reply(
        "لطفاً لینک را بفرست."
      );
    }

    const data = {
      ...session.data
    };

    /*
    |--------------------------------------------------------------------------
    | لینک اول = زیرنویس
    |--------------------------------------------------------------------------
    */

    if (
      data.linkStage === "subtitle"
    ) {
      data.links = [
        {
          type: "subtitle",
          url
        }
      ];

      data.linkStage = "dubbed";

      await setSession(
        ctx.from.id,
        9,
        data
      );

      return ctx.reply(
        "لینک زیرنویس ذخیره شد. ✅\n\n" +
        "حالا لینک دوبله فارسی را بفرست."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | لینک دوم = دوبله
    |--------------------------------------------------------------------------
    */

    if (
      data.linkStage === "dubbed"
    ) {
      data.links = [
        ...(data.links || []),
        {
          type: "dubbed",
          url
        }
      ];

      await setSession(
        ctx.from.id,
        10,
        data
      );

      return finalize(
        ctx,
        data
      );
    }

    return next();
  })
);

/*
|--------------------------------------------------------------------------
| ساخت و ارسال نهایی
|--------------------------------------------------------------------------
*/

async function finalize(
  ctx,
  data
) {
  await ctx.reply(
    "در حال ساخت تصویر و متن نهایی… 🎬"
  );

  let out = null;

  try {
    /*
    |--------------------------------------------------------------------------
    | لوگو
    |--------------------------------------------------------------------------
    */

    const logoBase64 =
      await getSetting(
        "logo_base64",
        null
      );

    const logo =
      logoBase64
        ? Buffer.from(
            logoBase64,
            "base64"
          )
        : null;

    /*
    |--------------------------------------------------------------------------
    | ساخت پوستر
    |--------------------------------------------------------------------------
    */

    out =
      await makePoster(
        data.posterPath,
        logo
      );

    /*
    |--------------------------------------------------------------------------
    | ساخت کپشن
    |--------------------------------------------------------------------------
    */

    const caption =
      await buildCaption(data);

    /*
    |--------------------------------------------------------------------------
    | مقصد
    |--------------------------------------------------------------------------
    */

    const target =
      await getSetting(
        "target_chat_id",
        null
      );

    const chatId =
      target || ctx.chat.id;

    /*
    |--------------------------------------------------------------------------
    | ارسال
    |--------------------------------------------------------------------------
    */

    await ctx.telegram.sendPhoto(
      chatId,
      {
        source: out
      },
      {
        caption,
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );

    await ctx.reply(
      "محتوا با موفقیت ساخته و ارسال شد. ✅"
    );
  } catch (err) {
    console.error(
      "FINALIZE ERROR:",
      err
    );

    await ctx.reply(
      "خطا در ساخت یا ارسال محتوا.\n\n" +
      "لاگ Render را بررسی کن."
    );
  } finally {
    await clearSession(
      ctx.from.id
    );

    if (out) {
      await cleanupDir(
        out
      ).catch(() => {});
    }

    if (data.posterPath) {
      await fs.rm(
        data.posterPath,
        {
          force: true
        }
      ).catch(() => {});
    }
  }
}

export default bot;
