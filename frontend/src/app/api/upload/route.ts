import { NextRequest, NextResponse } from 'next/server';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { putMetric } from '@/lib/cloudwatch';

// CloudFront configuration
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN!;
const CLOUDFRONT_KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID!;

if (!CLOUDFRONT_DOMAIN || !CLOUDFRONT_KEY_PAIR_ID) {
    throw new Error('Missing CloudFront configuration: CLOUDFRONT_DOMAIN or CLOUDFRONT_KEY_PAIR_ID not set');
}

// Rate limiting - max 5 uploads per IP per minute
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const MAX_UPLOADS = 5;
const WINDOW_MS = 60000;

// Allowed origins for CORS protection
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.ALLOWED_ORIGIN,
].filter((origin): origin is string => Boolean(origin));

function getPrivateKey(): string {
    const key = process.env.CLOUDFRONT_PRIVATE_KEY;
    if (!key) {
        throw new Error('CLOUDFRONT_PRIVATE_KEY environment variable is not set');
    }
    // Handle escaped newlines in environment variable
    return key.replace(/\\n/g, '\n');
}

export async function POST(request: NextRequest) {
    try {
        // Origin validation
        const origin = request.headers.get('origin');
        if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
            console.warn('Blocked request from unauthorized origin:', origin);
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            );
        }

        // Rate limiting
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
            request.headers.get('x-real-ip') ||
            'unknown';
        const now = Date.now();
        const record = rateLimit.get(ip);

        if (record && now < record.resetAt) {
            const remaining = Math.max(0, MAX_UPLOADS - record.count);

            if (record.count >= MAX_UPLOADS) {
                console.warn('Rate limit exceeded for IP:', ip);
                // Metric: Rate Limit Exceeded
                await putMetric('RateLimitExceeded', 1, 'Count');

                return NextResponse.json(
                    { error: 'Too many upload requests. Please try again later.' },
                    {
                        status: 429,
                        headers: {
                            'X-RateLimit-Limit': MAX_UPLOADS.toString(),
                            'X-RateLimit-Remaining': '0',
                            'X-RateLimit-Reset': record.resetAt.toString()
                        }
                    }
                );
            }
            record.count++;

            // Add rate limit headers to successful response context (stored for later)
        } else {
            rateLimit.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        }

        // Clean up old rate limit entries periodically
        if (rateLimit.size > 1000) {
            for (const [key, value] of rateLimit.entries()) {
                if (now > value.resetAt) {
                    rateLimit.delete(key);
                }
            }
        }

        const body = await request.json();
        const { fileName, contentType } = body;

        if (!fileName || !contentType) {
            return NextResponse.json(
                { error: 'fileName and contentType are required' },
                { status: 400 }
            );
        }

        // Validate content type - only allow JPEG and PNG images
        const allowedContentTypes = ['image/jpeg', 'image/png'];
        if (!allowedContentTypes.includes(contentType)) {
            return NextResponse.json(
                { error: 'Only JPEG and PNG images are allowed' },
                { status: 400 }
            );
        }

        // Generate unique key with timestamp
        const timestamp = Date.now();
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const key = `${timestamp}-${sanitizedFileName}`;

        // Generate CloudFront signed URL
        const url = `https://${CLOUDFRONT_DOMAIN}/${key}`;
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        const uploadUrl = getSignedUrl({
            url,
            keyPairId: CLOUDFRONT_KEY_PAIR_ID,
            dateLessThan: expiresAt.toISOString(),
            privateKey: getPrivateKey(),
        });

        // Metric: Upload Success
        await putMetric('UploadSuccess', 1, 'Count');

        return NextResponse.json({
            uploadUrl,
            key,
            cloudfrontDomain: CLOUDFRONT_DOMAIN,
            expiresAt: expiresAt.toISOString(),
        });
    } catch (error) {
        console.error('Failed to generate signed URL:', error);

        // Metric: Upload Failure
        await putMetric('UploadFailure', 1, 'Count');

        return NextResponse.json(
            { error: 'Failed to generate upload URL' },
            { status: 500 }
        );
    }
}
