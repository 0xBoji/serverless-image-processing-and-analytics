import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

const cloudWatchClient = new CloudWatchClient({
    region: process.env.AWS_REGION || 'ap-southeast-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});

const NAMESPACE = "ImageProcessingApp";

export async function putMetric(name: string, value: number, unit: "Count" | "Milliseconds" = "Count") {
    try {
        const command = new PutMetricDataCommand({
            Namespace: NAMESPACE,
            MetricData: [
                {
                    MetricName: name,
                    Value: value,
                    Unit: unit,
                    Timestamp: new Date(),
                },
            ],
        });
        await cloudWatchClient.send(command);
    } catch (error) {
        console.error(`Failed to send metric ${name}:`, error);
        // Monitoring shouldn't fail the request
    }
}
