import mongoose from 'mongoose';

const ContactAddressSchema = new mongoose.Schema(
  {
    country: { type: String, trim: true, maxlength: 100 },
    streetAddress: { type: String, trim: true, maxlength: 200 },
    apartment: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    zipCode: { type: String, trim: true, maxlength: 30 },
  },
  { _id: false }
);

const ContactSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 320 },
    phone: { type: String, trim: true, maxlength: 40 },
    companyName: { type: String, trim: true, maxlength: 200 },
    jobTitle: { type: String, trim: true, maxlength: 200 },
    address: { type: ContactAddressSchema, required: false },
    description: { type: String, trim: true, maxlength: 2000 },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: false, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true, index: true },
  },
  {
    timestamps: true,
  }
);

ContactSchema.index({ orgId: 1, userId: 1, email: 1 });

export default mongoose.models.Contact || mongoose.model('Contact', ContactSchema);
