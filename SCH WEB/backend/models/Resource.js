import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxLength: 200
  },
  description: {
    type: String,
    maxLength: 2000
  },
  subject: {
    type: String,
    trim: true,
    maxLength: 100
  },
  type: {
    type: String,
    enum: ['document', 'video', 'link'],
    required: true
  },
  // 'document' resources are uploaded to Cloudinary; 'video'/'link' point
  // off-site (e.g. a YouTube lesson or an external past-questions archive).
  fileUrl: String,
  fileName: String,
  fileSize: Number,
  externalUrl: String,
  divisions: [{
    type: String,
    enum: ['nursery', 'primary', 'secondary', 'college', 'all']
  }],
  classes: [String],
  isPublished: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

resourceSchema.index({ isPublished: 1, isActive: 1 });
resourceSchema.index({ divisions: 1 });
resourceSchema.index({ subject: 1 });
resourceSchema.index({ type: 1 });
resourceSchema.index({ title: 'text', description: 'text', subject: 'text' });

resourceSchema.pre('validate', function(next) {
  if (this.type === 'document' && !this.fileUrl) {
    return next(new Error('A document resource requires an uploaded file'));
  }
  if ((this.type === 'video' || this.type === 'link') && !this.externalUrl) {
    return next(new Error(`A ${this.type} resource requires an external URL`));
  }
  next();
});

// Division/class targeting mirrors Notice.findForUser: a resource with no
// classes listed reaches the whole division; one that does list classes
// only reaches students in one of those specific classes.
resourceSchema.statics.findForUser = function(userDivision, userClasses = []) {
  const query = {
    isPublished: true,
    isActive: true,
    $or: [
      { divisions: 'all' },
      { divisions: userDivision }
    ]
  };

  if (userClasses.length > 0) {
    query.$and = [{
      $or: [
        { classes: { $size: 0 } },
        { classes: { $in: userClasses } }
      ]
    }];
  }

  return this.find(query).sort({ createdAt: -1 });
};

export default mongoose.model('Resource', resourceSchema);
