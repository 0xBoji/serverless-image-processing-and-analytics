import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-southeast-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const key = searchParams.get('key');

        if (key) {
            // Fetch single item by key
            const command = new GetCommand({
                TableName: TABLE_NAME,
                Key: { image_key: key },
            });

            const response = await docClient.send(command);

            return NextResponse.json({
                item: response.Item || null,
            });
        }

        // Fetch all items
        const command = new ScanCommand({
            TableName: TABLE_NAME,
            Limit: 50,
        });

        const response = await docClient.send(command);

        // Sort by processed_at descending (newest first)
        const items = (response.Items || []).sort((a, b) => {
            const dateA = new Date(a.processed_at || 0).getTime();
            const dateB = new Date(b.processed_at || 0).getTime();
            return dateB - dateA;
        });

        return NextResponse.json({
            items,
            count: items.length,
        });
    } catch (error: any) {
        console.error('Failed to fetch images:', error);
        return NextResponse.json(
            {
                error: 'Failed to fetch images',
                details: error.message,
                code: error.name,
                requestId: error.$metadata?.requestId
            },
            { status: 500 }
        );
    }
}
