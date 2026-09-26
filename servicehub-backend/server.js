require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Booking, GroupPool, ActivityLog } = require('./models');
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch (err) {
  console.error('Twilio SDK unavailable:', err.message);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const JWT_SECRET = process.env.JWT_SECRET || 'servicehub-dev-secret';

const normalizeRoles = roles => {
  const entries = Array.isArray(roles) ? roles : [roles].filter(Boolean);
  const cleaned = entries.map(role => String(role).toLowerCase()).filter(Boolean);
  return [...new Set(cleaned)];
};

const normalizeUserRoleState = user => {
  const baseRoles = normalizeRoles(user.roles && user.roles.length ? user.roles : user.role ? [user.role] : ['customer']);
  const roles = baseRoles.length ? baseRoles : ['customer'];
  const activeRole = roles.includes(user.activeRole) ? user.activeRole : roles[0];
  user.roles = roles;
  user.activeRole = activeRole;
  user.role = activeRole;
  return user;
};

const isValidCoordinate = (lat, lng) => {
  const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const validLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
  return validLat && validLng;
};

const getAuthToken = req => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
};

const requireAuth = (req, res, next) => {
  try {
    const token = getAuthToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { _id: decoded.id, role: decoded.role || 'customer' };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

const requireActiveBookingAccess = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.bookingId || req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const isProvider = String(req.user._id) === String(booking.providerId);
    const isCustomer = String(req.user._id) === String(booking.customerId);
    if (!isProvider && !isCustomer) return res.status(403).json({ error: 'You are not authorized to access this booking.' });
    if (['COMPLETED', 'CANCELLED', 'REJECTED', 'FAILED'].includes(booking.status)) {
      return res.status(410).json({ error: 'This booking is no longer active.' });
    }
    req.booking = booking;
    next();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

io.on('connection', socket => {
  socket.on('join-video-room', roomId => {
    socket.join(roomId);
    socket.to(roomId).emit('video-peer-joined');
  });
  socket.on('join-booking-room', bookingId => {
    if (!bookingId) return;
    socket.join(`booking:${bookingId}`);
  });
  socket.on('leave-booking-room', bookingId => {
    if (!bookingId) return;
    socket.leave(`booking:${bookingId}`);
  });
  socket.on('video-offer', ({ roomId, offer }) => socket.to(roomId).emit('video-offer', offer));
  socket.on('video-answer', ({ roomId, answer }) => socket.to(roomId).emit('video-answer', answer));
  socket.on('ice-candidate', ({ roomId, candidate }) => socket.to(roomId).emit('ice-candidate', candidate));
  socket.on('leave-video-room', roomId => socket.leave(roomId));
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use(express.static(__dirname));
app.get('/api/config', (req, res) => {
  res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'ProConnect API', timestamp: new Date().toISOString() });
});
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/servicehub')
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error. Ensure MongoDB service is started.');
    console.error(err.message);
  });

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, roles, service, phone, activeRole } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const incomingRoles = normalizeRoles(roles && roles.length ? roles : [role || 'customer']);
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      existingUser.roles = normalizeRoles([...existingUser.roles, ...incomingRoles]);
      existingUser.role = existingUser.activeRole || existingUser.roles[0] || 'customer';
      existingUser.activeRole = existingUser.activeRole || existingUser.roles[0] || 'customer';
      if (!existingUser.customerProfile) existingUser.customerProfile = { preferences: [], savedAddresses: [], bookingHistory: [], reviewsGiven: [], favoriteProviders: [] };
      if (incomingRoles.includes('provider') && !existingUser.providerProfile) {
        existingUser.providerProfile = {
          profilePhoto: '',
          servicesOffered: service ? [service] : [],
          serviceCategory: service || '',
          description: '',
          skills: [],
          experience: '',
          pricing: '',
          availability: '',
          serviceLocation: '',
          ratings: 5.0,
          verificationStatus: 'pending',
          bankDetails: {}
        };
      }
      if (incomingRoles.includes('customer') && !existingUser.customerProfile) {
        existingUser.customerProfile = { preferences: [], savedAddresses: [], bookingHistory: [], reviewsGiven: [], favoriteProviders: [] };
      }
      if (activeRole && existingUser.roles.includes(activeRole)) {
        existingUser.activeRole = activeRole;
        existingUser.role = activeRole;
      }
      await existingUser.save();
      const token = jwt.sign({ id: existingUser._id, role: existingUser.activeRole }, JWT_SECRET);
      return res.status(200).json({ token, user: existingUser });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      roles: normalizeRoles(incomingRoles),
      activeRole: activeRole || normalizeRoles(incomingRoles)[0] || 'customer',
      role: activeRole || normalizeRoles(incomingRoles)[0] || 'customer',
      service,
      phone,
      customerProfile: {
        preferences: [],
        savedAddresses: [],
        bookingHistory: [],
        reviewsGiven: [],
        favoriteProviders: []
      },
      providerProfile: incomingRoles.includes('provider') ? {
        profilePhoto: '',
        servicesOffered: service ? [service] : [],
        serviceCategory: service || '',
        description: '',
        skills: [],
        experience: '',
        pricing: '',
        availability: '',
        serviceLocation: '',
        ratings: 5.0,
        verificationStatus: 'pending',
        bankDetails: {}
      } : {
        profilePhoto: '',
        servicesOffered: [],
        serviceCategory: '',
        description: '',
        skills: [],
        experience: '',
        pricing: '',
        availability: '',
        serviceLocation: '',
        ratings: 5.0,
        verificationStatus: 'pending',
        bankDetails: {}
      }
    });

    const token = jwt.sign({ id: user._id, role: user.activeRole }, JWT_SECRET);
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    normalizeUserRoleState(user);
    const token = jwt.sign({ id: user._id, role: user.activeRole }, JWT_SECRET);
    await user.save();
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/select-role', requireAuth, async (req, res) => {
  try {
    const { role } = req.body || {};
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const roles = normalizeUserRoleState(user).roles;
    if (!role || !roles.includes(String(role).toLowerCase())) {
      return res.status(400).json({ error: 'Selected role is not available for this account.' });
    }
    user.activeRole = String(role).toLowerCase();
    user.role = String(role).toLowerCase();
    await user.save();
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/upgrade-role', requireAuth, async (req, res) => {
  try {
    const { role } = req.body || {};
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const nextRole = String(role || 'provider').toLowerCase();
    if (!['customer', 'provider'].includes(nextRole)) {
      return res.status(400).json({ error: 'Unsupported role.' });
    }

    user.roles = normalizeRoles([...user.roles, nextRole]);
    if (nextRole === 'provider' && !user.providerProfile) {
      user.providerProfile = {
        profilePhoto: '',
        servicesOffered: [],
        serviceCategory: user.service || '',
        description: '',
        skills: [],
        experience: '',
        pricing: '',
        availability: '',
        serviceLocation: '',
        ratings: 5.0,
        verificationStatus: 'pending',
        bankDetails: {}
      };
    }
    if (nextRole === 'customer' && !user.customerProfile) {
      user.customerProfile = { preferences: [], savedAddresses: [], bookingHistory: [], reviewsGiven: [], favoriteProviders: [] };
    }
    user.activeRole = nextRole;
    user.role = nextRole;
    await user.save();
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ user });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

