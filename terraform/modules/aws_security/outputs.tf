output "jump_host_sg_id" {
  value = try(aws_security_group.jump_host[0].id, null)
}

output "internal_sg_id" {
  value = try(aws_security_group.internal[0].id, null)
}

output "web_sg_id" {
  value = try(aws_security_group.web[0].id, null)
}

output "rds_sg_id" {
  value = try(aws_security_group.rds[0].id, null)
}