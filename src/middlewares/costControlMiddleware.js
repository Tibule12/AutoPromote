// Same source/output quality for every plan. Resource limits protect storage, not feature access.
module.exports = (req, res, next) => {
  const maxSizeBytes = Number(process.env.MAX_MEDIA_UPLOAD_BYTES || 524288000);
  req.fileOptions = { maxSizeBytes, compression: "standard", storageClass: "STANDARD" };
  if (Number(req.headers["content-length"] || 0) > maxSizeBytes)
    return res.status(413).json({
      error: "MEDIA_SIZE_LIMIT",
      message: "This file exceeds the supported upload size.",
    });
  next();
};
