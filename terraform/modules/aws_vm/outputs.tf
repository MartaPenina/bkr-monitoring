output "jump_host_external_ip" {
  value = try(aws_instance.vm["jump-host"].public_ip, null)
}

output "jump_host_internal_ip" {
  value = try(aws_instance.vm["jump-host"].private_ip, null)
}

output "internal_vm_ips" {
  value = {
    for name, vm in aws_instance.vm : name => vm.private_ip
    if name != "jump-host"
  }
}

output "ui_instance_id" {
  value = try(aws_instance.vm["node-03"].id, null)
}