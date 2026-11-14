
import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: [
        'LOGIN_SUCCESS',
        'LOGIN_FAILURE',
        'REGISTRATION_SUCCESS',
        'LOGOUT',
        'ACCESS_DENIED',
        'ADMIN_BOOK_CREATED',
        'ADMIN_BOOK_UPDATED',
        'ADMIN_BOOK_DEACTIVATED',
        'ADMIN_CATEGORY_CREATED',
        'ADMIN_CATEGORY_UPDATED',
      ],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    outcome: {
      type: String,
      required: true,
      enum: ['SUCCESS', 'FAILURE'],
    },
    ipAddress: {
      type: String,
      maxlength: 45,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    strict: 'throw',
  },
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog =
  mongoose.models.AuditLog ||
  mongoose.model('AuditLog', auditLogSchema);
