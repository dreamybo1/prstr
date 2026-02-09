require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const connectDB = require("./db");
const { startLoginFlow } = require("./auth");
const Order = require("./models/Order");
const startChecker = require("./checker");

connectDB();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// === Пользовательские состояния ===
const userStates = {};

// === Главное меню ===
function sendMainMenu(chatId) {
  bot.sendMessage(chatId, "Главное меню:", {
    reply_markup: {
      keyboard: [
        ["📦 Мои заказы", "➕ Добавить заказ"],
        ["❌ Удалить заказ", "🔐 Логин"],
      ],
      resize_keyboard: true,
    },
  });
}

// === Просмотр заказов ===
async function showOrders(chatId) {
  const orders = await Order.find({ chatId });

  if (!orders.length) {
    return bot.sendMessage(chatId, "У вас нет заказов", {
      reply_markup: { keyboard: [["⬅️ Назад"]], resize_keyboard: true },
    });
  }

  for (const order of orders) {
    let itemsText = "";
    if (order.items && order.items.length) {
      itemsText = order.items.map(i => `• ${i.name} x${i.qty}`).join("\n");
    }

    const text = `📦 Заказ: ${order.orderId}\n` +
      `Статус: ${order.lastStatus || "неизвестно"}\n` +
      `Факт поставки: ${order.deliveryStatus || "неизвестно"}\n` +
      `Дата заключения: ${order.contractDate || "неизвестно"}\n` +
      `Дата поставки: ${order.deliveryDate || "неизвестно"}\n` +
      `Стоимость: ${order.cost || "неизвестно"} ₽\n` +
      (itemsText ? `Состав:\n${itemsText}` : "");

    await bot.sendMessage(chatId, text, {
      reply_markup: { keyboard: [["⬅️ Назад"]], resize_keyboard: true },
    });
  }
}

// === Добавление заказа ===
function askOrderNumber(chatId) {
  userStates[chatId] = "waiting_order";
  bot.sendMessage(chatId, "Введите номер заказа:", {
    reply_markup: { keyboard: [["⬅️ Назад"]], resize_keyboard: true },
  });
}

// === Удаление заказа ===
async function showDeleteMenu(chatId) {
  const orders = await Order.find({ chatId });

  if (!orders.length) {
    return bot.sendMessage(chatId, "Нет заказов для удаления", {
      reply_markup: { keyboard: [["⬅️ Назад"]], resize_keyboard: true },
    });
  }

  const buttons = orders.map(o => [o.orderId]);
  buttons.push(["⬅️ Назад"]);

  bot.sendMessage(chatId, "Выберите заказ для удаления:", {
    reply_markup: { keyboard: buttons, resize_keyboard: true },
  });
}

// === Обработчик сообщений ===
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // --- Главное меню ---
  if (text === "/start" || text === "⬅️ Назад") {
    return sendMainMenu(chatId);
  }

  if (text === "📦 Мои заказы") return showOrders(chatId);
  if (text === "➕ Добавить заказ") return askOrderNumber(chatId);
  if (text === "❌ Удалить заказ") return showDeleteMenu(chatId);
  if (text === "🔐 Логин") return startLoginFlow(bot, chatId);

  // --- Добавление нового заказа ---
  if (userStates[chatId] === "waiting_order") {
    if (text === "⬅️ Назад") {
      delete userStates[chatId];
      return sendMainMenu(chatId);
    }

    await Order.create({
      chatId,
      orderId: text,
      lastStatus: null,
      deliveryStatus: null,
      contractDate: null,
      deliveryDate: null,
      cost: null,
      items: [],
    });

    delete userStates[chatId];

    return bot.sendMessage(chatId, `✅ Заказ ${text} добавлен!`, {
      reply_markup: { keyboard: [["⬅️ В меню"]], resize_keyboard: true },
    });
  }

  // --- Удаление заказа ---
  const order = await Order.findOne({ chatId, orderId: text });
  if (order) {
    await Order.deleteOne({ chatId, orderId: text });
    return bot.sendMessage(chatId, `❌ Заказ ${text} удалён`, {
      reply_markup: { keyboard: [["⬅️ В меню"]], resize_keyboard: true },
    });
  }
});

// === Ошибки опроса ===
bot.on("polling_error", (err) => {
  console.log("Polling error:", err.message);
});

// === Запуск чекера ===
startChecker(bot);

module.exports = bot;
