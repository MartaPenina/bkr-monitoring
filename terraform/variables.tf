variable "gcp_credentials_file" {
  type      = string
  sensitive = true
  default   = ""
}

variable "db_password" {
  type      = string
  sensitive = true
}

# variable "aws_access_key" {
#   type      = string
#   sensitive = true
# }
# variable "aws_secret_key" {
#   type      = string
#   sensitive = true
# }