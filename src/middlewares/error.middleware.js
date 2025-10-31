import customApiError from '../error/custom.error.js';
export const errorHandlerMiddleware = async (err, req, res, next) => {
  console.log(err);
  if (err instanceof customApiError)
    res.status(err.statusCode).json({ msg: err.message });
  res.status(500).send('something went wrong!');
};
