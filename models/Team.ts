import mongoose, { Document, Schema } from 'mongoose';

export interface ITeam extends Document {
  orgId: mongoose.Types.ObjectId;
  name: string;
  description?: string | null;
  memberIds: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    memberIds: [{ type: Schema.Types.ObjectId, ref: 'Users' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'Users', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Users', default: null },
  },
  { timestamps: true }
);

TeamSchema.index({ orgId: 1, name: 1 }, { unique: true });
TeamSchema.index({ orgId: 1, memberIds: 1 });

export default mongoose.models.Team || mongoose.model<ITeam>('Team', TeamSchema);
