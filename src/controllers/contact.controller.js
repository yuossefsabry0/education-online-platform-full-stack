const { success } = require("../utils/apiResponse");
const config = require("../config");

function contactUs(req, res) {
  return success(res, {
    message: `Contact Us At ${config.contact.email}`,
  });
}

module.exports = { contactUs };
