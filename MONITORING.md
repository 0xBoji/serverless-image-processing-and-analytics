# 📊 Serverless Monitoring Stack

Monitor your serverless application using **Grafana** and **Prometheus**, populated with data from **AWS CloudWatch** via **YACE** (Yet Another CloudWatch Exporter).

## Architecture

`AWS CloudWatch` -> `YACE Exporter` -> `Prometheus` -> `Grafana`

*   **YACE**: Scrapes metrics from CloudWatch API (Lambda, DynamoDB, API Gateway, S3).
*   **Prometheus**: Collects and stores metrics.
*   **Grafana**: Visualizes metrics with beautiful dashboards.

## Prerequisites

*   Docker & Docker Compose installed.
*   AWS Credentials configured locally (`~/.aws/credentials`).

## Setup & Run

1.  **Configure AWS Credentials**:
    Ensure you have valid credentials in `~/.aws/credentials`. The `docker-compose.yml` mounts this file into the exporter container.

2.  **Start the Stack**:
    ```bash
    cd monitoring
    docker-compose up -d
    ```

3.  **Access Dashboards**:
    *   **Grafana**: [http://localhost:3000](http://localhost:3000) (User: `admin`, Pass: `admin`)
    *   **Prometheus**: [http://localhost:9090](http://localhost:9090)
    *   **YACE Metrics**: [http://localhost:5000/metrics](http://localhost:5000/metrics)

## Grafana Configuration

1.  **Add Data Source**:
    *   Go to **Configuration** -> **Data Sources**.
    *   Add **Prometheus**.
    *   URL: `http://prometheus:9090`
    *   Click **Save & Test**.

2.  **Import Dashboard**:
    *   Go to **Dashboards** -> **New** -> **Import**.
    *   You can create panels querying metrics like:
        *   `aws_lambda_invocations_sum`
        *   `aws_lambda_errors_sum`
        *   `aws_s3_bucket_size_bytes_average`

## Cleanup

To stop and remove containers:
```bash
docker-compose down
```
