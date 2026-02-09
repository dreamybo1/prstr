const { chromium } = require('playwright') 
const User = require('./models/User')

async function startLoginFlow(bot, chatId) {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(process.env.LOGIN_URL)

  bot.sendMessage(chatId, 'Введите номер телефона:')

  const phoneHandler = async (msg) => {
    if (msg.chat.id !== chatId) return

    bot.removeListener('message', phoneHandler)

    const phone = msg.text

    await page.fill('input[type=tel]', phone)
    await page.click('button')

    await bot.sendMessage(chatId, 'Введите SMS код:')

    const codeHandler = async (msg2) => {
      if (msg2.chat.id !== chatId) return

      bot.removeListener('message', codeHandler)

      const code = msg2.text

      await page.fill('input[type=text]', code)
      await page.click('button')

      // Ждём конкретный признак успешной авторизации
      await page.waitForURL('**/faq', { timeout: 60000 })

      const state = await context.storageState()

      await User.findOneAndUpdate(
        { chatId },
        {
          chatId,
          phone,
          session: JSON.stringify(state)
        },
        { upsert: true, new: true }
      )

      await bot.sendMessage(chatId, 'Авторизация успешна ✅')

      await browser.close()
    }

    bot.on('message', codeHandler)
  }

  bot.on('message', phoneHandler)
}
module.exports = { startLoginFlow }