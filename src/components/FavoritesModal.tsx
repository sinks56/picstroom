import { Modal } from './Modal';
import { useStore } from '../store';
import type { FeedImage } from '../types';

interface FavoritesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageClick: (image: FeedImage, allImages: FeedImage[], index: number, feedId?: string) => void;
}

export function FavoritesModal({ isOpen, onClose, onImageClick }: FavoritesModalProps) {
  const { favorites, toggleFavorite } = useStore();

  const handleImageClick = (favorite: typeof favorites[0], index: number) => {
    const image: FeedImage = {
      id: favorite.imageId,
      feedId: favorite.feedId,
      url: favorite.url,
      thumbnailUrl: favorite.thumbnailUrl,
      sourceUrl: favorite.sourceUrl,
      title: favorite.title,
      fetchedAt: favorite.savedAt
    };
    
    const allImages: FeedImage[] = favorites.map(f => ({
      id: f.imageId,
      feedId: f.feedId,
      url: f.url,
      thumbnailUrl: f.thumbnailUrl,
      sourceUrl: f.sourceUrl,
      title: f.title,
      fetchedAt: f.savedAt
    }));

    onImageClick(image, allImages, index);
  };

  const handleRemove = (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const favorite = favorites.find(f => f.imageId === imageId);
    if (favorite) {
      const image: FeedImage = {
        id: favorite.imageId,
        feedId: favorite.feedId,
        url: favorite.url,
        thumbnailUrl: favorite.thumbnailUrl,
        sourceUrl: favorite.sourceUrl,
        title: favorite.title,
        fetchedAt: favorite.savedAt
      };
      toggleFavorite(image);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Favorites" size="large">
      <div className="p-4">
        {favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-16 h-16 text-[var(--color-text-muted)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
            <h3 className="text-lg font-medium mb-2">No favorites yet</h3>
            <p className="text-[var(--color-text-muted)]">
              Tap the star on any image to save it here
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {favorites.map((favorite, index) => (
              <div
                key={favorite.imageId}
                onClick={() => handleImageClick(favorite, index)}
                className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group bg-[var(--color-bg-tertiary)]"
              >
                <img
                  src={favorite.thumbnailUrl || favorite.url}
                  alt={favorite.title || 'Favorite'}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                
                {/* Remove button */}
                <button
                  onClick={(e) => handleRemove(favorite.imageId, e)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                  aria-label="Remove from favorites"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                {/* Title overlay */}
                {favorite.title && (
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-xs line-clamp-2">{favorite.title}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
