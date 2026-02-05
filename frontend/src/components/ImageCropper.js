import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";

function getCroppedImg(imageSrc, pixelCrop) {
  const createImage = url =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", error => reject(error));
      image.setAttribute("crossOrigin", "anonymous");
      image.src = url;
    });

  return new Promise(async (resolve, reject) => {
    try {
      const image = await createImage(imageSrc);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        return reject(new Error("No 2d context"));
      }

      // set canvas size to match the bounding box
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      // draw the image
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      // As Base64 string
      // resolve(canvas.toDataURL('image/jpeg'));

      // As Blob (better for larger images)
      canvas.toBlob(blob => {
        resolve(blob);
      }, "image/jpeg");
    } catch (e) {
      reject(e);
    }
  });
}

function ImageCropper({ imageUrl, onChangeCrop, onClose }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [completedCrop, setCompletedCrop] = useState(null);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCompletedCrop(croppedAreaPixels);
  }, []);

  const handleApply = useCallback(() => {
    // Pass the actual pixel crop values back to the parent
    // The parent (ContentUploadForm) currently expects {x, y, w, h}
    // react-easy-crop returns {x, y, width, height}
    if (completedCrop && onChangeCrop) {
      onChangeCrop({
        x: completedCrop.x,
        y: completedCrop.y,
        w: completedCrop.width,
        h: completedCrop.height,
      });
    }
    onClose();
  }, [completedCrop, onChangeCrop, onClose]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.85)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ position: "relative", flex: 1, width: "100%" }}>
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={1} // Default square, can make configurable if needed
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
        />
      </div>

      <div
        style={{
          padding: 20,
          background: "white",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div
          style={{ width: "80%", maxWidth: 400, display: "flex", alignItems: "center", gap: 10 }}
        >
          <span>Zoom:</span>
          <input
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            aria-labelledby="Zoom"
            onChange={e => {
              setZoom(e.target.value);
            }}
            className="zoom-range"
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ minWidth: 100 }}>
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="btn btn-primary"
            style={{ fontWeight: "bold", minWidth: 100 }}
          >
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImageCropper;
