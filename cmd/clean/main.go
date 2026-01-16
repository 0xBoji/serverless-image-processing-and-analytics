package main

import (
	"context"
	"fmt"
	"log"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dynamodbtypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

func main() {
	bucketName := "image-processor-source-975050162743"
	tableName := "image-labels"

	ctx := context.TODO()
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion("ap-southeast-2"))
	if err != nil {
		log.Fatalf("unable to load SDK config, %v", err)
	}

	s3Client := s3.NewFromConfig(cfg)
	dynamoClient := dynamodb.NewFromConfig(cfg)

	// 1. Clean S3
	fmt.Printf("Cleaning S3 Bucket: %s...\n", bucketName)
	if err := cleanS3(ctx, s3Client, bucketName); err != nil {
		log.Printf("Failed to clean S3: %v\n", err)
	} else {
		fmt.Println("S3 Bucket cleaned.")
	}

	// 2. Clean DynamoDB
	fmt.Printf("Cleaning DynamoDB Table: %s...\n", tableName)
	if err := cleanDynamoDB(ctx, dynamoClient, tableName); err != nil {
		log.Printf("Failed to clean DynamoDB: %v\n", err)
	} else {
		fmt.Println("DynamoDB Table cleaned.")
	}
}

func cleanS3(ctx context.Context, client *s3.Client, bucket string) error {
	paginator := s3.NewListObjectsV2Paginator(client, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
	})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return err
		}

		if len(page.Contents) == 0 {
			continue
		}

		var objects []s3types.ObjectIdentifier
		for _, obj := range page.Contents {
			objects = append(objects, s3types.ObjectIdentifier{Key: obj.Key})
		}

		_, err = client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(bucket),
			Delete: &s3types.Delete{
				Objects: objects,
				Quiet:   aws.Bool(true),
			},
		})
		if err != nil {
			return err
		}
		fmt.Printf("Deleted %d objects from S3\n", len(objects))
	}
	return nil
}

func cleanDynamoDB(ctx context.Context, client *dynamodb.Client, table string) error {
	paginator := dynamodb.NewScanPaginator(client, &dynamodb.ScanInput{
		TableName:            aws.String(table),
		ProjectionExpression: aws.String("image_key"),
	})

	var deletedCount int
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return err
		}

		for _, item := range page.Items {
			key := item["image_key"].(*dynamodbtypes.AttributeValueMemberS).Value
			_, err := client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
				TableName: aws.String(table),
				Key: map[string]dynamodbtypes.AttributeValue{
					"image_key": &dynamodbtypes.AttributeValueMemberS{Value: key},
				},
			})
			if err != nil {
				log.Printf("Failed to delete item %s: %v\n", key, err)
			} else {
				deletedCount++
			}
		}
	}
	fmt.Printf("Deleted %d items from DynamoDB\n", deletedCount)
	return nil
}
