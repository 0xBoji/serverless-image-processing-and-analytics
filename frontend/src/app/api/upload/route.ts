import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-southeast-2',
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'image-processor-source-975050162743';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { fileName, contentType } = body;

        if (!fileName || !contentType) {
            return NextResponse.json(
                { error: 'fileName and contentType are required' },
                { status: 400 }
            );
        }

        // Generate unique key with timestamp
        const timestamp = Date.now();
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const key = `${timestamp}-${sanitizedFileName}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: contentType,
        });

        const uploadUrl = await getSignedUrl(s3Client, command, {
            expiresIn: 300, // 5 minutes
        });

        return NextResponse.json({
            uploadUrl,
            key,
            bucket: BUCKET_NAME,
        });
    } catch (error) {
        console.error('Failed to generate presigned URL:', error);
        return NextResponse.json(
            { error: 'Failed to generate upload URL' },
            { status: 500 }
        );
    }
}
