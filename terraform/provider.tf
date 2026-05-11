terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }

    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = local.general.project_id
  region  = local.config.locations[local.general.location].gcp.region
  zone    = local.config.locations[local.general.location].gcp.zones.primary
}

provider "aws" {
  region     = local.config.locations[local.general.location].aws.region
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
}