package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Request/Response types
type UploadRequest struct {
	ContentType string `json:"contentType"`
}

type UploadResponse struct {
	UploadURL string `json:"uploadUrl"`
	Key       string `json:"key"`
}

type ImageResponse struct {
	URL string `json:"url"`
}

// Handler holds the AWS service clients
type Handler struct {
	s3Client       *s3.Client
	dynamoDBClient *dynamodb.Client
	tableName      string
	bucketName     string
	logger         *slog.Logger
}

func NewHandler(ctx context.Context) (*Handler, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	tableName := os.Getenv("DYNAMODB_TABLE_NAME")
	if tableName == "" {
		tableName = "image-labels"
	}

	bucketName := os.Getenv("S3_BUCKET_NAME")
	if bucketName == "" {
		return nil, fmt.Errorf("S3_BUCKET_NAME environment variable is required")
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	return &Handler{
		s3Client:       s3.NewFromConfig(cfg),
		dynamoDBClient: dynamodb.NewFromConfig(cfg),
		tableName:      tableName,
		bucketName:     bucketName,
		logger:         logger,
	}, nil
}

func (h *Handler) HandleRequest(ctx context.Context, req map[string]interface{}) (events.APIGatewayV2HTTPResponse, error) {
	reqJSON, _ := json.Marshal(req)
	h.logger.Info("received raw request", slog.String("json", string(reqJSON)))

	// Attempt to unmarshal into V2
	var reqV2 events.APIGatewayV2HTTPRequest
	if err := json.Unmarshal(reqJSON, &reqV2); err == nil && reqV2.RawPath != "" {
		return h.handleV2(ctx, reqV2)
	}

	// Attempt to unmarshal into V1
	var reqV1 events.APIGatewayProxyRequest
	if err := json.Unmarshal(reqJSON, &reqV1); err == nil && reqV1.Path != "" {
		return h.handleV1(ctx, reqV1)
	}

	return events.APIGatewayV2HTTPResponse{
		StatusCode: 500,
		Body:       fmt.Sprintf("Could not parse event: %s", string(reqJSON)),
	}, nil
}

func (h *Handler) handleV2(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	// ... existing V2 logic ...
	h.logger.Info("handling as V2", slog.String("path", req.RawPath))
	path := req.RawPath
	if len(path) > 4 && path[:4] == "/api" {
		path = path[4:]
	}
	method := req.RequestContext.HTTP.Method

	switch {
	case path == "/images" && method == "GET":
		return h.handleGetImages(ctx, headersV2())
	case path == "/upload" && method == "POST":
		return h.handleUpload(ctx, req, headersV2())
	case path == "/image-url" && method == "GET":
		return h.handleGetImageURL(ctx, req, headersV2())
	default:
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 404,
			Headers:    headersV2(),
			Body:       `{"error":"Not Found"}`,
		}, nil
	}
}

func (h *Handler) handleV1(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayV2HTTPResponse, error) {
	// Adapter logic for V1 -> V2 response
	h.logger.Info("handling as V1", slog.String("path", req.Path))
	// ... logic ...
	return events.APIGatewayV2HTTPResponse{StatusCode: 501, Body: "V1 not supported yet"}, nil
}

func headersV2() map[string]string {
	return map[string]string{"Content-Type": "application/json"}
}

func (h *Handler) handleGetImages(ctx context.Context, headers map[string]string) (events.APIGatewayV2HTTPResponse, error) {
	input := &dynamodb.ScanInput{
		TableName: aws.String(h.tableName),
	}

	result, err := h.dynamoDBClient.Scan(ctx, input)
	if err != nil {
		h.logger.Error("failed to scan dynamodb", slog.String("error", err.Error()))
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 500,
			Headers:    headers,
			Body:       `{"error":"Failed to fetch images"}`,
		}, nil
	}

	var items []map[string]interface{}
	err = attributevalue.UnmarshalListOfMaps(result.Items, &items)
	if err != nil {
		h.logger.Error("failed to unmarshal items", slog.String("error", err.Error()))
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 500,
			Headers:    headers,
			Body:       `{"error":"Failed to process images"}`,
		}, nil
	}

	responseBody, _ := json.Marshal(map[string]interface{}{
		"items": items,
		"count": result.Count,
	})

	return events.APIGatewayV2HTTPResponse{
		StatusCode: 200,
		Headers:    headers,
		Body:       string(responseBody),
	}, nil
}

func (h *Handler) handleUpload(ctx context.Context, req events.APIGatewayV2HTTPRequest, headers map[string]string) (events.APIGatewayV2HTTPResponse, error) {
	var uploadReq UploadRequest
	if err := json.Unmarshal([]byte(req.Body), &uploadReq); err != nil {
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 400,
			Headers:    headers,
			Body:       `{"error":"Invalid request body"}`,
		}, nil
	}

	// Validate content type
	if uploadReq.ContentType != "image/jpeg" && uploadReq.ContentType != "image/png" {
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 400,
			Headers:    headers,
			Body:       `{"error":"Only JPEG and PNG images are allowed"}`,
		}, nil
	}

	key := fmt.Sprintf("images/%d-%s", time.Now().UnixNano(), "image")
	// Note: In a real app we might want the original filename, but here we generate a unique one or expecting it from client.
	// Let's stick to generating a unique key to allow multiple uploads.

	presignClient := s3.NewPresignClient(h.s3Client)
	presignedReq, err := presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(h.bucketName),
		Key:         aws.String(key),
		ContentType: aws.String(uploadReq.ContentType),
	}, s3.WithPresignExpires(time.Minute*15))

	if err != nil {
		h.logger.Error("failed to presign url", slog.String("error", err.Error()))
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 500,
			Headers:    headers,
			Body:       `{"error":"Failed to generate upload URL"}`,
		}, nil
	}

	resp := UploadResponse{
		UploadURL: presignedReq.URL,
		Key:       key,
	}
	responseBody, _ := json.Marshal(resp)

	return events.APIGatewayV2HTTPResponse{
		StatusCode: 200,
		Headers:    headers,
		Body:       string(responseBody),
	}, nil
}

func (h *Handler) handleGetImageURL(ctx context.Context, req events.APIGatewayV2HTTPRequest, headers map[string]string) (events.APIGatewayV2HTTPResponse, error) {
	key := req.QueryStringParameters["key"]
	if key == "" {
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 400,
			Headers:    headers,
			Body:       `{"error":"Missing key parameter"}`,
		}, nil
	}

	presignClient := s3.NewPresignClient(h.s3Client)
	presignedReq, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(h.bucketName),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(time.Hour))

	if err != nil {
		h.logger.Error("failed to generate signed url", slog.String("error", err.Error()))
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 500,
			Headers:    headers,
			Body:       `{"error":"Failed to generate image URL"}`,
		}, nil
	}

	resp := ImageResponse{
		URL: presignedReq.URL,
	}
	responseBody, _ := json.Marshal(resp)

	return events.APIGatewayV2HTTPResponse{
		StatusCode: 200,
		Headers:    headers,
		Body:       string(responseBody),
	}, nil
}

func main() {
	ctx := context.Background()
	handler, err := NewHandler(ctx)
	if err != nil {
		slog.Error("failed to initialize handler", slog.String("error", err.Error()))
		os.Exit(1)
	}

	lambda.Start(handler.HandleRequest)
}