app.put('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, email, phone, password } = req.body || {};
    if (name) user.name = String(name).trim();
    if (phone) user.phone = String(phone).trim();
    if (email) user.email = String(email).trim().toLowerCase();
    if (password) user.password = await bcrypt.hash(String(password), 10);

    const existingUser = await User.findOne({ email: user.email, _id: { $ne: user._id } });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const updatedUser = await user.save();
    const safeUser = updatedUser.toObject();
    delete safeUser.password;
    res.json({ user: safeUser });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/providers', async (req, res) => {
  const providers = await User.find({ role: 'provider' }).select('-password');
  res.json(providers);
});

app.get('/api/users/:id/favorites', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('preferredHelpers');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ favoriteIds: user.preferredHelpers.map(id => String(id)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id/favorites', async (req, res) => {
  try {
    const { providerId, favorite } = req.body;
    if (!mongoose.isValidObjectId(providerId)) return res.status(400).json({ error: 'Invalid provider ID' });
    const update = favorite
      ? { $addToSet: { preferredHelpers: providerId } }
      : { $pull: { preferredHelpers: providerId } };
    const user = await User.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' }).select('preferredHelpers');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ favoriteIds: user.preferredHelpers.map(id => String(id)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/providers/:id/location', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!isValidCoordinate(Number(lat), Number(lng))) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }
    const provider = await User.findByIdAndUpdate(
      req.params.id,
      { location: { lat: Number(lat), lng: Number(lng) } },
      { returnDocument: 'after' }
    ).select('-password');

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    io.emit('provider-location-updated', {
      providerId: provider._id,
      location: provider.location
    });
    res.json({ success: true, provider });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bookings/:bookingId/start-tracking', requireAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (String(req.user._id) !== String(booking.providerId)) {
      return res.status(403).json({ error: 'Only the assigned provider can start tracking for this booking.' });
    }
    if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(booking.status)) {
      return res.status(409).json({ error: 'This booking is no longer active.' });
    }

    booking.locationSharingEnabled = true;
    booking.trackingStartedAt = new Date();
    booking.trackingStoppedAt = null;
    booking.status = booking.status === 'CONFIRMED' ? 'PROVIDER_EN_ROUTE' : booking.status;
    await booking.save();

    io.to(`booking:${booking._id}`).emit('booking-location-status', {
      bookingId: booking._id,
      locationSharingEnabled: true,
      status: booking.status,
      message: 'Location sharing enabled.'
    });

    res.json({ success: true, booking });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bookings/:bookingId/stop-tracking', requireAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const isProvider = String(req.user._id) === String(booking.providerId);
    const isCustomer = String(req.user._id) === String(booking.customerId);
    if (!isProvider && !isCustomer) {
      return res.status(403).json({ error: 'You are not authorized to stop tracking for this booking.' });
    }

    booking.locationSharingEnabled = false;
    booking.trackingStoppedAt = new Date();
    await booking.save();

    io.to(`booking:${booking._id}`).emit('booking-location-status', {
      bookingId: booking._id,
      locationSharingEnabled: false,
      status: booking.status,
      message: 'Location sharing stopped.'
    });

    res.json({ success: true, booking });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bookings/:bookingId/location', requireAuth, async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (String(req.user._id) !== String(booking.providerId)) {
      return res.status(403).json({ error: 'Only the assigned provider can send a live location for this booking.' });
    }
    if (!isValidCoordinate(Number(lat), Number(lng))) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }
    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      return res.status(409).json({ error: 'Tracking is not available after the booking ends.' });
    }

    booking.latitude = Number(lat);
    booking.longitude = Number(lng);
    booking.locationUpdatedAt = new Date();
    booking.locationSharingEnabled = true;
    if (!booking.trackingStartedAt) booking.trackingStartedAt = booking.locationUpdatedAt;
    await booking.save();

    const payload = {
      bookingId: booking._id,
      providerId: booking.providerId,
      customerId: booking.customerId,
      location: { lat: booking.latitude, lng: booking.longitude },
      locationUpdatedAt: booking.locationUpdatedAt,
      locationSharingEnabled: booking.locationSharingEnabled,
      status: booking.status,
      service: booking.service
    };

    io.to(`booking:${booking._id}`).emit('booking-location-update', payload);
    io.emit('provider-location-updated', {
      providerId: booking.providerId,
      bookingId: booking._id,
      location: { lat: booking.latitude, lng: booking.longitude }
    });

    res.json({ success: true, booking: payload });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/bookings/:bookingId/location', requireAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const isProvider = String(req.user._id) === String(booking.providerId);
    const isCustomer = String(req.user._id) === String(booking.customerId);
    if (!isProvider && !isCustomer) {
      return res.status(403).json({ error: 'You are not authorized to view this location.' });
    }

    if (!booking.locationSharingEnabled || !booking.latitude || !booking.longitude) {
      return res.status(200).json({
        bookingId: booking._id,
        location: null,
        locationSharingEnabled: false,
        status: booking.status,
        locationUpdatedAt: booking.locationUpdatedAt,
        message: 'Provider has not started sharing location yet.'
      });
    }

    res.json({
      bookingId: booking._id,
      providerId: booking.providerId,
      customerId: booking.customerId,
      location: { lat: booking.latitude, lng: booking.longitude },
      locationUpdatedAt: booking.locationUpdatedAt,
      locationSharingEnabled: booking.locationSharingEnabled,
      status: booking.status,
      service: booking.service,
      message: 'Live provider location available.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add a new service / provider listing (Restricted to Providers and Admins)
app.post('/api/providers', async (req, res) => {
  try {
    const { name, service, price, creatorEmail } = req.body;

    if (!creatorEmail) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Check permissions of the user attempting to create the listing
    const requestingUser = await User.findOne({ email: creatorEmail });
    if (!requestingUser || !['provider', 'admin'].includes(requestingUser.role)) {
      return res.status(403).json({ error: 'Access denied: Only providers or admins can add services.' });
    }

    if (!name || !service) {
      return res.status(400).json({ error: 'Name and service title are required.' });
    }

    const newProvider = new User({
      name,
      service,
      rating: 5.0,
      role: 'provider',
      email: `${name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}@servicehub.local`,
      password: 'defaultPassword123'
    });

    const saved = await newProvider.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create service listing' });
  }
});
app.post('/api/ai/diagnose', (req, res) => {
  const { category, symptoms } = req.body;
  let report = {
    confidence: '95%',
    probableRootCause: 'Standard wear & tear detected in internal circuits.',
    estimatedCost: '$35.00 - $55.00',
    precaution: 'Turn off the primary breaker before physical handling.'
  };

  const query = (symptoms + ' ' + category).toLowerCase();
  if (query.includes('ac') || query.includes('air conditioner') || query.includes('compressor')) {
    report = {
      confidence: '96%',
      probableRootCause: 'Defective Dual Run Capacitor (45/5 uF) or low refrigerant pressure.',
      estimatedCost: '$45.00 - $65.00',
      precaution: 'Avoid continuous restart cycles to protect compressor.'
    };
  }
  res.json(report);
});

app.post('/api/bookings', async (req, res) => {
  try {
    const payload = {
      ...req.body,
      otp: String(req.body.otp || Math.floor(100000 + Math.random() * 900000))
    };
    const booking = await Booking.create(payload);
    res.status(201).json(booking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const { email, customerId } = req.query;
    const query = email || customerId ? {
      $or: [
        ...(email ? [{ customerEmail: String(email).trim().toLowerCase() }] : []),
        ...(customerId && mongoose.isValidObjectId(customerId) ? [{ customerId }] : [])
      ]
    } : {};
    const bookings = await Booking.find(query).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings/:id/verify-otp', requireAuth, async (req, res) => {
  try {
    const { otp } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const isProvider = String(req.user._id) === String(booking.providerId);
    const isCustomer = String(req.user._id) === String(booking.customerId);
    if (!isProvider && !isCustomer) {
      return res.status(403).json({ error: 'You are not authorized to verify this booking OTP.' });
    }

    if (String(booking.otp) !== String(otp)) {
      return res.status(400).json({ valid: false, message: 'Invalid OTP. Please confirm the one shared by the customer.' });
    }

    booking.escrowStatus = 'RELEASED_TO_PROVIDER';
    booking.status = 'COMPLETED';
    await booking.save();

    res.json({ valid: true, booking });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/group-pools', async (req, res) => {
  try {
    let pools = await GroupPool.find().sort({ createdAt: 1 });
    if (!pools.length) {
      pools = await GroupPool.insertMany([
        { service: 'AC Service', neighborhood: 'Vellanur', targetSlots: 4, discount: '10%' },
        { service: 'Plumbing', neighborhood: 'Chromepet', targetSlots: 5, discount: '12%' },
        { service: 'Electrical Checkup', neighborhood: 'Tambaram', targetSlots: 4, discount: '15%' }
      ]);
    }
    res.json(pools.map(pool => ({
      id: pool._id,
      service: pool.service,
      neighborhood: pool.neighborhood,
      targetSlots: pool.targetSlots,
      members: pool.members.length,
      discount: pool.discount,
      status: pool.status
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/group-pools', async (req, res) => {
  const { service, neighborhood, targetSlots, discount } = req.body;
  const pool = await GroupPool.create({ service, neighborhood, targetSlots: targetSlots || 4, discount: discount || '10%' });
  res.status(201).json({ id: pool._id, service, neighborhood, targetSlots: pool.targetSlots, members: 0, discount: pool.discount });
});

app.post('/api/group-pools/:id/join', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const pool = await GroupPool.findById(req.params.id);
    if (!pool) return res.status(404).json({ error: 'Group pool not found' });
    if (!email) return res.status(400).json({ error: 'Sign in before joining a pool.' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Sign in before joining a pool.' });
    if (pool.members.some(member => String(member) === String(user._id))) {
      return res.status(409).json({ error: 'You already joined this pool.' });
    }
    if (pool.members.length >= pool.targetSlots) return res.status(409).json({ error: 'This pool is full.' });
    pool.members.push(user._id);
    await pool.save();
    res.json({ success: true, members: pool.members.length, targetSlots: pool.targetSlots });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/bookings/:id/escrow', async (req, res) => {
  const { action } = req.body;
  const status = action === 'RELEASE' ? 'RELEASED_TO_PROVIDER' : 'DISPUTED';
  const updated = await Booking.findByIdAndUpdate(req.params.id, { escrowStatus: status }, { returnDocument: 'after' });
  res.json(updated);
});

app.post('/api/calls/masked', async (req, res) => {
  const { customerPhone, providerPhone } = req.body;
  if (!customerPhone || !providerPhone) {
    return res.status(400).json({ error: 'Customer and provider phone numbers are required.' });
  }
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    return res.status(503).json({ error: 'Masked calling is not configured. Add Twilio credentials to .env.' });
  }

  try {
    const call = await twilioClient.calls.create({
      to: customerPhone,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml: `<Response><Dial>${providerPhone}</Dial></Response>`
    });
    res.status(201).json({ success: true, callSid: call.sid, status: call.status });
  } catch (err) {
    res.status(502).json({ error: 'Twilio could not start the masked call.', details: err.message });
  }
});

app.post('/api/activity/log', async (req, res) => {
  try {
    const log = await ActivityLog.create(req.body);
    res.status(201).json(log);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sos', async (req, res) => {
  try {
    const { emergencyType, address } = req.body;
    const alert = {
      emergencyType,
      address,
      dispatchedAt: new Date().toISOString(),
      etaMinutes: 7,
      status: 'dispatched'
    };

    res.status(201).json(alert);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = { app, server, io };