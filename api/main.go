package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"sort"
	"strconv"
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

func (h *Handler) HandleRequest(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	h.logger.Info("received request", slog.String("path", req.RawPath), slog.String("method", req.RequestContext.HTTP.Method))

	// Content-Type Header
	headers := map[string]string{
		"Content-Type": "application/json",
	}

	// Strip /api prefix if present (for CloudFront routing)
	path := req.RawPath
	if len(path) > 4 && path[:4] == "/api" {
		path = path[4:]
	}

	method := req.RequestContext.HTTP.Method

	// Handle OPTIONS for CORS Preflight
	if method == "OPTIONS" {
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 200,
			Headers:    headers,
			Body:       "",
		}, nil
	}

	switch {
	case path == "/images" && method == "GET":
		return h.handleGetImages(ctx, req, headers)
	case path == "/upload" && method == "POST":
		return h.handleUpload(ctx, req, headers)
	case path == "/image-url" && method == "GET":
		return h.handleGetImageURL(ctx, req, headers)
	default:
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 404,
			Headers:    headers,
			Body:       `{"error":"Not Found"}`,
		}, nil
	}
}

func (h *Handler) handleGetImages(ctx context.Context, req events.APIGatewayV2HTTPRequest, headers map[string]string) (events.APIGatewayV2HTTPResponse, error) {
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

	// Sort items by image_key descending (newest first)
	// image_key format: images/<timestamp>-<name>
	sort.Slice(items, func(i, j int) bool {
		keyI, _ := items[i]["image_key"].(string)
		keyJ, _ := items[j]["image_key"].(string)
		return keyI > keyJ
	})

	// Pagination Logic (In-Memory Slice)
	limit := 10
	page := 1

	if l := req.QueryStringParameters["limit"]; l != "" {
		if val, err := strconv.Atoi(l); err == nil && val > 0 {
			limit = val
		}
	}
	if p := req.QueryStringParameters["page"]; p != "" {
		if val, err := strconv.Atoi(p); err == nil && val > 0 {
			page = val
		}
	}

	totalItems := len(items)
	start := (page - 1) * limit
	end := start + limit

	var pagedItems []map[string]interface{}
	if start < totalItems {
		if end > totalItems {
			end = totalItems
		}
		pagedItems = items[start:end]
	} else {
		pagedItems = []map[string]interface{}{}
	}

	// Sign URLs for paged items
	presignClient := s3.NewPresignClient(h.s3Client)
	for i := range pagedItems {
		// Determine which key to sign (thumbnail if available, else original)
		key := ""
		if k, ok := pagedItems[i]["thumbnail_key"].(string); ok && k != "" {
			key = k
		} else if k, ok := pagedItems[i]["image_key"].(string); ok && k != "" {
			key = k
		}

		if key != "" {
			presignedReq, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
				Bucket: aws.String(h.bucketName),
				Key:    aws.String(key),
			}, s3.WithPresignExpires(time.Hour))

			if err == nil {
				pagedItems[i]["url"] = presignedReq.URL
			} else {
				h.logger.Error("failed to presign url for item", slog.String("key", key), slog.String("error", err.Error()))
			}
		}
	}

	responseBody, _ := json.Marshal(map[string]interface{}{
		"items":       pagedItems,
		"total_count": totalItems,
		"page":        page,
		"limit":       limit,
		"has_more":    end < totalItems,
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
