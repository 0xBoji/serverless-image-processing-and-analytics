.PHONY: build clean deploy test

# Build the Lambda function for Linux/ARM64 (Graviton2)
build:
	GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap main.go
	zip function.zip bootstrap

# Build for x86_64 architecture (if needed)
build-amd64:
	GOOS=linux GOARCH=amd64 go build -tags lambda.norpc -o bootstrap main.go
	zip function.zip bootstrap

# Clean build artifacts
clean:
	rm -f bootstrap function.zip

# Run tests
test:
	go test -v ./...

# Download dependencies
deps:
	go mod tidy
	go mod download

# Lint the code
lint:
	go vet ./...
	golangci-lint run

# Deploy using AWS CLI (requires AWS credentials configured)
deploy:
	aws lambda update-function-code \
		--function-name image-processor \
		--zip-file fileb://function.zip

# Create a new Lambda function (one-time setup)
create-function:
	aws lambda create-function \
		--function-name image-processor \
		--runtime provided.al2023 \
		--architectures arm64 \
		--handler bootstrap \
		--role $(LAMBDA_ROLE_ARN) \
		--zip-file fileb://function.zip \
		--environment Variables="{DYNAMODB_TABLE_NAME=image-labels}" \
		--timeout 30 \
		--memory-size 256
