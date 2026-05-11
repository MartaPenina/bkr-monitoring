output "jump_host_external_ip" {
  value = local.cloud == "gcp" ? module.gcp_vm[0].jump_host_external_ip : module.aws_vm[0].jump_host_external_ip
}

output "jump_host_internal_ip" {
  value = local.cloud == "gcp" ? module.gcp_vm[0].jump_host_internal_ip : module.aws_vm[0].jump_host_internal_ip
}

output "internal_vm_ips" {
  value = local.cloud == "gcp" ? module.gcp_vm[0].internal_vm_ips : module.aws_vm[0].internal_vm_ips
}

output "ssh_connection" {
  value = "ssh -p ${local.general.ssh_port} ${local.general.ops_user}@${local.cloud == "gcp" ? module.gcp_vm[0].jump_host_external_ip : module.aws_vm[0].jump_host_external_ip}"
}

output "db_endpoint" {
  value = module.gcp_cloudsql[0].private_ip
}

output "db_name" {
  value = "bkr"
}
