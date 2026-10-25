require('dotenv').config();
const mongoose = require('mongoose');
const { User, Booking } = require('./models');

async function viewDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) throw new Error('Set MONGODB_URI before checking the database.');
    await mongoose.connect(mongoUri);
    
    console.log('\n================ USERS IN DATABASE ================');
    const users = await User.find().select('-password');
    console.table(users.map(u => ({ Name: u.name, Email: u.email, Service: u.service, Role: u.role })));

    console.log('\n================ BOOKINGS IN DATABASE ================');
    const bookings = await Booking.find();
    if (bookings.length === 0) {
      console.log('No bookings found yet. Go book a service on the website!');
    } else {
      console.table(bookings.map(b => ({
        Service: b.service,
        Date: b.date,
        Slot: b.timeSlot,
        Amount: `$${b.amount}`,
        Escrow: b.escrowStatus
      })));
    }
  } catch (err) {
    console.error('Error fetching database:', err);
  } finally {
    process.exit();
  }
}
viewDatabase();