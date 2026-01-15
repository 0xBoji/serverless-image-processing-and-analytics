package main

import (
	"bytes"
	"context"
	"fmt"
	"image/jpeg"
	"io"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/rekognition"
	rekognitionTypes "github.com/aws/aws-sdk-go-v2/service/rekognition/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/disintegration/imaging"
)

// ImageMetadata represents the metadata stored in DynamoDB for each processed image
type ImageMetadata struct {
	ImageKey       string      `dynamodbav:"image_key"`
	BucketName     string      `dynamodbav:"bucket_name"`
	ImageSize      int64       `dynamodbav:"image_size"`
	ProcessedAt    string      `dynamodbav:"processed_at"`
	DetectedLabels []LabelInfo `dynamodbav:"detected_labels"`
	ThumbnailKey   string      `dynamodbav:"thumbnail_key"`
}

// LabelInfo represents a detected label from Rekognition
type LabelInfo struct {
	Name       string  `dynamodbav:"name"`
	Confidence float32 `dynamodbav:"confidence"`
}

// Handler holds the AWS service clients and configuration
type Handler struct {
	s3Client          *s3.Client
	rekognitionClient *rekognition.Client
	dynamoDBClient    *dynamodb.Client
	tableName         string
	logger            *slog.Logger
}

// NewHandler creates a new Handler with initialized AWS clients
func NewHandler(ctx context.Context) (*Handler, error) {
	// Load AWS configuration
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	// Get DynamoDB table name from environment variable
	tableName := os.Getenv("DYNAMODB_TABLE_NAME")
	if tableName == "" {
		tableName = "image-labels" // default table name
	}

	// Initialize structured logger for CloudWatch
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	return &Handler{
		s3Client:          s3.NewFromConfig(cfg),
		rekognitionClient: rekognition.NewFromConfig(cfg),
		dynamoDBClient:    dynamodb.NewFromConfig(cfg),
		tableName:         tableName,
		logger:            logger,
	}, nil
}

// HandleS3Event processes S3 PutObject events
func (h *Handler) HandleS3Event(ctx context.Context, s3Event events.S3Event) error {
	for _, record := range s3Event.Records {
		err := h.processS3Record(ctx, record)
		if err != nil {
			// Log the error but continue processing other records
			h.logger.Error("failed to process S3 record",
				slog.String("bucket", record.S3.Bucket.Name),
				slog.String("key", record.S3.Object.Key),
				slog.String("error", err.Error()),
			)
			return fmt.Errorf("failed to process record %s/%s: %w",
				record.S3.Bucket.Name, record.S3.Object.Key, err)
		}
	}
	return nil
}

// processS3Record handles individual S3 event records
func (h *Handler) processS3Record(ctx context.Context, record events.S3EventRecord) error {
	bucket := record.S3.Bucket.Name
	key := record.S3.Object.Key
	size := record.S3.Object.Size

	h.logger.Info("processing image",
		slog.String("bucket", bucket),
		slog.String("key", key),
		slog.Int64("size", size),
		slog.String("event_time", record.EventTime.String()),
	)

	// Step 1: Download image from S3
	imageBytes, err := h.downloadImage(ctx, bucket, key)
	if err != nil {
		h.logger.Error("failed to download image from S3",
			slog.String("bucket", bucket),
			slog.String("key", key),
			slog.String("error", err.Error()),
		)
		return fmt.Errorf("failed to download image: %w", err)
	}

	h.logger.Info("successfully downloaded image",
		slog.String("key", key),
		slog.Int("bytes_downloaded", len(imageBytes)),
	)

	// Step 2: Call Rekognition to detect labels
	labels, err := h.detectLabels(ctx, imageBytes)
	if err != nil {
		h.logger.Error("failed to detect labels with Rekognition",
			slog.String("bucket", bucket),
			slog.String("key", key),
			slog.String("error", err.Error()),
		)
		return fmt.Errorf("failed to detect labels: %w", err)
	}

	h.logger.Info("successfully detected labels",
		slog.String("key", key),
		slog.Int("label_count", len(labels)),
	)

	// Step 3: Generate and Upload Thumbnail
	thumbnailKey, err := h.generateAndUploadThumbnail(ctx, bucket, key, imageBytes)
	if err != nil {
		h.logger.Error("failed to generate thumbnail",
			slog.String("bucket", bucket),
			slog.String("key", key),
			slog.String("error", err.Error()),
		)
		// We rely on the thumbnail, so we should probably fail or at least log error.
		// For now let's just log and continue with empty thumbnail key if it fails?
		// User requested thumbnail generation, so it's better to verify it works.
		// Let's propagate error to retry.
		return fmt.Errorf("failed to generate thumbnail: %w", err)
	}

	h.logger.Info("successfully generated thumbnail",
		slog.String("thumbnail_key", thumbnailKey),
	)

	// Step 4: Save metadata and labels to DynamoDB
	err = h.saveMetadata(ctx, bucket, key, size, labels, thumbnailKey)
	if err != nil {
		h.logger.Error("failed to save metadata to DynamoDB",
			slog.String("bucket", bucket),
			slog.String("key", key),
			slog.String("error", err.Error()),
		)
		return fmt.Errorf("failed to save metadata: %w", err)
	}

	h.logger.Info("successfully processed image",
		slog.String("bucket", bucket),
		slog.String("key", key),
		slog.Int("labels_saved", len(labels)),
	)

	return nil
}

