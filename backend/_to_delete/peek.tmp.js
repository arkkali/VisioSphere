require('dotenv').config();
const mongoose = require('mongoose');
const { runUnscoped } = require('./models/plugins/facilityScope');
const Guardian = require('./models/Guardian');
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const rows = await runUnscoped(async () =>
    Guardian.find({}, 'guardianId status isPasswordSet').sort({ guardianId: 1 }).lean());
  rows.forEach(r => console.log(`${r.guardianId}  status=${r.status}  isPasswordSet=${r.isPasswordSet}`));
  await mongoose.connection.close();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
