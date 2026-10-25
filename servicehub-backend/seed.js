require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('./models');

async function seed() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) throw new Error('Set MONGODB_URI before running the seed script.');
    await mongoose.connect(mongoUri);
    await User.deleteMany({ role: 'provider' });

    const password = await bcrypt.hash('secret123', 10);
    await User.create([
      {
        name: 'John Smith',
        email: 'john@servicehub.com',
        password,
        role: 'provider',
        phone: '+1 555-0192',
        service: 'Electrician',
        rating: 4.9,
        verified: { govtId: true, criminalCheck: true, certified: true }
      },
      {
        name: 'Alex Vance',
        email: 'alex@servicehub.com',
        password,
        role: 'provider',
        phone: '+1 555-0144',
        service: 'AC Specialist',
        rating: 5.0,
        verified: { govtId: true, criminalCheck: true, certified: true }
      },
      {
        name: 'Sarah Johnson',
        email: 'sarah@servicehub.com',
        password,
        role: 'provider',
        phone: '+1 555-0188',
        service: 'Plumber',
        rating: 4.8,
        verified: { govtId: true, criminalCheck: true, certified: true }
      }
    ]);
    console.log('✅ Providers seeded successfully!');
  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    process.exit();
  }
}
seed();