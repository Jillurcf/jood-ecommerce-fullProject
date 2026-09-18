function sendSuccess(res, data, message, status = 200) {
  const body = { success: true };
  if (data !== void 0) body.data = data;
  if (message) body.message = message;
  return res.status(status).json(body);
}
function sendError(res, statusCode, message, errorCode) {
  const body = {
    success: false,
    message,
    error_code: errorCode
  };
  return res.status(statusCode).json(body);
}
export {
  sendError,
  sendSuccess
};
