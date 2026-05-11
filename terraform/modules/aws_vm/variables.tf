variable "config" {
  type = any
}

variable "ssh_public_key" {
  type = string
}

variable "public_subnet_id" {
  type = string
}

variable "private_subnet_id" {
  type = string
}

variable "jump_host_sg_id" {
  type = string
}

variable "internal_sg_id" {
  type = string
}

variable "web_sg_id" {
  type = string
}