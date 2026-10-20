import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import type { FeedImage } from '../types';
import { useStore } from '../store';

interface ImageViewerProps {
  images: FeedImage[];
  initialIndex: number;
  onClose: () => void;
}

export function ImageViewer({ images, initialIndex, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const { toggleFavorite, isFavorited } = useStore();
  
  const hideUITimeout = useRef<number | undefined>(undefined);

  const currentImage = images[currentIndex];
  const favorited = isFavorited(currentImage?.id || '');

  const x = useMotionValue(0);
  const opacity = useTransform(x, [-200, 0, 200], [0.5, 1, 0.5]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'ArrowRight') goToNext();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const resetHideUITimer = useCallback(() => {
    setShowUI(true);
    if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
    hideUITimeout.current = window.setTimeout(() => {
      if (!isZoomed) setShowUI(false);
    }, 3000);
  }, [isZoomed]);

  useEffect(() => {
    resetHideUITimer();
    return () => {
      if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
    };
  }, [resetHideUITimer]);

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setScale(1);
      setIsZoomed(false);
    }
  };

  const goToNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setScale(1);
      setIsZoomed(false);
    }
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 100;
    const velocity = 500;

    if (!isZoomed) {
      if (info.offset.x > threshold || info.velocity.x > velocity) {
        goToPrevious();
      } else if (info.offset.x < -threshold || info.velocity.x < -velocity) {
        goToNext();
      }
    }
    x.set(0);
  };

  const handleDoubleTap = () => {
    if (scale === 1) {
      setScale(2);
      setIsZoomed(true);
    } else {
      setScale(1);
      setIsZoomed(false);
    }
    resetHideUITimer();
  };

  const handleShare = async () => {
    if (!currentImage) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: currentImage.title || 'Shared from PicStroom',
          url: currentImage.sourceUrl
        });
      } catch {
        // User cancelled or error
      }
    } else {
      // Fallback: copy URL to clipboard
      await navigator.clipboard.writeText(currentImage.sourceUrl);
      alert('Link copied to clipboard');
    }
  };

  const handleSaveImage = async () => {
    if (!currentImage) return;
    
    try {
      const response = await fetch(currentImage.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `picstroom-${currentImage.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(currentImage.url, '_blank');
    }
  };

  const handleOpenSource = () => {
    if (currentImage?.sourceUrl) {
      window.open(currentImage.sourceUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!currentImage) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onClick={() => resetHideUITimer()}
      onTouchStart={() => resetHideUITimer()}
    >
      {/* Header */}
      <AnimatePresence>
        {showUI && (
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
          >
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-white/80 text-sm">
              {currentIndex + 1} / {images.length}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => currentImage && toggleFavorite(currentImage)}
                className="p-2 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors"
                aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
              >
                <svg 
                  className={`w-6 h-6 ${favorited ? 'text-yellow-400 fill-current' : 'text-white'}`} 
                  viewBox="0 0 24 24" 
                  stroke="currentColor" 
                  strokeWidth={favorited ? 0 : 2}
                  fill={favorited ? 'currentColor' : 'none'}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Image */}
      <div 
        className="flex-1 flex items-center justify-center overflow-hidden"
      >
        <motion.div
          drag={!isZoomed ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          style={{ x, opacity }}
          className="w-full h-full flex items-center justify-center"
        >
          <motion.img
            key={currentImage.id}
            src={currentImage.url}
            alt={currentImage.title || 'Image'}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: scale }}
            transition={{ duration: 0.2 }}
            onDoubleClick={handleDoubleTap}
            className="max-w-full max-h-full object-contain select-none"
            draggable={false}
            style={{ touchAction: isZoomed ? 'pan-x pan-y' : 'none' }}
          />
        </motion.div>

        {/* Navigation arrows (desktop) */}
        {currentIndex > 0 && (
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors hidden md:block"
            aria-label="Previous image"
          >
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        {currentIndex < images.length - 1 && (
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors hidden md:block"
            aria-label="Next image"
          >
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* Footer */}
      <AnimatePresence>
        {showUI && (
          <motion.footer
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/50 to-transparent"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {currentImage.title && (
              <p className="text-white text-center mb-4 line-clamp-2">{currentImage.title}</p>
            )}
            
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleOpenSource}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors text-white text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Source
              </button>
              
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors text-white text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                Share
              </button>
              
              <button
                onClick={handleSaveImage}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors text-white text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Save
              </button>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
