export const notFound = (req, res) =>
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });

export const errorHandler = (error, req, res, next) => {
  console.error(error);
  const isDuplicateKey = error.code === 11000;
  res.status(isDuplicateKey ? 409 : error.statusCode || 500).json({
    message: isDuplicateKey ? 'An account with this email already exists.' : error.message || 'Server error.',
  });
};
