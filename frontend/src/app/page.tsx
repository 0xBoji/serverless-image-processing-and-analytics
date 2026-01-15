'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { UploadZone } from '@/components/UploadZone';
import { ImageGallery } from '@/components/ImageGallery';

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadComplete = () => {
    // Trigger gallery refresh
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen">
      <Header />

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="mb-12 text-center">
          <h1
            className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <span className="bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] bg-clip-text text-transparent">
              Cloud Vision
            </span>{' '}
            Analytics
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--color-text-muted)]">
            Upload images and let AWS Rekognition identify objects, scenes, and activities.
            Powered by machine learning for instant analysis.
          </p>
        </div>

        {/* Upload Section */}
        <section className="mb-16">
          <div className="glass-card mx-auto max-w-2xl p-6">
            <UploadZone onUploadComplete={handleUploadComplete} />
          </div>
        </section>

        {/* Gallery Section */}
        <section>
          <ImageGallery refreshTrigger={refreshTrigger} />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-[var(--color-text-muted)]">
          <p>
            Built with Next.js • AWS Lambda • S3 • CloudFront • Rekognition • DynamoDB
          </p>
        </div>
      </footer>
    </div>
  );
}
