'use client';

import { Tag, Clock, HardDrive, ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface ImageLabel {
    name: string;
    confidence: number;
}

export interface ProcessedImage {
    image_key: string;
    bucket_name: string;
    image_size: number;
    processed_at: string;
    detected_labels: ImageLabel[];
}

interface ImageCardProps {
    image: ProcessedImage;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function ImageCard({ image }: ImageCardProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchImageUrl = async () => {
            try {
                const response = await fetch(`/api/image-url?key=${encodeURIComponent(image.image_key)}`);
                if (response.ok) {
                    const data = await response.json();
                    setImageUrl(data.url);
                } else {
                    setError(true);
                }
            } catch {
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        fetchImageUrl();
    }, [image.image_key]);

    return (
        <div className="glass-card group overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg cursor-pointer">
            {/* Image */}
            <div className="relative aspect-video overflow-hidden bg-[var(--color-background-secondary)]">
                {loading ? (
                    <div className="flex h-full w-full items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
                    </div>
                ) : error || !imageUrl ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--color-text-muted)]">
                        <ImageOff className="h-8 w-8" />
                        <span className="text-xs">Failed to load</span>
                    </div>
                ) : (
                    <img
                        src={imageUrl}
                        alt={image.image_key}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
                {/* File name */}
                <h3 className="font-medium text-sm truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {image.image_key}
                </h3>

                {/* Metadata */}
                <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                    <div className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        <span>{formatBytes(image.image_size)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(image.processed_at)}</span>
                    </div>
                </div>

                {/* Labels */}
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)]">
                        <Tag className="h-3 w-3" />
                        <span>Detected Labels</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {image.detected_labels.slice(0, 5).map((label, index) => (
                            <span
                                key={index}
                                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]"
                            >
                                {label.name}
                                <span className="text-[var(--color-text-muted)] text-[10px]">
                                    {Math.round(label.confidence)}%
                                </span>
                            </span>
                        ))}
                        {image.detected_labels.length > 5 && (
                            <span className="inline-flex items-center rounded-full bg-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                                +{image.detected_labels.length - 5} more
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

