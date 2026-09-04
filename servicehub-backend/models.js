const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['customer', 'provider', 'admin'], default: 'customer' },
  phone: String,
  service: String,
  preferredHelpers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  rating: { type: Number, default: 5.0 },
  location: {
    lat: { type: Number, default: 13.0827 },
    lng: { type: Number, default: 80.2707 }
  },
  verified: {
    govtId: { type: Boolean, default: true },
    criminalCheck: { type: Boolean, default: true },
    certified: { type: Boolean, default: true }
  }
}, { timestamps: true });

const bookingSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customerEmail: { type: String },
  service: { type: String, required: true },
  date: { type: String, required: true },
  timeSlot: { type: String, required: true },
  address: { type: String, required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, default: 'UPI' },
  otp: { type: String },
  escrowStatus: { 
    type: String, 
    enum: ['HELD_IN_ESCROW', 'RELEASED_TO_PROVIDER', 'REFUNDED', 'DISPUTED'], 
    default: 'HELD_IN_ESCROW' 
  },
  status: { type: String, default: 'CONFIRMED' }
}, { timestamps: true });

const groupPoolSchema = new mongoose.Schema({
  service: { type: String, required: true },
  neighborhood: { type: String, required: true },
  targetSlots: { type: Number, default: 4 },
  discount: { type: String, default: '10%' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, default: 'OPEN' }
}, { timestamps: true });

const activityLogSchema = new mongoose.Schema({
  userEmail: String,
  userName: String,
  actionType: String,
  details: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = {
  User: mongoose.model('User', userSchema),
  Booking: mongoose.model('Booking', bookingSchema),
  GroupPool: mongoose.model('GroupPool', groupPoolSchema),
  ActivityLog: mongoose.model('ActivityLog', activityLogSchema)
};