const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  roles: [{ type: String, enum: ['customer', 'provider', 'admin'], default: ['customer'] }],
  activeRole: { type: String, enum: ['customer', 'provider', 'admin'], default: 'customer' },
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
  },
  customerProfile: {
    preferences: [{ type: String }],
    savedAddresses: [{ type: String }],
    bookingHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
    reviewsGiven: [{ type: String }],
    favoriteProviders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  providerProfile: {
    profilePhoto: { type: String, default: '' },
    servicesOffered: [{ type: String }],
    serviceCategory: { type: String, default: '' },
    description: { type: String, default: '' },
    skills: [{ type: String }],
    experience: { type: String, default: '' },
    pricing: { type: String, default: '' },
    availability: { type: String, default: '' },
    serviceLocation: { type: String, default: '' },
    ratings: { type: Number, default: 5.0 },
    verificationStatus: { type: String, default: 'pending' },
    bankDetails: { type: mongoose.Schema.Types.Mixed, default: {} }
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
  status: { type: String, default: 'CONFIRMED' },
  latitude: { type: Number },
  longitude: { type: Number },
  locationUpdatedAt: { type: Date, default: null },
  locationSharingEnabled: { type: Boolean, default: false },
  trackingStartedAt: { type: Date, default: null },
  trackingStoppedAt: { type: Date, default: null }
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

const performanceAnalysisSchema = new mongoose.Schema({
  websiteUrl: { type: String, required: true, maxlength: 2048 },
  deviceType: { type: String, enum: ['desktop-and-mobile'], default: 'desktop-and-mobile' },
  desktop: { type: mongoose.Schema.Types.Mixed, required: true },
  mobile: { type: mongoose.Schema.Types.Mixed, required: true },
  analyzedAt: { type: Date, default: Date.now }
}, { timestamps: true });

performanceAnalysisSchema.index({ analyzedAt: -1 });

module.exports = {
  User: mongoose.model('User', userSchema),
  Booking: mongoose.model('Booking', bookingSchema),
  GroupPool: mongoose.model('GroupPool', groupPoolSchema),
  ActivityLog: mongoose.model('ActivityLog', activityLogSchema),
  PerformanceAnalysis: mongoose.model('PerformanceAnalysis', performanceAnalysisSchema)
};