const { success } = require("../utils/apiResponse");

function contactUs(req, res) {
  return success(res, {
    message: "Contact Us At test@gmail.com",
  });
}

module.exports = { contactUs };
