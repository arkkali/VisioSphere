module.exports = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${err.stack}`);

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0];
    const message = field === 'email'
      ? 'That email address is already used by another account.'
      : 'A record with those details already exists.';

    return res.status(409).json({ message });
  }

  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
  });
};
