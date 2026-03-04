import { useState, useEffect, useRef } from "react";

export const useMediaProcessor = (initialFile = null) => {
  // Media State
  const [file, setFile] = useState(initialFile);
  const [sourceFiles, setSourceFiles] = useState([]); // For slideshows
  const [previewUrl, setPreviewUrl] = useState("");
  const [type, setType] = useState("video"); // 'video' | 'image'
  const [duration, setDuration] = useState(0);

  // Editor State
  const [showVideoEditor, setShowVideoEditor] = useState(false);
  const [showCropper, setShowCropper] = useState(false);

  // Transform Metadata (Applied during upload or via editor)
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [rotate, setRotate] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState(null);

  // Clean up object URLs
  const objectUrlsRef = useRef(new Set());

  // Handle new file selection
  const handleFileChange = newFile => {
    // 1. Handle Remote File Object (e.g. from VideoEditor backend processing)
    if (newFile && newFile.url && !newFile.edit) {
      setFile(newFile);
      setSourceFiles([newFile]);
      if (newFile.type && newFile.type.startsWith("image")) {
        setType("image");
      } else {
        setType("video");
      }
      setPreviewUrl(newFile.url);

      // Reset edits on new file
      setRotate(0);
      setFlipH(false);
      setFlipV(false);
      setTrimStart(0);
      setTrimEnd(0);
      setSelectedFilter(null);
      return;
    }

    // 2. If it's just a file object, load it (Standard File Input)
    if (newFile instanceof File || newFile instanceof Blob) {
      setFile(newFile);
      setSourceFiles([newFile]); // Default to single file

      // Auto-detect type
      if (newFile.type.startsWith("image")) {
        setType("image");
      } else {
        setType("video");
      }

      // Generate Preview URL
      try {
        const url = URL.createObjectURL(newFile);
        setPreviewUrl(url);
        objectUrlsRef.current.add(url);
      } catch (e) {
        console.warn("Failed to create object URL", e);
      }

      // Reset edits on new file
      setRotate(0);
      setFlipH(false);
      setFlipV(false);
      setTrimStart(0);
      setTrimEnd(0);
      setSelectedFilter(null);
      return;
    }

    // If it's an EDIT change (passed as an object from UI sliders)
    // We assume the caller might pass { ...file, edit: {} }
    // But for simpler UI sliders, we should accept partial updates
    if (newFile && newFile.edit) {
      if (newFile.edit.trimStart !== undefined) setTrimStart(newFile.edit.trimStart);
      if (newFile.edit.trimEnd !== undefined) setTrimEnd(newFile.edit.trimEnd);
      // ... other edits
    }
  };

  // Cleanup effect
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  return {
    // State
    file,
    sourceFiles,
    previewUrl,
    type,
    duration,
    setDuration, // Needed for video metadata loading

    // Editor Visibility
    showVideoEditor,
    setShowVideoEditor,
    showCropper,
    setShowCropper,

    // Transforms
    trimStart,
    setTrimStart,
    trimEnd,
    setTrimEnd,
    rotate,
    setRotate,
    flipH,
    setFlipH,
    flipV,
    setFlipV,
    selectedFilter,
    setSelectedFilter,

    // Actions
    handleFileChange,
  };
};
