import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import type { FeedImage } from '../types';
import { useStore } from '../store';
import { imageCache } from '../lib/image-cache';

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
  const [isDragging, setIsDragging] = useState(false);
  const [cachedUrls, setCachedUrls] = useState<Record<string, string>>({});
  const { toggleFavorite, isFavorited } = useStore();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const hideUITimeout = useRef<number | undefined>(undefined);
  const lastTapTime = useRef(0);
  const dragStartY = useRef(0);
  const touchStartX = useRef(0);
  const touchStartTime = useRef(0);

  const currentImage = images[currentIndex];
  const favorited = isFavorited(currentImage?.id || '');

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const dragProgress = useMotionValue(0);
  const bgOpacity = useTransform(dragProgress, [0, 1], [1, 0]);

  // Get cached URL or original
  const getImageUrl = useCallback((image: FeedImage) => {
    return cachedUrls[image.url] || image.url;
  }, [cachedUrls]);

  // Preload neighboring images
  useEffect(() => {
    const preloadNeighbors = async () => {
      const indices = [
        currentIndex - 2,
        currentIndex - 1,
        currentIndex,
        currentIndex + 1,
        currentIndex + 2
      ].filter(i => i >= 0 && i < images.length);

      for (const idx of indices) {
        const img = images[idx];
        if (!img) continue;
        
        // Check cache first
        const cached = await imageCache.get(img.url);
        if (cached) {
          setCachedUrls(prev => ({ ...prev, [img.url]: cached }));
        } else {
          // Preload image
          const preloader = new Image();
          preloader.decoding = 'async';
          preloader.src = img.url;
          preloader.onload = async () => {
            try {
              const response = await fetch(img.url);
              if (response.ok) {
                const blob = await response.blob();
                const cachedUrl = await imageCache.put(img.url, blob);
                setCachedUrls(prev => ({ ...prev, [img.url]: cachedUrl }));
              }
            } catch {
              // Ignore cache failures
            }
          };
        }
      }
    };

    preloadNeighbors();
  }, [currentIndex, images]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && !isZoomed) goToPrevious();
      if (e.key === 'ArrowRight' && !isZoomed) goToNext();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isZoomed]);

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

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setScale(1);
      setIsZoomed(false);
      x.set(0);
      y.set(0);
    }
  }, [currentIndex, x, y]);

  const goToNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setScale(1);
      setIsZoomed(false);
      x.set(0);
      y.set(0);
    }
  }, [currentIndex, images.length, x, y]);

  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      if (scale === 1) {
        setScale(2.5);
        setIsZoomed(true);
      } else {
        setScale(1);
        setIsZoomed(false);
        x.set(0);
        y.set(0);
      }
    }
    lastTapTime.current = now;
    resetHideUITimer();
  }, [scale, x, y, resetHideUITimer]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isZoomed) return;
    setIsDragging(true);
    dragStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    touchStartTime.current = Date.now();
  }, [isZoomed]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || isZoomed) return;
    
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const deltaY = currentY - dragStartY.current;
    const deltaX = currentX - touchStartX.current;
    
    // Determine if vertical or horizontal swipe
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      // Vertical swipe to dismiss
      y.set(deltaY);
      dragProgress.set(Math.min(Math.abs(deltaY) / 200, 1));
    } else if (Math.abs(deltaX) > 10) {
      // Horizontal swipe
      x.set(deltaX);
    }
  }, [isDragging, isZoomed, x, y, dragProgress]);

  const handleTouchEnd = useCallback((_e: React.TouchEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const currentY = y.get();
    const currentX = x.get();
    const elapsed = Date.now() - touchStartTime.current;
    const velocityX = currentX / (elapsed || 1) * 1000;
    
    // Dismiss if dragged far enough vertically
    if (Math.abs(currentY) > 100) {
      animate(y, currentY > 0 ? 500 : -500, { duration: 0.2 });
      animate(dragProgress, 1, { duration: 0.2 });
      setTimeout(onClose, 200);
      return;
    }
    
    // Spring back vertical
    if (Math.abs(currentY) > 0) {
      animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
      animate(dragProgress, 0, { duration: 0.2 });
    }
    
    // Handle horizontal swipe
    if (Math.abs(velocityX) > 500 || Math.abs(currentX) > 80) {
      const direction = currentX > 0 ? 'right' : 'left';
      if (direction === 'left' && currentIndex < images.length - 1) {
        animate(x, -window.innerWidth, { 
          type: 'spring', 
          stiffness: 400, 
          damping: 35,
          velocity: velocityX,
          onComplete: () => {
            goToNext();
            x.set(0);
          }
        });
      } else if (direction === 'right' && currentIndex > 0) {
        animate(x, window.innerWidth, { 
          type: 'spring', 
          stiffness: 400, 
          damping: 35,
          velocity: velocityX,
          onComplete: () => {
            goToPrevious();
            x.set(0);
          }
        });
      } else {
        animate(x, 0, { type: 'spring', stiffness: 500, damping: 35 });
      }
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 35 });
    }
  }, [isDragging, y, x, dragProgress, onClose, currentIndex, images.length, goToNext, goToPrevious]);

  const handleShare = async () => {
    if (!currentImage) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: currentImage.title || 'Shared from PicStroom',
          url: currentImage.sourceUrl
        });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(currentImage.sourceUrl);
    }
  };

  const handleSaveImage = async () => {
    if (!currentImage) return;
    window.open(currentImage.url, '_blank');
  };

  const handleOpenSource = () => {
    if (currentImage?.sourceUrl) {
      window.open(currentImage.sourceUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Neighbor images for preview
  const prevImage = currentIndex > 0 ? images[currentIndex - 1] : null;
  const nextImage = currentIndex < images.length - 1 ? images[currentIndex + 1] : null;

  if (!currentImage) return null;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex flex-col touch-none select-none"
      onClick={() => resetHideUITimer()}
    >
      {/* Black background with fade on drag */}
      <motion.div 
        className="absolute inset-0 bg-black"
        style={{ opacity: bgOpacity }}
      />

      {/* Header */}
      <AnimatePresence>
        {showUI && (
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.15 }}
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 active:bg-white/20"
              aria-label="Close"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-white/80 text-sm font-medium">
              {currentIndex + 1} / {images.length}
            </div>

            <button
              onClick={() => currentImage && toggleFavorite(currentImage)}
              className="p-2 rounded-full bg-white/10 active:bg-white/20"
              aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              <svg 
                className={`w-5 h-5 ${favorited ? 'text-yellow-400 fill-current' : 'text-white'}`} 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                strokeWidth={favorited ? 0 : 2}
                fill={favorited ? 'currentColor' : 'none'}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </button>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Image container with swipe gestures */}
      <div 
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Previous image preview */}
        {prevImage && (
          <motion.div
            className="absolute left-0 top-0 bottom-0 w-full flex items-center justify-center pointer-events-none"
            style={{ x: useTransform(x, v => v - window.innerWidth) }}
          >
            <img
              src={getImageUrl(prevImage)}
              alt=""
              className="max-w-full max-h-full object-contain opacity-90"
              decoding="async"
              loading="eager"
            />
          </motion.div>
        )}

        {/* Current image */}
        <motion.div
          className="w-full h-full flex items-center justify-center"
          style={{ x, y }}
        >
          <motion.img
            key={currentImage.id}
            src={getImageUrl(currentImage)}
            alt={currentImage.title || 'Image'}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: scale, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={handleDoubleTap}
            className="max-w-full max-h-full object-contain will-change-transform"
            draggable={false}
            decoding="async"
            style={{ 
              touchAction: isZoomed ? 'pan-x pan-y pinch-zoom' : 'none',
            }}
          />
        </motion.div>

        {/* Next image preview */}
        {nextImage && (
          <motion.div
            className="absolute right-0 top-0 bottom-0 w-full flex items-center justify-center pointer-events-none"
            style={{ x: useTransform(x, v => v + window.innerWidth) }}
          >
            <img
              src={getImageUrl(nextImage)}
              alt=""
              className="max-w-full max-h-full object-contain opacity-90"
              decoding="async"
              loading="eager"
            />
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <AnimatePresence>
        {showUI && (
          <motion.footer
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-0 left-0 right-0 z-10 p-3 bg-gradient-to-t from-black/60 to-transparent"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {currentImage.title && (
              <p className="text-white text-center mb-3 text-sm line-clamp-2">{currentImage.title}</p>
            )}
            
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleOpenSource}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 active:bg-white/20 text-white text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Source
              </button>
              
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 active:bg-white/20 text-white text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                Share
              </button>
              
              <button
                onClick={handleSaveImage}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 active:bg-white/20 text-white text-sm"
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