// downloadImage downloads an image from S3 and returns its bytes
func (h *Handler) downloadImage(ctx context.Context, bucket, key string) ([]byte, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}

	result, err := h.s3Client.GetObject(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("S3 GetObject failed: %w", err)
	}
	defer result.Body.Close()

	imageBytes, err := io.ReadAll(result.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read S3 object body: %w", err)
	}

	return imageBytes, nil
}

// detectLabels calls AWS Rekognition to detect labels in the image
func (h *Handler) detectLabels(ctx context.Context, imageBytes []byte) ([]LabelInfo, error) {
	input := &rekognition.DetectLabelsInput{
		Image: &rekognitionTypes.Image{
			Bytes: imageBytes,
		},
		MaxLabels:     aws.Int32(10),     // Limit to top 10 labels
		MinConfidence: aws.Float32(70.0), // Minimum 70% confidence
	}

	result, err := h.rekognitionClient.DetectLabels(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("Rekognition DetectLabels failed: %w", err)
	}

	labels := make([]LabelInfo, 0, len(result.Labels))
	for _, label := range result.Labels {
		labelInfo := LabelInfo{
			Name:       aws.ToString(label.Name),
			Confidence: aws.ToFloat32(label.Confidence),
		}
		labels = append(labels, labelInfo)

		h.logger.Debug("detected label",
			slog.String("name", labelInfo.Name),
			slog.Float64("confidence", float64(labelInfo.Confidence)),
		)
	}

	return labels, nil
}

// saveMetadata saves the image metadata and detected labels to DynamoDB
func (h *Handler) saveMetadata(ctx context.Context, bucket, key string, size int64, labels []LabelInfo, thumbnailKey string) error {
	metadata := ImageMetadata{
		ImageKey:       key,
		BucketName:     bucket,
		ImageSize:      size,
		ProcessedAt:    time.Now().UTC().Format(time.RFC3339),
		DetectedLabels: labels,
		ThumbnailKey:   thumbnailKey,
	}

	item, err := attributevalue.MarshalMap(metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	input := &dynamodb.PutItemInput{
		TableName: aws.String(h.tableName),
		Item:      item,
	}

	_, err = h.dynamoDBClient.PutItem(ctx, input)
	if err != nil {
		return fmt.Errorf("DynamoDB PutItem failed: %w", err)
	}

	return nil
}

// generateAndUploadThumbnail generates a thumbnail and uploads it to S3
func (h *Handler) generateAndUploadThumbnail(ctx context.Context, bucket, key string, imageBytes []byte) (string, error) {
	// Decode the image
	img, err := imaging.Decode(bytes.NewReader(imageBytes))
	if err != nil {
		return "", fmt.Errorf("failed to decode image: %w", err)
	}

	// Resize the image to width 300px preserving aspect ratio
	thumbnail := imaging.Resize(img, 300, 0, imaging.Lanczos)

	// Encode as JPEG
	var buf bytes.Buffer
	err = jpeg.Encode(&buf, thumbnail, nil)
	if err != nil {
		return "", fmt.Errorf("failed to encode thumbnail: %w", err)
	}

	// Upload to S3
	thumbnailKey := "thumbnails/" + key
	input := &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(thumbnailKey),
		Body:        bytes.NewReader(buf.Bytes()),
		ContentType: aws.String("image/jpeg"),
	}

	_, err = h.s3Client.PutObject(ctx, input)
	if err != nil {
		return "", fmt.Errorf("failed to upload thumbnail to S3: %w", err)
	}

	return thumbnailKey, nil
}

// Global handler instance (initialized once during cold start)
var handler *Handler

func main() {
	// Initialize handler during cold start
	ctx := context.Background()
	var err error
	handler, err = NewHandler(ctx)
	if err != nil {
		slog.Error("failed to initialize handler", slog.String("error", err.Error()))
		os.Exit(1)
	}

	slog.Info("lambda handler initialized successfully")

	// Start the Lambda runtime
	lambda.Start(handler.HandleS3Event)
}
