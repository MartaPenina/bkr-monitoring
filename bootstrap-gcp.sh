#!/bin/bash
set -e

# === Configuration ===
PROJECT_ID="sixth-hawk-496014-a4"        # твій вже існуючий GCP project ID
REGION="europe-central2"
SA_NAME="bkr-terraform-sa"
SA_DISPLAY_NAME="BKR Terraform Service Account"
BUCKET_NAME="${PROJECT_ID}-bkr-tf-state"

# === Step 1: Set project as default ===
echo "Setting default project..."
gcloud config set project $PROJECT_ID

# === Step 2: Enable APIs ===
echo "Enabling APIs..."
gcloud services enable compute.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable iam.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com

# === Step 3: Create service account ===
echo "Creating service account: $SA_NAME..."
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe $SA_EMAIL > /dev/null 2>&1; then
  echo "Service account already exists, skipping."
else
  gcloud iam service-accounts create $SA_NAME \
    --display-name="$SA_DISPLAY_NAME" \
    --project=$PROJECT_ID
fi

# === Step 4: Assign IAM roles ===
echo "Assigning roles to $SA_EMAIL..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/compute.admin"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.admin"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/iam.serviceAccountUser"

# === Step 5: Create service account key ===
echo "Creating key file..."
if [ -f terraform/bkr-key.json ]; then
  echo "Key file already exists, skipping."
else
  gcloud iam service-accounts keys create terraform/bkr-key.json \
    --iam-account=$SA_EMAIL
fi

# === Step 6: Create GCS bucket for Terraform state ===
echo "Creating state bucket: $BUCKET_NAME..."
if gcloud storage buckets describe gs://$BUCKET_NAME > /dev/null 2>&1; then
  echo "Bucket already exists, skipping."
else
  gcloud storage buckets create gs://$BUCKET_NAME \
    --location=$REGION \
    --project=$PROJECT_ID
fi

echo ""
echo "=== Bootstrap complete ==="
echo "Project:         $PROJECT_ID"
echo "Service Account: $SA_EMAIL"
echo "Key file:        terraform/bkr-key.json"
echo "State bucket:    gs://$BUCKET_NAME"
echo ""
echo "Next step — run Terraform:"
echo "  cd terraform"
echo "  export GOOGLE_APPLICATION_CREDENTIALS=bkr-key.json"
echo "  terraform init"
echo "  terraform apply"
