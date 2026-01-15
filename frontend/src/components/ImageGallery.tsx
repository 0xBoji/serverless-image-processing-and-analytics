'use client';

import { useEffect, useState } from 'react';
import { ImageCard, ProcessedImage } from './ImageCard';
import { Images, RefreshCw } from 'lucide-react';

interface ImageGalleryProps {
    refreshTrigger?: number;
}

export function ImageGallery({ refreshTrigger = 0 }: ImageGalleryProps) {
    const [images, setImages] = useState<ProcessedImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchImages = async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await fetch('/api/images');
            if (!response.ok) {
                throw new Error('Failed to fetch images');
            }

            const data = await response.json();
            setImages(data.items || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load images');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchImages();
    }, [refreshTrigger]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(fetchImages, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading && images.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
                <RefreshCw className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">Loading images...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-red-500">
                <p className="text-sm">{error}</p>
                <button
                    onClick={fetchImages}
                    className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm text-white hover:bg-[var(--color-primary)]/90 transition-colors cursor-pointer"
                >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                </button>
            </div>
        );
    }

    if (images.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-border)] mb-4">
                    <Images className="h-8 w-8" />
                </div>
                <p className="text-lg font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    No images yet
                </p>
                <p className="text-sm mt-1">
                    Upload an image to get started
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Processed Images
                    <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                        ({images.length})
                    </span>
                </h2>
                <button
                    onClick={fetchImages}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-border)] transition-colors cursor-pointer disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((image) => (
                    <ImageCard key={image.image_key} image={image} />
                ))}
            </div>
        </div>
    );
}
