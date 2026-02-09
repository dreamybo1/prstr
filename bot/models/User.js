const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  phone: String,

  // 👇 вот здесь храним playwright storageState
  session: {
    type: Object,
    default: null
  }

}, { timestamps: true })

module.exports = mongoose.model('User', userSchema)
