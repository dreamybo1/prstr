const puppeteer = require("puppeteer");
const Order = require("./models/Order");
const User = require("./models/User");

function startChecker(bot) {
  function getRandomInterval() {
    return Math.random() < 0.7
      ? (15 + Math.random() * 10) * 60 * 1000
      : (10 + Math.random() * 20) * 60 * 1000;
  }

  function getRandomDelayBetweenOrders() {
    const min = 5000,
      max = 20000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getRandomUserAgent() {
    const agents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "Mozilla/5.0 (X11; Linux x86_64)",
      "Mozilla/5.0 (Windows NT 10.0; WOW64)",
    ];
    return agents[Math.floor(Math.random() * agents.length)];
  }

  function getRandomViewport() {
    return {
      width: 1200 + Math.floor(Math.random() * 200),
      height: 800 + Math.floor(Math.random() * 200),
    };
  }

  async function checkOrders() {
    console.log("🔎 Проверка заказов...");

    try {
      const orders = await Order.find();
      if (!orders.length) {
        console.log("Нет заказов для проверки");
        return scheduleNext();
      }

      const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      for (const order of orders) {
        const user = await User.findOne({ chatId: order.chatId });

        if (!user?.session) {
          await bot.sendMessage(
            order.chatId,
            "❗ Сессия отсутствует. Выполните /login"
          );
          continue;
        }

        const page = await browser.newPage();

        await page.setUserAgent(getRandomUserAgent());
        await page.setViewport(getRandomViewport());

        // восстановление cookies
        const sessionData = JSON.parse(user.session);
        if (sessionData.cookies) {
          await page.setCookie(...sessionData.cookies);
        }

        try {
          await page.goto(`${process.env.ORDER_BASE_URL}/${order.orderId}`, {
            waitUntil: "networkidle2",
            timeout: 60000,
          });

          if (page.url().includes("login")) {
            await bot.sendMessage(
              order.chatId,
              "⚠️ Сессия истекла. Требуется повторный /login"
            );
            await page.close();
            continue;
          }

          // ===== Скрап =====
          const orderData = await page.evaluate(() => {
            const getText = (selector) =>
              document.querySelector(selector)?.textContent?.trim() || "";

            const factDelivery = getText(
              ".red_tabs_content table:first-of-type .status_badge"
            );
            const orderStatus = getText(
              ".red_tabs_content table:last-of-type .status_badge"
            );
            const contractNumber = getText(
              ".red_tabs_content table:last-of-type tr:nth-child(1) td:nth-child(2) div"
            );
            const deliveryDate = getText(
              ".red_tabs_content table:last-of-type tr:nth-child(2) td:nth-child(2) div"
            );
            const signingDate = getText(
              ".red_tabs_content table:first-of-type tr:nth-child(1) td:nth-child(2) div"
            );
            const cost = getText(
              ".red_tabs_content table:first-of-type tr:nth-child(2) td:nth-child(2) div"
            );

            const items = Array.from(
              document.querySelectorAll(".content_table.min tbody tr")
            ).map((tr) => {
              const cells = tr.querySelectorAll("td div");
              return {
                name: cells[0]?.textContent?.trim() || "",
                quantity: cells[1]?.textContent?.trim() || "",
                price: cells[2]?.textContent?.trim() || "",
              };
            });

            return {
              factDelivery,
              orderStatus,
              contractNumber,
              deliveryDate,
              signingDate,
              cost,
              items,
            };
          });

          // ===== Сравнение =====
          let changed = false;

          if (order.lastStatus !== orderData.orderStatus) {
            order.lastStatus = orderData.orderStatus;
            changed = true;
          }

          if (order.factDelivery !== orderData.factDelivery) {
            order.factDelivery = orderData.factDelivery;
            changed = true;
          }

          order.contractNumber = orderData.contractNumber;
          order.deliveryDate = orderData.deliveryDate;
          order.signingDate = orderData.signingDate;
          order.cost = orderData.cost;
          order.items = orderData.items;

          await order.save();

          const itemText = order.items
            .map((i) => `• ${i.name} x${i.quantity}`)
            .join("\n");

          if (changed) {
            await bot.sendMessage(
              order.chatId,
              `🔔 Статус заказа ${order.orderId} обновлён:\n${itemText}\n\nСтатус: ${order.lastStatus}\nФакт поставки: ${order.factDelivery}`
            );
          }
        } catch (err) {
          console.log(`Ошибка проверки ${order.orderId}:`, err.message);
        }

        await page.close();
        await new Promise((res) =>
          setTimeout(res, getRandomDelayBetweenOrders())
        );
      }

      await browser.close();
    } catch (err) {
      console.log("Глобальная ошибка чекера:", err.message);
    }

    scheduleNext();
  }

  function scheduleNext() {
    const next = getRandomInterval();
    console.log(`⏳ Следующая проверка через ${Math.round(next / 60000)} мин`);
    setTimeout(checkOrders, next);
  }

  scheduleNext();
}

module.exports = startChecker;
