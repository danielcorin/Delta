import React, { useState, useLayoutEffect } from "react";
import { ArrowUp, Square, X } from "lucide-react";

interface Props {
  input: string; handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSubmit: (e: { preventDefault(): void }) => void; textareaRef: React.RefObject<HTMLTextAreaElement>;
  droppedImages: string[]; setDroppedImages: React.Dispatch<React.SetStateAction<string[]>>;
  disabled?: boolean; isLoading: boolean; stop: () => void;
}
export default function ChatInput({ input, handleInputChange, handleSubmit, textareaRef, droppedImages, setDroppedImages, disabled, isLoading, stop }: Props) {
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px"; }
  }, [input, textareaRef]);
  const addImages = async (files: File[]) => {
    setError("");
    const valid = files.filter(f => ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(f.type));
    if (valid.some(f => f.size > 10 * 1024 * 1024)) { setError("Images must be smaller than 10 MB."); return; }
    const images = await Promise.all(valid.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);
    })));
    setDroppedImages(prev => [...prev, ...images].slice(0, 8));
  };
  return <div className={`rounded-xl bg-gray-100 dark:bg-gray-800 focus-within:ring-2 focus-within:ring-blue-500 ${drag ? "ring-2 ring-blue-500" : ""}`}
    onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
    onDrop={e => { e.preventDefault(); setDrag(false); void addImages(Array.from(e.dataTransfer.files)).catch(() => setError("Could not read this image.")); }}>
    {droppedImages.length > 0 && <div className="flex gap-2 px-3 pt-3 flex-wrap">
      {droppedImages.map((image, i) => <div key={i} className="relative group">
        <img src={image} alt={"Attached image " + (i + 1)} className="w-14 h-14 object-cover rounded-md" />
        <button type="button" title="Remove Image" className="absolute -right-1 -top-1 rounded-full p-1 bg-gray-700 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150" onClick={() => setDroppedImages(prev => prev.filter((_, n) => n !== i))}><X size={12} /></button>
      </div>)}
    </div>}
    {error && <p role="alert" className="text-xs text-red-600 px-3 pt-2">{error}</p>}
    <div className="relative">
      <textarea ref={textareaRef} aria-label="Message" spellCheck value={input} onChange={handleInputChange} rows={1}
        placeholder={disabled ? "Choose a model to start…" : "Message…"} disabled={disabled}
        className="w-full min-h-12 max-h-52 pl-4 pr-14 py-3 resize-none bg-transparent focus:outline-none text-sm disabled:opacity-50"
        onPaste={e => { const images = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/")); if (images.length) { e.preventDefault(); void addImages(images).catch(() => setError("Could not paste this image.")); } }}
        onKeyDown={e => {
          if (e.key === "Escape") { e.currentTarget.blur(); return; }
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!isLoading) handleSubmit(e); }
        }} />
      {isLoading ? <button type="button" aria-label="Stop Response" onClick={stop} className="absolute right-2 bottom-2 rounded-full h-8 w-8 flex items-center justify-center bg-gray-700 text-white"><Square size={14} fill="currentColor" /></button>
        : <button type="submit" aria-label="Send Message" disabled={disabled || !input.trim()} className="absolute right-2 bottom-2 rounded-full h-8 w-8 flex items-center justify-center bg-blue-600 text-white disabled:opacity-30"><ArrowUp size={18} /></button>}
    </div>
  </div>;
}
