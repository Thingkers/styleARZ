
function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Sign in to continue.",
    });
  }

  next();
}

module.exports = {
  requireUser,
};
