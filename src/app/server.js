import 'express-async-errors';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

import api from '../routes/index.js';
import connectDB from '../config/db.js';
import { errorHandlerMiddleware } from '../middlewares/error.middleware.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', api);

app.use(errorHandlerMiddleware);

const startApp = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(process.env.PORT || 5000, () => {
      console.log(`server is listening on port ${process.env.PORT || '5000'}`);
    });
  } catch (error) {
    console.log(error);
  }
};

startApp();
