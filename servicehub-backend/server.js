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

io.on('connection', socket => {
  socket.on('join-video-room', roomId => {
    socket.join(roomId);
    socket.to(roomId).emit('video-peer-joined');
  });
  socket.on('video-offer', ({ roomId, offer }) => socket.to(roomId).emit('video-offer', offer));
  socket.on('video-answer', ({ roomId, answer }) => socket.to(roomId).emit('video-answer', answer));
  socket.on('ice-candidate', ({ roomId, candidate }) => socket.to(roomId).emit('ice-candidate', candidate));
  socket.on('leave-video-room', roomId => socket.leave(roomId));
});

app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));
app.get('/api/config', (req, res) => {
  res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/servicehub')
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error. Ensure MongoDB service is started.');
    console.error(err.message);
  });

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, service, phone } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        error: 'An account with this email already exists. Please sign in instead.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: role || 'customer',
      service,
      phone
    });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
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
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const provider = await User.findByIdAndUpdate(
      req.params.id,
      { location: { lat, lng } },
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

app.post('/api/bookings/:id/verify-otp', async (req, res) => {
  const { otp } = req.body;
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (String(booking.otp) !== String(otp)) {
    return res.status(400).json({ valid: false, message: 'Invalid OTP. Please confirm the one shared by the customer.' });
  }

  booking.escrowStatus = 'RELEASED_TO_PROVIDER';
  booking.status = 'COMPLETED';
  await booking.save();

  res.json({ valid: true, booking });
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
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));