output "jump_host_external_ip" {
  value = local.general.cloud == "gcp" ? module.gcp_vm.jump_host_external_ip : module.aws_vm.jump_host_external_ip
}

output "jump_host_internal_ip" {
  value = local.general.cloud == "gcp" ? module.gcp_vm.jump_host_internal_ip : module.aws_vm.jump_host_internal_ip
}

output "internal_vm_ips" {
  value = local.general.cloud == "gcp" ? module.gcp_vm.internal_vm_ips : module.aws_vm.internal_vm_ips
}

output "ssh_connection" {
  value = "ssh -p ${local.general.ssh_port} ${local.general.ops_user}@${local.general.cloud == "gcp" ? module.gcp_vm.jump_host_external_ip : module.aws_vm.jump_host_external_ip}"
}

output "rds_endpoint" {
  value = local.general.cloud == "aws" ? module.aws_rds.db_endpoint : null
}

output "rds_db_name" {
  value = local.general.cloud == "aws" ? module.aws_rds.db_name : null
}