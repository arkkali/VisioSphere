const mongoose = require('mongoose');

const residentSchema = new mongoose.Schema(
  {
    residentId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    middleName: {
      type: String,
      default: '',
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    house: {
      type: String,
      enum: [
        'House of St. Charbel',
        'House of St. Francis',
        'House of St. Gabriel',
        'House of St. Rose of Lima',
        'House of St. Sebastian',
        'Louis S. Coson Hall'
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Discharged'],
      default: 'Active',
      index: true,
    },
    admittedAt: {
      type: Date,
      default: Date.now,
    },
    dischargedAt: {
      type: Date,
      default: null,
    },
    linkedAdminId: {
      type: String,
      default: null,
      index: true,
    },
    attendance: {
      type: String,
      enum: ['Present', 'Not Present', null],
      default: null,
      required: false,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    primaryGuardian: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Guardian',
      default: null,
    },
  },
  { timestamps: true }
);

residentSchema.statics.generateResidentId = async function () {
  const currentDate = new Date();
  const year  = currentDate.getFullYear().toString().slice(-2);
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const prefix = `E-${year}${month}`;

  for (let attempt = 0; attempt < 10; attempt++) {
    const lastResident = await this.findOne({
      residentId: { $regex: `^${prefix}` },
    }).sort({ residentId: -1 });

    let nextNumber = 1;
    if (lastResident && lastResident.residentId) {
      const lastNumberStr = lastResident.residentId.replace(prefix, '');
      const parsed = parseInt(lastNumberStr);
      if (!isNaN(parsed)) {
        nextNumber = parsed + 1;
      }
    }

    const candidateId = `${prefix}${nextNumber.toString().padStart(2, '0')}`;
    const exists = await this.findOne({ residentId: candidateId });
    if (!exists) {
      return candidateId;
    }
  }

  return `${prefix}${Date.now().toString().slice(-4)}`;
};

residentSchema.statics.discharge = async function (residentId) {
  return this.findOneAndUpdate(
    { residentId, status: 'Active' },
    {
      status: 'Discharged',
      dischargedAt: new Date(),
    },
    { new: true }
  );
};

module.exports = mongoose.model('Resident', residentSchema);