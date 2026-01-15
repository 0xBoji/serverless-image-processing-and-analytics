import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-southeast-2',
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'image-processor-source-975050162743';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const key = searchParams.get('key');

        if (!key) {
            return NextResponse.json(
                { error: 'key parameter is required' },
                { status: 400 }
            );
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: 3600, // 1 hour
        });

        return NextResponse.json({ url: signedUrl });
    } catch (error) {
        console.error('Failed to generate presigned URL:', error);
        return NextResponse.json(
            { error: 'Failed to generate image URL' },
            { status: 500 }
        );
    }
}
