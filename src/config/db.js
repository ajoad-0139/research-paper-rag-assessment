import mongoose from 'mongoose';

const connectDB = async (url) => {
  mongoose.connect(url);
};

export default connectDB;
