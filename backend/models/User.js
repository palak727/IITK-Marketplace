import mongoose from 'mongoose';

export const ALLOWED_HALLS = [
  'Hall 1',
  'Hall 2',
  'Hall 3',
  'Hall 4',
  'Hall 5',
  'Hall 7',
  'Hall 8',
  'Hall 9',
  'Hall 10',
  'Hall 11',
  'Hall 12',
  'Hall 13',
  'Hall 14',
  'GH1',
  'GH2',
  'CWS',
  'RA Tower',
  'SBRA',
];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^[a-zA-Z0-9._%+-]+@iitk\.ac\.in$/, 'Only @iitk.ac.in emails are allowed!'],
    },
    password: { type: String, required: true },
    emailVerified: { type: Boolean, default: undefined },
    hall: {type: String,enum: ALLOWED_HALLS,required: true},
    year: { type: String, default: 'Y21' },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model('User', userSchema);