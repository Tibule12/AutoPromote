import React, { useEffect, useRef, useState } from "react";

function ImageCropper({ imageUrl, onChangeCrop, onClose }) {
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [rect, setRect] = useState({ x: 20, y: 20, w: 160, h: 160 });
  const startRef = useRef(null);
  useEffect(() => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.src = imageUrl;
  }, [imageUrl]);
  useEffect(() => {
    if (!img) return;
    draw();
  }, [img, rect]);
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    canvas.width = Math.min(img.width, 800);
    canvas.height = Math.min(img.height, 600);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Fit image
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    ctx.drawImage(img, 0, 0, iw, ih);
    // Draw crop rect
    ctx.strokeStyle = "rgba(255,0,0,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
  function clientToCanvas(e) {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onDown(e) {
    setDragging(true);
    startRef.current = clientToCanvas(e);
  }
  function onMove(e) {
    if (!dragging) return;
    const p = clientToCanvas(e);
    const dx = p.x - startRef.current.x;
    const dy = p.y - startRef.current.y;
    setRect(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    startRef.current = p;
  }
  function onUp() {
    setDragging(false);
    if (onChangeCrop) onChangeCrop(rect);
  }
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 16,
          maxWidth: "90vw",
          maxHeight: "90vh",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ border: "1px solid #ddd", display: "block" }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button
            onClick={() => {
              if (onChangeCrop) onChangeCrop(null);
              onClose && onClose();
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onChangeCrop(rect);
              onClose && onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImageCropper;
