const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  chatId: { type: Number, required: true },
  orderId: { type: String, required: true },
  lastStatus: String,
  factDelivery: String,
  contractNumber: String,
  signingDate: String,
  deliveryDate: String,
  cost: String,
  items: [
    {
      name: String,
      quantity: String,
      price: String,
    },
  ],
});

module.exports = mongoose.model("Order", orderSchema);
