output "vpc_name" {
  value = try(google_compute_network.vpc[0].name, null)
}

output "subnet_id" {
  value = try(google_compute_subnetwork.subnet[0].id, null)
}