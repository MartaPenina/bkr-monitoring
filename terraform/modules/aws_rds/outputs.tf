output "db_endpoint" {
  value = try(aws_db_instance.postgres[0].endpoint, null)
}

output "db_name" {
  value = try(aws_db_instance.postgres[0].db_name, null)
}