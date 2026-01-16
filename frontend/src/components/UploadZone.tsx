'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, ImageIcon, X } from 'lucide-react';
import { StatusIndicator, ProcessingStatus } from './StatusIndicator';

interface UploadZoneProps {
    onUploadComplete?: () => void;
}

export function UploadZone({ onUploadComplete }: UploadZoneProps) {
    const [status, setStatus] = useState<ProcessingStatus>('idle');
    const [statusMessage, setStatusMessage] = useState<string>();
    const [preview, setPreview] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>('');

    const uploadToS3 = async (file: File) => {
        try {
            setStatus('uploading');
            setStatusMessage('Getting upload URL...');

            // Validate size locally first
            const MAX_SIZE = 5 * 1024 * 1024; // 5MB
            if (file.size > MAX_SIZE) {
                setStatus('error');
                setStatusMessage('File size exceeds 5MB limit');
                setTimeout(() => {
                    setStatus('idle');
                    setStatusMessage(undefined);
                    clearPreview();
                }, 3000);
                return;
            }

            // Get presigned URL from our API
            const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
            const response = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: file.name,
                    contentType: file.type,
                    size: file.size
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to get upload URL');
            }

            const { uploadUrl, key } = await response.json();

            setStatusMessage('Uploading to S3...');

            // Upload directly to S3
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type,
                },
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload to S3');
            }

            setStatus('analyzing');
            setStatusMessage('AI is analyzing your image...');

            // Wait for Lambda to process (poll DynamoDB)
            await pollForResults(key);

            setStatus('completed');
            setStatusMessage('Analysis complete!');

            // Reset after 3 seconds
            setTimeout(() => {
                setStatus('idle');
                setStatusMessage(undefined);
                setPreview(null);
                setFileName('');
                onUploadComplete?.();
            }, 3000);

        } catch (error) {
            console.error('Upload failed:', error);
            setStatus('error');
            setStatusMessage(error instanceof Error ? error.message : 'Upload failed');

            setTimeout(() => {
                setStatus('idle');
                setStatusMessage(undefined);
            }, 5000);
        }
    };

    const pollForResults = async (key: string, maxAttempts = 10): Promise<void> => {
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));

            try {
                const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
                const response = await fetch(`${API_BASE}/images?key=${encodeURIComponent(key)}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.item) {
                        return; // Found the processed result
                    }
                }
            } catch {
                // Continue polling
            }
        }
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (file) {
            setFileName(file.name);

            // Create preview
            const reader = new FileReader();
            reader.onload = () => {
                setPreview(reader.result as string);
            };
            reader.readAsDataURL(file);

            // Start upload
            uploadToS3(file);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
        },
        maxFiles: 1,
        disabled: status !== 'idle',
    });

    const clearPreview = () => {
        if (status === 'idle') {
            setPreview(null);
            setFileName('');
        }
    };

    return (
        <div className="space-y-4">
            {/* Upload Zone */}
            <div
                {...getRootProps()}
                className={`upload-zone relative p-8 text-center transition-all duration-300 ${isDragActive ? 'drag-active scale-[1.02]' : ''
                    } ${status !== 'idle' ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.01]'}`}
            >
                <input {...getInputProps()} />

                {preview ? (
                    <div className="relative overflow-hidden rounded-lg">
                        <img
                            src={preview}
                            alt="Preview"
                            className="mx-auto max-h-64 object-contain relative z-10"
                        />

                        {/* Scanning Effect */}
                        {status === 'analyzing' && (
                            <>
                                <div className="scan-line" />
                                <div className="scan-overlay" />
                                <div className="absolute inset-0 bg-blue-500/10 z-0 animate-pulse" />
                            </>
                        )}

                        {status === 'idle' && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearPreview();
                                }}
                                className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer z-20"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                        <p className="mt-4 text-sm text-[var(--color-text-muted)]">{fileName}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex justify-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)]">
                                {isDragActive ? (
                                    <ImageIcon className="h-8 w-8 text-white" />
                                ) : (
                                    <Upload className="h-8 w-8 text-white" />
                                )}
                            </div>
                        </div>
                        <div>
                            <p className="text-lg font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                {isDragActive ? 'Drop your image here' : 'Drag & drop an image'}
                            </p>
                            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                                or click to browse • JPEG, PNG, GIF, WebP
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Status Indicator */}
            {status !== 'idle' && (
                <div className="flex justify-center">
                    <StatusIndicator status={status} message={statusMessage} />
                </div>
            )}
        </div>
    );
}
