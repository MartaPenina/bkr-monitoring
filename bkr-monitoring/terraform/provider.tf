terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project     = var.gcp_project
  region      = local.general.region
  zone        = local.general.zone
  credentials = var.gcp_credentials_file != "" ? file(var.gcp_credentials_file) : null
}

provider "aws" {
  region  = local.general.aws_region
  profile = var.aws_profile
}
