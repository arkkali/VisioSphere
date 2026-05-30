const mongoose=require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(async()=>{
  const I=require('./models/Incident');
  const count=await I.countDocuments({createdAt:{$gte:new Date('2026-05-30T00:00:00.000Z')}});
  console.log('Today incidents:',count);
  const l=await I.find().sort({createdAt:-1}).limit(3).select('createdAt incidentType');
  console.log(JSON.stringify(l,null,2));
  process.exit();
});
