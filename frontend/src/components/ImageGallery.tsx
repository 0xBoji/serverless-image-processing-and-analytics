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
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    const fetchImages = async (pageNum: number = 1, isRefresh: boolean = false) => {
        try {
            if (pageNum === 1) setLoading(true);
            else setLoadingMore(true);
            setError(null);

            const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
            // Add limit and page params, plus timestamp
            const response = await fetch(`${API_BASE}/images?limit=10&page=${pageNum}&t=${Date.now()}`);
            if (!response.ok) {
                throw new Error('Failed to fetch images');
            }

            const data = await response.json();

            // Handle pagination response properly
            const newItems = data.items || [];

            if (pageNum === 1 || isRefresh) {
                setImages(newItems);
            } else {
                setImages(prev => [...prev, ...newItems]);
            }

            setHasMore(data.has_more);
            setTotalCount(data.total_count || 0);
            setPage(pageNum);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load images');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        fetchImages(1, true);
    }, [refreshTrigger]);

    const handleLoadMore = () => {
        if (!loadingMore && hasMore) {
            fetchImages(page + 1);
        }
    };

    if (loading && images.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
                <RefreshCw className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">Loading images...</p>
            </div>
        );
    }

    if (error && images.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-red-500">
                <p className="text-sm">{error}</p>
                <button
                    onClick={() => fetchImages(1, true)}
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
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Processed Images
                    <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                        ({totalCount || images.length})
                    </span>
                </h2>
                <button
                    onClick={() => fetchImages(1, true)}
                    disabled={loading || loadingMore}
                    className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-border)] transition-colors cursor-pointer disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((image) => (
                    <ImageCard key={`${image.image_key}-${Math.random()}`} image={image} />
                ))}
            </div>

            {/* Load More Button */}
            {hasMore && (
                <div className="flex justify-center pt-4">
                    <button
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="flex items-center gap-2 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] px-6 py-3 text-sm font-medium hover:bg-[var(--color-border)] transition-all cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                        {loadingMore ? (
                            <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Loading more...
                            </>
                        ) : (
                            'Load More Images'
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
