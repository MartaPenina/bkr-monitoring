variable "gcp_project" {
  description = "GCP project ID"
  type        = string
  default     = ""
}

variable "gcp_credentials_file" {
  description = "Path to GCP service account credentials JSON"
  type        = string
  default     = ""
}

variable "aws_profile" {
  description = "AWS CLI profile name"
  type        = string
  default     = "default"
}
