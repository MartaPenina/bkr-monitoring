output "connection_name" {
  value = length(google_sql_database_instance.postgres) > 0 ? google_sql_database_instance.postgres[0].connection_name : ""
}

output "private_ip" {
  value = length(google_sql_database_instance.postgres) > 0 ? google_sql_database_instance.postgres[0].private_ip_address : ""
}