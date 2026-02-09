const puppeteer = require("puppeteer");
const User = require("./models/User");

async function startLoginFlow(bot, chatId) {
  const browser = await puppeteer.launch({
    headless: false, // можно true на проде
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  await page.goto(process.env.LOGIN_URL, {
    waitUntil: "networkidle2",
  });

  await bot.sendMessage(chatId, "Введите номер телефона:");

  const phoneHandler = async (msg) => {
    if (msg.chat.id !== chatId) return;

    bot.removeListener("message", phoneHandler);

    const phone = msg.text;

    try {
      await page.type("input[type=tel]", phone, { delay: 50 });
      await page.click("button");

      await bot.sendMessage(chatId, "Введите SMS код:");

      const codeHandler = async (msg2) => {
        if (msg2.chat.id !== chatId) return;

        bot.removeListener("message", codeHandler);

        const code = msg2.text;

        try {
          await page.type("input[type=text]", code, { delay: 50 });
          await page.click("button");

          // Ждём успешную авторизацию
          await page.waitForFunction(
            () => !window.location.href.includes("login"),
            { timeout: 60000 }
          );

          // Получаем cookies
          const cookies = await page.cookies();

          await User.findOneAndUpdate(
            { chatId },
            {
              chatId,
              phone,
              session: JSON.stringify({ cookies }),
            },
            { upsert: true, new: true }
          );

          await bot.sendMessage(chatId, "Авторизация успешна ✅");
        } catch (err) {
          await bot.sendMessage(chatId, "❌ Ошибка при вводе кода");
          console.log("Login code error:", err.message);
        }

        await browser.close();
      };

      bot.on("message", codeHandler);
    } catch (err) {
      await bot.sendMessage(chatId, "❌ Ошибка при вводе телефона");
      console.log("Login phone error:", err.message);
      await browser.close();
    }
  };

  bot.on("message", phoneHandler);
}

module.exports = { startLoginFlow };
