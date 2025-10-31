import mongoose from 'mongoose';

const paperSchema = mongoose.Schema({
  citations: {
    type: Object,
    required: true,
  },
  paperSegments: {
    type: Array,
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  paperCount: {
    type: Number,
    // required: true,
  },
  isCleaned: {
    type: Boolean,
    default: false,
  },
  views: {
    type: Number,
    default: 0,
  },
  downloads: {
    type: Number,
    default: 0,
  },
});

export default mongoose.model('papers', paperSchema);
