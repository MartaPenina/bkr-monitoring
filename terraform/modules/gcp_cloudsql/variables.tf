variable "config" {
  description = "Global config object from config.yaml"
  type        = any
}

variable "vpc_id" {
  description = "VPC self link for private IP"
  type        = string
}