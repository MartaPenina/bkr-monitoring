output "vpc_id" {
  value = try(aws_vpc.main[0].id, null)
}

output "public_subnet_id" {
  value = try(aws_subnet.public[0].id, null)
}

output "private_subnet_id" {
  value = try(aws_subnet.private[0].id, null)
}

output "private_subnet_b_id" {
  value = try(aws_subnet.private_b[0].id, null)
}

output "public_subnet_b_id" {
  value = try(aws_subnet.public_b[0].id, null)
}