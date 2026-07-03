import { X } from 'lucide-react';
import { useEffect } from 'react';

interface LightboxProps {
    imageUrl: string;
    onClose: () => void;
}

export const Lightbox = ({ imageUrl, onClose }: LightboxProps) => {
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
            >
                <X className="w-6 h-6" />
            </button>
            
            <img
                src={imageUrl}
                alt="Zoomed"
                className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    );
};
