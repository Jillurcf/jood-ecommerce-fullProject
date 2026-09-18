"use strict";

exports.getBilling = async (req, res) => {
  try {
    res.render("admin/a/account/billing", {
      title: "Admin Billing",
      activePage: "billing",
    });
  } catch (error) {
    console.error(error);

    res.status(500).send("Server Error");
  }
};

