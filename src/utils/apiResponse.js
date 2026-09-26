const success = (res, data = null, status = 200) => {
  return res.status(status).json({ success: true, data, error: null });
};

const error = (
  res,
  message = "Something went wrong",
  status = 500,
  code = "ERROR",
  details = null,
  data = null
) => {
  return res.status(status).json({
    success: false,
    data,
    error: { code, message, details },
  });
};

module.exports = { success, error };